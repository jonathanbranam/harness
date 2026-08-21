// The design bench: one board, played by hand, refereed entirely by the real
// game engine (`@repo/dungeon-engine`).
//
// Every rule question — where a unit may move, what an attack reaches, what
// damage lands — is answered by calling the engine. Nothing here re-implements
// or approximates a rule, and no caller (agent or browser) is given a way to
// assert one. That is the constraint the previous harness violated; see
// docs/dungeon-harness/STATUS.md.
//
// Two engine facts shape this file:
//
// 1. The engine's board and unit-definition stores are module-level singletons
//    (one board, one def table per process). `ensureActive()` re-applies this
//    bench's board and def overrides before every engine call, so a second
//    session cannot leave the singleton pointing at someone else's board. It is
//    cheap at bench board sizes; instance-scoping the engine is the real fix and
//    is deferred until multiple boards must coexist.
// 2. Damage is side-asymmetric by design: a PC attack damages NPCs and
//    structures, an NPC attack damages PCs and structures. So a PC attack is
//    resolved with `resolvePcAction` and an NPC attack with `resolveNpcAction`,
//    even though both sides share the movement API.

import {
  advance,
  advanceNpc,
  amendTelegraph as engineAmendTelegraph,
  applyLoaded,
  applyMap,
  availableActions,
  boardCells,
  clampDef,
  commitAction,
  commitNpcTurn,
  getAllDefs,
  getDef,
  getMaxHp,
  gridCols,
  gridRows,
  hasAttacked,
  nextAction,
  plannableAttacks,
  preview,
  reconcileHp,
  remainingMove,
  threatTiles,
  unplannedNpcs as engineUnplannedNpcs,
  validMoveDests,
  type ActionId,
  type ActionOption,
  type ActionPreview,
  type Cell,
  type ContentMap,
  type GameState,
  type NpcAction,
  type NpcMoveChoice,
  type NpcType,
  type PcType,
  type SequencerStep,
  type TurnPhase,
  type Unit,
  type UnitDef,
} from '@repo/dungeon-engine'
import { cellsToRows, generateBoard, type GenerateBoardOptions } from './board-gen'
import type { BookmarkStore, BookmarkSummary } from './bookmark-store'

export type UnitType = PcType | NpcType

const PC_TYPES: PcType[] = ['melee', 'ranger', 'magic-user', 'rogue']
const NPC_TYPES: NpcType[] = ['short-range', 'long-range']
export const UNIT_TYPES: UnitType[] = [...PC_TYPES, ...NPC_TYPES]

/** How many frames the timeline keeps. `GameState` is plain data and every engine
 *  function returns a new one, so a frame is a value, not a diff to replay. */
const MAX_FRAMES = 200

/**
 * One point on the timeline: everything needed to put the bench back exactly as
 * it was. The board and the session's definition tweaks travel with the state
 * because loading a bookmark or changing a number are themselves steps — scrubbing
 * past one has to undo it too.
 */
interface Frame {
  state: GameState
  map: ContentMap
  defOverrides: Partial<Record<UnitType, UnitDef>>
  /**
   * Who planned each enemy currently marked planned this round, alongside the
   * state it describes — carried per frame so scrubbing back shows the right
   * attribution next to the right board rather than today's map applied to
   * yesterday's frame (design.md, "It must be part of the timeline frame").
   */
  npcAuthorship: Record<string, PlanAuthor>
  /** What produced this frame, for the scrub bar's tooltip. */
  label: string
}

export interface Tile {
  col: number
  row: number
}

export type { NpcMoveChoice }

/** Who authored an enemy's plan this round — bench-only bookkeeping. `GameState`
 *  records only *that* an enemy is planned (`npcPlannedThisRound`), never *who*
 *  chose it (design.md, "Authorship is tracked by the bench, not the engine"). */
export type PlanAuthor = 'designer' | 'ai'

/** What the browser draws and the agent reads. Every derived field is computed
 *  by the engine at read time, never stored — the failure mode that killed the
 *  previous harness was a stored overlay that outlived the state it described. */
/** The transport strip's view of the timeline. */
export interface TimelineView {
  /** Index of the frame currently shown. */
  cursor: number
  /** Every frame's label, oldest first — `labels[cursor]` is what produced now. */
  labels: string[]
}

export interface BenchState {
  board: {
    name: string
    cols: number
    rows: number
    cells: Cell[][]
  }
  units: Unit[]
  selection: SelectionView | null
  /** Reach and threat for both sides, recomputed from the engine on every read. */
  fields: BoardFields
  /** Which phase the engine's round is in right now. Moved through by the
   *  engine, not the bench — see `step`/`planEnemyTurn`/`resolveTelegraphs`. */
  phase: TurnPhase
  /**
   * What the engine's round will do next, straight from `nextAction` — never
   * derived here. `null` outside `npc-move`/`npc-attack`, where there is no
   * round step to report (the player phase is a designer's decision, not a
   * step the engine takes).
   */
  nextStep: SequencerStep | null
  /** NPC attack telegraphs still pending resolution this `npc-attack` phase —
   *  filtered against `npcPlansResolved`, since the engine keeps a resolved
   *  entry in `npcPlans` until the round ends rather than removing it. */
  telegraphs: { unitId: string; targetCol: number; targetRow: number }[]
  /** Living enemies not yet planned this round, straight from the engine's
   *  `unplannedNpcs`, in the order it gives — the AI's own preference order,
   *  not a commitment (design.md, "there is no reorder control"). */
  unplannedNpcs: string[]
  /** Who planned each currently-planned enemy this round — bench-only
   *  bookkeeping, keyed by unit id. Absent for a unit still in `unplannedNpcs`. */
  npcAuthorship: Record<string, PlanAuthor>
  /**
   * The attack tiles a prospective enemy plan would put in reach, from
   * `plannableAttacks` — the second half of the two-step selection design.md
   * describes: pick a destination (or holding), then see what it reaches,
   * before committing. Set by `setNpcPlanCandidate`; `null` until a candidate
   * is staged. Also drives the amend flow, staged with `{ kind: 'stay' }`
   * since amending never moves the enemy.
   */
  npcPlanPreview: { unitId: string; move: NpcMoveChoice; attackTiles: Tile[] } | null
  defs: Record<UnitType, UnitDef>
  canUndo: boolean
  canRedo: boolean
  timeline: TimelineView
  /** Saved board states, newest first. Empty when no bookmark store is configured. */
  bookmarks: BookmarkSummary[]
  /** Human-readable record of what has happened, newest last. */
  log: string[]
}

