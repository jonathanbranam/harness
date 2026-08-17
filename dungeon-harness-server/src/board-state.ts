// In-memory board store: mirrors deck-harness-server/src/editor-state.ts's
// subscribe/emit shape, but instantiated per session rather than as a
// module-level singleton (design.md's "board-state.ts mirrors
// editor-state.ts's store/broadcast shape, but instantiated per session"
// decision) — each design session gets its own scratch board, with no
// undo/redo and no persistence (round one's board state isn't meant to
// survive a restart).

import { randomUUID } from 'node:crypto'
import { findPath } from './board-engine/movement'
import { ARCHETYPES, UNIT_CATALOG } from './board-engine/unit-catalog'
import type { Archetype, BoardCell, BoardState, Cell, Faction, PlacedUnit, TerrainType } from './board-engine/types'

export const BOARD_WIDTH = 16
export const BOARD_HEIGHT = 8

const TERRAIN_TYPES: TerrainType[] = ['plains', 'forest', 'water', 'stone']

export interface OpResult {
  ok: boolean
  error?: string
}

export interface PlaceUnitResult extends OpResult {
  unitId?: string
}

function inBounds(cell: Cell): boolean {
  return cell.col >= 0 && cell.col < BOARD_WIDTH && cell.row >= 0 && cell.row < BOARD_HEIGHT
}

function emptyCells(): BoardCell[][] {
  return Array.from({ length: BOARD_HEIGHT }, () => Array.from({ length: BOARD_WIDTH }, () => ({ terrain: 'plains' as const })))
}

export class BoardStore {
  private cells: BoardCell[][] = emptyCells()
  private units: PlacedUnit[] = []
  private listeners = new Set<(state: BoardState) => void>()

  subscribe(listener: (state: BoardState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit() {
    const snapshot = this.getState()
    for (const listener of this.listeners) listener(snapshot)
  }

  getState(): BoardState {
    return {
      width: BOARD_WIDTH,
      height: BOARD_HEIGHT,
      cells: this.cells.map((row) => row.map((cell) => ({ ...cell }))),
      units: this.units.map((u) => ({ ...u, position: { ...u.position }, unitDef: u.unitDef })),
    }
  }

  placeUnit(archetype: string, faction: string, position: Cell): PlaceUnitResult {
    if (!ARCHETYPES.includes(archetype as Archetype)) {
      return { ok: false, error: `Unknown archetype "${archetype}". Valid archetypes: ${ARCHETYPES.join(', ')}` }
    }
    if (faction !== 'pc' && faction !== 'npc') {
      return { ok: false, error: `Unknown faction "${faction}". Valid factions: pc, npc` }
    }
    if (!inBounds(position)) {
      return { ok: false, error: `Position (${position.col}, ${position.row}) is out of bounds` }
    }
    if (this.units.some((u) => u.position.col === position.col && u.position.row === position.row)) {
      return { ok: false, error: `Cell (${position.col}, ${position.row}) is already occupied` }
    }

    const unit: PlacedUnit = {
      id: randomUUID(),
      archetype: archetype as Archetype,
      faction: faction as Faction,
      position: { ...position },
      unitDef: UNIT_CATALOG[archetype as Archetype],
    }
    this.units.push(unit)
    this.emit()
    return { ok: true, unitId: unit.id }
  }

  setTerrain(position: Cell, terrain: string): OpResult {
    if (!inBounds(position)) {
      return { ok: false, error: `Position (${position.col}, ${position.row}) is out of bounds` }
    }
    if (!TERRAIN_TYPES.includes(terrain as TerrainType)) {
      return { ok: false, error: `Unknown terrain "${terrain}". Valid terrain types: ${TERRAIN_TYPES.join(', ')}` }
    }
    this.cells[position.row][position.col] = { terrain: terrain as TerrainType }
    this.emit()
    return { ok: true }
  }

  removeUnit(unitId: string): OpResult {
    if (!this.units.some((u) => u.id === unitId)) {
      return { ok: false, error: `No unit with id "${unitId}"` }
    }
    this.units = this.units.filter((u) => u.id !== unitId)
    this.emit()
    return { ok: true }
  }

  moveUnit(unitId: string, dest: Cell): OpResult {
    const result = findPath(this.getState(), unitId, dest)
    if (!Array.isArray(result)) {
      return { ok: false, error: result.error }
    }
    const unit = this.units.find((u) => u.id === unitId)!
    unit.position = { ...dest }
    this.emit()
    return { ok: true }
  }

  clearBoard(): OpResult {
    this.units = []
    this.cells = emptyCells()
    this.emit()
    return { ok: true }
  }
}
