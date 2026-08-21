// The bench protocol as the browser sees it.
//
// Hand-mirrored from dungeon-harness-server/src/bench/{bench-store,intents}.ts
// and the engine's own types — there is no shared package spanning server and
// client in this repo (see CLAUDE.md, "No packages/ tier yet"), so these shapes
// are kept in sync by hand. Only what the UI actually reads is duplicated.

export type TerrainType = 'plains' | 'forest' | 'water' | 'stone'
export type PcType = 'melee' | 'ranger' | 'magic-user' | 'rogue'
export type NpcType = 'short-range' | 'long-range'
export type UnitType = PcType | NpcType

/** The engine's own round phases (mirrored from `@repo/dungeon-engine`'s
 *  `TurnPhase`). Every scenario starts in `placement` — setup is refused
 *  outside it — and moves to `npc-move` once the designer starts it. */
export type TurnPhase = 'placement' | 'player' | 'npc-move' | 'npc-attack'

/** A structure kind, mirrored from the engine's own `StructureKind`. */
export type StructureKind = 'power-center' | 'tower'

/** What one step of the engine's round is or did — mirrored from the
 *  engine's `SequencerStep`. Reported by `dungeon_round_status`/`BenchState.
 *  nextStep` before it happens, and is what `step`'s log line describes after. */
export type SequencerStep =
  | { kind: 'plan-enemy'; unitId: string; action: NpcAction; attackPlan: NpcAttackPlan | null }
  | { kind: 'resolve-telegraph'; unitId: string; attack: NpcAttackPlan }
  | { kind: 'skip-telegraph'; unitId: string; attack: NpcAttackPlan }
  | { kind: 'phase-transition'; from: TurnPhase; to: TurnPhase }

export type NpcAction =
  | { kind: 'move'; unitId: string; fromCol: number; fromRow: number; toCol: number; toRow: number; path: Tile[] }
  | { kind: 'attack'; unitId: string; targetCol: number; targetRow: number }
  | { kind: 'exit'; unitId: string; fromCol: number; fromRow: number }
  | { kind: 'stay'; unitId: string }

export type NpcAttackPlan = { kind: 'attack'; unitId: string; targetCol: number; targetRow: number }

/** What a host supplies when planning an enemy's turn by hand — mirrored from
 *  the engine's own `NpcMoveChoice` (`@repo/dungeon-engine`). */
export type NpcMoveChoice = { kind: 'stay' } | { kind: 'move'; toCol: number; toRow: number }

/** Who planned an enemy's turn this round — bench-only bookkeeping, not part
 *  of the engine's `GameState` (see dungeon-bench-enemy-planning's design.md,
 *  "Authorship is tracked by the bench, not the engine"). */
export type PlanAuthor = 'designer' | 'ai'

export const PC_TYPES: PcType[] = ['melee', 'ranger', 'magic-user', 'rogue']
export const NPC_TYPES: NpcType[] = ['short-range', 'long-range']
export const STRUCTURE_KINDS: StructureKind[] = ['power-center', 'tower']

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

export interface BoardFields {
  reach: { pc: Record<string, number>; npc: Record<string, number> }
  threat: { pc: Record<string, number>; npc: Record<string, number> }
}

/** Which field layers are painted. Reach is where a side can go; threat is what
 *  it can hit, counting moves it could make first. */
export interface FieldToggles {
  pcReach: boolean
  pcThreat: boolean
  npcReach: boolean
  npcThreat: boolean
}

export const NO_FIELDS: FieldToggles = { pcReach: false, pcThreat: false, npcReach: false, npcThreat: false }

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
  /** What the engine says this unit may do. Unavailable actions are present,
   *  carrying the reason, so the control row can disable and explain rather than
   *  the client deciding for itself. */
  actions: ActionOption[]
}

/** An action as the engine reports it. Aiming is by tile: no direction appears
 *  here, which is what keeps a direction picker from being built for an attack
 *  the game aims by tile. */
