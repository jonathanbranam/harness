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

// --- Object model ---
//
// DeckObject is a discriminated union on `type` (see
// openspec/changes/add-deck-styling-elements/design.md's "DeckObject becomes
// a discriminated union" decision). `textBox` keeps the original flat shape.
// `box`/`ellipse` keep a bounding-box (`x/y/width/height`) plus a
// stroke/fill; `box` additionally has `cornerRadius`. `line`/`arrow` drop
// the bounding box in favor of explicit endpoints (`x1/y1/x2/y2`), since a
// bounding box can't disambiguate a rising diagonal from a falling one;
// `arrow` additionally carries `arrowStart`/`arrowEnd`. Every object carries
// an explicit `zIndex` that determines paint order (see boundsOf/
// translateObject below and DeckCanvas.tsx's per-object CSS z-index).

interface BaseDeckObject {
  id: string
  zIndex: number
  opacity: number
}

export interface TextBoxObject extends BaseDeckObject {
  type: 'textBox'
  x: number
  y: number
  width: number
  height: number
  rotation: number
  text: TextBlock[]
  fillColor: string
  borderColor: string
  fontColor: string
  fontSize: number
}

export interface BoxObject extends BaseDeckObject {
  type: 'box'
  x: number
  y: number
  width: number
  height: number
  rotation: number
  fillColor: string
  borderColor: string
  borderWidth: number
  cornerRadius: number
}

export interface EllipseObject extends BaseDeckObject {
  type: 'ellipse'
  x: number
  y: number
  width: number
  height: number
  rotation: number
  fillColor: string
  borderColor: string
  borderWidth: number
}

export interface LineObject extends BaseDeckObject {
  type: 'line'
  x1: number
  y1: number
  x2: number
  y2: number
  strokeColor: string
  strokeWidth: number
}

export interface ArrowObject extends BaseDeckObject {
  type: 'arrow'
  x1: number
  y1: number
  x2: number
  y2: number
  strokeColor: string
  strokeWidth: number
  arrowStart: boolean
  arrowEnd: boolean
}

/**
 * A cropped/scaled image: `x/y/width/height` is the destination box on the
 * slide (participates in boundsOf/translateObject like box/ellipse), while
 * `cropX/cropY/cropWidth/cropHeight` is an independent rectangle in the
 * *source* image's own pixel coordinates (design.md's "image joins the
 * DeckObject union with its own geometry shape"). The two rectangles' aspect
 * ratios are independent — nothing here enforces or assumes they match; the
 * renderer reconciles a mismatch by fitting the crop into the destination
 * box at a single uniform scale (design.md's "Crop and destination are
 * independent rectangles").
 */
export interface ImageObject extends BaseDeckObject {
  type: 'image'
  src: string
  x: number
  y: number
  width: number
  height: number
  cropX: number
  cropY: number
  cropWidth: number
  cropHeight: number
  rotation: number
}

export type ShapeType = 'line' | 'box' | 'ellipse' | 'arrow'
export type ShapeObject = BoxObject | EllipseObject | LineObject | ArrowObject
export type DeckObject = TextBoxObject | ShapeObject | ImageObject

export interface Slide {
  id: string
  objects: DeckObject[]
  backgroundColor: string
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
  backgroundColor: string
  selection: string[]
  canUndo: boolean
  canRedo: boolean
}

export interface OpResult {
  ok: boolean
  error?: string
}

// --- Undo/redo history ---
//
// See openspec/changes/add-undo-redo-support/design.md's "Whole-state
// snapshots per entry, not inverse operations": each entry stores a
// deep-cloned before/after `{ decks, activeDeckId, selection }` snapshot
// rather than a hand-written inverse per action, so undo/redo is correct by
// construction regardless of which mutation produced the entry.

export type Actor = 'user' | 'agent'

interface HistorySnapshot {
  decks: Deck[]
  activeDeckId: string
  selection: string[]
}

interface HistoryEntry {
  id: string
  actor: Actor
  timestamp: number
  description: string
  before: HistorySnapshot
  after: HistorySnapshot
  /** Set only for mergeable applyUpdate actions (see mergeKeyFor) — lets a same-kind, same-target, same-actor edit within HISTORY_MERGE_WINDOW_MS extend this entry instead of pushing a new one. Never exposed via HistoryEntrySummary. */
  mergeKey?: string
  /** When the current merge burst started (set once, unlike `timestamp` which advances on every merge) — caps how long a continuous run of edits can keep collapsing into one entry, see HISTORY_MERGE_MAX_BURST_MS. */
  mergeBurstStart?: number
}

export interface HistoryEntrySummary {
  actor: Actor
  timestamp: number
  description: string
}

export interface HistoryResult {
  entries: HistoryEntrySummary[]
  canUndo: boolean
  canRedo: boolean
}

