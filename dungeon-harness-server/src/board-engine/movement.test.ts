import { describe, expect, it } from 'vitest'
import { findPath, type PathError } from './movement'
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

function unit(id: string, col: number, row: number, archetype: keyof typeof UNIT_CATALOG = 'melee'): PlacedUnit {
  return { id, archetype, faction: 'pc', position: { col, row }, unitDef: UNIT_CATALOG[archetype] }
}

function isError(result: unknown): result is PathError {
  return typeof result === 'object' && result !== null && 'error' in result
}

describe('findPath', () => {
  it('returns a path within range with no obstacles', () => {
    const board = emptyBoard()
    board.units = [unit('a', 0, 0, 'melee')]
    const result = findPath(board, 'a', { col: 3, row: 0 })
    expect(isError(result)).toBe(false)
    if (!isError(result)) {
      expect(result.length).toBe(4)
      expect(result[0]).toEqual({ col: 0, row: 0 })
      expect(result[result.length - 1]).toEqual({ col: 3, row: 0 })
    }
  })

  it('returns an out-of-range error when the destination is farther than movement.range', () => {
    const board = emptyBoard()
    board.units = [unit('a', 0, 0, 'melee')] // range 4
    const result = findPath(board, 'a', { col: 5, row: 0 })
    expect(isError(result)).toBe(true)
    if (isError(result)) expect(result.error).toMatch(/out of range/)
  })

  it('returns an unreachable error when every path within range is blocked by other units', () => {
    const board = emptyBoard()
    board.units = [
      unit('a', 0, 0, 'melee'),
      unit('b', 1, 0),
      unit('c', 0, 1),
    ]
    const result = findPath(board, 'a', { col: 1, row: 1 })
    expect(isError(result)).toBe(true)
    if (isError(result)) expect(result.error).toMatch(/unreachable/)
  })

  it('returns an error for an unknown unit id', () => {
    const board = emptyBoard()
    const result = findPath(board, 'does-not-exist', { col: 1, row: 1 })
    expect(isError(result)).toBe(true)
    if (isError(result)) expect(result.error).toMatch(/No unit/)
  })

  it('returns an error for an out-of-bounds destination', () => {
    const board = emptyBoard()
    board.units = [unit('a', 0, 0, 'melee')]
    const result = findPath(board, 'a', { col: -1, row: 0 })
    expect(isError(result)).toBe(true)
    if (isError(result)) expect(result.error).toMatch(/out of bounds/)
  })
})
