// In-memory "live deck" that the browser canvas and the presentation-bridge
// pi extension both read/write in-process. Auto-persisted to disk by
// deck-persistence.ts (debounced save on every `emit`, restored into the
// `editorStore` singleton below on startup) — see
// openspec/changes/persist-deck-state/design.md.
//
// Shape: decks -> slides -> objects, with exactly one active deck and one
// active slide per deck (deck-management's design.md). Object ids are unique
// only within their slide, not globally across the deck.

import { randomUUID } from 'node:crypto'
import { env } from './env'
import { loadSnapshot, readSnapshotFile } from './deck-persistence'

export interface TextRun {
  text: string
  bold?: boolean
  italic?: boolean
}

/** A paragraph or list-item block of inline runs — see openspec/changes/edit-text-boxes/design.md's "Structured text shape". */
export type TextBlock =
  | { kind: 'paragraph'; runs: TextRun[] }
  | { kind: 'listItem'; listType: 'bulleted' | 'numbered'; runs: TextRun[] }

export interface DeckObject {
  id: string
  x: number
  y: number
  width: number
  height: number
  text: TextBlock[]
  fillColor: string
  borderColor: string
  fontColor: string
  fontSize: number
}

export interface Slide {
  id: string
  objects: DeckObject[]
}

export interface Deck {
  id: string
  name: string
  slides: Slide[]
  activeSlideId: string
}

export interface DeckSummary {
  id: string
  name: string
  slideCount: number
}

export interface SlideSummary {
  id: string
}

/** Broadcast/query shape: deck list, active deck's slide list, and the active slide's own content. */
export interface DeckState {
  decks: DeckSummary[]
  activeDeckId: string
  slides: SlideSummary[]
  activeSlideId: string
  objects: DeckObject[]
  selection: string[]
}

export interface OpResult {
  ok: boolean
  error?: string
}

export type UpdateAction =
  | 'setPosition'
  | 'setSize'
  | 'setText'
  | 'setFillColor'
  | 'setFontColor'
  | 'setBorderColor'
  | 'setFontSize'
  | 'applyGridLayout'
  | 'addObject'
  | 'removeObject'
  | 'applyTextStyle'

export interface UpdateResult {
  changed: string[]
  errors: string[]
}

/** One `applyUpdate` call, as sent in a batch over the `object_update` WS message. */
export interface UpdateActionCall {
  action: UpdateAction
  targetIds: string[]
  args: Record<string, unknown>
}

// --- Structured text helpers ---
//
// `plainTextOf` is the one place that flattens structured text to a string —
// every call site that needs plain text (select_by_text matching, offset
// addressing for applyTextStyle) routes through it rather than re-deriving
// its own notion of "the text", per design.md's risk mitigation for the
// `text` shape change. Blocks are joined with "\n" so multi-block offsets
// are unambiguous and stable across edits.

function blockPlainText(block: TextBlock): string {
  return block.runs.map((r) => r.text).join('')
}

export function plainTextOf(object: { text: TextBlock[] }): string {
  return object.text.map(blockPlainText).join('\n')
}

function wrapPlainText(text: string): TextBlock[] {
  return [{ kind: 'paragraph', runs: text ? [{ text }] : [] }]
}

function sanitizeRun(input: unknown): TextRun | undefined {
  if (!input || typeof input !== 'object' || typeof (input as { text?: unknown }).text !== 'string') return undefined
  const r = input as { text: string; bold?: unknown; italic?: unknown }
  const run: TextRun = { text: r.text }
  if (r.bold === true) run.bold = true
  if (r.italic === true) run.italic = true
  return run
}

function sanitizeBlock(input: unknown): TextBlock {
  const b = (input ?? {}) as { kind?: unknown; listType?: unknown; runs?: unknown }
  const runs = Array.isArray(b.runs) ? b.runs.map(sanitizeRun).filter((r): r is TextRun => !!r) : []
  if (b.kind === 'listItem' && (b.listType === 'bulleted' || b.listType === 'numbered')) {
    return { kind: 'listItem', listType: b.listType, runs }
  }
  return { kind: 'paragraph', runs }
}

