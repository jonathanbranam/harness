// The bench protocol as the browser sees it.
//
// Hand-mirrored from dungeon-harness-server/src/bench/{bench-store,intents}.ts
// and the engine's own types — there is no shared package spanning server and
// client in this repo (see CLAUDE.md, "No packages/ tier yet"), so these shapes
// are kept in sync by hand. Only what the UI actually reads is duplicated.

export type TerrainType = 'plains' | 'forest' | 'water' | 'stone'
export type Direction = 'up' | 'down' | 'left' | 'right'
export type PcType = 'melee' | 'ranger' | 'magic-user' | 'rogue'
export type NpcType = 'short-range' | 'long-range'
export type UnitType = PcType | NpcType

export const PC_TYPES: PcType[] = ['melee', 'ranger', 'magic-user', 'rogue']
export const NPC_TYPES: NpcType[] = ['short-range', 'long-range']
export const DIRECTIONS: Direction[] = ['up', 'down', 'left', 'right']

export interface Tile {
  col: number
  row: number
}

export interface Cell {
  terrain: TerrainType
  hasStructure: boolean
  structureHp?: number
  structureKind?: 'power-center' | 'tower'
}

export interface Unit {
  id: string
  kind: 'pc' | 'npc'
  col: number
  row: number
  unitType: UnitType
  hp: number
}

export interface UnitDef {
  maxHp: number
  movement: { range: number }
  attack: {
    damage: number
    targeting: { mode: string; arc: string; minRange: number; maxRange: number }
    propagation: { shape: string; penetration: string }
  }
}

export interface SelectionView {
  unitId: string
  unitType: UnitType
  kind: 'pc' | 'npc'
  col: number
  row: number
  hp: number
  maxHp: number
  remainingMove: number
  hasAttacked: boolean
  moveDests: Tile[]
  attackByDir: Record<Direction, Tile[]>
}

export interface BenchState {
  board: { name: string; cols: number; rows: number; cells: Cell[][] }
  units: Unit[]
  selection: SelectionView | null
  telegraphs: { unitId: string; targetCol: number; targetRow: number }[]
  defs: Record<UnitType, UnitDef>
  canUndo: boolean
  log: string[]
}

export type BenchIntent =
  | { kind: 'select'; unitId: string | null }
  | { kind: 'move'; col: number; row: number }
  | { kind: 'attack'; direction: Direction; target?: Tile }
  | { kind: 'place'; unitType: UnitType; col: number; row: number; hp?: number }
  | { kind: 'remove'; unitId: string }
  | { kind: 'relocate'; unitId: string; col: number; row: number }
  | { kind: 'setHp'; unitId: string; hp: number }
  | { kind: 'clearUnits' }
  | { kind: 'newBoard'; cols?: number; rows?: number; preset?: 'open' | 'scattered' | 'arena'; seed?: number; powerCenters?: number; rowsText?: string[] }
  | { kind: 'runEnemyAi' }
  | { kind: 'endRound' }
  | { kind: 'undo' }
  | { kind: 'tweakDef'; unitType: UnitType; maxHp?: number; moveRange?: number; damage?: number; minRange?: number; maxRange?: number }
  | { kind: 'resetDefs' }

/** Archetype colors, matching the game's own rendering (see pc-archetypes spec). */
export const UNIT_COLORS: Record<UnitType, string> = {
  melee: '#4a90e2',
  ranger: '#2ecc71',
  'magic-user': '#9b59b6',
  rogue: '#e67e22',
  'short-range': '#c0392b',
  'long-range': '#7b241c',
}

export const UNIT_INITIALS: Record<UnitType, string> = {
  melee: 'M',
  ranger: 'R',
  'magic-user': 'W',
  rogue: 'G',
  'short-range': 's',
  'long-range': 'l',
}

export const TERRAIN_COLORS: Record<TerrainType, string> = {
  plains: '#d9e6c3',
  forest: '#7fa96b',
  water: '#7fb3d5',
  stone: '#9aa3ab',
}
