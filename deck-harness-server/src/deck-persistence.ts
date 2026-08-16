// Debounced auto-save + startup restore for editor-state.ts's EditorStore —
// see openspec/changes/persist-deck-state/design.md for the full rationale.
//
// Only `import type` from editor-state.ts (erased at compile time): this
// module is loaded by editor-state.ts itself (to read the snapshot before
// constructing its `editorStore` singleton), so a runtime import back would
// be circular. sanitizeText below therefore duplicates normalizeText's
// lenient-parsing style rather than calling it directly.

import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Deck, DeckObject, EditorStore, Slide, TextBlock, TextRun } from './editor-state'

export interface DeckSnapshot {
  decks: Deck[]
  activeDeckId: string
}

const DEFAULT_FILL_COLOR = '#374151'
const DEFAULT_BORDER_COLOR = 'transparent'
const DEFAULT_FONT_COLOR = '#ffffff'
const DEFAULT_FONT_SIZE = 16
const AUTO_SAVE_DEBOUNCE_MS = 750

function sanitizeRun(input: unknown): TextRun | undefined {
  if (!input || typeof input !== 'object' || typeof (input as { text?: unknown }).text !== 'string') return undefined
  const r = input as { text: string; bold?: unknown; italic?: unknown }
  const run: TextRun = { text: r.text }
  if (r.bold === true) run.bold = true
  if (r.italic === true) run.italic = true
  return run
}

function sanitizeTextBlock(input: unknown): TextBlock {
  const b = (input ?? {}) as { kind?: unknown; listType?: unknown; runs?: unknown }
  const runs = Array.isArray(b.runs) ? b.runs.map(sanitizeRun).filter((r): r is TextRun => !!r) : []
  if (b.kind === 'listItem' && (b.listType === 'bulleted' || b.listType === 'numbered')) {
    return { kind: 'listItem', listType: b.listType, runs }
  }
  return { kind: 'paragraph', runs }
}

/** Mirrors editor-state.ts's normalizeText: any unrecognized shape falls back to empty text rather than failing the load. */
function sanitizeText(input: unknown): TextBlock[] {
  return Array.isArray(input) && input.length ? input.map(sanitizeTextBlock) : [{ kind: 'paragraph', runs: [] }]
}

function sanitizeNumber(input: unknown, fallback: number): number {
  return typeof input === 'number' && Number.isFinite(input) ? input : fallback
}

function sanitizeString(input: unknown, fallback: string): string {
  return typeof input === 'string' && input.trim() ? input : fallback
}

function sanitizeObject(input: unknown): DeckObject | null {
  if (!input || typeof input !== 'object') return null
  const o = input as Record<string, unknown>
  return {
    id: sanitizeString(o.id, randomUUID()),
    x: sanitizeNumber(o.x, 0),
    y: sanitizeNumber(o.y, 0),
    width: Math.max(1, sanitizeNumber(o.width, 100)),
    height: Math.max(1, sanitizeNumber(o.height, 100)),
    text: sanitizeText(o.text),
    fillColor: sanitizeString(o.fillColor, DEFAULT_FILL_COLOR),
    borderColor: sanitizeString(o.borderColor, DEFAULT_BORDER_COLOR),
    fontColor: sanitizeString(o.fontColor, DEFAULT_FONT_COLOR),
    fontSize: Math.max(1, sanitizeNumber(o.fontSize, DEFAULT_FONT_SIZE)),
  }
}

function sanitizeSlide(input: unknown): Slide | null {
  if (!input || typeof input !== 'object') return null
  const s = input as Record<string, unknown>
  const objects = Array.isArray(s.objects) ? s.objects.map(sanitizeObject).filter((o): o is DeckObject => o !== null) : []
  return { id: sanitizeString(s.id, randomUUID()), objects }
}

function sanitizeDeck(input: unknown): Deck | null {
  if (!input || typeof input !== 'object') return null
  const d = input as Record<string, unknown>
  const rawSlides = Array.isArray(d.slides) ? d.slides.map(sanitizeSlide).filter((s): s is Slide => s !== null) : []
  const slides = rawSlides.length > 0 ? rawSlides : [{ id: randomUUID(), objects: [] }]
  const activeSlideId = slides.some((s) => s.id === d.activeSlideId) ? (d.activeSlideId as string) : slides[0].id
  return {
    id: sanitizeString(d.id, randomUUID()),
    name: sanitizeString(d.name, 'Untitled Deck'),
    slides,
    activeSlideId,
  }
}

/**
 * Sanitizes a parsed JSON value into a usable deck snapshot, per
 * specs/deck-persistence/spec.md's "Lenient loading" requirement:
 * unrecognized fields are dropped, malformed/missing fields fall back to
 * defaults, and only a wholly-unusable shape returns null (the caller then
 * falls back to the default seed deck, same as first-run). Deliberately no
 * schema-version field and no migration between formats — old/foreign data
 * that doesn't fit is just dropped, per proposal.md.
 */
export function loadSnapshot(raw: unknown): DeckSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.decks)) return null
  const decks = r.decks.map(sanitizeDeck).filter((d): d is Deck => d !== null)
  if (decks.length === 0) return null
  const activeDeckId = decks.some((d) => d.id === r.activeDeckId) ? (r.activeDeckId as string) : decks[0].id
  return { decks, activeDeckId }
}

/** Reads and parses the snapshot file, tolerating a missing file or invalid JSON by returning null instead of throwing. */
export function readSnapshotFile(path: string): unknown | null {
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    console.warn(`deck-persistence: failed to parse "${path}", starting fresh: ${(err as Error).message}`)
    return null
  }
}

/** Writes the snapshot atomically: write to a temp file in the same directory, then rename over the target. */
export function writeSnapshotFile(path: string, state: DeckSnapshot): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmpPath = `${path}.tmp`
  writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf8')
  renameSync(tmpPath, path)
}

// Set by the active startAutoSave call (there's only ever one editorStore
// singleton in this server) so flushPendingSave can reach it without
// startAutoSave having to route its stop function through index.ts too.
let pendingFlush: (() => void) | null = null

/**
 * Subscribes to `store`'s emit hook and writes a debounced snapshot to
 * `path` after edits settle (trailing debounce: a burst of edits produces
 * one write of the final state, not one write per edit). Returns a stop
 * function that unsubscribes and cancels any pending timer.
 */
export function startAutoSave(store: EditorStore, path: string): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null

  const writeNow = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    writeSnapshotFile(path, store.exportSnapshot())
  }
  pendingFlush = writeNow

  const unsubscribe = store.subscribe(() => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(writeNow, AUTO_SAVE_DEBOUNCE_MS)
  })

  return () => {
    unsubscribe()
    if (timer) clearTimeout(timer)
    timer = null
    if (pendingFlush === writeNow) pendingFlush = null
  }
}

/** Synchronously flushes the pending debounced save started by startAutoSave, if any. Used for a clean shutdown on SIGINT/SIGTERM. */
export function flushPendingSave(): void {
  pendingFlush?.()
}