/**
 * How far each side can move, and what each side can hit, for every tile on the
 * board — the quantity this game makes continuously visible, the way a
 * platformer makes trajectory visible.
 *
 * Values are counts: how many units of that side reach or threaten the tile. A
 * tile two enemies can both hit is a different tile from one only a single enemy
 * can reach, and the count is what makes that legible at a glance.
 *
 * Both fields are composed from engine queries only — `validMoveDests` for where
 * a unit can go, `attackFootprint` for what it hits from a given tile. Threat
 * composes them the same way the engine's own `attackSquares` does, taking the
 * planned move target as the attack origin, because in this game a unit may move
 * and then attack in one turn.
 */
export interface BoardFields {
  reach: { pc: Record<string, number>; npc: Record<string, number> }
  threat: { pc: Record<string, number>; npc: Record<string, number> }
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
  /** Engine-derived: every tile this unit can still reach this turn. Kept
   *  alongside `actions` because the board paints reach even when no action is
   *  armed. */
  moveDests: Tile[]
  /**
   * Engine-derived: what this unit may do, in the engine's own words.
   *
   * Unavailable actions are present, carrying the reason, so the client renders
   * a disabled control that explains itself rather than deciding for itself when
   * an action is possible. Aiming is by tile — no direction appears here, which
   * is what stops a control from being built that the game does not have.
   */
  actions: ActionOption[]
}

export type BenchResult = { ok: true; message: string } | { ok: false; error: string }

function ok(message: string): BenchResult {
  return { ok: true, message }
}

function fail(error: string): BenchResult {
  return { ok: false, error }
}

/**
 * The next free id number for a set of units.
 *
 * Ids are handed out as `<type>-<n>`, and both scrubbing back and loading a
 * bookmark install units this bench did not place. Counting them is not enough —
 * ids need not be contiguous — so the next number comes from the highest one
 * actually in use.
 */
function nextSeqFrom(units: Unit[]): number {
  let highest = 0
  for (const unit of units) {
    const suffix = Number(unit.id.slice(unit.id.lastIndexOf('-') + 1))
    if (Number.isFinite(suffix) && suffix > highest) highest = suffix
  }
  return highest
}

/**
 * Whether a saved bookmark predates the bench running on the engine's round.
 *
 * Such a bookmark has no `npcPlannedThisRound`/`npcPlansResolved` at all, and
 * `advance` reads both — loading one and stepping the round would throw on
 * `undefined` somewhere inside the engine, far from the cause.
 *
 * **Deliberately not migrated.** During development a stale bookmark is cheap
 * to throw away and re-save, and a migration would be guesswork about what
 * round a position was really in. Refuse it with a sentence that says what to
 * do instead, and revisit if bookmarks ever need to survive across versions.
 */
function incompatibleBookmarkReason(state: GameState): string | null {
  if (!Array.isArray(state.npcPlannedThisRound) || !Array.isArray(state.npcPlansResolved)) {
    return 'it was saved before the bench ran on the engine\'s round, so it has no record of which enemies had been planned. Delete it and save the position again.'
  }
  if (!state.phase) {
    return 'it was saved without a round phase. Delete it and save the position again.'
  }
  return null
}

function kindOf(unitType: UnitType): 'pc' | 'npc' {
  return (PC_TYPES as string[]).includes(unitType) ? 'pc' : 'npc'
}

/**
 * A new board's state — where the engine's own round starts. `endRound`
 * (called internally by `advance` at the `npc-attack → npc-move` transition)
 * moves every round, including the first, into `npc-move`: see its comment in
 * `npc.ts` ("The old `phase: 'player'` here was never observed"). Starting a
 * fresh bench board anywhere else would make its first round disagree with
 * every later one.
 */
function emptyState(cells: Cell[][]): GameState {
  return {
    cells,
    units: [],
    spawners: [],
    phase: 'npc-move',
    planningPhase: 'none',
    selectedUnitId: null,
    plans: {},
    planOrder: [],
    npcPlans: [],
    npcPlannedThisRound: [],
    npcPlansResolved: [],
    undoStack: [],
    movedThisTurn: {},
    attackedThisTurn: [],
  }
}

export class BenchStore {
  private map: ContentMap
  private state: GameState
  private frames: Frame[] = []
  private cursor = 0
  private selectedId: string | null = null
  private defOverrides: Partial<Record<UnitType, UnitDef>> = {}
  /** This round's plan authorship, unit id → who chose it. Bench-only; see
   *  `Frame.npcAuthorship`. */
  private npcAuthorship: Record<string, PlanAuthor> = {}
  /** A staged prospective enemy plan, previewed via `plannableAttacks` but not
   *  yet committed — see `setNpcPlanCandidate`. Never part of a `Frame`: it is
   *  UI scaffolding, not something that happened. */
  private npcPlanCandidate: { unitId: string; move: NpcMoveChoice } | null = null
  private log: string[] = []
  private unitSeq = 0
  private bookmarks: BookmarkStore | undefined
  private listeners = new Set<(state: BenchState) => void>()

  constructor(opts: GenerateBoardOptions & { bookmarks?: BookmarkStore } = {}) {
    this.bookmarks = opts.bookmarks
    this.map = generateBoard(opts)
    applyMap(this.map)
    this.state = emptyState(this.freshCells())
    this.frames = [{ state: this.state, map: this.map, defOverrides: {}, npcAuthorship: {}, label: `Board "${this.map.name}"` }]
    this.note(`Board "${this.map.name}" ready (${this.map.size.cols}×${this.map.size.rows}). No units placed.`)
  }

  // ─── Engine access ──────────────────────────────────────────────────────────

  /** Point the engine's process-global stores at this bench before any call. */
  private ensureActive(): void {
    applyMap(this.map)
    applyLoaded(this.defOverrides as Record<string, UnitDef>)
  }

  private freshCells(): Cell[][] {
    // The engine's own deserialized grid (terrain plus any structures), copied,
    // so the bench's board is byte-identical to what its queries will consult.
    return boardCells()
  }

  private unit(id: string): Unit | undefined {
    return this.state.units.find((u) => u.id === id)
  }