/**
 * Load-time normalizer (design.md's mitigation for the breaking `text` shape
 * change): a legacy plain string becomes a single unstyled paragraph block;
 * an already-structured value is sanitized field-by-field (untrusted tool/WS
 * input can't inject an arbitrary shape); anything else becomes empty text.
 */
export function normalizeText(input: unknown): TextBlock[] {
  if (typeof input === 'string') return wrapPlainText(input)
  if (Array.isArray(input)) return input.length ? input.map(sanitizeBlock) : wrapPlainText('')
  return wrapPlainText('')
}

function splitRunsAndMark(runs: TextRun[], localStart: number, localEnd: number, mark: 'bold' | 'italic', value: boolean): TextRun[] {
  const result: TextRun[] = []
  let pos = 0
  for (const run of runs) {
    const runLen = run.text.length
    const runStart = pos
    const runEnd = pos + runLen
    pos = runEnd
    if (runLen === 0 || runEnd <= localStart || runStart >= localEnd) {
      result.push(run)
      continue
    }
    const overlapStart = Math.max(0, localStart - runStart)
    const overlapEnd = Math.min(runLen, localEnd - runStart)
    if (overlapStart > 0) result.push({ ...run, text: run.text.slice(0, overlapStart) })
    const marked: TextRun = { ...run, text: run.text.slice(overlapStart, overlapEnd) }
    if (mark === 'bold') {
      if (value) marked.bold = true
      else delete marked.bold
    } else {
      if (value) marked.italic = true
      else delete marked.italic
    }
    result.push(marked)
    if (overlapEnd < runLen) result.push({ ...run, text: run.text.slice(overlapEnd) })
  }
  return result
}

/** Applies bold/italic to the plain-text range [start, end), splitting runs at the boundaries as needed. */
function applyMarkToBlocks(blocks: TextBlock[], start: number, end: number, mark: 'bold' | 'italic', value: boolean): TextBlock[] {
  let cursor = 0
  return blocks.map((block, i) => {
    if (i > 0) cursor += 1 // "\n" separator, matches plainTextOf's join
    const text = blockPlainText(block)
    const blockStart = cursor
    cursor = blockStart + text.length
    const localStart = Math.max(0, start - blockStart)
    const localEnd = Math.min(text.length, end - blockStart)
    if (localStart >= localEnd) return block
    return { ...block, runs: splitRunsAndMark(block.runs, localStart, localEnd, mark, value) } as TextBlock
  })
}

/** Converts blocks whose plain-text range overlaps [start, end) between paragraph and listItem, preserving runs. */
function applyListTypeToBlocks(blocks: TextBlock[], start: number, end: number, listType: 'bulleted' | 'numbered' | null): TextBlock[] {
  let cursor = 0
  return blocks.map((block, i) => {
    if (i > 0) cursor += 1
    const text = blockPlainText(block)
    const blockStart = cursor
    const blockEnd = blockStart + text.length
    cursor = blockEnd
    const touched = start <= blockEnd && end >= blockStart
    if (!touched) return block
    return listType ? { kind: 'listItem', listType, runs: block.runs } : { kind: 'paragraph', runs: block.runs }
  })
}

const SLIDE_WIDTH = 960
const SLIDE_HEIGHT = 540

/**
 * Clamps an object's x/y/width/height to the slide's 0,0-960,540 bounds —
 * the single source of truth for both UI-driven updates and presentation-bridge
 * tool calls (see openspec/changes/constrain-content-to-slide-bounds/design.md).
 * Size is clamped first, then position is clamped against the (possibly
 * just-clamped) size, so a resize that grows past an edge still lands fully
 * on-slide and a plain move never alters width/height.
 */
