import { describe, expect, it } from 'vitest'
import { EditorStore, editorStore, plainTextOf, type TextBlock } from './editor-state'

describe('editorStore', () => {
  it('setSelection drops unknown ids', () => {
    editorStore.setSelection(['title', 'does-not-exist'])
    expect(editorStore.getState().selection).toEqual(['title'])
  })

  it('applyUpdate setPosition updates x/y and reports changed ids', () => {
    const result = editorStore.applyUpdate('setPosition', ['title'], { x: 10, y: 20 })
    expect(result.changed).toEqual(['title'])
    expect(result.errors).toEqual([])
    const obj = editorStore.getState().objects.find((o) => o.id === 'title')
    expect(obj?.x).toBe(10)
    expect(obj?.y).toBe(20)
  })

  it('applyUpdate reports an error for unknown target ids instead of throwing', () => {
    const result = editorStore.applyUpdate('setText', ['does-not-exist'], { text: 'hi' })
    expect(result.changed).toEqual([])
    expect(result.errors).toEqual(['No object with id "does-not-exist"'])
  })

  it('applyGridLayout lays targets out left-to-right with the given gap', () => {
    const result = editorStore.applyUpdate('applyGridLayout', ['box-1', 'box-2'], { direction: 'horizontal', gap: 10 })
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
    const { deckId } = editorStore.createDeck('New Deck')
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
    const { deckId: deckA } = editorStore.createDeck('Deck A')
    const { slideId: deckASlide2 } = editorStore.addSlide()
    editorStore.createDeck('Deck B')
    editorStore.selectDeck(deckA)
    expect(editorStore.getState().activeSlideId).toBe(deckASlide2)
  })

  it('deleteDeck rejects deleting the only remaining deck', () => {
    const decks = editorStore.listDecks()
    for (const d of decks.slice(1)) editorStore.deleteDeck(d.id)
    const remaining = editorStore.listDecks()
    expect(remaining.length).toBe(1)
    const result = editorStore.deleteDeck(remaining[0].id)
    expect(result.ok).toBe(false)
    expect(editorStore.listDecks().length).toBe(1)
  })

  it('deleteDeck activates a remaining deck when deleting the active deck', () => {
    const { deckId } = editorStore.createDeck('Another Deck')
    expect(editorStore.getState().activeDeckId).toBe(deckId)
    const result = editorStore.deleteDeck(deckId)
    expect(result.ok).toBe(true)
    expect(editorStore.getState().activeDeckId).not.toBe(deckId)
  })

  it('renameDeck renames the active deck', () => {
    const { deckId } = editorStore.createDeck('Old Name')
    const result = editorStore.renameDeck(deckId, 'New Name')
    expect(result.ok).toBe(true)
    expect(editorStore.listDecks().find((d) => d.id === deckId)?.name).toBe('New Name')
  })

  it('renameDeck renames a deck that is not active without changing the active deck', () => {
    const { deckId: targetDeck } = editorStore.createDeck('Target Deck')
    const { deckId: activeDeck } = editorStore.createDeck('Active Deck')
    const result = editorStore.renameDeck(targetDeck, 'Renamed Target')
    expect(result.ok).toBe(true)
    expect(editorStore.listDecks().find((d) => d.id === targetDeck)?.name).toBe('Renamed Target')
    expect(editorStore.getState().activeDeckId).toBe(activeDeck)
  })

  it('renameDeck rejects an empty or whitespace-only name, leaving the name unchanged', () => {
    const { deckId } = editorStore.createDeck('Keep Me')
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
    const { slideId } = editorStore.addSlide()
    const state = editorStore.getState()
    expect(state.slides.length).toBe(before + 1)
    expect(state.activeSlideId).toBe(slideId)
    expect(state.objects).toEqual([])
  })

  it('removeSlide rejects removing the only remaining slide in a deck', () => {
    editorStore.createDeck('Solo Deck')
    const slides = editorStore.getState().slides
    expect(slides.length).toBe(1)
    const result = editorStore.removeSlide(slides[0].id)
    expect(result.ok).toBe(false)
    expect(editorStore.getState().slides.length).toBe(1)
  })

  it('removeSlide activates a neighboring slide when removing the active slide', () => {
    const { slideId } = editorStore.addSlide()
    const result = editorStore.removeSlide(slideId)
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
    const { slideId: otherSlideId } = editorStore.addSlide()
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
    const result = editorStore.applyUpdate('addObject', [], { x: 10, y: 20, width: 100, height: 50, text: 'hello' })
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
    const result = editorStore.applyUpdate('addObject', [], { x: 10, y: 20 })
    expect(result.changed).toEqual([])
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('addObject rejects a duplicate explicit id', () => {
    seedSlide()
    const result = editorStore.applyUpdate('addObject', [], { id: 'title', x: 0, y: 0, width: 10, height: 10 })
    expect(result.changed).toEqual([])
    expect(result.errors).toEqual(['Object with id "title" already exists on the active slide'])
  })

  it('removeObject removes the object and drops it from the selection', () => {
    seedSlide()
    const { changed } = editorStore.applyUpdate('addObject', [], { x: 0, y: 0, width: 10, height: 10 })
    const id = changed[0]
    editorStore.setSelection([id])
    const result = editorStore.applyUpdate('removeObject', [id], {})
    expect(result.changed).toEqual([id])
    expect(result.errors).toEqual([])
    expect(editorStore.getState().objects.find((o) => o.id === id)).toBeUndefined()
    expect(editorStore.getState().selection).toEqual([])
  })

  it('removeObject reports unknown ids without affecting other targets', () => {
    seedSlide()
    const { changed } = editorStore.applyUpdate('addObject', [], { x: 0, y: 0, width: 10, height: 10 })
    const id = changed[0]
    const result = editorStore.applyUpdate('removeObject', [id, 'does-not-exist'], {})
    expect(result.changed).toEqual([id])
    expect(result.errors).toEqual(['No object with id "does-not-exist"'])
  })
})

describe('editorStore slide-bounds clamping (960x540)', () => {
  it('addObject clamps an object placed beyond the slide edge', () => {
    seedSlide()
    const { changed } = editorStore.applyUpdate('addObject', [], { x: 900, y: 500, width: 100, height: 80 })
    const obj = editorStore.getState().objects.find((o) => o.id === changed[0])!
    expect(obj.width).toBe(100)
    expect(obj.height).toBe(80)
    expect(obj.x).toBe(860) // 960 - 100
    expect(obj.y).toBe(460) // 540 - 80
  })

  it('addObject leaves an in-bounds object exactly as requested', () => {
    seedSlide()
    const { changed } = editorStore.applyUpdate('addObject', [], { x: 10, y: 20, width: 100, height: 50 })
    const obj = editorStore.getState().objects.find((o) => o.id === changed[0])!
    expect(obj).toMatchObject({ x: 10, y: 20, width: 100, height: 50 })
  })

  it('setPosition clamps an object moved past each edge without changing its size', () => {
    seedSlide()
    const { changed } = editorStore.applyUpdate('addObject', [], { x: 0, y: 0, width: 100, height: 80 })
    const id = changed[0]

    editorStore.applyUpdate('setPosition', [id], { x: -50, y: -50 })
    expect(editorStore.getState().objects.find((o) => o.id === id)).toMatchObject({ x: 0, y: 0, width: 100, height: 80 })

    editorStore.applyUpdate('setPosition', [id], { x: 900, y: 500 })
    const obj = editorStore.getState().objects.find((o) => o.id === id)!
    expect(obj).toMatchObject({ x: 860, y: 460, width: 100, height: 80 })
  })

  it('setPosition leaves an in-bounds move exactly as requested', () => {
    seedSlide()
    const { changed } = editorStore.applyUpdate('addObject', [], { x: 0, y: 0, width: 100, height: 80 })
    const id = changed[0]
    editorStore.applyUpdate('setPosition', [id], { x: 300, y: 200 })
    expect(editorStore.getState().objects.find((o) => o.id === id)).toMatchObject({ x: 300, y: 200, width: 100, height: 80 })
  })

  it('setSize clamps an object grown past each edge', () => {
    seedSlide()
    const { changed } = editorStore.applyUpdate('addObject', [], { x: 900, y: 500, width: 10, height: 10 })
    const id = changed[0]
    editorStore.applyUpdate('setSize', [id], { width: 200, height: 150 })
    const obj = editorStore.getState().objects.find((o) => o.id === id)!
    expect(obj.width).toBe(200)
    expect(obj.height).toBe(150)
    expect(obj.x).toBe(760) // 960 - 200
    expect(obj.y).toBe(390) // 540 - 150
  })

  it('setSize clamps a requested size larger than the slide itself', () => {
    seedSlide()
    const { changed } = editorStore.applyUpdate('addObject', [], { x: 0, y: 0, width: 10, height: 10 })
    const id = changed[0]
    editorStore.applyUpdate('setSize', [id], { width: 2000, height: 1000 })
    const obj = editorStore.getState().objects.find((o) => o.id === id)!
    expect(obj).toMatchObject({ x: 0, y: 0, width: 960, height: 540 })
  })

  it('setSize leaves an in-bounds resize exactly as requested', () => {
    seedSlide()
    const { changed } = editorStore.applyUpdate('addObject', [], { x: 10, y: 10, width: 50, height: 50 })
    const id = changed[0]
    editorStore.applyUpdate('setSize', [id], { width: 120, height: 90 })
    expect(editorStore.getState().objects.find((o) => o.id === id)).toMatchObject({ x: 10, y: 10, width: 120, height: 90 })
  })
})

describe('editorStore font/border/fill color, including transparent', () => {
  it('setFontColor and setBorderColor update their fields', () => {
    seedSlide()
    editorStore.applyUpdate('setFontColor', ['title'], { color: '#ff0000' })
    editorStore.applyUpdate('setBorderColor', ['title'], { color: '#00ff00' })
    const obj = editorStore.getState().objects.find((o) => o.id === 'title')!
    expect(obj.fontColor).toBe('#ff0000')
    expect(obj.borderColor).toBe('#00ff00')
  })

  it('setBorderColor and setFillColor accept "transparent"', () => {
    seedSlide()
    editorStore.applyUpdate('setBorderColor', ['title'], { color: 'transparent' })
    editorStore.applyUpdate('setFillColor', ['title'], { color: 'transparent' })
    const obj = editorStore.getState().objects.find((o) => o.id === 'title')!
    expect(obj.borderColor).toBe('transparent')
    expect(obj.fillColor).toBe('transparent')
  })
})

describe('editorStore applyTextStyle', () => {
  it('bold splits a run at the given plain-text offsets', () => {
    seedSlide()
    editorStore.applyUpdate('setText', ['box-1'], { text: 'Hello world' })
    editorStore.applyUpdate('applyTextStyle', ['box-1'], { start: 0, end: 5, mark: 'bold', value: true })
    const obj = editorStore.getState().objects.find((o) => o.id === 'box-1')!
    expect(plainTextOf(obj)).toBe('Hello world')
    const runs = obj.text[0].runs
    expect(runs[0]).toEqual({ text: 'Hello', bold: true })
    expect(runs[1].bold).toBeUndefined()
    expect(runs.map((r) => r.text).join('')).toBe('Hello world')
  })

  it('toggles bold off when re-applied with value: false', () => {
    seedSlide()
    editorStore.applyUpdate('setText', ['box-1'], { text: 'Hello world' })
    editorStore.applyUpdate('applyTextStyle', ['box-1'], { start: 0, end: 5, mark: 'bold', value: true })
    editorStore.applyUpdate('applyTextStyle', ['box-1'], { start: 0, end: 5, mark: 'bold', value: false })
    const obj = editorStore.getState().objects.find((o) => o.id === 'box-1')!
    expect(obj.text[0].runs.every((r) => !r.bold)).toBe(true)
  })

  it('listType converts the touched block to a bulleted list, preserving runs', () => {
    seedSlide()
    editorStore.applyUpdate('setText', ['box-1'], { text: 'Item one' })
    editorStore.applyUpdate('applyTextStyle', ['box-1'], { start: 0, end: 4, mark: 'bold', value: true })
    editorStore.applyUpdate('applyTextStyle', ['box-1'], { start: 0, end: 8, listType: 'bulleted' })
    const obj = editorStore.getState().objects.find((o) => o.id === 'box-1')!
    const block = obj.text[0]
    if (block.kind !== 'listItem') throw new Error('expected a listItem block')
    expect(block.listType).toBe('bulleted')
    expect(plainTextOf(obj)).toBe('Item one')
    expect(block.runs[0]).toEqual({ text: 'Item', bold: true })
  })

  it('listType: null converts a list item back to a paragraph', () => {
    seedSlide()
    editorStore.applyUpdate('setText', ['box-1'], { text: 'Item one' })
    editorStore.applyUpdate('applyTextStyle', ['box-1'], { start: 0, end: 8, listType: 'numbered' })
    editorStore.applyUpdate('applyTextStyle', ['box-1'], { start: 0, end: 8, listType: null })
    const obj = editorStore.getState().objects.find((o) => o.id === 'box-1')!
    expect(obj.text[0].kind).toBe('paragraph')
  })

  it('addresses multi-block offsets across the "\\n" block separator', () => {
    seedSlide()
    editorStore.applyUpdate('setText', ['box-1'], {
      text: [
        { kind: 'paragraph', runs: [{ text: 'First' }] },
        { kind: 'paragraph', runs: [{ text: 'Second' }] },
      ],
    })
    expect(plainTextOf(editorStore.getState().objects.find((o) => o.id === 'box-1')!)).toBe('First\nSecond')
    // "Second" starts at offset 6: 5 chars of "First" plus 1 for the "\n" separator.
    editorStore.applyUpdate('applyTextStyle', ['box-1'], { start: 6, end: 12, mark: 'italic', value: true })
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
    editorStore.applyUpdate('setText', ['box-1'], { text: 'Hello world' })
    editorStore.applyUpdate('applyTextStyle', ['box-1'], { start: 0, end: 5, mark: 'bold', value: true })
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
