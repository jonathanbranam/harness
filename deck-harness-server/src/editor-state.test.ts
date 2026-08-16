import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deriveCropSize, deriveImageSize, EditorStore, editorStore, plainTextOf, type DeckObject, type ImageObject, type TextBlock, type TextBoxObject } from './editor-state'

/** Test-only narrowing helper: most existing tests operate on textBox objects (the seed deck / addObject), so this keeps assertions terse instead of re-deriving a type guard at every call site. */
function tb(o: DeckObject | undefined): TextBoxObject {
  if (!o || o.type !== 'textBox') throw new Error(`expected a textBox object, got ${JSON.stringify(o)}`)
  return o
}

function img(o: DeckObject | undefined): ImageObject {
  if (!o || o.type !== 'image') throw new Error(`expected an image object, got ${JSON.stringify(o)}`)
  return o
}

describe('editorStore', () => {
  it('setSelection drops unknown ids', () => {
    editorStore.setSelection(['title', 'does-not-exist'])
    expect(editorStore.getState().selection).toEqual(['title'])
  })

  it('applyUpdate setPosition updates x/y and reports changed ids', () => {
    const result = editorStore.applyUpdate('user', 'setPosition', ['title'], { x: 10, y: 20 })
    expect(result.changed).toEqual(['title'])
    expect(result.errors).toEqual([])
    const obj = tb(editorStore.getState().objects.find((o) => o.id === 'title'))
    expect(obj?.x).toBe(10)
    expect(obj?.y).toBe(20)
  })

  it('applyUpdate reports an error for unknown target ids instead of throwing', () => {
    const result = editorStore.applyUpdate('user', 'setText', ['does-not-exist'], { text: 'hi' })
    expect(result.changed).toEqual([])
    expect(result.errors).toEqual(['No object with id "does-not-exist"'])
  })

  it('applyGridLayout lays targets out left-to-right with the given gap', () => {
    const result = editorStore.applyUpdate('user', 'applyGridLayout', ['box-1', 'box-2'], { direction: 'horizontal', gap: 10 })
    expect(result.errors).toEqual([])
    const state = editorStore.getState()
    const box1 = tb(state.objects.find((o) => o.id === 'box-1'))
    const box2 = tb(state.objects.find((o) => o.id === 'box-2'))
    expect(box2.x).toBe(box1.x + box1.width + 10)
  })

  it('selectByText matches case-insensitively by default', () => {
    expect(editorStore.selectByText('deck')).toContain('title')
    expect(editorStore.selectByText('DECK')).toContain('title')
  })

  it('selectByText respects caseSensitive: true', () => {
    expect(editorStore.selectByText('DECK', true)).not.toContain('title')
  })
})

describe('editorStore deck management', () => {
  it('createDeck adds a deck with one blank slide and makes it active', () => {
    const before = editorStore.listDecks().length
    const { deckId } = editorStore.createDeck('user', 'New Deck')
    const decks = editorStore.listDecks()
    expect(decks.length).toBe(before + 1)
    expect(decks.find((d) => d.id === deckId)).toEqual({ id: deckId, name: 'New Deck', slideCount: 1 })
    const state = editorStore.getState()
    expect(state.activeDeckId).toBe(deckId)
    expect(state.objects).toEqual([])
  })

  it('selectDeck rejects an unknown deck id and leaves the active deck unchanged', () => {
    const before = editorStore.getState().activeDeckId
    const result = editorStore.selectDeck('does-not-exist')
    expect(result.ok).toBe(false)
    expect(editorStore.getState().activeDeckId).toBe(before)
  })

  it("selectDeck restores the deck's own last-active slide", () => {
    const { deckId: deckA } = editorStore.createDeck('user', 'Deck A')
    const { slideId: deckASlide2 } = editorStore.addSlide('user')
    editorStore.createDeck('user', 'Deck B')
    editorStore.selectDeck(deckA)
    expect(editorStore.getState().activeSlideId).toBe(deckASlide2)
  })

  it('deleteDeck rejects deleting the only remaining deck', () => {
    const decks = editorStore.listDecks()
    for (const d of decks.slice(1)) editorStore.deleteDeck('user', d.id)
    const remaining = editorStore.listDecks()
    expect(remaining.length).toBe(1)
    const result = editorStore.deleteDeck('user', remaining[0].id)
    expect(result.ok).toBe(false)
    expect(editorStore.listDecks().length).toBe(1)
  })

  it('deleteDeck activates a remaining deck when deleting the active deck', () => {
    const { deckId } = editorStore.createDeck('user', 'Another Deck')
    expect(editorStore.getState().activeDeckId).toBe(deckId)
    const result = editorStore.deleteDeck('user', deckId)
    expect(result.ok).toBe(true)
    expect(editorStore.getState().activeDeckId).not.toBe(deckId)
  })

  it('renameDeck renames the active deck', () => {
    const { deckId } = editorStore.createDeck('user', 'Old Name')
    const result = editorStore.renameDeck(deckId, 'New Name')
    expect(result.ok).toBe(true)
    expect(editorStore.listDecks().find((d) => d.id === deckId)?.name).toBe('New Name')
  })

  it('renameDeck renames a deck that is not active without changing the active deck', () => {
    const { deckId: targetDeck } = editorStore.createDeck('user', 'Target Deck')
    const { deckId: activeDeck } = editorStore.createDeck('user', 'Active Deck')
    const result = editorStore.renameDeck(targetDeck, 'Renamed Target')
    expect(result.ok).toBe(true)
    expect(editorStore.listDecks().find((d) => d.id === targetDeck)?.name).toBe('Renamed Target')
    expect(editorStore.getState().activeDeckId).toBe(activeDeck)
  })

  it('renameDeck rejects an empty or whitespace-only name, leaving the name unchanged', () => {
    const { deckId } = editorStore.createDeck('user', 'Keep Me')
    const result = editorStore.renameDeck(deckId, '   ')
    expect(result.ok).toBe(false)
    expect(editorStore.listDecks().find((d) => d.id === deckId)?.name).toBe('Keep Me')
  })

  it('renameDeck rejects an unknown deck id', () => {
    const result = editorStore.renameDeck('does-not-exist', 'New Name')
    expect(result.ok).toBe(false)
  })
})

describe('editorStore slide management', () => {
  it('addSlide appends a blank slide to the active deck and makes it active', () => {
    const before = editorStore.getState().slides.length
    const { slideId } = editorStore.addSlide('user')
    const state = editorStore.getState()
    expect(state.slides.length).toBe(before + 1)
    expect(state.activeSlideId).toBe(slideId)
    expect(state.objects).toEqual([])
  })

  it('removeSlide rejects removing the only remaining slide in a deck', () => {
    editorStore.createDeck('user', 'Solo Deck')
    const slides = editorStore.getState().slides
    expect(slides.length).toBe(1)
    const result = editorStore.removeSlide('user', slides[0].id)
    expect(result.ok).toBe(false)
    expect(editorStore.getState().slides.length).toBe(1)
  })

  it('removeSlide activates a neighboring slide when removing the active slide', () => {
    const { slideId } = editorStore.addSlide('user')
    const result = editorStore.removeSlide('user', slideId)
    expect(result.ok).toBe(true)
    expect(editorStore.getState().activeSlideId).not.toBe(slideId)
  })

  it('selectSlide rejects an unknown or out-of-deck slide id', () => {
    const before = editorStore.getState().activeSlideId
    const result = editorStore.selectSlide('does-not-exist')
    expect(result.ok).toBe(false)
    expect(editorStore.getState().activeSlideId).toBe(before)
  })

  it('selectSlide clears the current selection', () => {
    // Navigate to the seed deck's first slide specifically (still holding
    // the seeded objects), not just whichever slide it last remembered.
    const decks = editorStore.listDecks()
    editorStore.selectDeck(decks[0].id)
    const seedSlideId = editorStore.getState().slides[0].id
    editorStore.selectSlide(seedSlideId)
    const { slideId: otherSlideId } = editorStore.addSlide('user')
    editorStore.selectSlide(seedSlideId)
    editorStore.setSelection(['title'])
    expect(editorStore.getState().selection).toEqual(['title'])
    editorStore.selectSlide(otherSlideId)
    expect(editorStore.getState().selection).toEqual([])
  })
})