function clampToSlide(obj: { x: number; y: number; width: number; height: number }): void {
  obj.width = Math.min(Math.max(1, obj.width), SLIDE_WIDTH)
  obj.height = Math.min(Math.max(1, obj.height), SLIDE_HEIGHT)
  obj.x = Math.min(Math.max(0, obj.x), SLIDE_WIDTH - obj.width)
  obj.y = Math.min(Math.max(0, obj.y), SLIDE_HEIGHT - obj.height)
}

function seedObjects(): DeckObject[] {
  return [
    {
      id: 'title',
      x: 40,
      y: 40,
      width: 400,
      height: 80,
      text: wrapPlainText('Deck Harness'),
      fillColor: '#1f2937',
      borderColor: 'transparent',
      fontColor: '#ffffff',
      fontSize: 32,
    },
    {
      id: 'box-1',
      x: 40,
      y: 160,
      width: 200,
      height: 120,
      text: wrapPlainText('Talk to pi about the server here'),
      fillColor: '#374151',
      borderColor: 'transparent',
      fontColor: '#ffffff',
      fontSize: 16,
    },
    {
      id: 'box-2',
      x: 260,
      y: 160,
      width: 200,
      height: 120,
      text: wrapPlainText('It can move, resize, and restyle these boxes'),
      fillColor: '#374151',
      borderColor: 'transparent',
      fontColor: '#ffffff',
      fontSize: 16,
    },
  ]
}

export class EditorStore {
  private decks = new Map<string, Deck>()
  private activeDeckId: string
  private selection: string[] = []
  private listeners = new Set<(state: DeckState) => void>()

  /** @param initial Restored snapshot to seed from (see deck-persistence.ts's `loadSnapshot`); omitted/null builds the hardcoded demo deck (first run / no persisted state). */
  constructor(initial?: { decks: Deck[]; activeDeckId: string } | null) {
    if (initial && initial.decks.length > 0) {
      for (const deck of initial.decks) this.decks.set(deck.id, deck)
      this.activeDeckId = initial.activeDeckId
    } else {
      const slide: Slide = { id: randomUUID(), objects: seedObjects() }
      const deck: Deck = { id: randomUUID(), name: 'Deck 1', slides: [slide], activeSlideId: slide.id }
      this.decks.set(deck.id, deck)
      this.activeDeckId = deck.id
    }
  }

