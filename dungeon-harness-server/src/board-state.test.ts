import { describe, expect, it } from 'vitest'
import { BOARD_HEIGHT, BOARD_WIDTH, BoardStore } from './board-state'

describe('BoardStore', () => {
  it('starts as an empty grid with default fill color and no objects', () => {
    const board = new BoardStore()
    const state = board.getState()
    expect(state.width).toBe(BOARD_WIDTH)
    expect(state.height).toBe(BOARD_HEIGHT)
    expect(state.objects).toEqual([])
    const defaultColor = state.cells[0][0].fillColor
    expect(state.cells.every((row) => row.every((cell) => cell.fillColor === defaultColor))).toBe(true)
  })

  it('setCellFill updates the target cell and getState reflects it', () => {
    const board = new BoardStore()
    const result = board.setCellFill({ col: 1, row: 1 }, '#ff0000')
    expect(result.ok).toBe(true)
    expect(board.getState().cells[1][1].fillColor).toBe('#ff0000')
  })

  it('setCellFill rejects an out-of-bounds cell', () => {
    const board = new BoardStore()
    const result = board.setCellFill({ col: -1, row: 0 }, '#ff0000')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/out of bounds/)
  })

  it('drawShape adds a circle with a unique id', () => {
    const board = new BoardStore()
    const result = board.drawShape({ shapeType: 'circle', position: { x: 2.5, y: 3.5 }, radius: 0.4, color: 'blue', label: 'SR' })
    expect(result.ok).toBe(true)
    expect(result.id).toBeTruthy()
    const state = board.getState()
    expect(state.objects).toHaveLength(1)
    expect(state.objects[0]).toMatchObject({ kind: 'shape', shapeType: 'circle', color: 'blue', label: 'SR' })
  })

  it('drawShape adds a rectangle without a label', () => {
    const board = new BoardStore()
    const result = board.drawShape({ shapeType: 'rectangle', position: { x: 1, y: 1 }, width: 2, height: 1, color: 'green' })
    expect(result.ok).toBe(true)
    const state = board.getState()
    expect(state.objects[0]).toMatchObject({ kind: 'shape', shapeType: 'rectangle', width: 2, height: 1, color: 'green' })
    expect((state.objects[0] as { label?: string }).label).toBeUndefined()
  })

  it('drawLine adds a line connecting two or more points', () => {
    const board = new BoardStore()
    const result = board.drawLine([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }], 'green', 'dashed')
    expect(result.ok).toBe(true)
    const state = board.getState()
    expect(state.objects[0]).toMatchObject({ kind: 'line', color: 'green', style: 'dashed' })
    expect((state.objects[0] as { points: unknown[] }).points).toHaveLength(3)
  })

  it('drawLine rejects fewer than two points', () => {
    const board = new BoardStore()
    const result = board.drawLine([{ x: 0, y: 0 }], 'green', 'solid')
    expect(result.ok).toBe(false)
    expect(board.getState().objects).toEqual([])
  })

  it('drawOverlay adds an overlay covering the given cells', () => {
    const board = new BoardStore()
    const result = board.drawOverlay([{ col: 0, row: 0 }, { col: 1, row: 0 }], 'red')
    expect(result.ok).toBe(true)
    const state = board.getState()
    expect(state.objects[0]).toMatchObject({ kind: 'overlay', color: 'red' })
    expect((state.objects[0] as { cells: unknown[] }).cells).toHaveLength(2)
  })

  it('drawOverlay rejects an out-of-bounds cell', () => {
    const board = new BoardStore()
    const result = board.drawOverlay([{ col: 0, row: 0 }, { col: BOARD_WIDTH, row: 0 }], 'red')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/out of bounds/)
    expect(board.getState().objects).toEqual([])
  })

  it('drawLabel adds a standalone text label', () => {
    const board = new BoardStore()
    const result = board.drawLabel({ x: 4, y: 4 }, 'Threat zone', 'orange')
    expect(result.ok).toBe(true)
    const state = board.getState()
    expect(state.objects[0]).toMatchObject({ kind: 'label', text: 'Threat zone', color: 'orange' })
  })

  it('moveObject updates a shape\'s position, leaving color/label unchanged', () => {
    const board = new BoardStore()
    const { id } = board.drawShape({ shapeType: 'circle', position: { x: 0, y: 0 }, radius: 0.5, color: 'blue', label: 'SR' })
    const result = board.moveObject(id!, { kind: 'shape', position: { x: 3, y: 3 } })
    expect(result.ok).toBe(true)
    const object = board.getState().objects[0] as { position: { x: number; y: number }; color: string; label?: string }
    expect(object.position).toEqual({ x: 3, y: 3 })
    expect(object.color).toBe('blue')
    expect(object.label).toBe('SR')
  })

  it('moveObject rejects an unknown object id', () => {
    const board = new BoardStore()
    const result = board.moveObject('does-not-exist', { kind: 'shape', position: { x: 0, y: 0 } })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/No drawn object/)
  })

  it('moveObject rejects a geometry kind mismatched with the object\'s actual kind', () => {
    const board = new BoardStore()
    const { id } = board.drawLabel({ x: 0, y: 0 }, 'label', 'red')
    const result = board.moveObject(id!, { kind: 'line', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/label/)
  })

  it('removeObject removes a drawn object of any kind', () => {
    const board = new BoardStore()
    const { id } = board.drawLabel({ x: 0, y: 0 }, 'label', 'red')
    const result = board.removeObject(id!)
    expect(result.ok).toBe(true)
    expect(board.getState().objects).toEqual([])
  })

  it('removeObject rejects an unknown object id', () => {
    const board = new BoardStore()
    board.drawLabel({ x: 0, y: 0 }, 'label', 'red')
    const result = board.removeObject('does-not-exist')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/No drawn object/)
    expect(board.getState().objects).toHaveLength(1)
  })

  it('getState reflects prior mutations across calls', () => {
    const board = new BoardStore()
    board.drawLabel({ x: 0, y: 0 }, 'label', 'red')
    board.setCellFill({ col: 5, row: 5 }, '#00ff00')
    const state = board.getState()
    expect(state.objects).toHaveLength(1)
    expect(state.cells[5][5].fillColor).toBe('#00ff00')
  })

  it('subscribe is notified on draw and cell-fill mutations', () => {
    const board = new BoardStore()
    const seen: number[] = []
    const unsubscribe = board.subscribe((state) => seen.push(state.objects.length))
    board.drawLabel({ x: 0, y: 0 }, 'label', 'red')
    board.setCellFill({ col: 1, row: 1 }, '#00ff00')
    expect(seen).toEqual([1, 1])
    unsubscribe()
    board.drawLabel({ x: 1, y: 1 }, 'label2', 'red')
    expect(seen).toEqual([1, 1])
  })

  it('clearBoard removes all objects and resets fill colors to default', () => {
    const board = new BoardStore()
    board.drawLabel({ x: 0, y: 0 }, 'label', 'red')
    board.drawShape({ shapeType: 'circle', position: { x: 1, y: 1 }, radius: 0.5, color: 'blue' })
    board.setCellFill({ col: 5, row: 5 }, '#00ff00')
    const defaultColor = new BoardStore().getState().cells[0][0].fillColor
    const result = board.clearBoard()
    expect(result.ok).toBe(true)
    const state = board.getState()
    expect(state.objects).toEqual([])
    expect(state.cells.every((row) => row.every((cell) => cell.fillColor === defaultColor))).toBe(true)
  })

  it('clearBoard succeeds on an already-empty board', () => {
    const board = new BoardStore()
    const result = board.clearBoard()
    expect(result.ok).toBe(true)
    expect(board.getState().objects).toEqual([])
  })
})