  private note(message: string): void {
    this.log.push(message)
    if (this.log.length > 100) this.log.shift()
  }

  /**
   * Commit `next` as a new frame at the end of the timeline.
   *
   * Acting after stepping back discards the frames ahead, the way an editor's
   * undo history does: the designer went back to try a different line, and the
   * line they abandoned is not something they can step forward into any more.
   */
  private commit(next: GameState, message: string): void {
    this.frames = this.frames.slice(0, this.cursor + 1)
    this.frames.push({ state: next, map: this.map, defOverrides: { ...this.defOverrides }, npcAuthorship: { ...this.npcAuthorship }, label: message })
    if (this.frames.length > MAX_FRAMES) this.frames.shift()
    this.cursor = this.frames.length - 1
    this.state = next
    this.note(message)
    this.emit()
  }

  /** Put the bench back to the frame at `index` — board, units, and definitions. */
  private restore(index: number): void {
    const frame = this.frames[index]
    this.cursor = index
    this.state = frame.state
    this.map = frame.map
    this.defOverrides = { ...frame.defOverrides }
    this.npcAuthorship = { ...frame.npcAuthorship }
    // A staged-but-uncommitted planning candidate belongs to the moment it was
    // staged at, not to wherever the timeline lands after a jump.
    this.npcPlanCandidate = null
    this.unitSeq = nextSeqFrom(frame.state.units)
    this.ensureActive()
    if (this.selectedId && !this.unit(this.selectedId)) this.selectedId = null
  }

  // ─── Reads ──────────────────────────────────────────────────────────────────

  getState(): BenchState {
    this.ensureActive()
    return {
      board: { name: this.map.name, cols: gridCols(), rows: gridRows(), cells: this.state.cells },
      units: this.state.units,
      selection: this.selectionView(),
      fields: this.computeFields(),
      phase: this.state.phase,
      nextStep: nextAction(this.state),
      telegraphs: this.state.npcPlans
        // Unresolved *and* still on the board: the engine skips a telegraph
        // whose owner died inside the window, so listing one as pending would
        // promise an attack that can never land.
        .filter((p) => !this.state.npcPlansResolved.includes(p.unitId))
        .filter((p) => this.state.units.some((u) => u.id === p.unitId))
        .map((p) => ({ unitId: p.unitId, targetCol: p.targetCol, targetRow: p.targetRow })),
      unplannedNpcs: engineUnplannedNpcs(this.state),
      npcAuthorship: { ...this.npcAuthorship },
      npcPlanPreview: this.npcPlanCandidate
        ? {
            unitId: this.npcPlanCandidate.unitId,
            move: this.npcPlanCandidate.move,
            attackTiles: plannableAttacks(this.state, this.npcPlanCandidate.unitId, this.npcPlanCandidate.move),
          }
        : null,
      defs: getAllDefs() as Record<UnitType, UnitDef>,
      canUndo: this.cursor > 0,
      canRedo: this.cursor < this.frames.length - 1,
      timeline: { cursor: this.cursor, labels: this.frames.map((f) => f.label) },
      bookmarks: this.bookmarks?.list() ?? [],
      log: [...this.log],
    }
  }

  private selectionView(): SelectionView | null {
    if (!this.selectedId) return null
    const unit = this.unit(this.selectedId)
    if (!unit) return null

    const def = getDef(unit.unitType)

    return {
      unitId: unit.id,
      unitType: unit.unitType as UnitType,
      kind: unit.kind,
      col: unit.col,
      row: unit.row,
      hp: unit.hp,
      maxHp: def.maxHp,
      remainingMove: remainingMove(this.state, unit),
      hasAttacked: hasAttacked(this.state, unit.id),
      moveDests: validMoveDests(this.state, unit.id),
      actions: availableActions(this.state, unit.id),
    }
  }

  /**
   * Reach and threat for every unit on the board.
   *
   * Reach is where a unit can still move this turn. Threat is every tile it could
   * attack *this turn* — from where it stands, and from anywhere it could move to
   * first, since a unit may move and then attack. A unit that has already
   * attacked threatens nothing and reaches nowhere, which is exactly what the
   * engine reports for it.
   */
  /**
   * Every tile a unit's attack could land on if it stood at `origin`.
   *
   * This asks the engine, from a state with the unit moved there — it does not
   * reconstruct reach from definition fields. The version this replaces did, and
   * documented itself as an upper bound that ignored blocking, because the
   * engine's targeting walk was private at the time. It no longer is, so the
   * local copy is gone rather than corrected: a second implementation of a rule
   * is how the two drift apart.
   *
   * The practical difference is that a tile behind a blocker is no longer shown
   * as threatened.
   */
  private threatFrom(unit: Unit, origin: Tile): Tile[] {
    if (origin.col === unit.col && origin.row === unit.row) {
      return threatTiles(this.state, unit.id)
    }
    const moved: GameState = {
      ...this.state,
      units: this.state.units.map((u) => (u.id === unit.id ? { ...u, col: origin.col, row: origin.row } : u)),
    }
    return threatTiles(moved, unit.id)
  }

  private computeFields(): BoardFields {
    const fields: BoardFields = { reach: { pc: {}, npc: {} }, threat: { pc: {}, npc: {} } }

    for (const unit of this.state.units) {
      const side = unit.kind
      const dests = validMoveDests(this.state, unit.id)

      for (const tile of dests) {
        const key = `${tile.col},${tile.row}`
        fields.reach[side][key] = (fields.reach[side][key] ?? 0) + 1
      }

      if (hasAttacked(this.state, unit.id)) continue

      // Attack origins: where it stands, plus everywhere it could move to first.
      const threatened = new Set<string>()
      for (const origin of [{ col: unit.col, row: unit.row }, ...dests]) {
        for (const tile of this.threatFrom(unit, origin)) threatened.add(`${tile.col},${tile.row}`)
      }
      for (const key of threatened) {
        fields.threat[side][key] = (fields.threat[side][key] ?? 0) + 1
      }
    }

    return fields
  }

  /**
   * One field layer drawn as rows of digits — how the agent reads reach or threat
   * without a screenshot. A digit is the number of units of that side covering the
   * tile; `.` is none. Reading a shape is far easier than reading a coordinate map.
   */
  fieldRows(side: 'pc' | 'npc', layer: 'reach' | 'threat'): string[] {
    this.ensureActive()
    const counts = this.computeFields()[layer][side]
    return this.state.cells.map((row, rowIndex) =>
      row.map((_cell, colIndex) => {
        const count = counts[`${colIndex},${rowIndex}`] ?? 0
        return count === 0 ? '.' : String(Math.min(9, count))
      }).join(''),
    )
  }