export interface HistoryStepResult {
  steppedEntries: HistoryEntrySummary[]
  canUndo: boolean
  canRedo: boolean
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
  | 'setEndpoint'
  | 'setZIndex'
  | 'bringForward'
  | 'sendBackward'
  | 'bringToFront'
  | 'sendToBack'
  | 'setStrokeWidth'
  | 'setBorderWidth'
  | 'setCornerRadius'
  | 'setArrowHeads'
  | 'setOpacity'
  | 'setRotation'
  | 'setImageSource'
  | 'setCrop'

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

const DEFAULT_STROKE_COLOR = '#374151'
const DEFAULT_STROKE_WIDTH = 2
const DEFAULT_BORDER_WIDTH = 2
const DEFAULT_CORNER_RADIUS = 0
export const DEFAULT_SLIDE_BACKGROUND_COLOR = '#ffffff'

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export function isLineLike(obj: DeckObject): obj is LineObject | ArrowObject {
  return obj.type === 'line' || obj.type === 'arrow'
}

export function isTextBox(obj: DeckObject): obj is TextBoxObject {
  return obj.type === 'textBox'
}

export function isImage(obj: DeckObject): obj is ImageObject {
  return obj.type === 'image'
}

function hasFillStyle(obj: DeckObject): obj is TextBoxObject | BoxObject | EllipseObject {
  return obj.type === 'textBox' || obj.type === 'box' || obj.type === 'ellipse'
}

/** Bounding-box types that carry an independently settable rotation — deliberately excludes line/arrow (design.md's "rotation stays on the four bounding-box interfaces individually"), so the type system enforces deck-shape-elements' "Lines and arrows do not support rotation" requirement. */
export function hasRotation(obj: DeckObject): obj is TextBoxObject | ImageObject | BoxObject | EllipseObject {
  return obj.type === 'textBox' || obj.type === 'image' || obj.type === 'box' || obj.type === 'ellipse'
}

/**
 * Bounding box for any object type — literal x/y/width/height for box-like
 * types, min/max of the two endpoints for line/arrow. Unifies slide-bounds
 * clamping, grid layout, and drag-translate across all five types (see
 * design.md's "A boundsOf(object) helper unifies bounding-box logic across
 * types" decision).
 */
export function boundsOf(obj: DeckObject): Bounds {
  if (isLineLike(obj)) {
    return {
      x: Math.min(obj.x1, obj.x2),
      y: Math.min(obj.y1, obj.y2),
      width: Math.abs(obj.x2 - obj.x1),
      height: Math.abs(obj.y2 - obj.y1),
    }
  }
  return { x: obj.x, y: obj.y, width: obj.width, height: obj.height }
}

/** Moves whichever fields the object's type actually has by (dx, dy) — the "translate" half of the boundsOf pairing. */
function translateObject(obj: DeckObject, dx: number, dy: number): void {
  if (isLineLike(obj)) {
    obj.x1 += dx
    obj.y1 += dy
    obj.x2 += dx
    obj.y2 += dy
  } else {
    obj.x += dx
    obj.y += dy
  }
}

function nextZIndex(slide: Slide): number {
  return slide.objects.length === 0 ? 0 : Math.max(...slide.objects.map((o) => o.zIndex)) + 1
}

/**
 * Clamps an object to the slide's 0,0-960,540 bounds via boundsOf/
 * translateObject, the single source of truth for both UI-driven updates and
 * presentation-bridge tool calls (see openspec/changes/
 * constrain-content-to-slide-bounds/design.md, generalized across object
 * types by add-deck-styling-elements/design.md). Box-like types clamp their
 * own width/height first (size before position, so a resize that grows past
 * an edge still lands fully on-slide); line/arrow have no independent size
 * field, so their bounding box is clamped by translating the whole object.
 */
function clampToSlide(obj: DeckObject): void {
  if (!isLineLike(obj)) {
    obj.width = Math.min(Math.max(1, obj.width), SLIDE_WIDTH)
    obj.height = Math.min(Math.max(1, obj.height), SLIDE_HEIGHT)
  }
  const bounds = boundsOf(obj)
  const maxX = Math.max(0, SLIDE_WIDTH - bounds.width)
  const maxY = Math.max(0, SLIDE_HEIGHT - bounds.height)
  const dx = Math.min(Math.max(0, bounds.x), maxX) - bounds.x
  const dy = Math.min(Math.max(0, bounds.y), maxY) - bounds.y
  translateObject(obj, dx, dy)
}

// Shared by getState()/exportSnapshot() (both need an isolated copy so a
// caller can't mutate live state through the returned objects) and the
// undo/redo history snapshots below (which need every entry's before/after
// state to stay independent of subsequent live mutations).
// image carries no nested arrays/objects (unlike textBox's `text`), so a
// shallow spread is a safe deep-enough clone — no dedicated branch needed.
function cloneObject(o: DeckObject): DeckObject {
  if (o.type === 'textBox') return { ...o, text: o.text.map((b) => ({ ...b, runs: b.runs.map((r) => ({ ...r })) })) }
  return { ...o }
}

function cloneSlide(s: Slide): Slide {
  return { ...s, objects: s.objects.map(cloneObject) }
}

function cloneDeck(d: Deck): Deck {
  return { ...d, slides: d.slides.map(cloneSlide) }
}

function cloneDecks(decks: Deck[]): Deck[] {
  return decks.map(cloneDeck)
}

function toHistorySummary(e: HistoryEntry): HistoryEntrySummary {
  return { actor: e.actor, timestamp: e.timestamp, description: e.description }
}

const UPDATE_DESCRIPTIONS: Record<UpdateAction, (targetCount: number) => string> = {
  setPosition: (n) => `Moved ${n} object${n === 1 ? '' : 's'}`,
  setSize: (n) => `Resized ${n} object${n === 1 ? '' : 's'}`,
  setText: (n) => `Edited text on ${n} object${n === 1 ? '' : 's'}`,
  setFillColor: (n) => `Changed fill color on ${n} object${n === 1 ? '' : 's'}`,
  setFontColor: (n) => `Changed font color on ${n} object${n === 1 ? '' : 's'}`,
  setBorderColor: (n) => `Changed border color on ${n} object${n === 1 ? '' : 's'}`,
  setFontSize: (n) => `Changed font size on ${n} object${n === 1 ? '' : 's'}`,
  applyGridLayout: (n) => `Laid out ${n} object${n === 1 ? '' : 's'} in a grid`,
  addObject: () => 'Added object',
  removeObject: (n) => `Removed ${n} object${n === 1 ? '' : 's'}`,
  applyTextStyle: (n) => `Changed text style on ${n} object${n === 1 ? '' : 's'}`,
  setEndpoint: (n) => `Adjusted endpoint on ${n} object${n === 1 ? '' : 's'}`,
  setZIndex: (n) => `Changed stacking order of ${n} object${n === 1 ? '' : 's'}`,
  bringForward: (n) => `Brought ${n} object${n === 1 ? '' : 's'} forward`,
  sendBackward: (n) => `Sent ${n} object${n === 1 ? '' : 's'} backward`,
  bringToFront: (n) => `Brought ${n} object${n === 1 ? '' : 's'} to front`,
  sendToBack: (n) => `Sent ${n} object${n === 1 ? '' : 's'} to back`,
  setStrokeWidth: (n) => `Changed stroke width on ${n} object${n === 1 ? '' : 's'}`,
  setBorderWidth: (n) => `Changed border width on ${n} object${n === 1 ? '' : 's'}`,
  setCornerRadius: (n) => `Changed corner radius on ${n} object${n === 1 ? '' : 's'}`,
  setArrowHeads: (n) => `Changed arrowheads on ${n} object${n === 1 ? '' : 's'}`,
  setOpacity: (n) => `Changed opacity on ${n} object${n === 1 ? '' : 's'}`,
  setRotation: (n) => `Rotated ${n} object${n === 1 ? '' : 's'}`,
  setImageSource: (n) => `Changed image source on ${n} object${n === 1 ? '' : 's'}`,
  setCrop: (n) => `Changed crop on ${n} object${n === 1 ? '' : 's'}`,
}

function describeUpdate(action: UpdateAction, targetIds: string[]): string {
  return UPDATE_DESCRIPTIONS[action](targetIds.length)
}

// History-entry merging: a burst of rapid, same-kind edits to the same
// target(s) (font-size stepper clicks, a color-picker drag firing many
// onChange events, several quick nudges/resizes on the same object) should
// collapse into a single undo step rather than one entry per intermediate
// value — see commitHistory's mergeKey handling below. Structural/discrete
// actions (setText, applyTextStyle, addObject, removeObject,
// applyGridLayout, the z-order actions, setArrowHeads, setImageSource,
// setCrop) are deliberately excluded: each one is a distinct, intentional
// edit even when several happen in quick succession — setImageSource/setCrop
// in particular have no natural rapid-fire burst the way a drag/slider does
// (design.md's "Undo/redo: setOpacity/setRotation are mergeable; image tool
// calls are not").
//
// Two limits, not one: HISTORY_MERGE_WINDOW_MS is a sliding gap check (each
// new edit must land within this long of the *previous* edit to extend the
// burst — an edit can keep extending it indefinitely otherwise), while
// HISTORY_MERGE_MAX_BURST_MS caps the *total* burst duration from its first
// edit, so a marathon continuous-drag/slider session still gets chunked
// into a few undo steps instead of collapsing into one giant one.
const HISTORY_MERGE_WINDOW_MS = 600
const HISTORY_MERGE_MAX_BURST_MS = 2000
const MERGEABLE_UPDATE_ACTIONS = new Set<UpdateAction>([
  'setPosition',
  'setSize',
  'setFillColor',
  'setFontColor',
  'setBorderColor',
  'setFontSize',
  'setEndpoint',
  'setStrokeWidth',
  'setBorderWidth',
  'setCornerRadius',
  'setOpacity',
  'setRotation',
])

function mergeKeyFor(action: UpdateAction, targetIds: string[]): string {
  return `${action}:${[...targetIds].sort().join(',')}`
}

function seedObjects(): DeckObject[] {
  return [
    {
      id: 'title',
      type: 'textBox',
      zIndex: 0,
      opacity: 1,
      rotation: 0,
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
      type: 'textBox',
      zIndex: 1,
      opacity: 1,
      rotation: 0,
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
      type: 'textBox',
      zIndex: 2,
      opacity: 1,
      rotation: 0,
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

/**
 * Applies one UpdateAction to a single target object, validated against its
 * actual `type` (mismatched field/type reported as an error string, same
 * pattern as an unknown target id — see design.md's "Lenient but
 * type-checked args"). Returns undefined on success. Only ever called for
 * actions that are per-target (applyGridLayout/addObject/removeObject are
 * handled earlier in runUpdate, before the per-id loop that calls this).
 */
function applyActionToTarget(obj: DeckObject, action: UpdateAction, args: Record<string, unknown>, slide: Slide): string | undefined {
  switch (action) {
    case 'setPosition': {
      const bounds = boundsOf(obj)
      let dx = typeof args.x === 'number' ? args.x - bounds.x : 0
      let dy = typeof args.y === 'number' ? args.y - bounds.y : 0
      if (typeof args.dx === 'number') dx += args.dx
      if (typeof args.dy === 'number') dy += args.dy
      translateObject(obj, dx, dy)
      clampToSlide(obj)
      return undefined
    }
    case 'setSize':
      if (isLineLike(obj)) return `setSize does not apply to type "${obj.type}"`
      if (typeof args.width === 'number') obj.width = args.width
      if (typeof args.height === 'number') obj.height = args.height
      clampToSlide(obj)
      return undefined
    case 'setEndpoint': {
      if (!isLineLike(obj)) return `setEndpoint does not apply to type "${obj.type}"`
      if ((args.which !== 'start' && args.which !== 'end') || typeof args.x !== 'number' || typeof args.y !== 'number') {
        return 'setEndpoint requires "which" ("start" or "end") and numeric x/y'
      }
      const x = Math.min(Math.max(0, args.x), SLIDE_WIDTH)
      const y = Math.min(Math.max(0, args.y), SLIDE_HEIGHT)
      if (args.which === 'start') {
        obj.x1 = x
        obj.y1 = y
      } else {
        obj.x2 = x
        obj.y2 = y
      }
      return undefined
    }
    case 'setText':
      if (!isTextBox(obj)) return `setText does not apply to type "${obj.type}"`
      if (typeof args.text === 'string' || Array.isArray(args.text)) obj.text = normalizeText(args.text)
      return undefined
    case 'setFillColor':
      if (!hasFillStyle(obj)) return `setFillColor does not apply to type "${obj.type}"`
      if (typeof args.color === 'string') obj.fillColor = args.color
      return undefined
    case 'setBorderColor':
      // Generic across text/box/ellipse/line/arrow: sets borderColor for
      // text/box/ellipse, or strokeColor for line/arrow (design.md's "New pi
      // tools vs. extending presentation_update" decision). image has
      // neither field — it's the one type with no border-like styling.
      if (obj.type === 'image') return `setBorderColor does not apply to type "${obj.type}"`
      if (typeof args.color === 'string') {
        if (isLineLike(obj)) obj.strokeColor = args.color
        else obj.borderColor = args.color
      }
      return undefined
    case 'setFontColor':
      if (!isTextBox(obj)) return `setFontColor does not apply to type "${obj.type}"`
      if (typeof args.color === 'string') obj.fontColor = args.color
      return undefined
    case 'setFontSize':
      if (!isTextBox(obj)) return `setFontSize does not apply to type "${obj.type}"`
      if (typeof args.fontSize === 'number') obj.fontSize = Math.max(1, args.fontSize)
      return undefined
    case 'applyTextStyle': {
      if (!isTextBox(obj)) return `applyTextStyle does not apply to type "${obj.type}"`
      const start = typeof args.start === 'number' ? args.start : 0
      const end = typeof args.end === 'number' ? args.end : start
      if (args.mark === 'bold' || args.mark === 'italic') {
        obj.text = applyMarkToBlocks(obj.text, start, end, args.mark, args.value === true)
      } else if ('listType' in args) {
        const listType = args.listType === 'bulleted' || args.listType === 'numbered' ? args.listType : null
        obj.text = applyListTypeToBlocks(obj.text, start, end, listType)
      }
      return undefined
    }
    case 'setStrokeWidth':
      if (!isLineLike(obj)) return `setStrokeWidth does not apply to type "${obj.type}"`
      if (typeof args.strokeWidth === 'number') obj.strokeWidth = Math.max(1, args.strokeWidth)
      return undefined
    case 'setBorderWidth':
      if (obj.type !== 'box' && obj.type !== 'ellipse') return `setBorderWidth does not apply to type "${obj.type}"`
      if (typeof args.borderWidth === 'number') obj.borderWidth = Math.max(0, args.borderWidth)
      return undefined
    case 'setCornerRadius':
      if (obj.type !== 'box') return `setCornerRadius does not apply to type "${obj.type}"`
      if (typeof args.cornerRadius === 'number') obj.cornerRadius = Math.max(0, args.cornerRadius)
      return undefined
    case 'setArrowHeads':
      if (obj.type !== 'arrow') return `setArrowHeads does not apply to type "${obj.type}"`
      if (typeof args.arrowStart === 'boolean') obj.arrowStart = args.arrowStart
      if (typeof args.arrowEnd === 'boolean') obj.arrowEnd = args.arrowEnd
      return undefined
    case 'setOpacity':
      if (typeof args.opacity !== 'number') return 'setOpacity requires numeric "opacity"'
      obj.opacity = Math.min(1, Math.max(0, args.opacity))
      return undefined
    case 'setRotation':
      if (!hasRotation(obj)) return `setRotation does not apply to type "${obj.type}"`
      if (typeof args.rotation !== 'number') return 'setRotation requires numeric "rotation"'
      obj.rotation = args.rotation
      return undefined
    case 'setImageSource': {
      if (!isImage(obj)) return `setImageSource does not apply to type "${obj.type}"`
      if (typeof args.src !== 'string' || !args.src.trim()) return 'setImageSource requires non-empty "src"'
      if (typeof args.naturalWidth !== 'number' || typeof args.naturalHeight !== 'number') {
        return 'setImageSource requires numeric "naturalWidth"/"naturalHeight" for the new source (the server cannot inspect image bytes itself)'
      }
      obj.src = args.src
      // Crop resets to the new source's full extent (deck-image-elements'
      // "Agent changes an image's source" scenario); destination
      // x/y/width/height are left untouched — crop and destination are
      // independent rectangles, reconciled only at render time.
      obj.cropX = 0
      obj.cropY = 0
      obj.cropWidth = args.naturalWidth
      obj.cropHeight = args.naturalHeight
      return undefined
    }
    case 'setCrop': {
      if (!isImage(obj)) return `setCrop does not apply to type "${obj.type}"`
      if (typeof args.cropX === 'number') obj.cropX = args.cropX
      if (typeof args.cropY === 'number') obj.cropY = args.cropY
      if (typeof args.cropWidth === 'number') obj.cropWidth = args.cropWidth
      if (typeof args.cropHeight === 'number') obj.cropHeight = args.cropHeight
      return undefined
    }
    case 'setZIndex':
      if (typeof args.zIndex !== 'number') return 'setZIndex requires numeric "zIndex"'
      obj.zIndex = args.zIndex
      return undefined
    case 'bringForward': {
      const higher = slide.objects.filter((o) => o.zIndex > obj.zIndex).sort((a, b) => a.zIndex - b.zIndex)[0]
      if (higher) {
        const tmp = obj.zIndex
        obj.zIndex = higher.zIndex
        higher.zIndex = tmp
      }
      return undefined
    }
    case 'sendBackward': {
      const lower = slide.objects.filter((o) => o.zIndex < obj.zIndex).sort((a, b) => b.zIndex - a.zIndex)[0]
      if (lower) {
        const tmp = obj.zIndex
        obj.zIndex = lower.zIndex
        lower.zIndex = tmp
      }
      return undefined
    }
    case 'bringToFront':
      obj.zIndex = Math.max(...slide.objects.map((o) => o.zIndex)) + 1
      return undefined
    case 'sendToBack':
      obj.zIndex = Math.min(...slide.objects.map((o) => o.zIndex)) - 1
      return undefined
    default:
      // applyGridLayout/addObject/removeObject never reach here — runUpdate
      // handles them before the per-id loop that calls this function.
      return undefined
  }
}

const HISTORY_CAP = 100

export class EditorStore {
  private decks = new Map<string, Deck>()
  private activeDeckId: string
  private selection: string[] = []
  private listeners = new Set<(state: DeckState) => void>()
  private history: HistoryEntry[] = []
  private redoStack: HistoryEntry[] = []

  /** @param initial Restored snapshot to seed from (see deck-persistence.ts's `loadSnapshot`); omitted/null builds the hardcoded demo deck (first run / no persisted state). */
  constructor(initial?: { decks: Deck[]; activeDeckId: string } | null) {
    if (initial && initial.decks.length > 0) {
      for (const deck of initial.decks) this.decks.set(deck.id, deck)
      this.activeDeckId = initial.activeDeckId
    } else {
      const slide: Slide = { id: randomUUID(), objects: seedObjects(), backgroundColor: DEFAULT_SLIDE_BACKGROUND_COLOR }
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

  private snapshotState(): HistorySnapshot {
    return { decks: cloneDecks([...this.decks.values()]), activeDeckId: this.activeDeckId, selection: [...this.selection] }
  }

  /** Deep-clones the target snapshot before adopting it as live state, so a later mutation can never corrupt a still-reachable history entry (see design.md's "correct by construction" guarantee — restoring by reference would let a subsequent edit mutate the very entry it was restored from). */
  private restoreSnapshot(snapshot: HistorySnapshot) {
    this.decks = new Map(cloneDecks(snapshot.decks).map((d) => [d.id, d]))
    this.activeDeckId = snapshot.activeDeckId
    this.selection = [...snapshot.selection]
  }

  /**
   * Centralizes the cap/eviction/redo-invalidation rule (design.md's
   * "History capture centralized in one private wrapper") — pushes one
   * entry from an already-captured before/after pair, then emits once.
   *
   * When `mergeKey` is given and matches the current top-of-stack entry's
   * `mergeKey` (same actor, same action, same target ids), that entry was
   * last touched within `HISTORY_MERGE_WINDOW_MS`, and the burst it's part
   * of started no more than `HISTORY_MERGE_MAX_BURST_MS` ago, this extends
   * that entry in place (new `after`, refreshed `timestamp`) instead of
   * pushing a new one — collapsing a burst of rapid same-kind edits
   * (font-size stepper clicks, a color-picker drag, several quick nudges on
   * the same object) into a single undo step. The merged entry's original
   * `before` is left untouched, so one Undo reverts the whole burst — up to
   * the max-burst cap, after which a new burst (and a new entry) starts.
   */
  private commitHistory(actor: Actor, description: string, before: HistorySnapshot, after: HistorySnapshot, mergeKey?: string) {
    const top = this.history[this.history.length - 1]
    const now = Date.now()
    if (
      mergeKey &&
      top &&
      top.mergeKey === mergeKey &&
      top.actor === actor &&
      now - top.timestamp <= HISTORY_MERGE_WINDOW_MS &&
      now - (top.mergeBurstStart ?? top.timestamp) <= HISTORY_MERGE_MAX_BURST_MS
    ) {
      top.after = after
      top.timestamp = now
      this.emit()
      return
    }
    this.redoStack = []
    this.history.push({ id: randomUUID(), actor, timestamp: now, description, before, after, mergeKey, mergeBurstStart: now })
    if (this.history.length > HISTORY_CAP) this.history.shift()
    this.emit()
  }

  /** Snapshots before/after around `mutate`, unconditionally committing a history entry — for methods (createDeck, deleteDeck, addSlide, removeSlide, setSlideBackgroundColor) whose callers already guard against no-op calls before invoking them. applyUpdate/addShape capture their own before/after instead, since they must skip the commit when nothing actually changed (see their own comments). `mergeKey` lets a caller opt into the same burst-coalescing behavior commitHistory gives applyUpdate (see setSlideBackgroundColor). */
  private withHistory<T>(actor: Actor, description: string, mutate: () => T, mergeKey?: string): T {
    const before = this.snapshotState()
    const result = mutate()
    const after = this.snapshotState()
    this.commitHistory(actor, description, before, after, mergeKey)
    return result
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
      objects: slide.objects.map(cloneObject),
      backgroundColor: slide.backgroundColor,
      selection: [...this.selection],
      canUndo: this.history.length > 0,
      canRedo: this.redoStack.length > 0,
    }
  }

  // --- Deck management ---

  createDeck(actor: Actor, name: string): { deckId: string } {
    return this.withHistory(actor, `Created deck "${name}"`, () => {
      const slide: Slide = { id: randomUUID(), objects: [], backgroundColor: DEFAULT_SLIDE_BACKGROUND_COLOR }
      const deck: Deck = { id: randomUUID(), name, slides: [slide], activeSlideId: slide.id }
      this.decks.set(deck.id, deck)
      this.activeDeckId = deck.id
      this.selection = []
      return { deckId: deck.id }
    })
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

  renameDeck(deckId: string, name: string): OpResult {
    const deck = this.decks.get(deckId)
    if (!deck) return { ok: false, error: `No deck with id "${deckId}"` }
    const trimmed = name.trim()
    if (!trimmed) return { ok: false, error: 'Deck name cannot be empty' }
    deck.name = trimmed
    this.emit()
    return { ok: true }
  }

  deleteDeck(actor: Actor, deckId: string): OpResult {
    const deck = this.decks.get(deckId)
    if (!deck) return { ok: false, error: `No deck with id "${deckId}"` }
    if (this.decks.size === 1) return { ok: false, error: 'Cannot delete the only remaining deck' }
    return this.withHistory(actor, `Deleted deck "${deck.name}"`, () => {
      this.decks.delete(deckId)
      if (this.activeDeckId === deckId) {
        this.activeDeckId = this.decks.keys().next().value!
        this.selection = []
      }
      return { ok: true }
    })
  }

  // --- Slide management (active deck) ---

  addSlide(actor: Actor): { slideId: string } {
    return this.withHistory(actor, 'Added slide', () => {
      const deck = this.activeDeck()
      const slide: Slide = { id: randomUUID(), objects: [], backgroundColor: DEFAULT_SLIDE_BACKGROUND_COLOR }
      deck.slides.push(slide)
      deck.activeSlideId = slide.id
      this.selection = []
      return { slideId: slide.id }
    })
  }

  removeSlide(actor: Actor, slideId: string): OpResult {
    const deck = this.activeDeck()
    const index = deck.slides.findIndex((s) => s.id === slideId)
    if (index === -1) return { ok: false, error: `No slide with id "${slideId}" in the active deck` }
    if (deck.slides.length === 1) return { ok: false, error: 'Cannot remove the only remaining slide in a deck' }
    return this.withHistory(actor, 'Removed slide', () => {
      deck.slides.splice(index, 1)
      if (deck.activeSlideId === slideId) {
        const neighborIndex = Math.min(index, deck.slides.length - 1)
        deck.activeSlideId = deck.slides[neighborIndex].id
        this.selection = []
      }
      return { ok: true }
    })
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

  /** Sets the active slide's background color. Content mutation, so it goes through withHistory; keyed by slide id so a dragged color-picker change coalesces into one undo step, same as setFillColor (see design.md's "Undo/redo integration" decision). */
  setSlideBackgroundColor(actor: Actor, color: string): OpResult {
    if (typeof color !== 'string' || !color.trim()) return { ok: false, error: 'setSlideBackgroundColor requires a non-empty "color"' }
    const slide = this.activeSlide()
    return this.withHistory(
      actor,
      'Changed slide background color',
      () => {
        slide.backgroundColor = color
        return { ok: true }
      },
      `setSlideBackgroundColor:${slide.id}`,
    )
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
      .filter((o): o is TextBoxObject => o.type === 'textBox')
      .filter((o) => {
        const text = plainTextOf(o)
        return (caseSensitive ? text : text.toLowerCase()).includes(needle)
      })
      .map((o) => o.id)
  }

  /**
   * Captures its own before/after snapshot instead of routing through
   * `withHistory` because, unlike createDeck/deleteDeck/addSlide/removeSlide
   * (which each validate upfront and always succeed once past that guard),
   * a call here can process a batch of target ids where every one fails
   * (unknown id, addObject's required-field/duplicate-id checks) — nothing
   * actually mutates, and per deck-undo-redo spec's "Content mutations are
   * captured in history" a no-op call must not push a history entry.
   */
  applyUpdate(actor: Actor, action: UpdateAction, targetIds: string[], args: Record<string, unknown>): UpdateResult {
    const before = this.snapshotState()
    const result = this.runUpdate(action, targetIds, args)
    if (result.changed.length > 0) {
      const mergeKey = MERGEABLE_UPDATE_ACTIONS.has(action) ? mergeKeyFor(action, result.changed) : undefined
      this.commitHistory(actor, describeUpdate(action, targetIds), before, this.snapshotState(), mergeKey)
    }
    return result
  }

  /**
   * Creates a new shape object (`line`/`box`/`ellipse`/`arrow`) on the
   * active slide, mirroring `applyUpdate`'s own comment on exactly the same
   * hazard: shape creation can fail validation (missing/invalid geometry),
   * so this captures its own before/after and only commits history when
   * creation actually succeeded — a no-op call must not push a history
   * entry (see design.md's "presentation_add_shape's addShape must follow
   * applyUpdate's pattern, not withHistory").
   */
  addShape(actor: Actor, args: Record<string, unknown>): UpdateResult {
    const before = this.snapshotState()
    const result = this.createShape(args)
    if (result.changed.length > 0) {
      this.commitHistory(actor, `Added ${typeof args.type === 'string' ? args.type : 'shape'}`, before, this.snapshotState())
    }
    return result
  }

  private createShape(args: Record<string, unknown>): UpdateResult {
    const errors: string[] = []
    const changed: string[] = []
    const type = args.type
    if (type !== 'line' && type !== 'box' && type !== 'ellipse' && type !== 'arrow') {
      errors.push('addShape requires "type" to be one of "line", "box", "ellipse", "arrow"')
      return { changed, errors }
    }
    const slide = this.activeSlide()
    const id = typeof args.id === 'string' && args.id.trim() ? args.id : randomUUID()
    if (slide.objects.some((o) => o.id === id)) {
      errors.push(`Object with id "${id}" already exists on the active slide`)
      return { changed, errors }
    }
    const zIndex = nextZIndex(slide)

    if (type === 'box' || type === 'ellipse') {
      for (const key of ['x', 'y', 'width', 'height'] as const) {
        if (typeof args[key] !== 'number') errors.push(`addShape requires numeric "${key}" for type "${type}"`)
      }
      if (errors.length > 0) return { changed, errors }
      const fillColor = typeof args.fillColor === 'string' ? args.fillColor : 'transparent'
      const borderColor = typeof args.borderColor === 'string' ? args.borderColor : DEFAULT_STROKE_COLOR
      const borderWidth = typeof args.borderWidth === 'number' ? Math.max(0, args.borderWidth) : DEFAULT_BORDER_WIDTH
      const geometry = { x: args.x as number, y: args.y as number, width: args.width as number, height: args.height as number }
      const obj: DeckObject =
        type === 'box'
          ? {
              id,
              type,
              zIndex,
              opacity: 1,
              rotation: 0,
              ...geometry,
              fillColor,
              borderColor,
              borderWidth,
              cornerRadius: typeof args.cornerRadius === 'number' ? Math.max(0, args.cornerRadius) : DEFAULT_CORNER_RADIUS,
            }
          : { id, type, zIndex, opacity: 1, rotation: 0, ...geometry, fillColor, borderColor, borderWidth }
      clampToSlide(obj)
      slide.objects.push(obj)
      changed.push(obj.id)
      return { changed, errors }
    }

    for (const key of ['x1', 'y1', 'x2', 'y2'] as const) {
      if (typeof args[key] !== 'number') errors.push(`addShape requires numeric "${key}" for type "${type}"`)
    }
    if (errors.length > 0) return { changed, errors }
    const strokeColor = typeof args.strokeColor === 'string' ? args.strokeColor : DEFAULT_STROKE_COLOR
    const strokeWidth = typeof args.strokeWidth === 'number' ? Math.max(1, args.strokeWidth) : DEFAULT_STROKE_WIDTH
    const points = { x1: args.x1 as number, y1: args.y1 as number, x2: args.x2 as number, y2: args.y2 as number }
    const obj: DeckObject =
      type === 'arrow'
        ? { id, type, zIndex, opacity: 1, ...points, strokeColor, strokeWidth, arrowStart: args.arrowStart === true, arrowEnd: args.arrowEnd !== false }
        : { id, type, zIndex, opacity: 1, ...points, strokeColor, strokeWidth }
    clampToSlide(obj)
    slide.objects.push(obj)
    changed.push(obj.id)
    return { changed, errors }
  }

  /**
   * Creates a new `image` object on the active slide, mirroring
   * `createShape`'s validation + own before/after history-capture pattern
   * (see `addImage` below). Crop fields default to the full source image's
   * extent — this requires the *caller* (the tool layer / client, per
   * design.md) to supply the source's natural dimensions via
   * naturalWidth/naturalHeight, since the store has no way to inspect image
   * bytes itself.
   */
  private createImage(args: Record<string, unknown>): UpdateResult {
    const errors: string[] = []
    const changed: string[] = []
    if (typeof args.src !== 'string' || !args.src.trim()) errors.push('addImage requires non-empty "src"')
    for (const key of ['x', 'y'] as const) {
      if (typeof args[key] !== 'number') errors.push(`addImage requires numeric "${key}"`)
    }
    if (typeof args.width !== 'number' && typeof args.height !== 'number') {
      errors.push('addImage requires numeric "width" and/or "height"')
    }
    const hasCropSize = typeof args.cropWidth === 'number' || typeof args.cropHeight === 'number'
    if (!hasCropSize && (typeof args.naturalWidth !== 'number' || typeof args.naturalHeight !== 'number')) {
      errors.push('addImage requires "cropWidth"/"cropHeight", or "naturalWidth"/"naturalHeight" to default the crop to the full source image')
    }
    if (errors.length > 0) return { changed, errors }

    const slide = this.activeSlide()
    const id = typeof args.id === 'string' && args.id.trim() ? args.id : randomUUID()
    if (slide.objects.some((o) => o.id === id)) {
      errors.push(`Object with id "${id}" already exists on the active slide`)
      return { changed, errors }
    }

    const cropX = typeof args.cropX === 'number' ? args.cropX : 0
    const cropY = typeof args.cropY === 'number' ? args.cropY : 0
    const cropWidth = typeof args.cropWidth === 'number' ? args.cropWidth : (args.naturalWidth as number)
    const cropHeight = typeof args.cropHeight === 'number' ? args.cropHeight : (args.naturalHeight as number)

    const obj: ImageObject = {
      id,
      type: 'image',
      zIndex: nextZIndex(slide),
      opacity: 1,
      rotation: 0,
      src: args.src as string,
      x: args.x as number,
      y: args.y as number,
      width: typeof args.width === 'number' ? args.width : (args.height as number) * (cropWidth / cropHeight),
      height: typeof args.height === 'number' ? args.height : (args.width as number) * (cropHeight / cropWidth),
      cropX,
      cropY,
      cropWidth,
      cropHeight,
    }
    clampToSlide(obj)
    slide.objects.push(obj)
    changed.push(obj.id)
    return { changed, errors }
  }

  /**
   * Mirrors `addShape`'s own before/after capture: `createImage` can fail
   * validation (missing src/geometry), and a no-op call must not push a
   * history entry (deck-undo-redo's "A failed image-creation call is not
   * captured").
   */
  addImage(actor: Actor, args: Record<string, unknown>): UpdateResult {
    const before = this.snapshotState()
    const result = this.createImage(args)
    if (result.changed.length > 0) {
      this.commitHistory(actor, 'Added image', before, this.snapshotState())
    }
    return result
  }

  private runUpdate(action: UpdateAction, targetIds: string[], args: Record<string, unknown>): UpdateResult {
    const slide = this.activeSlide()
    const errors: string[] = []
    const changed: string[] = []

    if (action === 'applyGridLayout') {
      const targets = targetIds.map((id) => slide.objects.find((o) => o.id === id)).filter((o): o is DeckObject => !!o)
      if (targets.length === 0) errors.push('No matching target objects for applyGridLayout')
      const direction = args.direction === 'vertical' ? 'vertical' : 'horizontal'
      const gap = typeof args.gap === 'number' ? args.gap : 24
      const targetBounds = targets.map((t) => boundsOf(t))
      let cursor = direction === 'horizontal' ? Math.min(...targetBounds.map((b) => b.x)) : Math.min(...targetBounds.map((b) => b.y))
      targets.forEach((t, i) => {
        const b = targetBounds[i]
        if (direction === 'horizontal') {
          translateObject(t, cursor - b.x, 0)
          cursor += b.width + gap
        } else {
          translateObject(t, 0, cursor - b.y)
          cursor += b.height + gap
        }
        changed.push(t.id)
      })
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
        type: 'textBox',
        zIndex: nextZIndex(slide),
        opacity: 1,
        rotation: 0,
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
      return { changed, errors }
    }

    for (const id of targetIds) {
      const obj = slide.objects.find((o) => o.id === id)
      if (!obj) {
        errors.push(`No object with id "${id}"`)
        continue
      }
      const error = applyActionToTarget(obj, action, args, slide)
      if (error) errors.push(error)
      else changed.push(id)
    }

    return { changed, errors }
  }

  /** Full decks/slides/objects snapshot (not the `getState()` broadcast shape, which only carries the active slide's objects) — used by deck-persistence.ts's debounced auto-save. */
  exportSnapshot(): { decks: Deck[]; activeDeckId: string } {
    return { decks: cloneDecks([...this.decks.values()]), activeDeckId: this.activeDeckId }
  }

  // --- Undo/redo ---
  //
  // `actor` is accepted (not currently branched on) for the same "explicit
  // parameter on every mutating method" convention as applyUpdate/createDeck/
  // etc. (design.md's "actor becomes an explicit parameter" decision) — undo
  // and redo don't themselves push a new history entry, so there's nothing
  // to attribute yet, but keeping the parameter here matches every other
  // mutating call site and leaves room for future provenance on the
  // undo/redo action itself.

  undo(actor: Actor, count = 1): HistoryStepResult {
    const stepped: HistoryEntry[] = []
    for (let i = 0; i < count && this.history.length > 0; i++) {
      const entry = this.history.pop()!
      this.redoStack.push(entry)
      stepped.push(entry)
    }
    if (stepped.length > 0) {
      this.restoreSnapshot(stepped[stepped.length - 1].before)
      this.emit()
    }
    return { steppedEntries: stepped.map(toHistorySummary), canUndo: this.history.length > 0, canRedo: this.redoStack.length > 0 }
  }

  redo(actor: Actor, count = 1): HistoryStepResult {
    const stepped: HistoryEntry[] = []
    for (let i = 0; i < count && this.redoStack.length > 0; i++) {
      const entry = this.redoStack.pop()!
      this.history.push(entry)
      stepped.push(entry)
    }
    if (stepped.length > 0) {
      this.restoreSnapshot(stepped[stepped.length - 1].after)
      this.emit()
    }
    return { steppedEntries: stepped.map(toHistorySummary), canUndo: this.history.length > 0, canRedo: this.redoStack.length > 0 }
  }

  getHistory(limit?: number): HistoryResult {
    const ordered = [...this.history].reverse()
    const entries = (limit !== undefined ? ordered.slice(0, limit) : ordered).map(toHistorySummary)
    return { entries, canUndo: this.history.length > 0, canRedo: this.redoStack.length > 0 }
  }
}

const initialSnapshot = loadSnapshot(readSnapshotFile(env.DECK_STATE_FILE))
export const editorStore = new EditorStore(initialSnapshot)
