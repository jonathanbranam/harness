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
  applyLoaded,
  applyMap,
  attackFootprint,
  boardCells,
  clampDef,
  computeMovePath,
  computeNpcTurns,
  endRound,
  getAllDefs,
  getDef,
  gridCols,
  gridRows,
  hasAttacked,
  remainingMove,
  resolveNpcAction,
  resolvePcAction,
  applyMove,
  validMoveDests,
  type Cell,
  type ContentMap,
  type Direction,
  type GameState,
  type NpcType,
  type PcType,
  type Unit,
  type UnitDef,
} from '@repo/dungeon-engine'
import { generateBoard, type GenerateBoardOptions } from './board-gen'
import type { BookmarkStore, BookmarkSummary } from './bookmark-store'

export type UnitType = PcType | NpcType

const PC_TYPES: PcType[] = ['melee', 'ranger', 'magic-user', 'rogue']
const NPC_TYPES: NpcType[] = ['short-range', 'long-range']
export const UNIT_TYPES: UnitType[] = [...PC_TYPES, ...NPC_TYPES]
export const DIRECTIONS: Direction[] = ['up', 'down', 'left', 'right']

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
  /** What produced this frame, for the scrub bar's tooltip. */
  label: string
}

export interface Tile {
  col: number
  row: number
}

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
  /** NPC attack telegraphs from the last AI run, as the game would show them. */
  telegraphs: { unitId: string; targetCol: number; targetRow: number }[]
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
  /** Engine-derived: every tile this unit can still reach this turn. */
  moveDests: Tile[]
  /** Engine-derived: the attack footprint in each direction from where it stands. */
  attackByDir: Record<Direction, Tile[]>
}

export type BenchResult = { ok: true; message: string } | { ok: false; error: string }

function ok(message: string): BenchResult {
  return { ok: true, message }
}

function fail(error: string): BenchResult {
  return { ok: false, error }
}

function kindOf(unitType: UnitType): 'pc' | 'npc' {
  return (PC_TYPES as string[]).includes(unitType) ? 'pc' : 'npc'
}

