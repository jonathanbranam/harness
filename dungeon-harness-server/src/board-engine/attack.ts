// Pure attack-footprint/hit-resolution geometry, matching track-web's
// current attackFootprint.ts behavior (design.md's "Attack preview returns
// footprint and hit cells separately" decision): computeFootprint is pure
// geometry (single/line/plus, clipped to board bounds), resolveHits applies
// occupancy + penetration on top of it.

import type { BoardState, Cell, Direction, PlacedUnit, UnitDef } from './types'

const STEP: Record<Direction, Cell> = {
  up: { col: 0, row: -1 },
  down: { col: 0, row: 1 },
  left: { col: -1, row: 0 },
  right: { col: 1, row: 0 },
}

function inBounds(board: BoardState, cell: Cell): boolean {
  return cell.col >= 0 && cell.col < board.width && cell.row >= 0 && cell.row < board.height
}

/**
 * The candidate footprint for `unit` attacking in `dir`, per its
 * targeting/propagation — clipped to the board's bounds. Ordered nearest to
 * farthest along the line of fire (spec.md's "line" requirement).
 */
export function computeFootprint(board: BoardState, unit: PlacedUnit, dir: Direction): Cell[] {
  const def: UnitDef = unit.unitDef
  const step = STEP[dir]
  const { minRange, maxRange } = def.attack.targeting

  if (def.attack.propagation.shape === 'single') {
    const cell: Cell = { col: unit.position.col + step.col * minRange, row: unit.position.row + step.row * minRange }
    return inBounds(board, cell) ? [cell] : []
  }

  if (def.attack.propagation.shape === 'line') {
    const cells: Cell[] = []
    for (let dist = minRange; dist <= maxRange; dist++) {
      const cell: Cell = { col: unit.position.col + step.col * dist, row: unit.position.row + step.row * dist }
      if (!inBounds(board, cell)) break
      cells.push(cell)
    }
    return cells
  }

  // 'plus': the cell at maxRange along dir, plus its four orthogonal
  // neighbors, clipped at the board edge.
  const center: Cell = { col: unit.position.col + step.col * maxRange, row: unit.position.row + step.row * maxRange }
  const candidates: Cell[] = [
    center,
    { col: center.col, row: center.row - 1 },
    { col: center.col, row: center.row + 1 },
    { col: center.col - 1, row: center.row },
    { col: center.col + 1, row: center.row },
  ]
  return candidates.filter((cell) => inBounds(board, cell))
}

/**
 * Which of `footprint`'s cells are actually hit given current unit
 * occupancy and `penetration`: "none" hits every occupied footprint cell;
 * "stop_at_first" hits only the nearest occupied cell in `footprint`'s
 * near-to-far order.
 */
export function resolveHits(footprint: Cell[], board: BoardState, penetration: 'none' | 'stop_at_first'): Cell[] {
  const occupiedAt = (cell: Cell) => board.units.some((u) => u.position.col === cell.col && u.position.row === cell.row)

  if (penetration === 'none') return footprint.filter(occupiedAt)

  const first = footprint.find(occupiedAt)
  return first ? [first] : []
}