  /** The board as terrain rows — how the agent reads a board without a screenshot.
   *  Same alphabet the tools document and `boardFromRows` accepts, so a board the
   *  agent reads is a board it could hand straight back. */
  boardRows(): string[] {
    return cellsToRows(this.state.cells)
  }

  subscribe(listener: (state: BenchState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    const snapshot = this.getState()
    for (const listener of this.listeners) listener(snapshot)
  }

  // ─── Setup ──────────────────────────────────────────────────────────────────

  newBoard(map: ContentMap): BenchResult {
    this.map = map
    applyMap(this.map)
    this.selectedId = null
    this.unitSeq = 0
    this.npcAuthorship = {}
    this.npcPlanCandidate = null
    // A frame like any other, so the designer can step back to the board they
    // were working on if they swapped it out by mistake.
    this.commit(emptyState(this.freshCells()), `New board "${map.name}" (${map.size.cols}×${map.size.rows}). All units cleared.`)
    return ok(`Board is now "${map.name}", ${map.size.cols}×${map.size.rows}, empty.`)
  }

  placeUnit(unitType: UnitType, col: number, row: number, hp?: number): BenchResult {
    this.ensureActive()
    if (!UNIT_TYPES.includes(unitType)) return fail(`Unknown unit type "${unitType}". Known: ${UNIT_TYPES.join(', ')}`)
    if (col < 0 || col >= gridCols() || row < 0 || row >= gridRows()) {
      return fail(`(${col}, ${row}) is off the ${gridCols()}×${gridRows()} board`)
    }
    if (this.state.units.some((u) => u.col === col && u.row === row)) return fail(`(${col}, ${row}) is already occupied`)
    if (this.state.cells[row][col].hasStructure) return fail(`(${col}, ${row}) holds a structure`)

    const def = getDef(unitType)
    const unit: Unit = {
      id: `${unitType}-${++this.unitSeq}`,
      kind: kindOf(unitType),
      col,
      row,
      unitType,
      hp: hp ?? def.maxHp,
    }
    this.commit({ ...this.state, units: [...this.state.units, unit] }, `Placed ${unit.id} at (${col}, ${row}) with ${unit.hp} HP.`)
    return ok(`Placed ${unit.id} at (${col}, ${row}).`)
  }

  removeUnit(unitId: string): BenchResult {
    if (!this.unit(unitId)) return fail(`No unit "${unitId}" on the board`)
    if (this.selectedId === unitId) this.selectedId = null
    delete this.npcAuthorship[unitId]
    if (this.npcPlanCandidate?.unitId === unitId) this.npcPlanCandidate = null
    this.commit(
      this.withoutDepartedUnits({ ...this.state, units: this.state.units.filter((u) => u.id !== unitId) }),
      `Removed ${unitId}.`,
    )
    return ok(`Removed ${unitId}.`)
  }

  /** Setup-time relocation: ignores movement budget and legality, because this is
   *  placing a piece, not taking a turn. Use `commitSelected` to take a turn. */
  relocateUnit(unitId: string, col: number, row: number): BenchResult {
    this.ensureActive()
    const unit = this.unit(unitId)
    if (!unit) return fail(`No unit "${unitId}" on the board`)
    if (col < 0 || col >= gridCols() || row < 0 || row >= gridRows()) return fail(`(${col}, ${row}) is off the board`)
    if (this.state.units.some((u) => u.id !== unitId && u.col === col && u.row === row)) return fail(`(${col}, ${row}) is already occupied`)
    if (this.state.cells[row][col].hasStructure) return fail(`(${col}, ${row}) holds a structure`)

    const units = this.state.units.map((u) => (u.id === unitId ? { ...u, col, row } : u))
    this.commit({ ...this.state, units }, `Moved ${unitId} to (${col}, ${row}) during setup.`)
    return ok(`${unitId} is now at (${col}, ${row}).`)
  }

  setUnitHp(unitId: string, hp: number): BenchResult {
    const unit = this.unit(unitId)
    if (!unit) return fail(`No unit "${unitId}" on the board`)
    if (hp <= 0) return fail('HP must be at least 1 — remove the unit instead')
    const units = this.state.units.map((u) => (u.id === unitId ? { ...u, hp } : u))
    this.commit({ ...this.state, units }, `Set ${unitId} to ${hp} HP.`)
    return ok(`${unitId} now has ${hp} HP.`)
  }

  /**
   * Drop every round record naming units that are no longer on the board.
   *
   * Removing or clearing units is a *setup* operation, but the round's records
   * are keyed by unit id — so without this the bench keeps telegraphs for
   * units that do not exist. The engine skips such a telegraph at resolution,
   * so nothing lands wrongly; what breaks is the display, which lists a
   * phantom as pending and offers an Amend that then refuses with "No unit
   * ... on the board". Found exactly that way, driving the bench in a browser.
   */
  private withoutDepartedUnits(state: GameState): GameState {
    const alive = new Set(state.units.map((u) => u.id))
    return {
      ...state,
      npcPlans: state.npcPlans.filter((p) => alive.has(p.unitId)),
      npcPlannedThisRound: state.npcPlannedThisRound.filter((id) => alive.has(id)),
      npcPlansResolved: state.npcPlansResolved.filter((id) => alive.has(id)),
    }
  }

  clearUnits(): BenchResult {
    this.selectedId = null
    this.npcAuthorship = {}
    this.npcPlanCandidate = null
    this.commit(this.withoutDepartedUnits({ ...this.state, units: [] }), 'Cleared all units.')
    return ok('Board cleared of units.')
  }

  // ─── Play ───────────────────────────────────────────────────────────────────

  select(unitId: string | null): BenchResult {
    if (unitId && !this.unit(unitId)) return fail(`No unit "${unitId}" on the board`)
    this.selectedId = unitId
    this.emit()
    return ok(unitId ? `Selected ${unitId}.` : 'Selection cleared.')
  }

  /**
   * Commit an action for the selected unit against a target tile.
   *
   * The engine decides everything: which actions exist, which tiles each may be
   * aimed at, and whether this particular tile is one of them. The bench neither
   * checks nor pre-filters — it forwards the engine's refusal, so the designer
   * and the agent hear the same sentence.
   *
   * Aiming is by **tile**. The version this replaces took a direction, which is
   * not how the game aims: a cross-shaped attack covers tiles either side of its
   * centre, and no direction names them.
   */
  commitSelected(action: ActionId, tile: Tile): BenchResult {
    this.ensureActive()
    if (!this.selectedId) return fail('No unit selected')
    const unit = this.unit(this.selectedId)
    if (!unit) return fail('Selected unit is no longer on the board')

    const before = this.state
    const result = commitAction(this.state, unit.id, action, tile)
    if (!result.ok) return fail(result.reason)

    if (action === 'move') {
      const spent = remainingMove(before, unit) - remainingMove(result.state, result.state.units.find((u) => u.id === unit.id)!)
      this.commit(result.state, `${unit.id} moved to (${tile.col}, ${tile.row}), ${spent} tile(s).`)
      return ok(`${unit.id} moved to (${tile.col}, ${tile.row}).`)
    }

    this.commit(
      result.state,
      `${unit.id} attacked (${tile.col}, ${tile.row}). ${describeChanges(before, result.state)}`,
    )
    return ok(`${unit.id} attacked (${tile.col}, ${tile.row}).`)
  }

  /**
   * What an action would do against a tile, without doing it. Used for hover
   * feedback in the browser and for an agent that wants to check before
   * committing. Comes from the engine, which reads the effects by resolving and
   * diffing, so a preview cannot disagree with the commit that follows.
   */
  previewSelected(action: ActionId, tile: Tile): ActionPreview | null {
    this.ensureActive()
    if (!this.selectedId) return null
    return preview(this.state, this.selectedId, action, tile)
  }

  // ─── Enemy turn planning (the designer's seat) ─────────────────────────────
  //
  // Three ways to fill an enemy's plan, mixable within one round (proposal.md):
  // by hand (`planEnemyByHand`, over `commitNpcTurn`), handed to the AI one at
  // a time (`planEnemyByAi`, over `advanceNpc`), or handed to the AI for every
  // enemy still unplanned (the existing `planEnemyTurn`, whose loop below also
  // tags each enemy it plans as AI-authored). Turn order is planning order —
  // there is no fourth way that reorders (design.md).

  /**
   * Legal destinations for an unplanned enemy — the first half of the two-step
   * selection design.md describes ("Planning is a two-step selection"),
   * straight from the engine's `validMoveDests`, the same query a PC's own
   * selection already exposes.
   */
  npcMoveDests(unitId: string): Tile[] {
    this.ensureActive()
    return validMoveDests(this.state, unitId)
  }

  /**
   * The attack tiles this enemy would reach **if** it made `move` — the second
   * half of the two-step selection, and the reason `plannableAttacks` exists at
   * all (design.md): a destination is chosen before attack targets are
   * offered, which is the only order this query can answer for.
   */
  npcPlannableAttacks(unitId: string, move: NpcMoveChoice): Tile[] {
    this.ensureActive()
    return plannableAttacks(this.state, unitId, move)
  }

  /**
   * Stage a prospective move for one enemy so `getState().npcPlanPreview` can
   * report what it would put in reach, without committing anything. The
   * client's two-step planning UI drives this between picking a destination
   * and picking an attack tile; the amend flow drives it too, always with
   * `{ kind: 'stay' }`, since amending never moves the enemy.
   *
   * Deliberately not validated here beyond "this is an enemy on the board" —
   * `npcPlanPreview`'s `attackTiles` comes from `plannableAttacks`, which
   * already reports nothing for an illegal destination (design.md, "the bench
   * never pre-filters"), so there is no separate legality check to duplicate.
   */
  setNpcPlanCandidate(unitId: string, move: NpcMoveChoice | null): BenchResult {
    if (move === null) {
      this.npcPlanCandidate = null
      this.emit()
      return ok('Planning candidate cleared.')
    }
    const unit = this.unit(unitId)
    if (!unit) return fail(`No unit "${unitId}" on the board`)
    if (unit.kind !== 'npc') return fail(`"${unitId}" is a player character, not an enemy, and cannot be planned as one.`)
    this.npcPlanCandidate = { unitId, move }
    this.emit()
    return ok('Planning candidate set.')
  }

  /**
   * The designer plans one enemy's turn by hand: a destination (or holding in
   * place) and, optionally, an attack tile — validated by the engine exactly as
   * the AI's own choice would be (`commitNpcTurn`). The bench does not
   * pre-check either half; a refusal here is the engine's own, forwarded
   * verbatim.
   *
   * Provenance is recorded in the same call that plans the move, so the two
   * can never drift apart (design.md, "Provenance can drift from the plan").
   */
  planEnemyByHand(unitId: string, move: NpcMoveChoice, attackTile?: Tile): BenchResult {
    this.ensureActive()
    const result = commitNpcTurn(this.state, unitId, move, attackTile)
    if (!result.ok) return fail(result.reason)
    this.npcAuthorship = { ...this.npcAuthorship, [unitId]: 'designer' }
    this.npcPlanCandidate = null
    const destination = move.kind === 'stay' ? 'stayed in place' : `moved to (${move.toCol}, ${move.toRow})`
    const attack = attackTile ? `, attack telegraphed at (${attackTile.col}, ${attackTile.row})` : ', no attack'
    const message = `${unitId} planned by hand: ${destination}${attack}.`
    this.commit(result.state, message)
    return ok(message)
  }

  /**
   * Hand one named enemy to the game's own AI (`advanceNpc`), leaving every
   * other enemy's plan — or lack of one — untouched. The middle ground between
   * planning by hand and `planEnemyTurn`'s "AI takes everyone still unplanned".
   */
  planEnemyByAi(unitId: string): BenchResult {
    this.ensureActive()
    const result = advanceNpc(this.state, unitId)
    if (!result.ok) return fail(result.reason)
    this.npcAuthorship = { ...this.npcAuthorship, [unitId]: 'ai' }
    if (this.npcPlanCandidate?.unitId === unitId) this.npcPlanCandidate = null
    const message = `${unitId} planned by the AI.`
    this.commit(result.state, message)
    return ok(message)
  }

  /**
   * Retarget a locked telegraph after it was planned and before it resolves —
   * the one deliberate departure from the game's own rules (proposal.md): in
   * the game a telegraph cannot change once locked, but a designer who spots a
   * bad enemy plan mid-turn should not have to rewind the whole turn to fix it.
   *
   * The engine (`amendTelegraph`) validates the new target exactly once, from
   * the enemy's current, immutable-since-move position — never re-derived
   * per historical frame. The amendment is then retroactive: it reads as
   * though the enemy had been planned that way from the start, so it is
   * written into every frame from the one that locked the telegraph through
   * the current cursor. See `rewriteTelegraphWindow` for the mechanics and
   * why this is safe.
   */
  amendTelegraph(unitId: string, tile: Tile): BenchResult {
    this.ensureActive()
    const result = engineAmendTelegraph(this.state, unitId, tile)
    if (!result.ok) return fail(result.reason)

    const amended = result.state.npcPlans.find((p) => p.unitId === unitId)
    if (!amended) {
      // Unreachable: the engine's own success above already means an entry
      // for this unit existed to amend. Guarded rather than asserted with a
      // non-null assertion, so a change to the engine's contract fails loudly
      // here instead of producing a silent `undefined` write below.
      return fail(`No locked telegraph for ${unitId} to amend.`)
    }

    this.rewriteTelegraphWindow(unitId, amended)
    if (this.npcPlanCandidate?.unitId === unitId) this.npcPlanCandidate = null
    const message = `${unitId}'s telegraph retargeted to (${tile.col}, ${tile.row}).`
    this.note(message)
    this.emit()
    return ok(message)
  }

  /**
   * The retroactive rewrite (design.md, "Amendment rewrites history in
   * place") — **the only code in this file that mutates a stored frame's
   * state rather than appending a new one.** Kept to this one place and
   * touching nothing but `unitId`'s own `npcPlans` entry, on purpose: this is
   * the least self-evident failure mode in the bench, since a bug here
   * corrupts history rather than producing a visibly wrong board.
   *
   * The window is exactly "after locked, before resolved": walking back from
   * the cursor, a frame belongs to it while the frame's own state still has
   * `unitId` in `npcPlannedThisRound` and not yet in `npcPlansResolved`. The
   * engine's own refusals above already guarantee the cursor's frame is in
   * this window — `amendTelegraph` refuses unless both hold there — so the
   * loop only has to find how much *further back* the window extends.
   *
   * Nothing else needs to change in an amended frame: nothing reads `npcPlans`
   * between lock and resolution (design.md cites the engine's `actions.ts`,
   * `pc.ts`, and `pathfinding.ts` as having no such read — a telegraph is
   * display-only until resolution walks it), so replacing one entry in that
   * array is the entire edit. Every other field of every frame in the window —
   * board, units, every *other* unit's plan — is copied forward untouched.
   *
   * Frames beyond the cursor (a redo stack, if the designer had scrubbed back
   * before amending) are discarded rather than left stale: they were computed
   * against the pre-amendment telegraph, and the bench already discards a redo
   * stack whenever the designer acts after stepping back — amending is no
   * different.
   */
  private rewriteTelegraphWindow(unitId: string, amended: GameState['npcPlans'][number]): void {
    let lockIndex = this.cursor
    while (
      lockIndex > 0 &&
      this.frames[lockIndex - 1].state.npcPlannedThisRound.includes(unitId) &&
      !this.frames[lockIndex - 1].state.npcPlansResolved.includes(unitId)
    ) {
      lockIndex--
    }

    for (let i = lockIndex; i <= this.cursor; i++) {
      const frame = this.frames[i]
      this.frames[i] = {
        ...frame,
        state: { ...frame.state, npcPlans: frame.state.npcPlans.map((p) => (p.unitId === unitId ? amended : p)) },
      }
    }

    this.frames = this.frames.slice(0, this.cursor + 1)
    this.state = this.frames[this.cursor].state
  }

  /**
   * Perform exactly one step of the engine's round — whatever `nextAction`
   * says comes next — as its own timeline frame. The granularity the
   * scrubbable enemy-phase interval is built on: `planEnemyTurn` and
   * `resolveTelegraphs` are this, looped.
   *
   * Refuses whenever the engine does — most commonly outside `npc-move` /
   * `npc-attack`, since ending the player's turn is the bench's own decision
   * (`endPlayerTurn`), not a step the engine takes. The refusal is the
   * engine's own reason, forwarded rather than reworded.
   */
  step(): BenchResult {
    this.ensureActive()
    const result = advance(this.state)
    if (!result.ok) return fail(result.reason)
    this.noteStepAuthorship(result.step)
    const message = describeStep(result.step)
    this.commit(result.state, message)
    return ok(message)
  }

  /**
   * Bookkeeping that belongs exactly where a generic `advance()` step changes
   * `npcPlans`/`npcPlannedThisRound`: the engine's own AI is the only thing a
   * bare `plan-enemy` step here can be (`planEnemyByHand`/`planEnemyByAi` are
   * separate calls that record authorship themselves and never go through
   * `advance`), so tag it AI-authored. And once the round truly ends — the
   * `npc-attack → npc-move` transition `advance` performs by chaining into
   * `endRound` — clear provenance, since `GameState` itself has moved on to a
   * round nothing has been planned in yet (design.md, "cleared when the round
   * ends").
   */
  private noteStepAuthorship(step: SequencerStep): void {
    if (step.kind === 'plan-enemy') {
      this.npcAuthorship = { ...this.npcAuthorship, [step.unitId]: 'ai' }
    } else if (step.kind === 'phase-transition' && step.from === 'npc-attack') {
      this.npcAuthorship = {}
    }
  }

  /**
   * Hand the enemy side to the game's own AI for the **planning** half of its
   * turn, for comparison with driving it by hand. Every enemy's move resolves
   * immediately; its attack is chosen and locked as a telegraph, not resolved —
   * `resolveTelegraphs` is the other half. This is the shipped game's own split
   * (`runNpcMovePhase` / `runNpcAttackPhase`), now the engine's `npc-move`
   * phase — restored here so the board shows what is coming rather than what
   * already happened.
   *
   * `advance` is called once per enemy (and once more for the phase
   * transition out), each its own frame — never collapsed into one, or
   * stepping back into the middle of a planned turn would have nowhere to
   * land (design.md, "One frame per engine step").
   */
  planEnemyTurn(): BenchResult {
    return this.advanceThroughPhase('npc-move', 'enemy turn planning')
  }

  /**
   * Play out the telegraphs a planned enemy turn locked, in the order they
   * were planned — the other half of `planEnemyTurn`, now the engine's
   * `npc-attack` phase. A telegraph whose owner died inside the window is
   * skipped rather than resolved (the engine's `skip-telegraph` step),
   * matching the shipped game's `runNpcAttackPhase`.
   */
  resolveTelegraphs(): BenchResult {
    return this.advanceThroughPhase('npc-attack', 'telegraph resolution')
  }

  /**
   * Loop `step`'s single `advance` call while the round is still in `phase`,
   * committing one frame per call — the composite `planEnemyTurn` and
   * `resolveTelegraphs` are built from, per design.md's "`advance` is exposed
   * both single-step and composite".
   *
   * Refuses up front, without calling the engine, if the round is not
   * currently in `phase` at all: `advance` has no notion of which composite
   * is asking, so calling it anyway would silently perform whatever *other*
   * phase's step is next — planning an enemy under "Resolve telegraphs", say —
   * rather than doing nothing. That refusal is the bench's own, not the
   * engine's, because there is no engine call this forwards it from.
   */
  private advanceThroughPhase(phase: TurnPhase, label: string): BenchResult {
    this.ensureActive()
    if (this.state.phase !== phase) {
      return fail(`Nothing to do for ${label} — the round's phase is "${this.state.phase}", not "${phase}".`)
    }

    let steps = 0
    let message = ''
    while (this.state.phase === phase) {
      const result = advance(this.state)
      if (!result.ok) return fail(result.reason)
      steps++
      this.noteStepAuthorship(result.step)
      message = describeStep(result.step)
      this.commit(result.state, message)
    }
    return ok(`${label}: ${steps} step(s). ${message}`)
  }

  /**
   * The one phase transition the bench performs itself rather than the
   * engine: ending the player's turn is a decision, not a rule (design.md).
   * Matches the shipped game's `handleConfirmEndTurn`
   * (`DungeonTacticsGame.tsx:430`), which sets `phase: 'npc-attack'` directly.
   *
   * Refused outside the `player` phase — not an engine refusal (nothing here
   * calls the engine), but the bench's own: this is the one transition it
   * owns, so it is the one place it has to guard itself. While the round is
   * still `npc-move`, this is also the requirement that the round cannot
   * proceed with an enemy unplanned (spec.md) — not a separate guard, since
   * the engine's own phase machine already makes `player` unreachable until
   * `unplannedNpcs` is empty; naming which enemies are still unplanned here
   * just makes that refusal legible instead of generic.
   */
  endPlayerTurn(): BenchResult {
    if (this.state.phase !== 'player') {
      const remaining = this.state.phase === 'npc-move' ? engineUnplannedNpcs(this.state) : []
      if (remaining.length > 0) {
        return fail(`Can't end the player's turn yet — ${remaining.length} enemy turn(s) still need a plan: ${remaining.join(', ')}.`)
      }
      return fail(`Can't end the player's turn from the "${this.state.phase}" phase.`)
    }
    this.commit({ ...this.state, phase: 'npc-attack' }, 'Player turn ended — enemy attacks are about to resolve.')
    return ok('Player turn ended.')
  }

  // ─── The timeline ───────────────────────────────────────────────────────────
  //
  // Every action is a frame, so the whole session is a trajectory the designer
  // can walk rather than a one-way animation. Full-state frames mean this
  // reverses attacks, placements, board changes, and definition tweaks — not just
  // moves, which is all the engine's own undo covers.

  /** Step back one action. */
  undo(): BenchResult {
    if (this.cursor === 0) return fail('Nothing to step back to')
    this.restore(this.cursor - 1)
    this.note('Stepped back one action.')
    this.emit()
    return ok('Stepped back one action.')
  }

  /** Step forward again, if the designer has stepped back and not acted since. */
  redo(): BenchResult {
    if (this.cursor >= this.frames.length - 1) return fail('Nothing to step forward to')
    this.restore(this.cursor + 1)
    this.note('Stepped forward one action.')
    this.emit()
    return ok('Stepped forward one action.')
  }

  /** Jump anywhere on the timeline — what the scrub bar drives. */
  stepTo(index: number): BenchResult {
    if (!Number.isInteger(index) || index < 0 || index >= this.frames.length) {
      return fail(`No frame ${index} — the timeline runs 0 to ${this.frames.length - 1}`)
    }
    if (index === this.cursor) return ok('Already there.')
    this.restore(index)
    this.note(`Scrubbed to "${this.frames[index].label}".`)
    this.emit()
    return ok(`At "${this.frames[index].label}".`)
  }

  // ─── Unit definitions (session-scoped, never persisted) ──────────────────────

  /**
   * Change a unit type's numbers for this session only. Nothing is written to
   * disk: this is the edit→see loop for a POC, not an editor. The engine clamps
   * the values, and every overlay re-derives on the next read.
   */
  tweakDef(unitType: UnitType, patch: Partial<{ maxHp: number; moveRange: number; damage: number; minRange: number; maxRange: number }>): BenchResult {
    this.ensureActive()
    if (!UNIT_TYPES.includes(unitType)) return fail(`Unknown unit type "${unitType}". Known: ${UNIT_TYPES.join(', ')}`)

    const current = getDef(unitType)
    const next = clampDef({
      ...current,
      maxHp: patch.maxHp ?? current.maxHp,
      movement: { range: patch.moveRange ?? current.movement.range },
      attack: {
        ...current.attack,
        damage: patch.damage ?? current.attack.damage,
        targeting: {
          ...current.attack.targeting,
          minRange: patch.minRange ?? current.attack.targeting.minRange,
          maxRange: patch.maxRange ?? current.attack.targeting.maxRange,
        },
      },
    })

    const prevMax = { [unitType]: getMaxHp(unitType) } as Partial<Record<UnitType, number>>
    this.defOverrides[unitType] = next
    this.ensureActive()
    // Units already on the board move with the change, through the engine's own
    // rule — raising a maximum heals them, lowering it wounds them but never
    // kills. Doing this here rather than locally is what keeps the bench and the
    // game agreeing about what a balance edit does mid-match.
    const reconciled = reconcileHp(this.state, prevMax)
    const summary = `${unitType}: ${next.maxHp} HP, move ${next.movement.range}, damage ${next.attack.damage}, range ${next.attack.targeting.minRange}–${next.attack.targeting.maxRange}`
    // A frame, so stepping back past a number change puts the number back — the
    // designer can walk a trajectory that includes their own edits.
    this.commit(reconciled, `Definition changed — ${summary}`)
    return ok(summary)
  }

  // ─── Bookmarks ──────────────────────────────────────────────────────────────

  /**
   * Save the board exactly as it stands — mid-turn, mid-fight, whatever it is —
   * under a name. Cheap to make and cheap to throw away is the point: the
   * library holds interesting positions, not approved test cases.
   */
  saveBookmark(name: string): BenchResult {
    if (!this.bookmarks) return fail('Bookmarks are not configured for this bench')
    try {
      const saved = this.bookmarks.write({
        name: name.trim(),
        savedAt: new Date().toISOString(),
        map: this.map,
        state: this.state,
        defOverrides: this.defOverrides,
      })
      this.note(`Saved bookmark "${saved}".`)
      this.emit()
      return ok(`Saved "${saved}".`)
    } catch (err) {
      return fail(err instanceof Error ? err.message : 'Could not save that bookmark')
    }
  }

  /** Jump to a saved position. The current board is replaced, not merged, and the
   *  jump is a frame on the timeline like any other action. */
  loadBookmark(name: string): BenchResult {
    if (!this.bookmarks) return fail('Bookmarks are not configured for this bench')
    const bookmark = this.bookmarks.read(name)
    if (!bookmark) return fail(`No bookmark named "${name}"`)

    this.map = bookmark.map
    this.defOverrides = bookmark.defOverrides ?? {}
    const incompatible = incompatibleBookmarkReason(bookmark.state)
    if (incompatible) {
      return fail(`Can't load "${bookmark.name}" — ${incompatible}`)
    }

    this.selectedId = null
    // A bookmark predates this bench's own provenance bookkeeping — it saved
    // no record of who planned what, so there is nothing truthful to restore.
    this.npcAuthorship = {}
    this.npcPlanCandidate = null
    this.ensureActive()
    // Unit ids came from the saved state; keep new placements from colliding.
    this.unitSeq = nextSeqFrom(bookmark.state.units)
    this.commit(bookmark.state, `Loaded bookmark "${bookmark.name}" (saved ${bookmark.savedAt}).`)
    return ok(`Loaded "${bookmark.name}".`)
  }

  deleteBookmark(name: string): BenchResult {
    if (!this.bookmarks) return fail('Bookmarks are not configured for this bench')
    if (!this.bookmarks.delete(name)) return fail(`No bookmark named "${name}"`)
    this.note(`Deleted bookmark "${name}".`)
    this.emit()
    return ok(`Deleted "${name}".`)
  }

  /** Drop every session tweak and go back to the game's shipped numbers. */
  resetDefs(): BenchResult {
    this.defOverrides = {}
    this.ensureActive()
    this.commit(this.state, 'Unit definitions reset to the shipped values.')
    return ok('Unit definitions reset to the shipped values.')
  }
}

/** What one `NpcAction` did, phrased for `describeStep`. `attack` never
 *  reaches here — the sequencer reports an enemy's attack as a separate
 *  telegraph, not folded into its move — but the type carries it, so it is
 *  covered rather than asserted away. */
function describeNpcAction(action: NpcAction): string {
  switch (action.kind) {
    case 'move':
      return `moved to (${action.toCol}, ${action.toRow})`
    case 'stay':
      return 'stayed in place'
    case 'exit':
      return 'exited the board'
    case 'attack':
      return `attacked (${action.targetCol}, ${action.targetRow})`
  }
}

/**
 * What one engine step did, phrased for the timeline label and the log — the
 * text `step` and every composite's loop share, so scrubbing to a frame and
 * reading the log agree about what happened there. Built from the engine's
 * own `SequencerStep`, not a re-derivation of what advancing does.
 */
function describeStep(step: SequencerStep): string {
  switch (step.kind) {
    case 'plan-enemy': {
      const move = describeNpcAction(step.action)
      const telegraph = step.attackPlan
        ? `, attack telegraphed at (${step.attackPlan.targetCol}, ${step.attackPlan.targetRow})`
        : ', no attack'
      return `${step.unitId} planned: ${move}${telegraph}.`
    }
    case 'resolve-telegraph':
      return `${step.unitId}'s telegraphed attack resolved at (${step.attack.targetCol}, ${step.attack.targetRow}).`
    case 'skip-telegraph':
      return `${step.unitId}'s telegraphed attack was skipped — it didn't survive to resolve it.`
    case 'phase-transition':
      return `Phase: ${step.from} → ${step.to}.`
  }
}

/**
 * What an action changed, phrased for the log: units damaged or destroyed, and
 * structures damaged or levelled.
 *
 * Structures matter here as much as units. A PC swinging at a power center takes
 * it from 3 to 2 — the engine deals structures one point per hit regardless of
 * the attacker's damage — and a log that reported "nothing was hit" for that was
 * simply wrong, which is worse than terse.
 */
function describeChanges(before: GameState, after: GameState): string {
  const parts: string[] = []

  const survivors = new Set(after.units.map((u) => u.id))
  for (const unit of after.units) {
    const was = before.units.find((b) => b.id === unit.id)
    if (was && was.hp !== unit.hp) parts.push(`${unit.id} ${was.hp}→${unit.hp} HP`)
  }
  const dead = before.units.filter((u) => !survivors.has(u.id)).map((u) => u.id)
  if (dead.length > 0) parts.push(`${dead.join(', ')} destroyed`)

  for (let row = 0; row < before.cells.length; row++) {
    for (let col = 0; col < before.cells[row].length; col++) {
      const was = before.cells[row][col]
      const now = after.cells[row]?.[col]
      if (!now || !was.hasStructure) continue
      if (!now.hasStructure) parts.push(`the ${was.structureKind ?? 'structure'} at (${col}, ${row}) was levelled`)
      else if (was.structureHp !== now.structureHp) {
        parts.push(`the ${was.structureKind ?? 'structure'} at (${col}, ${row}) ${was.structureHp}→${now.structureHp} HP`)
      }
    }
  }

  return parts.length > 0 ? parts.join('; ') + '.' : 'Nothing was hit.'
}