  subscribe(listener: (state: DeckState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit() {
    const snapshot = this.getState()
    for (const listener of this.listeners) listener(snapshot)
  }

  private activeDeck(): Deck {
    // A deck always exists: deleteDeck refuses to remove the last one.
    return this.decks.get(this.activeDeckId)!
  }

  private activeSlide(): Slide {
    const deck = this.activeDeck()
    // A slide always exists: removeSlide refuses to remove the last one.
    return deck.slides.find((s) => s.id === deck.activeSlideId)!
  }

  getState(): DeckState {
    const deck = this.activeDeck()
    const slide = this.activeSlide()
    return {
      decks: [...this.decks.values()].map((d) => ({ id: d.id, name: d.name, slideCount: d.slides.length })),
      activeDeckId: this.activeDeckId,
      slides: deck.slides.map((s) => ({ id: s.id })),
      activeSlideId: deck.activeSlideId,
      objects: slide.objects.map((o) => ({ ...o, text: o.text.map((b) => ({ ...b, runs: b.runs.map((r) => ({ ...r })) })) })),
      selection: [...this.selection],
    }
  }

  // --- Deck management ---

  createDeck(name: string): { deckId: string } {
    const slide: Slide = { id: randomUUID(), objects: [] }
    const deck: Deck = { id: randomUUID(), name, slides: [slide], activeSlideId: slide.id }
    this.decks.set(deck.id, deck)
    this.activeDeckId = deck.id
    this.selection = []
    this.emit()
    return { deckId: deck.id }
  }

  listDecks(): DeckSummary[] {
    return [...this.decks.values()].map((d) => ({ id: d.id, name: d.name, slideCount: d.slides.length }))
  }

  selectDeck(deckId: string): OpResult {
    if (!this.decks.has(deckId)) return { ok: false, error: `No deck with id "${deckId}"` }
    this.activeDeckId = deckId
    this.selection = []
    this.emit()
    return { ok: true }
  }

  deleteDeck(deckId: string): OpResult {
    if (!this.decks.has(deckId)) return { ok: false, error: `No deck with id "${deckId}"` }
    if (this.decks.size === 1) return { ok: false, error: 'Cannot delete the only remaining deck' }
    this.decks.delete(deckId)
    if (this.activeDeckId === deckId) {
      this.activeDeckId = this.decks.keys().next().value!
      this.selection = []
    }
    this.emit()
    return { ok: true }
  }

  // --- Slide management (active deck) ---

  addSlide(): { slideId: string } {
    const deck = this.activeDeck()
    const slide: Slide = { id: randomUUID(), objects: [] }
    deck.slides.push(slide)
    deck.activeSlideId = slide.id
    this.selection = []
    this.emit()
    return { slideId: slide.id }
  }

  removeSlide(slideId: string): OpResult {
    const deck = this.activeDeck()
    const index = deck.slides.findIndex((s) => s.id === slideId)
    if (index === -1) return { ok: false, error: `No slide with id "${slideId}" in the active deck` }
    if (deck.slides.length === 1) return { ok: false, error: 'Cannot remove the only remaining slide in a deck' }
    deck.slides.splice(index, 1)
    if (deck.activeSlideId === slideId) {
      const neighborIndex = Math.min(index, deck.slides.length - 1)
      deck.activeSlideId = deck.slides[neighborIndex].id
      this.selection = []
    }
    this.emit()
    return { ok: true }
  }

  selectSlide(slideId: string): OpResult {
    const deck = this.activeDeck()
    if (!deck.slides.some((s) => s.id === slideId)) {
      return { ok: false, error: `No slide with id "${slideId}" in the active deck` }
    }
    deck.activeSlideId = slideId
    this.selection = []
    this.emit()
    return { ok: true }
  }

  // --- Object editing (active deck's active slide) ---

  setSelection(ids: string[]) {
    const slide = this.activeSlide()
    const known = new Set(slide.objects.map((o) => o.id))
    this.selection = ids.filter((id) => known.has(id))
    this.emit()
  }

  selectByText(query: string, caseSensitive = false): string[] {
    const slide = this.activeSlide()
    const needle = caseSensitive ? query : query.toLowerCase()
    return slide.objects
      .filter((o) => {
        const text = plainTextOf(o)
        return (caseSensitive ? text : text.toLowerCase()).includes(needle)
      })
      .map((o) => o.id)
  }

  applyUpdate(action: UpdateAction, targetIds: string[], args: Record<string, unknown>): UpdateResult {
    const slide = this.activeSlide()
    const errors: string[] = []
    const changed: string[] = []

    if (action === 'applyGridLayout') {
      const targets = targetIds.map((id) => slide.objects.find((o) => o.id === id)).filter((o): o is DeckObject => !!o)
      if (targets.length === 0) errors.push('No matching target objects for applyGridLayout')
      const direction = args.direction === 'vertical' ? 'vertical' : 'horizontal'
      const gap = typeof args.gap === 'number' ? args.gap : 24
      let cursor = direction === 'horizontal' ? Math.min(...targets.map((t) => t.x)) : Math.min(...targets.map((t) => t.y))
      for (const t of targets) {
        if (direction === 'horizontal') {
          t.x = cursor
          cursor += t.width + gap
        } else {
          t.y = cursor
          cursor += t.height + gap
        }
        changed.push(t.id)
      }
      this.emit()
      return { changed, errors }
    }

    if (action === 'addObject') {
      const required = ['x', 'y', 'width', 'height'] as const
      for (const key of required) {
        if (typeof args[key] !== 'number') errors.push(`addObject requires numeric "${key}"`)
      }
      if (errors.length > 0) return { changed, errors }
      const id = typeof args.id === 'string' && args.id.trim() ? args.id : randomUUID()
      if (slide.objects.some((o) => o.id === id)) {
        errors.push(`Object with id "${id}" already exists on the active slide`)
        return { changed, errors }
      }
      const newObject: DeckObject = {
        id,
        x: args.x as number,
        y: args.y as number,
        width: args.width as number,
        height: args.height as number,
        text: normalizeText(args.text),
        fillColor: typeof args.fillColor === 'string' ? args.fillColor : '#374151',
        borderColor: typeof args.borderColor === 'string' ? args.borderColor : 'transparent',
        fontColor: typeof args.fontColor === 'string' ? args.fontColor : '#ffffff',
        fontSize: typeof args.fontSize === 'number' ? Math.max(1, args.fontSize) : 16,
      }
      clampToSlide(newObject)
      slide.objects.push(newObject)
      changed.push(newObject.id)
      this.emit()
      return { changed, errors }
    }

    if (action === 'removeObject') {
      for (const id of targetIds) {
        const index = slide.objects.findIndex((o) => o.id === id)
        if (index === -1) {
          errors.push(`No object with id "${id}"`)
          continue
        }
        slide.objects.splice(index, 1)
        changed.push(id)
      }
      if (changed.length > 0) {
        const known = new Set(slide.objects.map((o) => o.id))
        this.selection = this.selection.filter((id) => known.has(id))
      }
      this.emit()
      return { changed, errors }
    }

    for (const id of targetIds) {
      const obj = slide.objects.find((o) => o.id === id)
      if (!obj) {
        errors.push(`No object with id "${id}"`)
        continue
      }
      switch (action) {
        case 'setPosition':
          if (typeof args.x === 'number') obj.x = args.x
          if (typeof args.y === 'number') obj.y = args.y
          if (typeof args.dx === 'number') obj.x += args.dx
          if (typeof args.dy === 'number') obj.y += args.dy
          clampToSlide(obj)
          break
        case 'setSize':
          if (typeof args.width === 'number') obj.width = args.width
          if (typeof args.height === 'number') obj.height = args.height
          clampToSlide(obj)
          break
        case 'setText':
          if (typeof args.text === 'string' || Array.isArray(args.text)) obj.text = normalizeText(args.text)
          break
        case 'setFillColor':
          if (typeof args.color === 'string') obj.fillColor = args.color
          break
        case 'setBorderColor':
          if (typeof args.color === 'string') obj.borderColor = args.color
          break
        case 'setFontColor':
          if (typeof args.color === 'string') obj.fontColor = args.color
          break
        case 'setFontSize':
          if (typeof args.fontSize === 'number') obj.fontSize = Math.max(1, args.fontSize)
          break
        case 'applyTextStyle': {
          const start = typeof args.start === 'number' ? args.start : 0
          const end = typeof args.end === 'number' ? args.end : start
          if (args.mark === 'bold' || args.mark === 'italic') {
            obj.text = applyMarkToBlocks(obj.text, start, end, args.mark, args.value === true)
          } else if ('listType' in args) {
            const listType = args.listType === 'bulleted' || args.listType === 'numbered' ? args.listType : null
            obj.text = applyListTypeToBlocks(obj.text, start, end, listType)
          }
          break
        }
      }
      changed.push(id)
    }

    this.emit()
    return { changed, errors }
  }

  /** Full decks/slides/objects snapshot (not the `getState()` broadcast shape, which only carries the active slide's objects) — used by deck-persistence.ts's debounced auto-save. */
  exportSnapshot(): { decks: Deck[]; activeDeckId: string } {
    return {
      decks: [...this.decks.values()].map((d) => ({
        id: d.id,
        name: d.name,
        activeSlideId: d.activeSlideId,
        slides: d.slides.map((s) => ({
          id: s.id,
          objects: s.objects.map((o) => ({ ...o, text: o.text.map((b) => ({ ...b, runs: b.runs.map((r) => ({ ...r })) })) })),
        })),
      })),
      activeDeckId: this.activeDeckId,
    }
  }
}

const initialSnapshot = loadSnapshot(readSnapshotFile(env.DECK_STATE_FILE))
export const editorStore = new EditorStore(initialSnapshot)
