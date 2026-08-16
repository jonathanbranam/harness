import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPendingSave, loadSnapshot, readSnapshotFile, startAutoSave } from './deck-persistence'
import { EditorStore, type Deck, type DeckObject, type ImageObject, type TextBoxObject } from './editor-state'

function tb(o: DeckObject | undefined): TextBoxObject {
  if (!o || o.type !== 'textBox') throw new Error(`expected a textBox object, got ${JSON.stringify(o)}`)
  return o
}

const validDeck: Deck = {
  id: 'd1',
  name: 'Deck',
  activeSlideId: 's1',
  slides: [
    {
      id: 's1',
      backgroundColor: '#ffffff',
      objects: [
        {
          id: 'o1',
          type: 'textBox',
          zIndex: 0,
          opacity: 1,
          rotation: 0,
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
    const obj = tb(result?.decks[0].slides[0].objects[0])
    expect(obj.width).toBe(100)
    expect(obj.fillColor).toBe('#374151')
    expect(obj.text).toEqual([{ kind: 'paragraph', runs: [] }])
  })

  it('defaults a slide backgroundColor and object type/zIndex when absent (legacy snapshot)', () => {
    const legacyObjects = [
      { id: 'o1', x: 0, y: 0, width: 10, height: 10, text: 'a', fillColor: '#111', borderColor: '#222', fontColor: '#333', fontSize: 10 },
      { id: 'o2', x: 20, y: 20, width: 10, height: 10, text: 'b', fillColor: '#111', borderColor: '#222', fontColor: '#333', fontSize: 10 },
    ]
    const deck = { id: 'd1', name: 'Deck', activeSlideId: 's1', slides: [{ id: 's1', objects: legacyObjects }] }
    const result = loadSnapshot({ decks: [deck], activeDeckId: 'd1' })
    expect(result?.decks[0].slides[0].backgroundColor).toBe('#ffffff')
    const objects = result!.decks[0].slides[0].objects
    expect(objects.map((o) => o.type)).toEqual(['textBox', 'textBox'])
    // zIndex backfills from array position, preserving the pre-existing visual stacking order.
    expect(objects.map((o) => o.zIndex)).toEqual([0, 1])
    // A snapshot saved before opacity/rotation existed loads fully opaque and
    // unrotated — identical to how it rendered before this change.
    expect(objects.map((o) => o.opacity)).toEqual([1, 1])
    expect(objects.map((o) => (o.type === 'textBox' ? o.rotation : undefined))).toEqual([0, 0])
  })

  it('round-trips a box object', () => {
    const box: DeckObject = { id: 'b1', type: 'box', zIndex: 3, opacity: 0.5, rotation: 15, x: 1, y: 2, width: 30, height: 40, fillColor: '#abc123', borderColor: '#654321', borderWidth: 4, cornerRadius: 8 }
    const deck = { ...validDeck, slides: [{ id: 's1', backgroundColor: '#ffffff', objects: [box] }] }
    const result = loadSnapshot({ decks: [deck], activeDeckId: 'd1' })
    expect(result?.decks[0].slides[0].objects[0]).toEqual(box)
  })

  it('round-trips an ellipse object', () => {
    const ellipse: DeckObject = { id: 'e1', type: 'ellipse', zIndex: 1, opacity: 1, rotation: 0, x: 1, y: 2, width: 30, height: 30, fillColor: 'transparent', borderColor: '#654321', borderWidth: 2 }
    const deck = { ...validDeck, slides: [{ id: 's1', backgroundColor: '#ffffff', objects: [ellipse] }] }
    const result = loadSnapshot({ decks: [deck], activeDeckId: 'd1' })
    expect(result?.decks[0].slides[0].objects[0]).toEqual(ellipse)
  })

  it('round-trips a line object', () => {
    const line: DeckObject = { id: 'l1', type: 'line', zIndex: 2, opacity: 0.75, x1: 0, y1: 0, x2: 100, y2: 50, strokeColor: '#123456', strokeWidth: 3 }
    const deck = { ...validDeck, slides: [{ id: 's1', backgroundColor: '#ffffff', objects: [line] }] }
    const result = loadSnapshot({ decks: [deck], activeDeckId: 'd1' })
    expect(result?.decks[0].slides[0].objects[0]).toEqual(line)
  })

  it('round-trips an arrow object', () => {
    const arrow: DeckObject = { id: 'a1', type: 'arrow', zIndex: 4, opacity: 1, x1: 0, y1: 0, x2: 100, y2: 50, strokeColor: '#123456', strokeWidth: 3, arrowStart: true, arrowEnd: false }
    const deck = { ...validDeck, slides: [{ id: 's1', backgroundColor: '#ffffff', objects: [arrow] }] }
    const result = loadSnapshot({ decks: [deck], activeDeckId: 'd1' })
    expect(result?.decks[0].slides[0].objects[0]).toEqual(arrow)
  })

  it('round-trips an image object', () => {
    const image: DeckObject = {
      id: 'i1',
      type: 'image',
      zIndex: 5,
      opacity: 0.9,
      rotation: 30,
      src: '/api/images/abc.png',
      x: 10,
      y: 20,
      width: 200,
      height: 100,
      cropX: 5,
      cropY: 5,
      cropWidth: 400,
      cropHeight: 200,
    }
    const deck = { ...validDeck, slides: [{ id: 's1', backgroundColor: '#ffffff', objects: [image] }] }
    const result = loadSnapshot({ decks: [deck], activeDeckId: 'd1' })
    expect(result?.decks[0].slides[0].objects[0]).toEqual(image)
  })

  it('falls back to safe defaults for a malformed image entry (missing src) instead of throwing', () => {
    const malformed = { id: 'i1', type: 'image', x: 10, y: 20, width: 200, height: 100, cropWidth: 400, cropHeight: 200 }
    const deck = { ...validDeck, slides: [{ id: 's1', backgroundColor: '#ffffff', objects: [malformed] }] }
    expect(() => loadSnapshot({ decks: [deck], activeDeckId: 'd1' })).not.toThrow()
    const obj = loadSnapshot({ decks: [deck], activeDeckId: 'd1' })?.decks[0].slides[0].objects[0] as ImageObject
    expect(obj.type).toBe('image')
    expect(obj.src).toBe('')
  })

  it('falls back to safe defaults for malformed shape-specific fields rather than dropping the object', () => {
    const malformed = { id: 'b1', type: 'box', x: 1, y: 2, width: 30, height: 40, borderWidth: 'not-a-number', cornerRadius: 'not-a-number' }
    const deck = { ...validDeck, slides: [{ id: 's1', backgroundColor: '#ffffff', objects: [malformed] }] }
    const result = loadSnapshot({ decks: [deck], activeDeckId: 'd1' })
    const obj = result?.decks[0].slides[0].objects[0]
    expect(obj).toMatchObject({ id: 'b1', type: 'box', borderWidth: 2, cornerRadius: 0 })
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
