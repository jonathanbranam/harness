import { describe, expect, it } from 'vitest'
import { computeFootprint, resolveHits } from './attack'
import { UNIT_CATALOG } from './unit-catalog'
import type { BoardState, PlacedUnit } from './types'

function emptyBoard(width = 16, height = 8): BoardState {
  return {
    width,
    height,
    cells: Array.from({ length: height }, () => Array.from({ length: width }, () => ({ terrain: 'plains' as const }))),
    units: [],
  }
}

function unit(id: string, col: number, row: number, archetype: keyof typeof UNIT_CATALOG): PlacedUnit {
  return { id, archetype, faction: 'pc', position: { col, row }, unitDef: UNIT_CATALOG[archetype] }
}

describe('computeFootprint', () => {
  it('single: footprint is the one cell at minRange in the given direction', () => {
    const board = emptyBoard()
    const u = unit('a', 4, 4, 'melee')
    expect(computeFootprint(board, u, 'right')).toEqual([{ col: 5, row: 4 }])
  })

  it('line: footprint runs minRange to maxRange, clipped at the board edge', () => {
    const board = emptyBoard()
    const u = unit('a', 14, 4, 'ranger') // minRange 2, maxRange effectively unbounded
    const footprint = computeFootprint(board, u, 'right')
    // board width 16: cols 0..15, unit at col 14, minRange 2 -> starts at col 16 (out of bounds)
    expect(footprint).toEqual([])
  })

  it('line: footprint clips at the board edge when within range', () => {
    const board = emptyBoard()
    const u = unit('a', 1, 4, 'ranger')
    const footprint = computeFootprint(board, u, 'right')
    // minRange 2 -> col 3, then col 4, ... up to col 15 (edge)
    expect(footprint[0]).toEqual({ col: 3, row: 4 })
    expect(footprint[footprint.length - 1]).toEqual({ col: 15, row: 4 })
  })

  it('plus: footprint is the cell at maxRange plus its four orthogonal neighbors, clipped at the board edge', () => {
    const board = emptyBoard()
    const u = unit('a', 4, 4, 'magic-user') // maxRange 2
    const footprint = computeFootprint(board, u, 'up')
    expect(footprint).toEqual(
      expect.arrayContaining([{ col: 4, row: 2 }, { col: 3, row: 2 }, { col: 5, row: 2 }, { col: 4, row: 1 }, { col: 4, row: 3 }]),
    )
    expect(footprint.length).toBe(5)
  })

  it('plus: clips neighbors that fall off the board edge', () => {
    const board = emptyBoard()
    const u = unit('a', 1, 0, 'magic-user') // maxRange 2, center at row -2 -> off board
    const footprint = computeFootprint(board, u, 'up')
    expect(footprint).toEqual([])
  })
})

describe('resolveHits', () => {
  it('penetration "none" hits every occupied footprint cell', () => {
    const board = emptyBoard()
    board.units = [unit('target1', 4, 2, 'melee'), unit('target2', 3, 2, 'melee'), unit('target3', 5, 1, 'melee')]
    const footprint = [{ col: 4, row: 2 }, { col: 3, row: 2 }, { col: 5, row: 2 }, { col: 4, row: 1 }, { col: 4, row: 3 }]
    const hits = resolveHits(footprint, board, 'none')
    expect(hits).toEqual(expect.arrayContaining([{ col: 4, row: 2 }, { col: 3, row: 2 }]))
    expect(hits.length).toBe(2)
  })

  it('penetration "stop_at_first" hits only the nearest occupied cell in near-to-far order', () => {
    const board = emptyBoard()
    board.units = [unit('near', 5, 4, 'melee'), unit('far', 8, 4, 'melee')]
    const footprint = [
      { col: 4, row: 4 },
      { col: 5, row: 4 },
      { col: 6, row: 4 },
      { col: 7, row: 4 },
      { col: 8, row: 4 },
    ]
    const hits = resolveHits(footprint, board, 'stop_at_first')
    expect(hits).toEqual([{ col: 5, row: 4 }])
  })

  it('returns an empty hit list when the footprint has no occupied cells', () => {
    const board = emptyBoard()
    const footprint = [{ col: 0, row: 0 }, { col: 1, row: 0 }]
    expect(resolveHits(footprint, board, 'none')).toEqual([])
    expect(resolveHits(footprint, board, 'stop_at_first')).toEqual([])
  })
})