export interface ActionOption {
  id: ActionId
  label: string
  available: boolean
  reason?: string
  selection: 'tile'
  targets: Tile[]
  overlay: 'reachable' | 'targetable'
}

export type ActionId = 'move' | 'attack'

export type ActionEffect =
  | { kind: 'damage'; tile: Tile; target: string; amount: number; lethal: boolean }
  | { kind: 'damage-structure'; tile: Tile; amount: number; destroys: boolean }

export interface ActionPreview {
  affected: Tile[]
  cost: number
  effects: ActionEffect[]
  hitsNothing: boolean
}

export interface BookmarkSummary {
  name: string
  savedAt: string
  board: string
  units: number
}

export interface BenchState {
  board: { name: string; cols: number; rows: number; cells: Cell[][] }
  units: Unit[]
  selection: SelectionView | null
  fields: BoardFields
  /** Which phase the engine's round is in right now — moved through by the
   *  engine, not the bench. */
  phase: TurnPhase
  /** What the engine's round will do next, straight from the engine's
   *  `nextAction` — `null` outside `npc-move`/`npc-attack`, where there is no
   *  round step to report. */
  nextStep: SequencerStep | null
  telegraphs: { unitId: string; targetCol: number; targetRow: number }[]
  /** Living enemies not yet planned this round, in the AI's own preference
   *  order — not a commitment; there is no separate ordering step. */
  unplannedNpcs: string[]
  /** Who planned each currently-planned enemy this round, keyed by unit id.
   *  Absent for a unit still in `unplannedNpcs`. */
  npcAuthorship: Record<string, PlanAuthor>
  /** The attack tiles a staged prospective enemy plan would put in reach —
   *  the second half of the two-step planning selection. `null` until a
   *  candidate move is staged via the `setNpcPlanCandidate` intent. */
  npcPlanPreview: { unitId: string; move: NpcMoveChoice; attackTiles: Tile[] } | null
  defs: Record<UnitType, UnitDef>
  canUndo: boolean
  canRedo: boolean
  timeline: { cursor: number; labels: string[] }
  bookmarks: BookmarkSummary[]
  log: string[]
}

export type BenchIntent =
  | { kind: 'select'; unitId: string | null }
  | { kind: 'commit'; action: ActionId; col: number; row: number }
  | { kind: 'place'; unitType: UnitType; col: number; row: number; hp?: number }
  | { kind: 'remove'; unitId: string }
  | { kind: 'relocate'; unitId: string; col: number; row: number }
  | { kind: 'setHp'; unitId: string; hp: number }
  | { kind: 'clearUnits' }
  | { kind: 'placeStructure'; structureKind: StructureKind; col: number; row: number; hp?: number }
  | { kind: 'removeStructure'; col: number; row: number }
  | { kind: 'moveStructure'; fromCol: number; fromRow: number; toCol: number; toRow: number }
  | { kind: 'startScenario' }
  | { kind: 'newBoard'; cols?: number; rows?: number; preset?: 'open' | 'scattered' | 'arena'; seed?: number; powerCenters?: number; rowsText?: string[] }
  | { kind: 'step' }
  | { kind: 'planEnemyTurn' }
  | { kind: 'resolveTelegraphs' }
  | { kind: 'endPlayerTurn' }
  | { kind: 'setNpcPlanCandidate'; unitId: string; move: NpcMoveChoice | null }
  | { kind: 'planEnemyByHand'; unitId: string; move: NpcMoveChoice; attackTile?: Tile }
  | { kind: 'planEnemyByAi'; unitId: string }
  | { kind: 'amendTelegraph'; unitId: string; tile: Tile }
  | { kind: 'undo' }
  | { kind: 'redo' }
  | { kind: 'stepTo'; index: number }
  | { kind: 'tweakDef'; unitType: UnitType; maxHp?: number; moveRange?: number; damage?: number; minRange?: number; maxRange?: number }
  | { kind: 'resetDefs' }
  | { kind: 'saveBookmark'; name: string }
  | { kind: 'loadBookmark'; name: string }
  | { kind: 'deleteBookmark'; name: string }

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
