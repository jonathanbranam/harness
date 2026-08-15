// In-memory "live deck" that the browser canvas and the presentation-bridge
// pi extension both read/write in-process. No persistence: this is a local,
// iterate-fast prototype per docs/talks/deck-harness/planning.md — see that
// doc's "Open questions" for whether/how to persist deck state later.
//
// Shape: decks -> slides -> objects, with exactly one active deck and one
// active slide per deck (deck-management's design.md). Object ids are unique
// only within their slide, not globally across the deck.

import { randomUUID } from 'node:crypto'

export interface DeckObject {
  id: string
  x: number
  y: number
  width: number
  height: number
  text: string
  fillColor: string
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

export type UpdateAction = 'setPosition' | 'setSize' | 'setText' | 'setFillColor' | 'setFontSize' | 'applyGridLayout'

export interface UpdateResult {
  changed: string[]
  errors: string[]
}

function seedObjects(): DeckObject[] {
  return [
    { id: 'title', x: 40, y: 40, width: 400, height: 80, text: 'Deck Harness', fillColor: '#1f2937', fontSize: 32 },
    { id: 'box-1', x: 40, y: 160, width: 200, height: 120, text: 'Talk to pi about the server here', fillColor: '#374151', fontSize: 16 },
    { id: 'box-2', x: 260, y: 160, width: 200, height: 120, text: 'It can move, resize, and restyle these boxes', fillColor: '#374151', fontSize: 16 },
  ]
}

class EditorStore {
  private decks = new Map<string, Deck>()
  private activeDeckId: string
  private selection: string[] = []
  private listeners = new Set<(state: DeckState) => void>()

  constructor() {
    const slide: Slide = { id: randomUUID(), objects: seedObjects() }
    const deck: Deck = { id: randomUUID(), name: 'Deck 1', slides: [slide], activeSlideId: slide.id }
    this.decks.set(deck.id, deck)
    this.activeDeckId = deck.id
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
      objects: slide.objects.map((o) => ({ ...o })),
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
      .filter((o) => (caseSensitive ? o.text : o.text.toLowerCase()).includes(needle))
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
          break
        case 'setSize':
          if (typeof args.width === 'number') obj.width = Math.max(1, args.width)
          if (typeof args.height === 'number') obj.height = Math.max(1, args.height)
          break
        case 'setText':
          if (typeof args.text === 'string') obj.text = args.text
          break
        case 'setFillColor':
          if (typeof args.color === 'string') obj.fillColor = args.color
          break
        case 'setFontSize':
          if (typeof args.fontSize === 'number') obj.fontSize = Math.max(1, args.fontSize)
          break
      }
      changed.push(id)
    }

    this.emit()
    return { changed, errors }
  }
}

export const editorStore = new EditorStore()
