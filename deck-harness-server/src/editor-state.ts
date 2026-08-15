// In-memory "live deck" that the browser canvas and the presentation-bridge
// pi extension both read/write in-process. No persistence: this is a local,
// iterate-fast prototype per docs/talks/deck-harness/planning.md — see that
// doc's "Open questions" for whether/how to persist deck state later.

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

export interface DeckState {
  objects: DeckObject[]
  selection: string[]
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
  private state: DeckState = { objects: seedObjects(), selection: [] }
  private listeners = new Set<(state: DeckState) => void>()

  subscribe(listener: (state: DeckState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit() {
    const snapshot = this.getState()
    for (const listener of this.listeners) listener(snapshot)
  }

  getState(): DeckState {
    return { objects: this.state.objects.map((o) => ({ ...o })), selection: [...this.state.selection] }
  }

  setSelection(ids: string[]) {
    const known = new Set(this.state.objects.map((o) => o.id))
    this.state.selection = ids.filter((id) => known.has(id))
    this.emit()
  }

  selectByText(query: string, caseSensitive = false): string[] {
    const needle = caseSensitive ? query : query.toLowerCase()
    return this.state.objects
      .filter((o) => (caseSensitive ? o.text : o.text.toLowerCase()).includes(needle))
      .map((o) => o.id)
  }

  applyUpdate(action: UpdateAction, targetIds: string[], args: Record<string, unknown>): UpdateResult {
    const errors: string[] = []
    const changed: string[] = []

    if (action === 'applyGridLayout') {
      const targets = targetIds.map((id) => this.state.objects.find((o) => o.id === id)).filter((o): o is DeckObject => !!o)
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
      const obj = this.state.objects.find((o) => o.id === id)
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
