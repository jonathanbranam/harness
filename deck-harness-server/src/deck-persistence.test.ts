import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPendingSave, loadSnapshot, readSnapshotFile, startAutoSave } from './deck-persistence'
import { EditorStore, type Deck } from './editor-state'

const validDeck: Deck = {
  id: 'd1',
  name: 'Deck',
  activeSlideId: 's1',
  slides: [
    {
      id: 's1',
      objects: [
        {
          id: 'o1',
          x: 1,
          y: 2,
          width: 10,
          height: 20,
          text: [{ kind: 'paragraph', runs: [{ text: 'hi' }] }],
          fillColor: '#111111',
          borderColor: '#222222',
          fontColor: '#333333',
          fontSize: 12,
        },
      ],
    },
  ],
}

describe('loadSnapshot', () => {
  it('round-trips a valid snapshot', () => {
    expect(loadSnapshot({ decks: [validDeck], activeDeckId: 'd1' })).toEqual({ decks: [validDeck], activeDeckId: 'd1' })
  })

  it('drops unrecognized fields on objects', () => {
    const objectWithExtra = { ...validDeck.slides[0].objects[0], mysteryField: 'nope' }
    const deck = { ...validDeck, slides: [{ id: 's1', objects: [objectWithExtra] }] }
    const result = loadSnapshot({ decks: [deck], activeDeckId: 'd1' })
    expect(result?.decks[0].slides[0].objects[0]).not.toHaveProperty('mysteryField')
    expect(result?.decks[0].slides[0].objects[0]).toEqual(validDeck.slides[0].objects[0])
  })

  it('falls back to safe defaults for malformed or missing object fields', () => {
    const deck = { id: 'd1', name: 'Deck', activeSlideId: 's1', slides: [{ id: 's1', objects: [{ id: 'o1', width: 'not-a-number', text: 'legacy-string-should-be-dropped' }] }] }
    const result = loadSnapshot({ decks: [deck], activeDeckId: 'd1' })
    const obj = result?.decks[0].slides[0].objects[0]
    expect(obj?.width).toBe(100)
    expect(obj?.fillColor).toBe('#374151')
    expect(obj?.text).toEqual([{ kind: 'paragraph', runs: [] }])
  })

  it('returns null for a wholly unusable top-level shape', () => {
    expect(loadSnapshot(null)).toBeNull()
    expect(loadSnapshot('not-an-object')).toBeNull()
    expect(loadSnapshot({})).toBeNull()
    expect(loadSnapshot({ decks: [] })).toBeNull()
    expect(loadSnapshot({ decks: ['not-an-object'] })).toBeNull()
  })

  it('falls back activeDeckId to the first deck when it points at a missing deck', () => {
    const result = loadSnapshot({ decks: [validDeck], activeDeckId: 'does-not-exist' })
    expect(result?.activeDeckId).toBe('d1')
  })
})

describe('readSnapshotFile', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deck-persistence-test-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns null for a missing file instead of throwing', () => {
    expect(readSnapshotFile(join(dir, 'missing.json'))).toBeNull()
  })

  it('returns null for invalid JSON instead of throwing', () => {
    const file = join(dir, 'bad.json')
    writeFileSync(file, '{not valid json')
    expect(readSnapshotFile(file)).toBeNull()
  })
})

describe('startAutoSave', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'deck-persistence-test-'))
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    rmSync(dir, { recursive: true, force: true })
  })

  it('coalesces rapid edits into a single debounced write reflecting the final state', () => {
    const store = new EditorStore()
    const path = join(dir, 'decks.json')
    const stop = startAutoSave(store, path)

    store.createDeck('user', 'First')
    vi.advanceTimersByTime(200)
    store.createDeck('user', 'Second')
    vi.advanceTimersByTime(200)
    expect(existsSync(path)).toBe(false)

    vi.advanceTimersByTime(750)
    expect(existsSync(path)).toBe(true)
    const written = JSON.parse(readFileSync(path, 'utf8'))
    expect(written.decks.some((d: Deck) => d.name === 'Second')).toBe(true)

    stop()
  })

  it('flushPendingSave writes immediately without waiting for the debounce', () => {
    const store = new EditorStore()
    const path = join(dir, 'decks.json')
    const stop = startAutoSave(store, path)

    store.createDeck('user', 'Now')
    expect(existsSync(path)).toBe(false)
    flushPendingSave()
    expect(existsSync(path)).toBe(true)

    stop()
  })
})
