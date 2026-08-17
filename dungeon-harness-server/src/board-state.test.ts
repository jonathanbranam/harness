import { describe, expect, it } from 'vitest'
import { BOARD_HEIGHT, BOARD_WIDTH, BoardStore } from './board-state'

describe('BoardStore', () => {
  it('starts as an empty grid with plains terrain and no units', () => {
    const board = new BoardStore()
    const state = board.getState()
    expect(state.width).toBe(BOARD_WIDTH)
    expect(state.height).toBe(BOARD_HEIGHT)
    expect(state.units).toEqual([])
    expect(state.cells.every((row) => row.every((cell) => cell.terrain === 'plains'))).toBe(true)
  })

  it('placeUnit adds a unit with derived stats and a unique id', () => {
    const board = new BoardStore()
    const result = board.placeUnit('ranger', 'pc', { col: 2, row: 3 })
    expect(result.ok).toBe(true)
    expect(result.unitId).toBeTruthy()
    const state = board.getState()
    expect(state.units).toHaveLength(1)
    expect(state.units[0]).toMatchObject({ archetype: 'ranger', faction: 'pc', position: { col: 2, row: 3 } })
    expect(state.units[0].unitDef.movement.range).toBe(3)
  })

  it('placeUnit rejects an occupied cell', () => {
    const board = new BoardStore()
    board.placeUnit('melee', 'pc', { col: 0, row: 0 })
    const result = board.placeUnit('rogue', 'pc', { col: 0, row: 0 })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/occupied/)
    expect(board.getState().units).toHaveLength(1)
  })

  it('placeUnit rejects an out-of-bounds cell', () => {
    const board = new BoardStore()
    const result = board.placeUnit('melee', 'pc', { col: BOARD_WIDTH, row: 0 })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/out of bounds/)
  })

  it('placeUnit rejects an unknown archetype and lists valid ones', () => {
    const board = new BoardStore()
    const result = board.placeUnit('wizard', 'pc', { col: 0, row: 0 })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/melee/)
    expect(board.getState().units).toHaveLength(0)
  })

  it('setTerrain updates the target cell and getState reflects it', () => {
    const board = new BoardStore()
    const result = board.setTerrain({ col: 1, row: 1 }, 'water')
    expect(result.ok).toBe(true)
    expect(board.getState().cells[1][1].terrain).toBe('water')
  })

  it('setTerrain rejects an out-of-bounds cell', () => {
    const board = new BoardStore()
    const result = board.setTerrain({ col: -1, row: 0 }, 'water')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/out of bounds/)
  })

  it('getState reflects prior mutations across calls', () => {
    const board = new BoardStore()
    board.placeUnit('melee', 'pc', { col: 0, row: 0 })
    board.setTerrain({ col: 5, row: 5 }, 'forest')
    const state = board.getState()
    expect(state.units).toHaveLength(1)
    expect(state.cells[5][5].terrain).toBe('forest')
  })

  it('subscribe is notified on placeUnit and setTerrain', () => {
    const board = new BoardStore()
    const seen: number[] = []
    const unsubscribe = board.subscribe((state) => seen.push(state.units.length))
    board.placeUnit('melee', 'pc', { col: 0, row: 0 })
    board.setTerrain({ col: 1, row: 1 }, 'forest')
    expect(seen).toEqual([1, 1])
    unsubscribe()
    board.placeUnit('rogue', 'pc', { col: 2, row: 2 })
    expect(seen).toEqual([1, 1])
  })
})
