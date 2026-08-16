import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorStore, editorStore, plainTextOf, type TextBlock } from './editor-state'

describe('editorStore', () => {
  it('setSelection drops unknown ids', () => {
    editorStore.setSelection(['title', 'does-not-exist'])
    expect(editorStore.getState().selection).toEqual(['title'])
  })

  it('applyUpdate setPosition updates x/y and reports changed ids', () => {
    const result = editorStore.applyUpdate('user', 'setPosition', ['title'], { x: 10, y: 20 })
    expect(result.changed).toEqual(['title'])
    expect(result.errors).toEqual([])
    const obj = editorStore.getState().objects.find((o) => o.id === 'title')
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
    const box1 = state.objects.find((o) => o.id === 'box-1')!
    const box2 = state.objects.find((o) => o.id === 'box-2')!
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
    const created = state.objects.find((o) => o.id === result.changed[0])!
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
    const obj = editorStore.getState().objects.find((o) => o.id === changed[0])!
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
    const obj = editorStore.getState().objects.find((o) => o.id === id)!
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
    const obj = editorStore.getState().objects.find((o) => o.id === 'title')!
    expect(obj.fontColor).toBe('#ff0000')
    expect(obj.borderColor).toBe('#00ff00')
  })

  it('setBorderColor and setFillColor accept "transparent"', () => {
    seedSlide()
    editorStore.applyUpdate('user', 'setBorderColor', ['title'], { color: 'transparent' })
    editorStore.applyUpdate('user', 'setFillColor', ['title'], { color: 'transparent' })
    const obj = editorStore.getState().objects.find((o) => o.id === 'title')!
    expect(obj.borderColor).toBe('transparent')
    expect(obj.fillColor).toBe('transparent')
  })
})

describe('editorStore applyTextStyle', () => {
  it('bold splits a run at the given plain-text offsets', () => {
    seedSlide()
    editorStore.applyUpdate('user', 'setText', ['box-1'], { text: 'Hello world' })
    editorStore.applyUpdate('user', 'applyTextStyle', ['box-1'], { start: 0, end: 5, mark: 'bold', value: true })
    const obj = editorStore.getState().objects.find((o) => o.id === 'box-1')!
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
    const obj = editorStore.getState().objects.find((o) => o.id === 'box-1')!
    expect(obj.text[0].runs.every((r) => !r.bold)).toBe(true)
  })

  it('listType converts the touched block to a bulleted list, preserving runs', () => {
    seedSlide()
    editorStore.applyUpdate('user', 'setText', ['box-1'], { text: 'Item one' })
    editorStore.applyUpdate('user', 'applyTextStyle', ['box-1'], { start: 0, end: 4, mark: 'bold', value: true })
    editorStore.applyUpdate('user', 'applyTextStyle', ['box-1'], { start: 0, end: 8, listType: 'bulleted' })
    const obj = editorStore.getState().objects.find((o) => o.id === 'box-1')!
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
    const obj = editorStore.getState().objects.find((o) => o.id === 'box-1')!
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
    expect(plainTextOf(editorStore.getState().objects.find((o) => o.id === 'box-1')!)).toBe('First\nSecond')
    // "Second" starts at offset 6: 5 chars of "First" plus 1 for the "\n" separator.
    editorStore.applyUpdate('user', 'applyTextStyle', ['box-1'], { start: 6, end: 12, mark: 'italic', value: true })
    const obj = editorStore.getState().objects.find((o) => o.id === 'box-1')!
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
              objects: [
                {
                  id: 'obj-a',
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
    expect(store.getState().objects.find((o) => o.id === 'title')?.fontSize).toBe(19)
  })

  it('undo after a merged burst reverts all the way back to before the first edit', () => {
    const store = new EditorStore(null)
    const seedFontSize = store.getState().objects.find((o) => o.id === 'title')!.fontSize
    store.applyUpdate('user', 'setFontSize', ['title'], { fontSize: 17 })
    vi.advanceTimersByTime(50)
    store.applyUpdate('user', 'setFontSize', ['title'], { fontSize: 19 })

    const result = store.undo('user')
    expect(result.steppedEntries.length).toBe(1)
    expect(store.getState().objects.find((o) => o.id === 'title')?.fontSize).toBe(seedFontSize)
  })

  it('rapid setPosition calls on the same object (e.g. quick consecutive drags) collapse into one entry', () => {
    const store = new EditorStore(null)
    const seedX = store.getState().objects.find((o) => o.id === 'title')!.x
    store.applyUpdate('user', 'setPosition', ['title'], { x: 100, y: 100 })
    vi.advanceTimersByTime(100)
    store.applyUpdate('user', 'setPosition', ['title'], { x: 105, y: 100 })
    vi.advanceTimersByTime(100)
    store.applyUpdate('user', 'setPosition', ['title'], { x: 110, y: 100 })

    expect(store.getHistory().entries.length).toBe(1)
    const undoResult = store.undo('user')
    expect(undoResult.steppedEntries.length).toBe(1)
    expect(store.getState().objects.find((o) => o.id === 'title')?.x).toBe(seedX)
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
    const seedFontSize = store.getState().objects.find((o) => o.id === 'title')!.fontSize
    store.applyUpdate('user', 'setFontSize', ['title'], { fontSize: 17 }) // burst start, t=0
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(500) // < HISTORY_MERGE_WINDOW_MS each time, but t=2500 total exceeds the 2000ms cap
      store.applyUpdate('user', 'setFontSize', ['title'], { fontSize: 18 + i })
    }

    expect(store.getHistory().entries.length).toBe(2)
    expect(store.getState().objects.find((o) => o.id === 'title')?.fontSize).toBe(22)

    // First undo reverts only the second burst (back to 21, the value right before it started).
    store.undo('user')
    expect(store.getState().objects.find((o) => o.id === 'title')?.fontSize).toBe(21)
    // Second undo reverts the first burst all the way back to the seed value.
    store.undo('user')
    expect(store.getState().objects.find((o) => o.id === 'title')?.fontSize).toBe(seedFontSize)
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