function emptyState(cells: Cell[][]): GameState {
  return {
    cells,
    units: [],
    spawners: [],
    phase: 'player',
    planningPhase: 'none',
    selectedUnitId: null,
    plans: {},
    planOrder: [],
    npcPlans: [],
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
  private log: string[] = []
  private unitSeq = 0
  private bookmarks: BookmarkStore | undefined
  private listeners = new Set<(state: BenchState) => void>()

  constructor(opts: GenerateBoardOptions & { bookmarks?: BookmarkStore } = {}) {
    this.bookmarks = opts.bookmarks
    this.map = generateBoard(opts)
    applyMap(this.map)
    this.state = emptyState(this.freshCells())
    this.frames = [{ state: this.state, map: this.map, defOverrides: {}, label: `Board "${this.map.name}"` }]
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
    this.frames.push({ state: next, map: this.map, defOverrides: { ...this.defOverrides }, label: message })
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
      telegraphs: this.state.npcPlans.map((p) => ({ unitId: p.unitId, targetCol: p.targetCol, targetRow: p.targetRow })),
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
    const attackByDir = {} as Record<Direction, Tile[]>
    for (const dir of DIRECTIONS) {
      attackByDir[dir] = attackFootprint(def, { col: unit.col, row: unit.row }, dir)
    }

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
      attackByDir,
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
   * Every tile a unit's attack could land on from `origin`, in any direction.
   *
   * For most shapes this is exactly the engine's own footprint. **One documented
   * approximation:** a `single`-shape attack resolves on the tile at *min* range,
   * but a unit whose targeting band is wider than that can select a target
   * anywhere in the band — the NPC scanners in the engine walk `minRange` to
   * `maxRange` along each cardinal. A short-range enemy therefore shoots two
   * tiles, and a long-range enemy shoots across the board, even though each
   * resolves on one tile. Using the footprint alone would tell the designer the
   * enemy is far less dangerous than it is.
   *
   * So for `single` shapes the band is used. It ignores blocking — the scanners
   * stop at the first unit or structure — which makes this an **upper bound**:
   * every tile shown is one the unit could hit with a clear line, and none is
   * missing. That is the right direction to err for a "what can touch me" view.
   * The scanners themselves are internal to the engine, so this is derived from
   * the same definition fields they read rather than by re-implementing them.
   */
  private threatTilesFrom(def: UnitDef, origin: Tile): Tile[] {
    const { minRange, maxRange } = def.attack.targeting
    if (def.attack.propagation.shape !== 'single' || maxRange <= minRange) {
      return DIRECTIONS.flatMap((dir) => attackFootprint(def, origin, dir))
    }

    // The targeting band along each cardinal, board-clipped the way the engine
    // clips its own footprints.
    const banded: Tile[] = []
    for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as [number, number][]) {
      for (let d = minRange; d <= maxRange; d++) {
        const col = origin.col + dc * d
        const row = origin.row + dr * d
        if (col < 0 || row < 0 || col >= gridCols() || row >= gridRows()) break
        banded.push({ col, row })
      }
    }
    return banded
  }

  private computeFields(): BoardFields {
    const fields: BoardFields = { reach: { pc: {}, npc: {} }, threat: { pc: {}, npc: {} } }

    for (const unit of this.state.units) {
      const side = unit.kind
      const def = getDef(unit.unitType)
      const dests = validMoveDests(this.state, unit.id)

      for (const tile of dests) {
        const key = `${tile.col},${tile.row}`
        fields.reach[side][key] = (fields.reach[side][key] ?? 0) + 1
      }

      if (hasAttacked(this.state, unit.id)) continue

      // Attack origins: where it stands, plus everywhere it could move to first.
      const threatened = new Set<string>()
      for (const origin of [{ col: unit.col, row: unit.row }, ...dests]) {
        for (const tile of this.threatTilesFrom(def, origin)) threatened.add(`${tile.col},${tile.row}`)
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
    const counts = this.computeFields()[layer][side]
    return this.state.cells.map((row, rowIndex) =>
      row.map((_cell, colIndex) => {
        const count = counts[`${colIndex},${rowIndex}`] ?? 0
        return count === 0 ? '.' : String(Math.min(9, count))
      }).join(''),
    )
  }

  /** The board as terrain rows — how the agent reads a board without a screenshot. */
  boardRows(): string[] {
    return this.state.cells.map((row) => row.map((c) => (c.hasStructure ? '#' : c.terrain[0])).join(''))
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
    this.commit({ ...this.state, units: this.state.units.filter((u) => u.id !== unitId) }, `Removed ${unitId}.`)
    return ok(`Removed ${unitId}.`)
  }

  /** Setup-time relocation: ignores movement budget and legality, because this is
   *  placing a piece, not taking a turn. Use `moveSelectedTo` to take a turn. */
  relocateUnit(unitId: string, col: number, row: number): BenchResult {
    this.ensureActive()
    const unit = this.unit(unitId)
    if (!unit) return fail(`No unit "${unitId}" on the board`)
    if (col < 0 || col >= gridCols() || row < 0 || row >= gridRows()) return fail(`(${col}, ${row}) is off the board`)
    if (this.state.units.some((u) => u.id !== unitId && u.col === col && u.row === row)) return fail(`(${col}, ${row}) is already occupied`)

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

  clearUnits(): BenchResult {
    this.selectedId = null
    this.commit({ ...this.state, units: [] }, 'Cleared all units.')
    return ok('Board cleared of units.')
  }

  // ─── Play ───────────────────────────────────────────────────────────────────

  select(unitId: string | null): BenchResult {
    if (unitId && !this.unit(unitId)) return fail(`No unit "${unitId}" on the board`)
    this.selectedId = unitId
    this.emit()
    return ok(unitId ? `Selected ${unitId}.` : 'Selection cleared.')
  }

  /** Take a movement step with the selected unit. Legality and cost come from the
   *  engine: `validMoveDests` decides where it may go, `computeMovePath` finds the
   *  route, `applyMove` charges the budget. */
  moveSelectedTo(col: number, row: number): BenchResult {
    this.ensureActive()
    if (!this.selectedId) return fail('No unit selected')
    const unit = this.unit(this.selectedId)
    if (!unit) return fail('Selected unit is no longer on the board')

    const legal = validMoveDests(this.state, unit.id)
    if (!legal.some((t) => t.col === col && t.row === row)) {
      const left = remainingMove(this.state, unit)
      return fail(
        left <= 0
          ? `${unit.id} has no movement left this turn${hasAttacked(this.state, unit.id) ? ' (it has attacked)' : ''}`
          : `(${col}, ${row}) is not reachable — ${unit.id} has ${left} movement left`,
      )
    }

    const path = computeMovePath(this.state, unit.id, unit.col, unit.row, col, row)
    if (path.length === 0) return fail(`No path from (${unit.col}, ${unit.row}) to (${col}, ${row})`)

    this.commit(applyMove(this.state, unit.id, col, row, path), `${unit.id} moved to (${col}, ${row}), ${path.length} tile(s).`)
    return ok(`${unit.id} moved to (${col}, ${row}).`)
  }

  /**
   * Attack with the selected unit in `dir`. The footprint comes from the engine.
   * A PC attack is resolved by `resolvePcAction` (it damages NPCs/structures); an
   * NPC attack is resolved by `resolveNpcAction` against one tile of the
   * footprint (it damages PCs/structures), which is why NPCs take a target.
   */
  attackSelected(dir: Direction, target?: Tile): BenchResult {
    this.ensureActive()
    if (!this.selectedId) return fail('No unit selected')
    const unit = this.unit(this.selectedId)
    if (!unit) return fail('Selected unit is no longer on the board')
    if (hasAttacked(this.state, unit.id)) return fail(`${unit.id} has already attacked this turn`)

    const footprint = attackFootprint(getDef(unit.unitType), { col: unit.col, row: unit.row }, dir)
    if (footprint.length === 0) return fail(`${unit.id} has nothing in reach ${dir}`)

    if (unit.kind === 'pc') {
      const before = this.state.units
      const next = resolvePcAction(this.state, { kind: 'attack', unitId: unit.id, col: unit.col, row: unit.row, attackDir: dir })
      this.commit(next, `${unit.id} attacked ${dir}. ${describeCasualties(before, next.units)}`)
      return ok(`${unit.id} attacked ${dir}.`)
    }

    const tile = target ?? footprint[0]
    if (!footprint.some((t) => t.col === tile.col && t.row === tile.row)) {
      return fail(`(${tile.col}, ${tile.row}) is not in ${unit.id}'s ${dir} footprint`)
    }
    const before = this.state.units
    const next = resolveNpcAction(this.state, { kind: 'attack', unitId: unit.id, targetCol: tile.col, targetRow: tile.row })
    // resolveNpcAction doesn't mark the attacker as spent (the game resolves NPC
    // telegraphs at end of round, not as a turn action), so the bench marks it —
    // otherwise a hand-driven NPC could attack repeatedly in one turn.
    const attackedThisTurn = next.attackedThisTurn.includes(unit.id) ? next.attackedThisTurn : [...next.attackedThisTurn, unit.id]
    this.commit({ ...next, attackedThisTurn }, `${unit.id} attacked (${tile.col}, ${tile.row}). ${describeCasualties(before, next.units)}`)
    return ok(`${unit.id} attacked (${tile.col}, ${tile.row}).`)
  }

  /** Hand the enemy side to the game's own AI for one round, for comparison with
   *  driving it by hand. Moves resolve first, then the attack telegraphs. */
  runEnemyAi(): BenchResult {
    this.ensureActive()
    if (!this.state.units.some((u) => u.kind === 'npc')) return fail('No NPCs on the board')

    const { moves, attackPlans } = computeNpcTurns(this.state)
    const before = this.state.units
    let next = this.state
    for (const move of moves) next = resolveNpcAction(next, move)
    for (const plan of attackPlans) next = resolveNpcAction(next, plan)

    this.commit(
      { ...next, npcPlans: attackPlans },
      `Enemy AI ran: ${moves.length} move(s), ${attackPlans.length} attack(s). ${describeCasualties(before, next.units)}`,
    )
    return ok(`Enemy AI ran ${moves.length} move(s) and ${attackPlans.length} attack(s).`)
  }

  endRound(): BenchResult {
    this.ensureActive()
    this.commit(endRound(this.state), 'Round ended — movement and attacks are available again.')
    return ok('Round ended.')
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

    this.defOverrides[unitType] = next
    this.ensureActive()
    const summary = `${unitType}: ${next.maxHp} HP, move ${next.movement.range}, damage ${next.attack.damage}, range ${next.attack.targeting.minRange}–${next.attack.targeting.maxRange}`
    // A frame, so stepping back past a number change puts the number back — the
    // designer can walk a trajectory that includes their own edits.
    this.commit(this.state, `Definition changed — ${summary}`)
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
    this.selectedId = null
    this.ensureActive()
    // Unit ids came from the saved state; keep new placements from colliding.
    this.unitSeq = bookmark.state.units.length
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

/** Which units died between two unit lists, phrased for the log. */
function describeCasualties(before: Unit[], after: Unit[]): string {
  const survivors = new Set(after.map((u) => u.id))
  const dead = before.filter((u) => !survivors.has(u.id)).map((u) => u.id)
  const damaged = after
    .map((u) => {
      const was = before.find((b) => b.id === u.id)
      return was && was.hp !== u.hp ? `${u.id} ${was.hp}→${u.hp} HP` : null
    })
    .filter((s): s is string => s !== null)

  const parts = [...damaged]
  if (dead.length > 0) parts.push(`${dead.join(', ')} destroyed`)
  return parts.length > 0 ? parts.join('; ') + '.' : 'Nothing was hit.'
}
