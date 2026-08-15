import { describe, expect, it } from 'vitest'
import { editorStore } from './editor-state'

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
