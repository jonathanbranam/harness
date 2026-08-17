// 4-directionally-connected BFS shortest path, capped at the moving unit's
// movement.range. Matches track-web's current validMoveDests/pathfinding
// semantics: terrain is never consulted, only other units' occupied cells
// block a path (design.md's "Movement is BFS shortest-path" decision).

import type { BoardState, Cell, PlacedUnit } from './types'

export interface PathError {
  error: string
}

function key(cell: Cell): string {
  return `${cell.col},${cell.row}`
}

function inBounds(board: BoardState, cell: Cell): boolean {
  return cell.col >= 0 && cell.col < board.width && cell.row >= 0 && cell.row < board.height
}

const DELTAS: Cell[] = [
  { col: 0, row: -1 },
  { col: 0, row: 1 },
  { col: -1, row: 0 },
  { col: 1, row: 0 },
]

/**
 * Shortest 4-connected path from `unitId`'s current cell to `dest`,
 * excluding cells occupied by any other placed unit, capped at the unit's
 * `movement.range` steps. Returns an error distinguishing "no unit with
 * that id" from "unreachable within range" (spec.md's "Movement preview
 * computes a range-limited path" requirement).
 */
export function findPath(board: BoardState, unitId: string, dest: Cell): Cell[] | PathError {
  const unit = board.units.find((u) => u.id === unitId)
  if (!unit) return { error: `No unit with id "${unitId}"` }

  if (!inBounds(board, dest)) return { error: `Destination (${dest.col}, ${dest.row}) is out of bounds` }

  const occupied = new Set(board.units.filter((u): u is PlacedUnit => u.id !== unitId).map((u) => key(u.position)))

  const start = unit.position
  if (start.col === dest.col && start.row === dest.row) return [start]

  const range = unit.unitDef.movement.range
  const visited = new Set<string>([key(start)])
  const cameFrom = new Map<string, Cell>()
  let frontier: Cell[] = [start]

  for (let step = 0; step < range; step++) {
    const next: Cell[] = []
    for (const cell of frontier) {
      for (const delta of DELTAS) {
        const candidate: Cell = { col: cell.col + delta.col, row: cell.row + delta.row }
        if (!inBounds(board, candidate)) continue
        const k = key(candidate)
        if (visited.has(k) || occupied.has(k)) continue
        visited.add(k)
        cameFrom.set(k, cell)
        if (candidate.col === dest.col && candidate.row === dest.row) {
          const path: Cell[] = [candidate]
          let cursor: Cell | undefined = cell
          while (cursor) {
            path.unshift(cursor)
            cursor = cameFrom.get(key(cursor))
          }
          return path
        }
        next.push(candidate)
      }
    }
    frontier = next
    if (frontier.length === 0) break
  }

  // Board is a convex rectangle, so the unobstructed shortest 4-connected
  // path length always equals Manhattan distance — use that to distinguish
  // "genuinely too far" from "within range but every route is blocked."
  const manhattan = Math.abs(dest.col - start.col) + Math.abs(dest.row - start.row)
  if (manhattan > range) return { error: `Destination (${dest.col}, ${dest.row}) is out of range (movement range ${range})` }
  return { error: `Destination (${dest.col}, ${dest.row}) is unreachable: blocked by other units` }
}
