// Shared shapes for the board-engine module. Mirrors the fields of
// track-web's UnitDef (see design.md's Context section) closely enough that
// a preview computed here is trustworthy while a designer writes a
// scenario, without importing or depending on track-web's own code.

export type Archetype = 'melee' | 'rogue' | 'ranger' | 'magic-user' | 'short-range' | 'long-range'

export type Faction = 'pc' | 'npc'

export type Direction = 'up' | 'down' | 'left' | 'right'

export type TerrainType = 'plains' | 'forest' | 'water' | 'stone'

export interface UnitDef {
  maxHp: number
  movement: { range: number }
  attack: {
    damage: number
    targeting: { mode: 'direction'; arc: 'cardinal'; minRange: number; maxRange: number }
    propagation: { shape: 'single' | 'line' | 'plus'; penetration: 'none' | 'stop_at_first' }
  }
}

export interface Cell {
  col: number
  row: number
}

export interface PlacedUnit {
  id: string
  archetype: Archetype
  faction: Faction
  position: Cell
  unitDef: UnitDef
}

export interface BoardCell {
  terrain: TerrainType
}

export interface BoardState {
  width: number
  height: number
  cells: BoardCell[][]
  units: PlacedUnit[]
}