// Navigates to the seed deck's first slide specifically (still holding the
// seeded 'title'/'box-1'/'box-2' objects) — mirrors the helper inlined above.
function seedSlide() {
  const decks = editorStore.listDecks()
  editorStore.selectDeck(decks[0].id)
  editorStore.selectSlide(editorStore.getState().slides[0].id)
}

describe('editorStore object CRUD (addObject / removeObject)', () => {
  it('addObject creates a new object with the given bounds and reports its id as changed', () => {
    seedSlide()
    const before = editorStore.getState().objects.length
    const result = editorStore.applyUpdate('user', 'addObject', [], { x: 10, y: 20, width: 100, height: 50, text: 'hello' })
    expect(result.errors).toEqual([])
    expect(result.changed.length).toBe(1)
    const state = editorStore.getState()
    expect(state.objects.length).toBe(before + 1)
    const created = tb(state.objects.find((o) => o.id === result.changed[0]))
    expect(created.x).toBe(10)
    expect(created.y).toBe(20)
    expect(created.width).toBe(100)
    expect(created.height).toBe(50)
    expect(plainTextOf(created)).toBe('hello')
  })

  it('addObject requires numeric x/y/width/height', () => {
    seedSlide()
    const result = editorStore.applyUpdate('user', 'addObject', [], { x: 10, y: 20 })
    expect(result.changed).toEqual([])
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('addObject rejects a duplicate explicit id', () => {
    seedSlide()
    const result = editorStore.applyUpdate('user', 'addObject', [], { id: 'title', x: 0, y: 0, width: 10, height: 10 })
    expect(result.changed).toEqual([])
    expect(result.errors).toEqual(['Object with id "title" already exists on the active slide'])
  })

  it('removeObject removes the object and drops it from the selection', () => {
    seedSlide()
    const { changed } = editorStore.applyUpdate('user', 'addObject', [], { x: 0, y: 0, width: 10, height: 10 })
    const id = changed[0]
    editorStore.setSelection([id])
    const result = editorStore.applyUpdate('user', 'removeObject', [id], {})
    expect(result.changed).toEqual([id])
    expect(result.errors).toEqual([])
    expect(editorStore.getState().objects.find((o) => o.id === id)).toBeUndefined()
    expect(editorStore.getState().selection).toEqual([])
  })

  it('removeObject reports unknown ids without affecting other targets', () => {
    seedSlide()
    const { changed } = editorStore.applyUpdate('user', 'addObject', [], { x: 0, y: 0, width: 10, height: 10 })
    const id = changed[0]
    const result = editorStore.applyUpdate('user', 'removeObject', [id, 'does-not-exist'], {})
    expect(result.changed).toEqual([id])
    expect(result.errors).toEqual(['No object with id "does-not-exist"'])
  })
})

describe('editorStore slide-bounds clamping (960x540)', () => {
  it('addObject clamps an object placed beyond the slide edge', () => {
    seedSlide()
    const { changed } = editorStore.applyUpdate('user', 'addObject', [], { x: 900, y: 500, width: 100, height: 80 })
    const obj = tb(editorStore.getState().objects.find((o) => o.id === changed[0]))
    expect(obj.width).toBe(100)
    expect(obj.height).toBe(80)
    expect(obj.x).toBe(860) // 960 - 100
    expect(obj.y).toBe(460) // 540 - 80
  })

  it('addObject leaves an in-bounds object exactly as requested', () => {
    seedSlide()
    const { changed } = editorStore.applyUpdate('user', 'addObject', [], { x: 10, y: 20, width: 100, height: 50 })
    const obj = editorStore.getState().objects.find((o) => o.id === changed[0])!
    expect(obj).toMatchObject({ x: 10, y: 20, width: 100, height: 50 })
  })

  it('setPosition clamps an object moved past each edge without changing its size', () => {
    seedSlide()
    const { changed } = editorStore.applyUpdate('user', 'addObject', [], { x: 0, y: 0, width: 100, height: 80 })
    const id = changed[0]

    editorStore.applyUpdate('user', 'setPosition', [id], { x: -50, y: -50 })
    expect(editorStore.getState().objects.find((o) => o.id === id)).toMatchObject({ x: 0, y: 0, width: 100, height: 80 })

    editorStore.applyUpdate('user', 'setPosition', [id], { x: 900, y: 500 })
    const obj = editorStore.getState().objects.find((o) => o.id === id)!
    expect(obj).toMatchObject({ x: 860, y: 460, width: 100, height: 80 })
  })

  it('setPosition leaves an in-bounds move exactly as requested', () => {
    seedSlide()
    const { changed } = editorStore.applyUpdate('user', 'addObject', [], { x: 0, y: 0, width: 100, height: 80 })
    const id = changed[0]
    editorStore.applyUpdate('user', 'setPosition', [id], { x: 300, y: 200 })
    expect(editorStore.getState().objects.find((o) => o.id === id)).toMatchObject({ x: 300, y: 200, width: 100, height: 80 })
  })

  it('setSize clamps an object grown past each edge', () => {
    seedSlide()
    const { changed } = editorStore.applyUpdate('user', 'addObject', [], { x: 900, y: 500, width: 10, height: 10 })
    const id = changed[0]
    editorStore.applyUpdate('user', 'setSize', [id], { width: 200, height: 150 })
    const obj = tb(editorStore.getState().objects.find((o) => o.id === id))
    expect(obj.width).toBe(200)
    expect(obj.height).toBe(150)
    expect(obj.x).toBe(760) // 960 - 200
    expect(obj.y).toBe(390) // 540 - 150
  })

  it('setSize clamps a requested size larger than the slide itself', () => {
    seedSlide()
    const { changed } = editorStore.applyUpdate('user', 'addObject', [], { x: 0, y: 0, width: 10, height: 10 })
    const id = changed[0]
    editorStore.applyUpdate('user', 'setSize', [id], { width: 2000, height: 1000 })
    const obj = editorStore.getState().objects.find((o) => o.id === id)!
    expect(obj).toMatchObject({ x: 0, y: 0, width: 960, height: 540 })
  })

  it('setSize leaves an in-bounds resize exactly as requested', () => {
    seedSlide()
    const { changed } = editorStore.applyUpdate('user', 'addObject', [], { x: 10, y: 10, width: 50, height: 50 })
    const id = changed[0]
    editorStore.applyUpdate('user', 'setSize', [id], { width: 120, height: 90 })
    expect(editorStore.getState().objects.find((o) => o.id === id)).toMatchObject({ x: 10, y: 10, width: 120, height: 90 })
  })
})

describe('editorStore font/border/fill color, including transparent', () => {
  it('setFontColor and setBorderColor update their fields', () => {
    seedSlide()
    editorStore.applyUpdate('user', 'setFontColor', ['title'], { color: '#ff0000' })
    editorStore.applyUpdate('user', 'setBorderColor', ['title'], { color: '#00ff00' })
    const obj = tb(editorStore.getState().objects.find((o) => o.id === 'title'))
    expect(obj.fontColor).toBe('#ff0000')
    expect(obj.borderColor).toBe('#00ff00')
  })

  it('setBorderColor and setFillColor accept "transparent"', () => {
    seedSlide()
    editorStore.applyUpdate('user', 'setBorderColor', ['title'], { color: 'transparent' })
    editorStore.applyUpdate('user', 'setFillColor', ['title'], { color: 'transparent' })
    const obj = tb(editorStore.getState().objects.find((o) => o.id === 'title'))
    expect(obj.borderColor).toBe('transparent')
    expect(obj.fillColor).toBe('transparent')
  })
})

describe('editorStore applyTextStyle', () => {
  it('bold splits a run at the given plain-text offsets', () => {
    seedSlide()
    editorStore.applyUpdate('user', 'setText', ['box-1'], { text: 'Hello world' })
    editorStore.applyUpdate('user', 'applyTextStyle', ['box-1'], { start: 0, end: 5, mark: 'bold', value: true })
    const obj = tb(editorStore.getState().objects.find((o) => o.id === 'box-1'))
    expect(plainTextOf(obj)).toBe('Hello world')
    const runs = obj.text[0].runs
    expect(runs[0]).toEqual({ text: 'Hello', bold: true })
    expect(runs[1].bold).toBeUndefined()
    expect(runs.map((r) => r.text).join('')).toBe('Hello world')
  })

  it('toggles bold off when re-applied with value: false', () => {
    seedSlide()
    editorStore.applyUpdate('user', 'setText', ['box-1'], { text: 'Hello world' })
    editorStore.applyUpdate('user', 'applyTextStyle', ['box-1'], { start: 0, end: 5, mark: 'bold', value: true })
    editorStore.applyUpdate('user', 'applyTextStyle', ['box-1'], { start: 0, end: 5, mark: 'bold', value: false })
    const obj = tb(editorStore.getState().objects.find((o) => o.id === 'box-1'))
    expect(obj.text[0].runs.every((r) => !r.bold)).toBe(true)
  })

  it('listType converts the touched block to a bulleted list, preserving runs', () => {
    seedSlide()
    editorStore.applyUpdate('user', 'setText', ['box-1'], { text: 'Item one' })
    editorStore.applyUpdate('user', 'applyTextStyle', ['box-1'], { start: 0, end: 4, mark: 'bold', value: true })
    editorStore.applyUpdate('user', 'applyTextStyle', ['box-1'], { start: 0, end: 8, listType: 'bulleted' })
    const obj = tb(editorStore.getState().objects.find((o) => o.id === 'box-1'))
    const block = obj.text[0]
    if (block.kind !== 'listItem') throw new Error('expected a listItem block')
    expect(block.listType).toBe('bulleted')
    expect(plainTextOf(obj)).toBe('Item one')
    expect(block.runs[0]).toEqual({ text: 'Item', bold: true })
  })

  it('listType: null converts a list item back to a paragraph', () => {
    seedSlide()
    editorStore.applyUpdate('user', 'setText', ['box-1'], { text: 'Item one' })
    editorStore.applyUpdate('user', 'applyTextStyle', ['box-1'], { start: 0, end: 8, listType: 'numbered' })
    editorStore.applyUpdate('user', 'applyTextStyle', ['box-1'], { start: 0, end: 8, listType: null })
    const obj = tb(editorStore.getState().objects.find((o) => o.id === 'box-1'))
    expect(obj.text[0].kind).toBe('paragraph')
  })

  it('addresses multi-block offsets across the "\\n" block separator', () => {
    seedSlide()
    editorStore.applyUpdate('user', 'setText', ['box-1'], {
      text: [
        { kind: 'paragraph', runs: [{ text: 'First' }] },
        { kind: 'paragraph', runs: [{ text: 'Second' }] },
      ],
    })
    expect(plainTextOf(tb(editorStore.getState().objects.find((o) => o.id === 'box-1')))).toBe('First\nSecond')
    // "Second" starts at offset 6: 5 chars of "First" plus 1 for the "\n" separator.
    editorStore.applyUpdate('user', 'applyTextStyle', ['box-1'], { start: 6, end: 12, mark: 'italic', value: true })
    const obj = tb(editorStore.getState().objects.find((o) => o.id === 'box-1'))
    expect(obj.text[0].runs.every((r) => !r.italic)).toBe(true)
    expect(obj.text[1].runs[0]).toEqual({ text: 'Second', italic: true })
  })
})

describe('plainTextOf and select_by_text over structured text', () => {
  it('plainTextOf concatenates run text within a block', () => {
    const object = { text: [{ kind: 'paragraph', runs: [{ text: 'Hello ' }, { text: 'world', bold: true }] }] as TextBlock[] }
    expect(plainTextOf(object)).toBe('Hello world')
  })

  it('plainTextOf joins multiple blocks with "\\n"', () => {
    const object = {
      text: [
        { kind: 'paragraph', runs: [{ text: 'First' }] },
        { kind: 'listItem', listType: 'bulleted', runs: [{ text: 'Second' }] },
      ] as TextBlock[],
    }
    expect(plainTextOf(object)).toBe('First\nSecond')
  })

  it('matches a query spanning a bold run and a non-bold run', () => {
    seedSlide()
    editorStore.applyUpdate('user', 'setText', ['box-1'], { text: 'Hello world' })
    editorStore.applyUpdate('user', 'applyTextStyle', ['box-1'], { start: 0, end: 5, mark: 'bold', value: true })
    expect(editorStore.selectByText('lo wo')).toContain('box-1')
  })
})

describe('EditorStore construction from a persisted snapshot', () => {
  it('restores decks/slides/objects/active ids from a provided snapshot', () => {
    const snapshot = {
      decks: [
        {
          id: 'deck-a',
          name: 'Deck A',
          activeSlideId: 'slide-a',
          slides: [
            {
              id: 'slide-a',
              backgroundColor: '#ffffff',
              objects: [
                {
                  id: 'obj-a',
                  type: 'textBox' as const,
                  zIndex: 0,
                  opacity: 1,
                  rotation: 0,
                  x: 5,
                  y: 5,
                  width: 50,
                  height: 50,
                  text: [{ kind: 'paragraph', runs: [{ text: 'restored' }] }] as TextBlock[],
                  fillColor: '#000000',
                  borderColor: '#111111',
                  fontColor: '#ffffff',
                  fontSize: 20,
                },
              ],
            },
          ],
        },
      ],
      activeDeckId: 'deck-a',
    }

    const store = new EditorStore(snapshot)
    const state = store.getState()
    expect(state.activeDeckId).toBe('deck-a')
    expect(state.activeSlideId).toBe('slide-a')
    expect(state.objects).toEqual(snapshot.decks[0].slides[0].objects)
  })

  it('falls back to the hardcoded seed deck when constructed without a snapshot', () => {
    const store = new EditorStore(null)
    const state = store.getState()
    expect(state.decks.length).toBe(1)
    expect(state.objects.length).toBeGreaterThan(0)
  })
})

// Fresh, isolated EditorStore instances (not the shared `editorStore`
// singleton other describe blocks above mutate sequentially) — undo/redo
// scenarios need a deterministic starting history, which a store shared
// across ~40 prior tests can't offer.
describe('editorStore undo/redo', () => {
  it('undo restores content, selection, and active slide to their state before the entry', () => {
    const store = new EditorStore(null)
    const seedSlideId = store.getState().activeSlideId
    store.setSelection(['box-1'])
    const { slideId: newSlideId } = store.addSlide('user')
    expect(store.getState().selection).toEqual([])
    expect(store.getState().activeSlideId).toBe(newSlideId)

    const result = store.undo('user')
    expect(result.steppedEntries).toEqual([{ actor: 'user', description: 'Added slide', timestamp: expect.any(Number) }])
    const state = store.getState()
    expect(state.activeSlideId).toBe(seedSlideId)
    expect(state.selection).toEqual(['box-1'])
    expect(state.slides.length).toBe(1)
  })

  it('undo with an empty history is a no-op that does not throw', () => {
    const store = new EditorStore(null)
    const before = store.getState()
    let result: ReturnType<typeof store.undo> | undefined
    expect(() => {
      result = store.undo('user')
    }).not.toThrow()
    expect(result!.steppedEntries).toEqual([])
    expect(result!.canUndo).toBe(false)
    expect(store.getState().slides.length).toBe(before.slides.length)
  })

  it('repeated undo walks backward in the exact reverse order entries were added', () => {
    const store = new EditorStore(null)
    // setPosition targets 'title' on the seed slide before addSlide makes a
    // new, blank slide active — 'title' doesn't exist there.
    store.applyUpdate('agent', 'setPosition', ['title'], { x: 5, y: 5 })
    store.addSlide('user')
    const first = store.undo('user')
    expect(first.steppedEntries[0].description).toBe('Added slide')
    const second = store.undo('user')
    expect(second.steppedEntries[0].description).toBe('Moved 1 object')
  })

  it('redo reapplies the most recently undone entry', () => {
    const store = new EditorStore(null)
    const { slideId: newSlideId } = store.addSlide('user')
    store.undo('user')
    expect(store.getState().slides.length).toBe(1)

    const result = store.redo('user')
    expect(result.steppedEntries[0].description).toBe('Added slide')
    const state = store.getState()
    expect(state.slides.length).toBe(2)
    expect(state.activeSlideId).toBe(newSlideId)
  })

  it('redo with nothing to redo is a no-op that does not throw', () => {
    const store = new EditorStore(null)
    store.addSlide('user')
    let result: ReturnType<typeof store.redo> | undefined
    expect(() => {
      result = store.redo('user')
    }).not.toThrow()
    expect(result!.steppedEntries).toEqual([])
    expect(result!.canRedo).toBe(false)
  })

  it('a new edit after undo discards the redo tail', () => {
    const store = new EditorStore(null)
    store.addSlide('user')
    store.undo('user')
    expect(store.getHistory().canRedo).toBe(true)

    store.addSlide('user')
    expect(store.getHistory().canRedo).toBe(false)
    expect(store.redo('user').steppedEntries).toEqual([])
  })

  it('undo/redo with a count larger than available entries stops at the bottom and reports how many were stepped', () => {
    const store = new EditorStore(null)
    store.addSlide('user')
    store.addSlide('user')

    const undoResult = store.undo('user', 10)
    expect(undoResult.steppedEntries.length).toBe(2)
    expect(undoResult.canUndo).toBe(false)

    const redoResult = store.redo('user', 10)
    expect(redoResult.steppedEntries.length).toBe(2)
    expect(redoResult.canRedo).toBe(false)
  })

  it('caps history at ~100 entries, evicting the oldest first', () => {
    const store = new EditorStore(null)
    for (let i = 0; i < 105; i++) store.addSlide('user')
    expect(store.getState().slides.length).toBe(106) // 1 seed slide + 105 added
    expect(store.getHistory().entries.length).toBe(100)

    // The oldest 5 entries were evicted, so only the most recent 100 of the
    // 105 additions are undoable — undoing all of them lands back at the
    // state right after the (now-irreversible) 5th addition.
    const result = store.undo('user', 200)
    expect(result.steppedEntries.length).toBe(100)
    expect(store.getHistory().canUndo).toBe(false)
    expect(store.getState().slides.length).toBe(6)
  })

  it('entries record the actor that made the change', () => {
    const store = new EditorStore(null)
    store.addSlide('user')
    store.addSlide('agent')
    const entries = store.getHistory().entries
    expect(entries[0].actor).toBe('agent')
    expect(entries[1].actor).toBe('user')
  })

  it('a fully-failed applyUpdate call does not push a history entry', () => {
    const store = new EditorStore(null)
    const before = store.getHistory()
    const result = store.applyUpdate('user', 'setText', ['does-not-exist'], { text: 'hi' })
    expect(result.errors.length).toBeGreaterThan(0)
    expect(store.getHistory()).toEqual(before)
  })

  it('getHistory returns entries most-recent-first with canUndo/canRedo reflecting each stack state', () => {
    const store = new EditorStore(null)
    expect(store.getHistory()).toEqual({ entries: [], canUndo: false, canRedo: false })

    // setPosition targets 'title' on the seed slide before addSlide makes a
    // new, blank slide active — 'title' doesn't exist there.
    store.applyUpdate('agent', 'setPosition', ['title'], { x: 5, y: 5 })
    let history = store.getHistory()
    expect(history.entries.map((e) => e.description)).toEqual(['Moved 1 object'])
    expect(history.canUndo).toBe(true)
    expect(history.canRedo).toBe(false)

    store.addSlide('user')
    history = store.getHistory()
    expect(history.entries.map((e) => e.description)).toEqual(['Added slide', 'Moved 1 object'])
    expect(history.entries[0].actor).toBe('user')

    store.undo('user')
    history = store.getHistory()
    expect(history.canUndo).toBe(true)
    expect(history.canRedo).toBe(true)

    store.undo('user')
    history = store.getHistory()
    expect(history.canUndo).toBe(false)
    expect(history.canRedo).toBe(true)
  })

  it('getHistory respects an optional limit while still reporting canUndo/canRedo over the full stack', () => {
    const store = new EditorStore(null)
    store.addSlide('user')
    store.addSlide('user')
    store.addSlide('user')
    const limited = store.getHistory(2)
    expect(limited.entries.length).toBe(2)
    expect(limited.canUndo).toBe(true)
    expect(store.getHistory().entries.length).toBe(3)
  })
})

describe('editorStore addShape', () => {
  it('creates a box with type-appropriate defaults and a zIndex above existing objects', () => {
    const store = new EditorStore(null)
    const before = store.getHistory()
    const result = store.addShape('user', { type: 'box', x: 10, y: 10, width: 50, height: 40 })
    expect(result.errors).toEqual([])
    expect(result.changed.length).toBe(1)
    const obj = store.getState().objects.find((o) => o.id === result.changed[0])
    expect(obj).toMatchObject({ type: 'box', x: 10, y: 10, width: 50, height: 40, fillColor: 'transparent', borderColor: '#374151', borderWidth: 2, cornerRadius: 0 })
    const maxExistingZ = Math.max(...store.getState().objects.filter((o) => o.id !== result.changed[0]).map((o) => o.zIndex))
    expect(obj?.zIndex).toBe(maxExistingZ + 1)
    expect(store.getHistory().entries.length).toBe(before.entries.length + 1)
  })

  it('creates an ellipse, line, and arrow with their own defaults', () => {
    const store = new EditorStore(null)
    const ellipse = store.addShape('user', { type: 'ellipse', x: 0, y: 0, width: 20, height: 20 })
    const line = store.addShape('user', { type: 'line', x1: 0, y1: 0, x2: 50, y2: 50 })
    const arrow = store.addShape('user', { type: 'arrow', x1: 0, y1: 0, x2: 50, y2: 50 })
    const state = store.getState()
    expect(state.objects.find((o) => o.id === ellipse.changed[0])).toMatchObject({ type: 'ellipse', borderWidth: 2 })
    expect(state.objects.find((o) => o.id === line.changed[0])).toMatchObject({ type: 'line', strokeColor: '#374151', strokeWidth: 2 })
    expect(state.objects.find((o) => o.id === arrow.changed[0])).toMatchObject({ type: 'arrow', arrowStart: false, arrowEnd: true })
  })

  it('rejects an unknown type without pushing a history entry', () => {
    const store = new EditorStore(null)
    const before = store.getHistory()
    const result = store.addShape('user', { type: 'triangle', x: 0, y: 0, width: 10, height: 10 })
    expect(result.changed).toEqual([])
    expect(result.errors.length).toBeGreaterThan(0)
    expect(store.getHistory()).toEqual(before)
  })

  it('rejects missing geometry for a box without pushing a history entry', () => {
    const store = new EditorStore(null)
    const before = store.getHistory()
    const result = store.addShape('user', { type: 'box', x: 0, y: 0 })
    expect(result.changed).toEqual([])
    expect(result.errors.length).toBeGreaterThan(0)
    expect(store.getHistory()).toEqual(before)
  })

  it('rejects missing geometry for a line without pushing a history entry', () => {
    const store = new EditorStore(null)
    const before = store.getHistory()
    const result = store.addShape('user', { type: 'line', x1: 0, y1: 0 })
    expect(result.changed).toEqual([])
    expect(result.errors.length).toBeGreaterThan(0)
    expect(store.getHistory()).toEqual(before)
  })

  it('clamps a shape placed beyond the slide edge', () => {
    const store = new EditorStore(null)
    const result = store.addShape('user', { type: 'box', x: 900, y: 500, width: 100, height: 80 })
    const obj = store.getState().objects.find((o) => o.id === result.changed[0])!
    expect(obj).toMatchObject({ x: 860, y: 460 })
  })
})

describe('editorStore z-order', () => {
  function threeBoxes() {
    const store = new EditorStore(null)
    const a = store.addShape('user', { type: 'box', x: 0, y: 0, width: 10, height: 10 }).changed[0]
    const b = store.addShape('user', { type: 'box', x: 20, y: 0, width: 10, height: 10 }).changed[0]
    const c = store.addShape('user', { type: 'box', x: 40, y: 0, width: 10, height: 10 }).changed[0]
    return { store, a, b, c }
  }

  function zOf(store: EditorStore, id: string): number {
    return store.getState().objects.find((o) => o.id === id)!.zIndex
  }

  it('setZIndex sets an explicit value', () => {
    const { store, a } = threeBoxes()
    const result = store.applyUpdate('user', 'setZIndex', [a], { zIndex: 42 })
    expect(result.errors).toEqual([])
    expect(zOf(store, a)).toBe(42)
  })

  it('bringForward swaps with the next-higher object', () => {
    const { store, a, b } = threeBoxes()
    const zA = zOf(store, a)
    const zB = zOf(store, b)
    store.applyUpdate('user', 'bringForward', [a], {})
    expect(zOf(store, a)).toBe(zB)
    expect(zOf(store, b)).toBe(zA)
  })

  it('bringForward on the topmost object is a no-op', () => {
    const { store, c } = threeBoxes()
    const zC = zOf(store, c)
    store.applyUpdate('user', 'bringForward', [c], {})
    expect(zOf(store, c)).toBe(zC)
  })

  it('sendBackward swaps with the next-lower object', () => {
    const { store, b, c } = threeBoxes()
    const zB = zOf(store, b)
    const zC = zOf(store, c)
    store.applyUpdate('user', 'sendBackward', [c], {})
    expect(zOf(store, c)).toBe(zB)
    expect(zOf(store, b)).toBe(zC)
  })

  it('bringToFront moves an object above every other object', () => {
    const { store, a, b, c } = threeBoxes()
    store.applyUpdate('user', 'bringToFront', [a], {})
    const state = store.getState()
    const maxOther = Math.max(zOf(store, b), zOf(store, c))
    expect(state.objects.find((o) => o.id === a)!.zIndex).toBeGreaterThan(maxOther)
  })

  it('sendToBack moves an object below every other object', () => {
    const { store, a, b, c } = threeBoxes()
    store.applyUpdate('user', 'sendToBack', [c], {})
    const minOther = Math.min(zOf(store, a), zOf(store, b))
    expect(zOf(store, c)).toBeLessThan(minOther)
  })
})

describe('editorStore setEndpoint (line/arrow)', () => {
  it('moves the start endpoint independently of the end endpoint', () => {
    const store = new EditorStore(null)
    const { changed } = store.addShape('user', { type: 'line', x1: 10, y1: 10, x2: 100, y2: 100 })
    const id = changed[0]
    const result = store.applyUpdate('user', 'setEndpoint', [id], { which: 'start', x: 50, y: 60 })
    expect(result.errors).toEqual([])
    const obj = store.getState().objects.find((o) => o.id === id) as { x1: number; y1: number; x2: number; y2: number }
    expect(obj).toMatchObject({ x1: 50, y1: 60, x2: 100, y2: 100 })
  })

  it('clamps an endpoint moved beyond the slide edge', () => {
    const store = new EditorStore(null)
    const { changed } = store.addShape('user', { type: 'arrow', x1: 10, y1: 10, x2: 100, y2: 100 })
    const id = changed[0]
    store.applyUpdate('user', 'setEndpoint', [id], { which: 'end', x: 5000, y: -100 })
    const obj = store.getState().objects.find((o) => o.id === id) as { x2: number; y2: number }
    expect(obj).toMatchObject({ x2: 960, y2: 0 })
  })

  it('rejects setEndpoint on a non-line/arrow type', () => {
    const store = new EditorStore(null)
    const result = store.applyUpdate('user', 'setEndpoint', ['title'], { which: 'start', x: 0, y: 0 })
    expect(result.changed).toEqual([])
    expect(result.errors[0]).toContain('does not apply to type')
  })
})

describe('editorStore type-checked action/type mismatches', () => {
  it('setSize does not apply to line/arrow', () => {
    const store = new EditorStore(null)
    const { changed } = store.addShape('user', { type: 'line', x1: 0, y1: 0, x2: 10, y2: 10 })
    const result = store.applyUpdate('user', 'setSize', [changed[0]], { width: 100, height: 100 })
    expect(result.changed).toEqual([])
    expect(result.errors[0]).toContain('does not apply to type')
  })

  it('setFontSize/setFontColor/setText/applyTextStyle only apply to textBox', () => {
    const store = new EditorStore(null)
    const { changed } = store.addShape('user', { type: 'box', x: 0, y: 0, width: 10, height: 10 })
    const id = changed[0]
    for (const [action, args] of [
      ['setFontSize', { fontSize: 20 }],
      ['setFontColor', { color: '#fff' }],
      ['setText', { text: 'hi' }],
      ['applyTextStyle', { start: 0, end: 1, mark: 'bold', value: true }],
    ] as const) {
      const result = store.applyUpdate('user', action, [id], args)
      expect(result.changed).toEqual([])
      expect(result.errors[0]).toContain('does not apply to type')
    }
  })

  it('setFillColor does not apply to line/arrow', () => {
    const store = new EditorStore(null)
    const { changed } = store.addShape('user', { type: 'arrow', x1: 0, y1: 0, x2: 10, y2: 10 })
    const result = store.applyUpdate('user', 'setFillColor', [changed[0]], { color: '#fff' })
    expect(result.changed).toEqual([])
    expect(result.errors[0]).toContain('does not apply to type')
  })

  it('setBorderColor sets strokeColor on line/arrow and borderColor on box/ellipse/textBox', () => {
    const store = new EditorStore(null)
    const line = store.addShape('user', { type: 'line', x1: 0, y1: 0, x2: 10, y2: 10 }).changed[0]
    store.applyUpdate('user', 'setBorderColor', [line], { color: '#123456' })
    const lineObj = store.getState().objects.find((o) => o.id === line) as { strokeColor: string }
    expect(lineObj.strokeColor).toBe('#123456')

    store.applyUpdate('user', 'setBorderColor', ['title'], { color: '#654321' })
    const titleObj = tb(store.getState().objects.find((o) => o.id === 'title'))
    expect(titleObj.borderColor).toBe('#654321')
  })

  it('setStrokeWidth only applies to line/arrow', () => {
    const store = new EditorStore(null)
    const result = store.applyUpdate('user', 'setStrokeWidth', ['title'], { strokeWidth: 5 })
    expect(result.changed).toEqual([])
    expect(result.errors[0]).toContain('does not apply to type')
  })

  it('setBorderWidth only applies to box/ellipse', () => {
    const store = new EditorStore(null)
    const { changed } = store.addShape('user', { type: 'box', x: 0, y: 0, width: 10, height: 10 })
    const result = store.applyUpdate('user', 'setBorderWidth', [changed[0]], { borderWidth: 6 })
    expect(result.errors).toEqual([])
    expect((store.getState().objects.find((o) => o.id === changed[0]) as { borderWidth: number }).borderWidth).toBe(6)

    const rejected = store.applyUpdate('user', 'setBorderWidth', ['title'], { borderWidth: 6 })
    expect(rejected.changed).toEqual([])
  })

  it('setCornerRadius only applies to box, not ellipse', () => {
    const store = new EditorStore(null)
    const box = store.addShape('user', { type: 'box', x: 0, y: 0, width: 10, height: 10 }).changed[0]
    const ellipse = store.addShape('user', { type: 'ellipse', x: 0, y: 0, width: 10, height: 10 }).changed[0]
    expect(store.applyUpdate('user', 'setCornerRadius', [box], { cornerRadius: 12 }).errors).toEqual([])
    const rejected = store.applyUpdate('user', 'setCornerRadius', [ellipse], { cornerRadius: 12 })
    expect(rejected.changed).toEqual([])
  })

  it('setArrowHeads only applies to arrow', () => {
    const store = new EditorStore(null)
    const arrow = store.addShape('user', { type: 'arrow', x1: 0, y1: 0, x2: 10, y2: 10 }).changed[0]
    store.applyUpdate('user', 'setArrowHeads', [arrow], { arrowStart: true, arrowEnd: false })
    const obj = store.getState().objects.find((o) => o.id === arrow) as { arrowStart: boolean; arrowEnd: boolean }
    expect(obj).toMatchObject({ arrowStart: true, arrowEnd: false })

    const line = store.addShape('user', { type: 'line', x1: 0, y1: 0, x2: 10, y2: 10 }).changed[0]
    const rejected = store.applyUpdate('user', 'setArrowHeads', [line], { arrowStart: true })
    expect(rejected.changed).toEqual([])
  })

  it('setRotation is rejected on line/arrow but applies to textBox/box/ellipse', () => {
    const store = new EditorStore(null)
    const line = store.addShape('user', { type: 'line', x1: 0, y1: 0, x2: 10, y2: 10 }).changed[0]
    const arrow = store.addShape('user', { type: 'arrow', x1: 0, y1: 0, x2: 10, y2: 10 }).changed[0]
    for (const id of [line, arrow]) {
      const result = store.applyUpdate('user', 'setRotation', [id], { rotation: 45 })
      expect(result.changed).toEqual([])
      expect(result.errors[0]).toContain('does not apply to type')
    }

    const box = store.addShape('user', { type: 'box', x: 0, y: 0, width: 10, height: 10 }).changed[0]
    const result = store.applyUpdate('user', 'setRotation', [box, 'title'], { rotation: 30 })
    expect(result.errors).toEqual([])
    expect(result.changed).toEqual([box, 'title'])
    expect((store.getState().objects.find((o) => o.id === box) as { rotation: number }).rotation).toBe(30)
  })

  it('setOpacity applies to and clamps on every object type', () => {
    const store = new EditorStore(null)
    const line = store.addShape('user', { type: 'line', x1: 0, y1: 0, x2: 10, y2: 10 }).changed[0]
    const result = store.applyUpdate('user', 'setOpacity', [line, 'title'], { opacity: 1.5 })
    expect(result.errors).toEqual([])
    expect((store.getState().objects.find((o) => o.id === line) as { opacity: number }).opacity).toBe(1)
    store.applyUpdate('user', 'setOpacity', [line], { opacity: -1 })
    expect((store.getState().objects.find((o) => o.id === line) as { opacity: number }).opacity).toBe(0)
  })
})

describe('editorStore slide background color', () => {
  it('setSlideBackgroundColor sets the active slide backgroundColor and captures history', () => {
    const store = new EditorStore(null)
    const before = store.getHistory()
    const result = store.setSlideBackgroundColor('user', '#123456')
    expect(result.ok).toBe(true)
    expect(store.getState().backgroundColor).toBe('#123456')
    expect(store.getHistory().entries.length).toBe(before.entries.length + 1)
  })

  it('rejects an empty color', () => {
    const store = new EditorStore(null)
    const result = store.setSlideBackgroundColor('user', '')
    expect(result.ok).toBe(false)
  })

  it('coalesces a rapid burst of background color changes into one undo step', () => {
    vi.useFakeTimers()
    try {
      const store = new EditorStore(null)
      store.setSlideBackgroundColor('user', '#111111')
      vi.advanceTimersByTime(50)
      store.setSlideBackgroundColor('user', '#222222')
      expect(store.getHistory().entries.length).toBe(1)
      const undoResult = store.undo('user')
      expect(undoResult.steppedEntries.length).toBe(1)
      expect(store.getState().backgroundColor).toBe('#ffffff')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('editorStore boundsOf/clampToSlide for line/arrow, and mixed-type applyGridLayout', () => {
  it('setPosition moves a line by translating both endpoints', () => {
    const store = new EditorStore(null)
    const { changed } = store.addShape('user', { type: 'line', x1: 10, y1: 10, x2: 50, y2: 30 })
    const id = changed[0]
    store.applyUpdate('user', 'setPosition', [id], { dx: 5, dy: 5 })
    const obj = store.getState().objects.find((o) => o.id === id) as { x1: number; y1: number; x2: number; y2: number }
    expect(obj).toMatchObject({ x1: 15, y1: 15, x2: 55, y2: 35 })
  })

  it('setPosition with absolute x/y moves a line so its top-left bound lands there', () => {
    const store = new EditorStore(null)
    const { changed } = store.addShape('user', { type: 'line', x1: 10, y1: 10, x2: 50, y2: 30 })
    const id = changed[0]
    store.applyUpdate('user', 'setPosition', [id], { x: 100, y: 100 })
    const obj = store.getState().objects.find((o) => o.id === id) as { x1: number; y1: number; x2: number; y2: number }
    // bounds were { x: 10, y: 10, width: 40, height: 20 }; moving bounds.x/y to 100,100 translates by dx=90, dy=90.
    expect(obj).toMatchObject({ x1: 100, y1: 100, x2: 140, y2: 120 })
  })

  it('applyGridLayout lays out a mix of a textBox and a line by their bounding boxes', () => {
    const store = new EditorStore(null)
    const line = store.addShape('user', { type: 'line', x1: 0, y1: 0, x2: 40, y2: 20 }).changed[0]
    const result = store.applyUpdate('user', 'applyGridLayout', ['title', line], { direction: 'horizontal', gap: 10 })
    expect(result.errors).toEqual([])
    const titleObj = tb(store.getState().objects.find((o) => o.id === 'title'))
    const lineObj = store.getState().objects.find((o) => o.id === line) as { x1: number; x2: number }
    expect(lineObj.x1).toBe(titleObj.x + titleObj.width + 10)
    expect(lineObj.x2 - lineObj.x1).toBe(40)
  })
})

// Font-size stepper clicks, color-picker drags, and rapid consecutive
// nudges/resizes on the same object should collapse into a single undo
// step rather than one entry per intermediate value — see editor-state.ts's
// HISTORY_MERGE_WINDOW_MS/HISTORY_MERGE_MAX_BURST_MS/mergeKeyFor. Uses fake
// timers so both windows are exercised deterministically without a real
// wall-clock wait.
describe('editorStore undo/redo history merging', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('rapid setFontSize calls on the same object within the merge window collapse into one entry', () => {
    const store = new EditorStore(null)
    store.applyUpdate('user', 'setFontSize', ['title'], { fontSize: 17 })
    vi.advanceTimersByTime(50)
    store.applyUpdate('user', 'setFontSize', ['title'], { fontSize: 18 })
    vi.advanceTimersByTime(50)
    store.applyUpdate('user', 'setFontSize', ['title'], { fontSize: 19 })

    const history = store.getHistory()
    expect(history.entries.length).toBe(1)
    expect(history.entries[0].description).toBe('Changed font size on 1 object')
    expect(tb(store.getState().objects.find((o) => o.id === 'title')).fontSize).toBe(19)
  })

  it('undo after a merged burst reverts all the way back to before the first edit', () => {
    const store = new EditorStore(null)
    const seedFontSize = tb(store.getState().objects.find((o) => o.id === 'title')).fontSize
    store.applyUpdate('user', 'setFontSize', ['title'], { fontSize: 17 })
    vi.advanceTimersByTime(50)
    store.applyUpdate('user', 'setFontSize', ['title'], { fontSize: 19 })

    const result = store.undo('user')
    expect(result.steppedEntries.length).toBe(1)
    expect(tb(store.getState().objects.find((o) => o.id === 'title')).fontSize).toBe(seedFontSize)
  })

  it('rapid setPosition calls on the same object (e.g. quick consecutive drags) collapse into one entry', () => {
    const store = new EditorStore(null)
    const seedX = tb(store.getState().objects.find((o) => o.id === 'title')).x
    store.applyUpdate('user', 'setPosition', ['title'], { x: 100, y: 100 })
    vi.advanceTimersByTime(100)
    store.applyUpdate('user', 'setPosition', ['title'], { x: 105, y: 100 })
    vi.advanceTimersByTime(100)
    store.applyUpdate('user', 'setPosition', ['title'], { x: 110, y: 100 })

    expect(store.getHistory().entries.length).toBe(1)
    const undoResult = store.undo('user')
    expect(undoResult.steppedEntries.length).toBe(1)
    expect(tb(store.getState().objects.find((o) => o.id === 'title')).x).toBe(seedX)
  })

  it('edits separated by more than the merge window each get their own entry', () => {
    const store = new EditorStore(null)
    store.applyUpdate('user', 'setFontSize', ['title'], { fontSize: 17 })
    vi.advanceTimersByTime(700)
    store.applyUpdate('user', 'setFontSize', ['title'], { fontSize: 18 })
    expect(store.getHistory().entries.length).toBe(2)
  })

  it('forces a new entry once a continuous burst exceeds the max burst duration, even with every gap inside the merge window', () => {
    const store = new EditorStore(null)
    const seedFontSize = tb(store.getState().objects.find((o) => o.id === 'title')).fontSize
    store.applyUpdate('user', 'setFontSize', ['title'], { fontSize: 17 }) // burst start, t=0
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(500) // < HISTORY_MERGE_WINDOW_MS each time, but t=2500 total exceeds the 2000ms cap
      store.applyUpdate('user', 'setFontSize', ['title'], { fontSize: 18 + i })
    }

    expect(store.getHistory().entries.length).toBe(2)
    expect(tb(store.getState().objects.find((o) => o.id === 'title')).fontSize).toBe(22)

    // First undo reverts only the second burst (back to 21, the value right before it started).
    store.undo('user')
    expect(tb(store.getState().objects.find((o) => o.id === 'title')).fontSize).toBe(21)
    // Second undo reverts the first burst all the way back to the seed value.
    store.undo('user')
    expect(tb(store.getState().objects.find((o) => o.id === 'title')).fontSize).toBe(seedFontSize)
  })

  it('does not merge edits from different actors even within the merge window', () => {
    const store = new EditorStore(null)
    store.applyUpdate('user', 'setFontSize', ['title'], { fontSize: 17 })
    store.applyUpdate('agent', 'setFontSize', ['title'], { fontSize: 18 })
    expect(store.getHistory().entries.length).toBe(2)
  })

  it('does not merge edits targeting different objects even within the merge window', () => {
    const store = new EditorStore(null)
    store.applyUpdate('user', 'setFontSize', ['title'], { fontSize: 17 })
    store.applyUpdate('user', 'setFontSize', ['box-1'], { fontSize: 18 })
    expect(store.getHistory().entries.length).toBe(2)
  })

  it('does not merge edits with a different action even on the same target within the window', () => {
    const store = new EditorStore(null)
    store.applyUpdate('user', 'setFontSize', ['title'], { fontSize: 17 })
    store.applyUpdate('user', 'setPosition', ['title'], { x: 5, y: 5 })
    expect(store.getHistory().entries.length).toBe(2)
  })

  it('never merges non-mergeable actions like setText, even for the same target within the window', () => {
    const store = new EditorStore(null)
    store.applyUpdate('user', 'setText', ['title'], { text: 'one' })
    store.applyUpdate('user', 'setText', ['title'], { text: 'two' })
    expect(store.getHistory().entries.length).toBe(2)
  })

  it('a merged burst still discards the redo tail on the first edit that starts it', () => {
    const store = new EditorStore(null)
    store.applyUpdate('user', 'setFontSize', ['title'], { fontSize: 17 })
    store.undo('user')
    expect(store.getHistory().canRedo).toBe(true)

    store.applyUpdate('user', 'setFontSize', ['title'], { fontSize: 20 })
    expect(store.getHistory().canRedo).toBe(false)
  })
})

describe('editorStore addImage', () => {
  it('creates an image with an explicit crop, deriving nothing', () => {
    const store = new EditorStore(null)
    const before = store.getHistory()
    const result = store.addImage('user', { src: 'https://example.com/a.png', x: 10, y: 10, width: 200, height: 100, cropX: 5, cropY: 5, cropWidth: 400, cropHeight: 200 })
    expect(result.errors).toEqual([])
    const obj = img(store.getState().objects.find((o) => o.id === result.changed[0]))
    expect(obj).toMatchObject({ type: 'image', src: 'https://example.com/a.png', x: 10, y: 10, width: 200, height: 100, cropX: 5, cropY: 5, cropWidth: 400, cropHeight: 200, opacity: 1, rotation: 0 })
    expect(store.getHistory().entries.length).toBe(before.entries.length + 1)
  })

  it('creates an image without an explicit crop, defaulting to the full source extent via naturalWidth/naturalHeight', () => {
    const store = new EditorStore(null)
    const result = store.addImage('user', { src: 'https://example.com/a.png', x: 0, y: 0, width: 100, naturalWidth: 800, naturalHeight: 400 })
    const obj = img(store.getState().objects.find((o) => o.id === result.changed[0]))
    expect(obj).toMatchObject({ cropX: 0, cropY: 0, cropWidth: 800, cropHeight: 400 })
    // height derived from width via the crop's 2:1 aspect ratio.
    expect(obj.height).toBe(50)
  })

  it('derives the omitted destination dimension from the crop aspect ratio when only one is given', () => {
    const store = new EditorStore(null)
    const result = store.addImage('user', { src: 'a.png', x: 0, y: 0, height: 50, cropWidth: 800, cropHeight: 400 })
    const obj = img(store.getState().objects.find((o) => o.id === result.changed[0]))
    expect(obj.width).toBe(100)
  })

  it('rejects a call missing src without pushing a history entry', () => {
    const store = new EditorStore(null)
    const before = store.getHistory()
    const result = store.addImage('user', { x: 0, y: 0, width: 100, height: 50, cropWidth: 200, cropHeight: 100 })
    expect(result.changed).toEqual([])
    expect(result.errors.length).toBeGreaterThan(0)
    expect(store.getHistory()).toEqual(before)
  })

  it('rejects a call with neither crop size nor natural dimensions without pushing a history entry', () => {
    const store = new EditorStore(null)
    const before = store.getHistory()
    const result = store.addImage('user', { src: 'a.png', x: 0, y: 0, width: 100, height: 50 })
    expect(result.changed).toEqual([])
    expect(result.errors.length).toBeGreaterThan(0)
    expect(store.getHistory()).toEqual(before)
  })

  it('clamps an oversized image by scaling width/height down together, preserving aspect ratio', () => {
    const store = new EditorStore(null)
    const result = store.addImage('user', { src: 'a.png', x: 0, y: 0, width: 1920, height: 1080, cropWidth: 1920, cropHeight: 1080 })
    const obj = img(store.getState().objects.find((o) => o.id === result.changed[0]))
    expect(obj.width).toBeLessThanOrEqual(960)
    expect(obj.height).toBeLessThanOrEqual(540)
    // 1920x1080 is 16:9 — clamped by the height limit (540/1080 = 0.5), so width should be exactly half too.
    expect(obj.width).toBeCloseTo(960, 5)
    expect(obj.height).toBeCloseTo(540, 5)
  })
})

describe('deriveImageSize / deriveCropSize', () => {
  const current: ImageObject = {
    id: 'i1',
    type: 'image',
    zIndex: 0,
    opacity: 1,
    rotation: 0,
    src: 'a.png',
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    cropX: 0,
    cropY: 0,
    cropWidth: 400,
    cropHeight: 200,
  }

  it('derives height from width alone, preserving the crop aspect ratio', () => {
    expect(deriveImageSize(current, { width: 100 })).toEqual({ width: 100, height: 50 })
  })

  it('derives width from height alone, preserving the crop aspect ratio', () => {
    expect(deriveImageSize(current, { height: 25 })).toEqual({ width: 50, height: 25 })
  })

  it('when both width and height are given with a mismatched ratio, width wins and height is recomputed', () => {
    expect(deriveImageSize(current, { width: 100, height: 999 })).toEqual({ width: 100, height: 50 })
  })

  it('returns the current size unchanged when neither field is given', () => {
    expect(deriveImageSize(current, {})).toEqual({ width: 200, height: 100 })
  })

  it('derives cropHeight from cropWidth alone', () => {
    expect(deriveCropSize(current, { cropWidth: 200 })).toEqual({ cropWidth: 200, cropHeight: 100 })
  })

  it('derives cropWidth from cropHeight alone', () => {
    expect(deriveCropSize(current, { cropHeight: 50 })).toEqual({ cropWidth: 100, cropHeight: 50 })
  })

  it('when both cropWidth and cropHeight are given with a mismatched ratio, cropWidth wins', () => {
    expect(deriveCropSize(current, { cropWidth: 200, cropHeight: 999 })).toEqual({ cropWidth: 200, cropHeight: 100 })
  })
})

describe('editorStore image-specific update actions', () => {
  function withImage() {
    const store = new EditorStore(null)
    const id = store.addImage('user', { src: 'https://example.com/a.png', x: 10, y: 10, width: 200, height: 100, cropX: 0, cropY: 0, cropWidth: 400, cropHeight: 200 }).changed[0]
    return { store, id }
  }

  it('setSize on an image derives the omitted dimension and captures history', () => {
    const { store, id } = withImage()
    const before = store.getHistory()
    const result = store.applyUpdate('user', 'setSize', [id], { width: 100 })
    expect(result.errors).toEqual([])
    expect(img(store.getState().objects.find((o) => o.id === id)).height).toBe(50)
    expect(store.getHistory().entries.length).toBe(before.entries.length + 1)
  })

  it('setCrop pans without changing size, and zooms without changing position', () => {
    const { store, id } = withImage()
    store.applyUpdate('user', 'setCrop', [id], { cropX: 20, cropY: 30 })
    let obj = img(store.getState().objects.find((o) => o.id === id))
    expect(obj).toMatchObject({ cropX: 20, cropY: 30, cropWidth: 400, cropHeight: 200 })
    // Destination is unaffected by a pan.
    expect(obj).toMatchObject({ width: 200, height: 100 })

    store.applyUpdate('user', 'setCrop', [id], { cropWidth: 200 })
    obj = img(store.getState().objects.find((o) => o.id === id))
    expect(obj).toMatchObject({ cropX: 20, cropY: 30, cropWidth: 200, cropHeight: 100 })
  })

  it('setCrop does not apply to non-image types', () => {
    const store = new EditorStore(null)
    const result = store.applyUpdate('user', 'setCrop', ['title'], { cropX: 1 })
    expect(result.changed).toEqual([])
    expect(result.errors[0]).toContain('does not apply to type')
  })

  it('setImageSource resets the crop to the new source full extent and rederives height from the existing width', () => {
    const { store, id } = withImage()
    const result = store.applyUpdate('user', 'setImageSource', [id], { src: 'https://example.com/b.png', naturalWidth: 800, naturalHeight: 800 })
    expect(result.errors).toEqual([])
    const obj = img(store.getState().objects.find((o) => o.id === id))
    expect(obj.src).toBe('https://example.com/b.png')
    expect(obj).toMatchObject({ cropX: 0, cropY: 0, cropWidth: 800, cropHeight: 800 })
    expect(obj.width).toBe(200)
    expect(obj.height).toBe(200)
  })

  it('setImageSource requires naturalWidth/naturalHeight since the server cannot inspect image bytes', () => {
    const { store, id } = withImage()
    const result = store.applyUpdate('user', 'setImageSource', [id], { src: 'https://example.com/b.png' })
    expect(result.changed).toEqual([])
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('undo/redo step through setOpacity, setRotation, setImageSource, and setCrop individually', () => {
    const { store, id } = withImage()
    store.applyUpdate('user', 'setOpacity', [id], { opacity: 0.5 })
    store.applyUpdate('user', 'setRotation', [id], { rotation: 45 })
    store.applyUpdate('user', 'setImageSource', [id], { src: 'https://example.com/b.png', naturalWidth: 400, naturalHeight: 200 })
    store.applyUpdate('user', 'setCrop', [id], { cropX: 10 })

    expect(img(store.getState().objects.find((o) => o.id === id)).cropX).toBe(10)
    store.undo('user')
    expect(img(store.getState().objects.find((o) => o.id === id)).src).toBe('https://example.com/b.png')
    store.undo('user')
    expect(img(store.getState().objects.find((o) => o.id === id)).src).toBe('https://example.com/a.png')
    expect((store.getState().objects.find((o) => o.id === id) as { rotation: number }).rotation).toBe(45)
    store.undo('user')
    expect((store.getState().objects.find((o) => o.id === id) as { rotation: number }).rotation).toBe(0)
    store.undo('user')
    expect((store.getState().objects.find((o) => o.id === id) as { opacity: number }).opacity).toBe(1)

    store.redo('user')
    expect((store.getState().objects.find((o) => o.id === id) as { opacity: number }).opacity).toBe(0.5)
  })
})
