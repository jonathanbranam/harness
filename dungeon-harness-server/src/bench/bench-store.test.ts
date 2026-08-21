import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setEngineMode } from '@repo/dungeon-engine'
import { BenchStore, type UnitType } from './bench-store'
import { boardFromRows, boardToRows, generateBoard } from './board-gen'

// The real server sets this once at process startup (`engine-startup.ts`) and
// never toggles it — one process is either the game or the bench.
//
// Bench mode buys **no** latitude over the round: `dungeon-sequencer-guards`'
// phase guard is unconditional, refuses every host including this one, and
// this suite plays by it exactly like the game does (`playerPhase` below is
// what most tests use to reach the phase where acting is legal). What bench
// mode actually fences is narrower — authoring a scenario at all
// (`scenario.newScenario`, which a fresh `BenchStore` calls in its
// constructor, so this is needed even to build one) and retargeting a locked
// telegraph (`amendTelegraph`, the one deliberate departure from the game's
// own rules). Set here for every test, not just the one block that used to
// need it for `amendTelegraph`, because constructing a `BenchStore` now needs
// it too.
beforeEach(() => setEngineMode('bench'))
afterEach(() => setEngineMode('game'))

/** An open 8×5 board with no terrain and no structures to complicate pathing.
 *  Lands in `placement`, same as any other board — setup calls after this
 *  are free until something calls `startScenario`. */
function openBench(): BenchStore {
  const bench = new BenchStore()
  bench.newBoard(generateBoard({ cols: 8, rows: 5, preset: 'open', powerCenters: 0 }))
  return bench
}

/**
 * Places each unit and starts the scenario, landing the round in `npc-move` —
 * what every test below that *plays* a turn needs, since setup (including
 * placement) is refused once the round has started. The shape the correction
 * plan anticipates for its own `playerPhase()` fixture (phase-5-correction.md
 * §9, change 3) — a setup helper, not a per-test edit, so tests read as "place
 * these, then play" rather than repeating the same `startScenario()` call.
 */
function startedWith(bench: BenchStore, units: { unitType: UnitType; col: number; row: number; hp?: number }[]): void {
  for (const u of units) bench.placeUnit(u.unitType, u.col, u.row, u.hp)
  bench.startScenario()
}

/**
 * Like `startedWith`, but plays the round the rest of the way to `player` —
 * what most tests below actually want, since acting through the action
 * surface (`select` + `commitSelected`) is refused everywhere else now
 * (`dungeon-sequencer-guards`'s unconditional phase guard).
 *
 * `startScenario` lands the round in `npc-move`, so every enemy takes its
 * turn before the player's first — that is the game's round, not an
 * artifact of this fixture. Handing enemy turns to the AI here would move
 * them to positions a test never chose, and assertions about tiles would
 * start failing for reasons unrelated to what the test is testing. So every
 * enemy is planned **by hand**, to `{ kind: 'stay' }` with no attack: it
 * holds its position and locks no telegraph, and the round is then stepped
 * the rest of the way to `player`. The enemy phase really runs — it is
 * simply told to do nothing.
 *
 * A test that wants an enemy to have actually moved or telegraphed says so
 * explicitly, planning it differently once this fixture returns.
 */
function playerPhase(bench: BenchStore, units: { unitType: UnitType; col: number; row: number; hp?: number }[]): void {
  startedWith(bench, units)
  for (const npc of bench.getState().units.filter((u) => u.kind === 'npc')) {
    bench.planEnemyByHand(npc.id, { kind: 'stay' })
  }
  while (bench.getState().phase !== 'player') bench.step()
}

describe('board generation', () => {
  it('is reproducible from a seed', () => {
    const a = generateBoard({ cols: 10, rows: 6, preset: 'scattered', seed: 42 })
    const b = generateBoard({ cols: 10, rows: 6, preset: 'scattered', seed: 42 })
    const c = generateBoard({ cols: 10, rows: 6, preset: 'scattered', seed: 43 })
    expect(boardToRows(a)).toEqual(boardToRows(b))
    expect(boardToRows(a)).not.toEqual(boardToRows(c))
  })

  it('round-trips explicit terrain and structure rows', () => {
    const rows = ['....f...', '..w..s..', '...P....', 'f.....T.', '........']
    expect(boardToRows(boardFromRows(rows))).toEqual(rows)
  })

  it('places a power center by default, because the enemy AI walks toward structures', () => {
    expect(generateBoard({ cols: 8, rows: 5 }).objects).toHaveLength(1)
    expect(generateBoard({ cols: 8, rows: 5, powerCenters: 0 }).objects).toHaveLength(0)
  })

  it('rejects a ragged board rather than squaring it off', () => {
    expect(() => boardFromRows(['....', '...', '....'])).toThrow(/same width/)
    expect(() => boardFromRows(['....', '..x.', '....'])).toThrow(/Unknown character/)
  })
})

describe('setup', () => {
  it('places units anywhere, ignoring spawn zones', () => {
    const bench = openBench()
    expect(bench.placeUnit('melee', 4, 2).ok).toBe(true)
    expect(bench.placeUnit('short-range', 4, 0).ok).toBe(true)
    const state = bench.getState()
    expect(state.units.map((u) => [u.unitType, u.col, u.row])).toEqual([
      ['melee', 4, 2],
      ['short-range', 4, 0],
    ])
  })

  // The refusal text below is the engine's own (`scenario.ts`'s `placeUnit`),
  // not a reworded local copy — occupancy and bounds are engine facts, and
  // this is what proves the check actually moved rather than merely still
  // happening to agree with a bench-side one left in place.
  it('refuses an occupied tile and an off-board tile, with the engine\'s own reason', () => {
    const bench = openBench()
    bench.placeUnit('melee', 1, 1)
    const occupied = bench.placeUnit('rogue', 1, 1)
    expect(occupied).toMatchObject({ ok: false })
    if (!occupied.ok) expect(occupied.error).toMatch(/already holds a unit/)

    const offBoard = bench.placeUnit('rogue', 99, 1)
    expect(offBoard).toMatchObject({ ok: false })
    if (!offBoard.ok) expect(offBoard.error).toMatch(/is off the board/)
  })

  it('seeds HP from the unit definition unless told otherwise', () => {
    const bench = openBench()
    bench.placeUnit('melee', 0, 0)
    bench.placeUnit('melee', 1, 0, 1)
    const [full, hurt] = bench.getState().units
    expect(full.hp).toBe(3)
    expect(hurt.hp).toBe(1)
  })
})

// dungeon-bench-setup-adoption: a bench scenario begins in `placement`, and
// setup is refused once the designer has started it — the invariant this
// change adds. Every operation's *legality* (occupancy, bounds, structure
// blocking, default HP) is already covered above and in 'structures' below;
// what belongs here is the phase gate itself.
describe('setup is a phase', () => {
  it('a fresh bench and a re-generated board both start in placement', () => {
    const bench = new BenchStore()
    expect(bench.getState().phase).toBe('placement')

    bench.newBoard(generateBoard({ cols: 6, rows: 4, preset: 'open', powerCenters: 0 }))
    expect(bench.getState().phase).toBe('placement')
  })

  it('starting the scenario moves to npc-move and is recorded on the timeline, like any other action', () => {
    const bench = openBench()
    bench.placeUnit('melee', 0, 0)
    const beforeCursor = bench.getState().timeline.cursor

    const result = bench.startScenario()
    expect(result.ok).toBe(true)
    expect(bench.getState().phase).toBe('npc-move')
    expect(bench.getState().timeline.cursor).toBe(beforeCursor + 1)
    expect(bench.getState().timeline.labels.at(-1)).toMatch(/started/i)
  })

  it('refuses to start again once already started, with the engine\'s reason', () => {
    const bench = openBench()
    bench.startScenario()

    const result = bench.startScenario()
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.error).toMatch(/already started/i)
  })

  it('refuses every setup operation once the scenario has started, changing nothing, with the engine\'s reason', () => {
    const bench = openBench()
    bench.placeUnit('melee', 0, 0)
    const id = bench.getState().units[0].id
    bench.startScenario()
    const before = bench.getState().units

    const placed = bench.placeUnit('rogue', 3, 3)
    expect(placed).toMatchObject({ ok: false })
    if (!placed.ok) expect(placed.error).toMatch(/placement/i)

    expect(bench.removeUnit(id)).toMatchObject({ ok: false })
    expect(bench.relocateUnit(id, 1, 1)).toMatchObject({ ok: false })
    expect(bench.setUnitHp(id, 1)).toMatchObject({ ok: false })
    expect(bench.clearUnits()).toMatchObject({ ok: false })
    expect(bench.placeStructure('tower', 3, 3)).toMatchObject({ ok: false })
    expect(bench.getState().units).toEqual(before)
  })

  it('stepping back to before the start reopens setup', () => {
    const bench = openBench()
    bench.placeUnit('melee', 0, 0)
    const beforeStartCursor = bench.getState().timeline.cursor
    bench.startScenario()
    expect(bench.getState().phase).toBe('npc-move')

    bench.stepTo(beforeStartCursor)
    expect(bench.getState().phase).toBe('placement')
    expect(bench.placeUnit('rogue', 3, 3)).toMatchObject({ ok: true })
  })

  // dungeon_new_board (and the browser/agent equivalents) is not gated by
  // phase at all — swapping the board discards whatever round was underway,
  // it does not edit it, so it is never refused. This is the reachable
  // exception "setup is refused once started" carves out.
  it('a new board is always accepted, even mid-round, and returns to placement', () => {
    const bench = openBench()
    bench.placeUnit('melee', 0, 0)
    bench.startScenario()
    expect(bench.getState().phase).toBe('npc-move')

    const result = bench.newBoard(generateBoard({ cols: 6, rows: 4, preset: 'open', powerCenters: 0 }))
    expect(result.ok).toBe(true)
    expect(bench.getState().phase).toBe('placement')
    expect(bench.getState().units).toHaveLength(0)
  })
})

describe('structures', () => {
  it('places a structure, moves it with its HP preserved, and removes it', () => {
    const bench = openBench()
    // A damaged structure, authored directly rather than via combat: moving and
    // removing a structure are setup operations, refused once the round has
    // started ('setup is a phase' below), and dealing the damage by attack would
    // require starting it first. (Combat actually damaging a structure by one
    // point per hit, whatever the attacker's damage, is covered independently
    // by 'the action log' below.) What this test is about — a structure's move
    // and removal, HP travelling with a move — needs none of that.
    expect(bench.placeStructure('tower', 4, 2, 4)).toMatchObject({ ok: true })
    expect(bench.getState().board.cells[2][4]).toMatchObject({ hasStructure: true, structureKind: 'tower', structureHp: 4 })

    const moved = bench.moveStructure(4, 2, 6, 2)
    expect(moved).toMatchObject({ ok: true })
    expect(bench.getState().board.cells[2][4].hasStructure).toBe(false)
    // The damage travelled with it — a damaged structure arrives just as damaged.
    expect(bench.getState().board.cells[2][6]).toMatchObject({ hasStructure: true, structureKind: 'tower', structureHp: 4 })

    expect(bench.removeStructure(6, 2)).toMatchObject({ ok: true })
    expect(bench.getState().board.cells[2][6].hasStructure).toBe(false)
  })

  it('defaults a fresh structure\'s HP by kind, and accepts an explicit one', () => {
    const bench = openBench()
    expect(bench.placeStructure('power-center', 1, 1)).toMatchObject({ ok: true })
    expect(bench.getState().board.cells[1][1].structureHp).toBe(3)

    expect(bench.placeStructure('tower', 2, 1, 2)).toMatchObject({ ok: true })
    expect(bench.getState().board.cells[1][2].structureHp).toBe(2)
  })

  it('refuses to place on an occupied or off-board tile, and to move or remove where nothing is, with the engine\'s reason', () => {
    const bench = openBench()
    bench.placeUnit('melee', 0, 0)
    expect(bench.placeStructure('tower', 0, 0)).toMatchObject({ ok: false })
    expect(bench.placeStructure('tower', 99, 0)).toMatchObject({ ok: false })

    const removed = bench.removeStructure(3, 3)
    expect(removed).toMatchObject({ ok: false })
    if (!removed.ok) expect(removed.error).toMatch(/holds no structure/)

    const moved = bench.moveStructure(3, 3, 4, 4)
    expect(moved).toMatchObject({ ok: false })
    if (!moved.ok) expect(moved.error).toMatch(/holds no structure/)
  })

  it('reach and threat account for a structure on the next read', () => {
    const bench = openBench() // 8×5 open board
    bench.placeUnit('melee', 0, 0) // move 4
    expect(bench.getState().fields.reach.pc['2,0']).toBe(1)

    expect(bench.placeStructure('tower', 2, 0)).toMatchObject({ ok: true })
    expect(bench.getState().fields.reach.pc['2,0']).toBeUndefined() // now blocked

    expect(bench.moveStructure(2, 0, 6, 4)).toMatchObject({ ok: true })
    expect(bench.getState().fields.reach.pc['2,0']).toBe(1) // reopened
  })
})

describe('playing by hand', () => {
  it('derives move options from the engine and charges the budget', () => {
    const bench = openBench()
    playerPhase(bench, [{ unitType: 'melee', col: 0, row: 0 }]) // move range 4
    const id = bench.getState().units[0].id
    bench.select(id)

    const before = bench.getState().selection!
    expect(before.remainingMove).toBe(4)
    expect(before.moveDests).toContainEqual({ col: 2, row: 0 })

    expect(bench.commitSelected('move', { col: 2, row: 0 }).ok).toBe(true)
    const after = bench.getState().selection!
    expect([after.col, after.row]).toEqual([2, 0])
    expect(after.remainingMove).toBe(2)
    expect(after.moveDests).not.toContainEqual({ col: 6, row: 0 })
  })

  it('refuses a move the engine says is out of reach', () => {
    const bench = openBench()
    playerPhase(bench, [{ unitType: 'melee', col: 0, row: 0 }])
    bench.select(bench.getState().units[0].id)

    // In the player phase deliberately, and asserting the reason: this test
    // used to run during `placement`, where the phase guard refused the move
    // before reach was ever consulted. It passed, but it would have passed
    // with the reach check deleted.
    expect(bench.commitSelected('move', { col: 7, row: 4 })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/legal move target/i),
    })
  })

  it('resolves a PC attack against an adjacent NPC for the def damage', () => {
    const bench = openBench()
    playerPhase(bench, [{ unitType: 'melee', col: 2, row: 2 }, { unitType: 'short-range', col: 3, row: 2 }])
    const [pc, npc] = bench.getState().units
    bench.select(pc.id)

    const attack = bench.getState().selection!.actions.find((a) => a.id === 'attack')!
    expect(attack.available).toBe(true)
    expect(attack.targets).toContainEqual({ col: 3, row: 2 })
    expect(bench.commitSelected('attack', { col: 3, row: 2 }).ok).toBe(true)

    const hit = bench.getState().units.find((u) => u.id === npc.id)!
    expect(hit.hp).toBe(1) // 3 HP - 2 melee damage
  })

  it('makes an attack committal, as the game does', () => {
    const bench = openBench()
    playerPhase(bench, [{ unitType: 'melee', col: 2, row: 2 }, { unitType: 'short-range', col: 3, row: 2 }])
    bench.select(bench.getState().units[0].id)
    bench.commitSelected('attack', { col: 3, row: 2 })

    const selection = bench.getState().selection!
    expect(selection.hasAttacked).toBe(true)
    expect(selection.remainingMove).toBe(0)
    expect(bench.commitSelected('move', { col: 2, row: 3 })).toMatchObject({ ok: false })
    expect(bench.commitSelected('attack', { col: 3, row: 2 })).toMatchObject({ ok: false })
    // Both actions come back unavailable with the engine's own reason, so the
    // client renders a disabled control that explains itself.
    for (const action of selection.actions) {
      expect(action.available).toBe(false)
      expect(action.reason).toMatch(/already attacked/)
    }
  })

  // dungeon-bench-guard-adoption: an enemy has no action surface — its route
  // into a round is being planned, the same seat the game's AI occupies. This
  // used to select the NPC and drive `commitSelected('attack', ...)` directly,
  // resolving damage on the spot; that is not the game's rule (the game's
  // enemy attack is always a telegraph, locked here and resolved a phase
  // later). Re-aimed onto `planEnemyByHand`, the same designer intent through
  // the game's own path: the attack locks as a telegraph and lands only after
  // the player's turn, never immediately.
  it('takes an enemy attack by planning it: telegraphed now, landing after the player\'s turn', () => {
    const bench = openBench()
    bench.placeUnit('melee', 2, 2)
    bench.placeUnit('short-range', 3, 2)
    const [pc, npc] = bench.getState().units
    bench.startScenario()

    expect(bench.planEnemyByHand(npc.id, { kind: 'stay' }, { col: 2, row: 2 }).ok).toBe(true)
    expect(bench.getState().telegraphs).toEqual([{ unitId: npc.id, targetCol: 2, targetRow: 2 }])
    expect(bench.getState().units.find((u) => u.id === pc.id)!.hp).toBe(3) // not yet landed

    bench.step() // the only enemy is now planned: phase transition into player
    bench.endPlayerTurn()
    bench.resolveTelegraphs()
    expect(bench.getState().telegraphs).toEqual([])
    expect(bench.getState().units.find((u) => u.id === pc.id)!.hp).toBe(2) // 3 - 1, landed after the player's turn
  })

  it('refuses a target outside the engine footprint', () => {
    const bench = openBench()
    playerPhase(bench, [
      { unitType: 'melee', col: 6, row: 4 },
      { unitType: 'short-range', col: 0, row: 0 },
    ])
    bench.select(bench.getState().units[0].id)

    // The actor is the PC. This test used to select the enemy and attack the
    // PC — a route that no longer exists at all, so it would now pass on the
    // enemy refusal rather than on the footprint it is named for.
    expect(bench.commitSelected('attack', { col: 0, row: 0 })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/legal attack target/i),
    })
  })

  it('plans the enemy turn: moves resolve immediately toward the objective', () => {
    // The NPC goal is a structure, not a PC — so the board needs one for the AI
    // to have anywhere to go. See board-gen's `powerCenters`.
    const bench = new BenchStore()
    // Power center lands at (4, 2) on this board; start the NPC out of its
    // 2-tile scan band so the AI has to walk rather than stand and telegraph.
    bench.newBoard(generateBoard({ cols: 8, rows: 5, preset: 'open', powerCenters: 1 }))
    bench.placeUnit('short-range', 0, 0)
    const start = bench.getState().units[0]
    bench.startScenario()

    expect(bench.planEnemyTurn().ok).toBe(true)

    const npc = bench.getState().units.find((u) => u.kind === 'npc')!
    const distance = (u: { col: number; row: number }) => Math.abs(u.col - 4) + Math.abs(u.row - 2)
    expect(distance(npc)).toBeLessThan(distance(start))
  })

  it('plans the enemy turn: the NPC stays put when there is nothing to attack', () => {
    // Documents real engine behavior rather than papering over it: NPCs walk
    // toward structures and shoot PCs that stray into range; with neither, the
    // right answer is to do nothing.
    const bench = openBench()
    bench.placeUnit('short-range', 4, 0)
    bench.startScenario()
    expect(bench.planEnemyTurn().ok).toBe(true)
    expect(bench.getState().units.find((u) => u.kind === 'npc')!.row).toBe(0)
  })

  // Regression coverage for the defect this change fixes: planning must report
  // a telegraph for an attack that has not landed. Against the old, unsplit
  // `runEnemyAi` this failed, because the attack was resolved and only
  // afterward stored as the "telegraph" the board painted — the PC had already
  // lost HP by the time the marker appeared. Keep it as a standing regression
  // check even though the round-trip test below now covers the same ground.
  it('reports a telegraph before its attack has landed, not after', () => {
    const bench = openBench()
    startedWith(bench, [{ unitType: 'melee', col: 4, row: 1 }, { unitType: 'short-range', col: 4, row: 0 }])
    bench.planEnemyTurn()
    expect(bench.getState().telegraphs).toEqual([{ unitId: expect.any(String), targetCol: 4, targetRow: 1 }])
    expect(bench.getState().units.find((u) => u.kind === 'pc')!.hp).toBe(3)
  })

  // `BenchStore.endRound` is gone (design.md, "`endRound` as a bench operation
  // is retired"): the engine ends the round as the `npc-attack` phase
  // transition, which only happens once every telegraph has resolved or been
  // skipped. There is no longer any call that could discard a pending one —
  // not a guard to test, a call that no longer exists to make.
  it('has no way to end the round while telegraphs are pending — only to resolve or abandon them', () => {
    const bench = openBench()
    startedWith(bench, [{ unitType: 'melee', col: 4, row: 1 }, { unitType: 'short-range', col: 4, row: 0 }])
    bench.planEnemyTurn()
    expect(bench.getState().telegraphs).toHaveLength(1)

    bench.endPlayerTurn()
    expect(bench.getState().phase).toBe('npc-attack')
    expect(bench.getState().telegraphs).toHaveLength(1) // still pending — nothing skipped it

    bench.resolveTelegraphs()
    expect(bench.getState().telegraphs).toEqual([])
    expect(bench.getState().phase).toBe('npc-move') // the round only ends once it's resolved
  })

  it('locks a telegraph on planning and lands it on resolving — the original assertions, split across the window', () => {
    const bench = openBench()
    startedWith(bench, [{ unitType: 'melee', col: 4, row: 1 }, { unitType: 'short-range', col: 4, row: 0 }])

    bench.planEnemyTurn()
    expect(bench.getState().telegraphs).toEqual([{ unitId: expect.any(String), targetCol: 4, targetRow: 1 }])
    expect(bench.getState().units.find((u) => u.kind === 'pc')!.hp).toBe(3) // not yet landed

    bench.endPlayerTurn()
    bench.resolveTelegraphs()
    expect(bench.getState().telegraphs).toEqual([])
    expect(bench.getState().units.find((u) => u.kind === 'pc')!.hp).toBe(2) // landed
  })

  it('resolves a telegraph against the tile it was locked onto, even after the PC that was there moves away', () => {
    const bench = openBench()
    startedWith(bench, [{ unitType: 'melee', col: 4, row: 1 }, { unitType: 'short-range', col: 4, row: 0 }])
    const pc = bench.getState().units.find((u) => u.kind === 'pc')!

    bench.planEnemyTurn()
    expect(bench.getState().telegraphs).toEqual([{ unitId: expect.any(String), targetCol: 4, targetRow: 1 }])

    bench.select(pc.id)
    expect(bench.commitSelected('move', { col: 1, row: 1 }).ok).toBe(true)

    bench.endPlayerTurn()
    bench.resolveTelegraphs()
    expect(bench.getState().telegraphs).toEqual([])
    // The telegraph landed on (4, 1), which is now empty — the PC that left is
    // unharmed at its new tile.
    expect(bench.getState().units.find((u) => u.kind === 'pc')!).toMatchObject({ col: 1, row: 1, hp: 3 })
  })

  it('skips a telegraph whose owner died inside the window instead of landing it', () => {
    const bench = openBench()
    startedWith(bench, [{ unitType: 'melee', col: 4, row: 1 }, { unitType: 'short-range', col: 4, row: 0, hp: 1 }]) // 1 HP: one melee hit kills it
    const pc = bench.getState().units.find((u) => u.kind === 'pc')!

    bench.planEnemyTurn()
    expect(bench.getState().telegraphs).toEqual([{ unitId: expect.any(String), targetCol: 4, targetRow: 1 }])

    // The designer kills the enemy inside the window instead of moving away.
    bench.select(pc.id)
    expect(bench.commitSelected('attack', { col: 4, row: 0 }).ok).toBe(true)
    expect(bench.getState().units.some((u) => u.kind === 'npc')).toBe(false)

    bench.endPlayerTurn()
    bench.resolveTelegraphs()
    expect(bench.getState().telegraphs).toEqual([])
    expect(bench.getState().units.find((u) => u.kind === 'pc')!.hp).toBe(3) // the dead enemy's attack never lands
  })

  it('ends a round and restores movement', () => {
    const bench = openBench()
    bench.placeUnit('melee', 0, 0)
    bench.startScenario()
    bench.planEnemyTurn() // no NPCs: one step returns straight to `player`
    bench.select(bench.getState().units[0].id)
    bench.commitSelected('move', { col: 3, row: 0 })
    expect(bench.getState().selection!.remainingMove).toBe(1)

    bench.endPlayerTurn()
    bench.resolveTelegraphs() // nothing pending: one step chains into the next round
    expect(bench.getState().selection!.remainingMove).toBe(4)
  })
})

describe('the telegraph window', () => {
  // Every `advance` is now its own frame (design.md, "One frame per engine
  // step, including inside composites"), so the number of undos between "just
  // resolved" and "still pending" is no longer fixed at one — `planEnemyTurn`
  // alone can commit several. Scrub by captured cursor instead of counting
  // `undo()` calls, which is what the designer's scrub bar does too.
  it('is a scrubbable interval: scrubbing back returns to the pending board, and further back to before the enemy turn', () => {
    const bench = openBench()
    bench.placeUnit('melee', 4, 1)
    bench.placeUnit('short-range', 4, 0)
    bench.startScenario()
    const beforePlanningCursor = bench.getState().timeline.cursor
    const beforeUnits = bench.getState().units

    bench.planEnemyTurn()
    bench.endPlayerTurn()
    const pendingCursor = bench.getState().timeline.cursor
    const pendingUnits = bench.getState().units
    const pendingTelegraphs = bench.getState().telegraphs
    expect(pendingTelegraphs.length).toBeGreaterThan(0)

    bench.resolveTelegraphs()
    expect(bench.getState().telegraphs).toEqual([])

    bench.stepTo(pendingCursor) // scrub back into the window
    expect(bench.getState().units).toEqual(pendingUnits)
    expect(bench.getState().telegraphs).toEqual(pendingTelegraphs)

    bench.stepTo(beforePlanningCursor) // scrub back to before the enemy turn was planned
    expect(bench.getState().units).toEqual(beforeUnits)
    expect(bench.getState().telegraphs).toEqual([])
  })

  it('commits one frame per enemy planned, not one for the whole composite', () => {
    const bench = new BenchStore()
    bench.newBoard(generateBoard({ cols: 8, rows: 5, preset: 'open', powerCenters: 1 }))
    bench.placeUnit('short-range', 0, 0)
    bench.placeUnit('short-range', 7, 3) // not the bottom row, or the AI reads it as leaving the board
    bench.startScenario()
    const beforePlanning = bench.getState().timeline.cursor

    bench.planEnemyTurn()
    const afterPlanning = bench.getState().timeline.cursor
    // Two enemies planned plus the transition into `player`: at least three
    // steps happened, each its own frame — not one for the whole composite.
    expect(afterPlanning).toBeGreaterThanOrEqual(beforePlanning + 3)

    bench.stepTo(afterPlanning - 1) // one enemy planned, the other not yet reached
    const midPlan = bench.getState().units.filter((u) => u.kind === 'npc')
    expect(midPlan).toHaveLength(2) // both still on the board — planning moves, never removes
  })
})

describe('enemy turn refusals', () => {
  // Previously a bench-side guard refusing outright ("No NPCs on the board").
  // That guard is deleted (task 2.5) and not replaced: the engine has no
  // concept of "no enemies", only "no enemy step left to take" — with zero
  // NPCs, the `npc-move` phase has nothing to plan and the round simply moves
  // straight through to `player`, same as it would once every real NPC had
  // been planned. Forwarding the engine verbatim means forwarding this too.
  it('planning with no NPCs on the board succeeds trivially and still advances the phase', () => {
    const bench = openBench()
    bench.placeUnit('melee', 0, 0)
    bench.startScenario()
    expect(bench.getState().phase).toBe('npc-move')

    const result = bench.planEnemyTurn()
    expect(result.ok).toBe(true)
    expect(bench.getState().telegraphs).toEqual([])
    expect(bench.getState().phase).toBe('player')
  })

  it('refuses to plan again once the round has moved past npc-move', () => {
    const bench = openBench()
    startedWith(bench, [{ unitType: 'melee', col: 4, row: 1 }, { unitType: 'short-range', col: 4, row: 0 }])
    bench.planEnemyTurn()
    expect(bench.getState().phase).toBe('player')

    const result = bench.planEnemyTurn()
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.error).toMatch(/phase/i)
    // The refusal changed nothing: still exactly one telegraph pending.
    expect(bench.getState().telegraphs).toHaveLength(1)
  })

  it('refuses to resolve when the round is not awaiting telegraph resolution', () => {
    const bench = openBench()
    bench.placeUnit('melee', 4, 1)
    bench.placeUnit('short-range', 4, 0)
    const result = bench.resolveTelegraphs()
    expect(result).toMatchObject({ ok: false })
    expect(bench.getState().telegraphs).toEqual([])
  })
})

describe('refusals come from the engine, not a reworded copy', () => {
  it('step forwards advance()\'s exact reason for refusing outside an enemy phase', () => {
    const bench = openBench()
    bench.placeUnit('melee', 0, 0) // no NPCs: planEnemyTurn lands straight in `player`
    bench.startScenario()
    bench.planEnemyTurn()
    expect(bench.getState().phase).toBe('player')

    const result = bench.step()
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) {
      // The sequencer's own wording (sequencer.ts, `advance`) — not
      // paraphrased or re-derived here.
      expect(result.error).toBe(
        'The round is not in an enemy phase — there is no enemy step for the engine to advance.',
      )
    }
  })
})

describe('the engine sequences the round end to end', () => {
  it('runs a full round: enemies plan one at a time, phase moves to player, ending the turn moves to npc-attack, telegraphs resolve, and the round chains into the next npc-move', () => {
    const bench = new BenchStore()
    bench.newBoard(generateBoard({ cols: 8, rows: 5, preset: 'open', powerCenters: 1 }))
    bench.placeUnit('melee', 0, 0)
    bench.placeUnit('short-range', 4, 1)
    bench.placeUnit('long-range', 4, 3)
    bench.startScenario()
    expect(bench.getState().phase).toBe('npc-move')

    expect(bench.planEnemyTurn().ok).toBe(true)
    expect(bench.getState().phase).toBe('player')
    expect(bench.getState().units.filter((u) => u.kind === 'npc')).toHaveLength(2) // planning moves, never removes

    expect(bench.endPlayerTurn().ok).toBe(true)
    expect(bench.getState().phase).toBe('npc-attack')

    expect(bench.resolveTelegraphs().ok).toBe(true)
    expect(bench.getState().telegraphs).toEqual([])
    expect(bench.getState().phase).toBe('npc-move') // chained straight into the next round

    // The round really did end: the same enemies can be planned again.
    expect(bench.planEnemyTurn().ok).toBe(true)
    expect(bench.getState().phase).toBe('player')
  })

  it('reports the next step from the engine, matches what step() then does, and rereading it changes nothing', () => {
    const bench = openBench()
    bench.placeUnit('melee', 4, 1)
    bench.placeUnit('short-range', 4, 0)
    bench.startScenario()

    const before = bench.getState()
    const predicted = before.nextStep
    expect(predicted?.kind).toBe('plan-enemy')
    if (predicted?.kind !== 'plan-enemy') throw new Error('unreachable — asserted above')

    // Reading it again changes nothing.
    expect(bench.getState().nextStep).toEqual(predicted)
    expect(bench.getState().units).toEqual(before.units)
    expect(bench.getState().timeline.cursor).toBe(before.timeline.cursor)

    bench.step()
    expect(bench.getState().log.at(-1)).toContain(predicted.unitId)
  })
})

describe('stepping back', () => {
  it('reverses a move', () => {
    const bench = openBench()
    playerPhase(bench, [{ unitType: 'melee', col: 0, row: 0 }])
    bench.select(bench.getState().units[0].id)
    bench.commitSelected('move', { col: 2, row: 0 })
    bench.undo()
    const selection = bench.getState().selection!
    expect([selection.col, selection.row]).toEqual([0, 0])
    expect(selection.remainingMove).toBe(4)
  })

  it('reverses an attack, which the engine undo alone cannot', () => {
    const bench = openBench()
    playerPhase(bench, [{ unitType: 'melee', col: 2, row: 2 }, { unitType: 'short-range', col: 3, row: 2 }])
    const npcId = bench.getState().units[1].id
    bench.select(bench.getState().units[0].id)
    bench.commitSelected('attack', { col: 3, row: 2 })
    expect(bench.getState().units.find((u) => u.id === npcId)!.hp).toBe(1)

    bench.undo()
    expect(bench.getState().units.find((u) => u.id === npcId)!.hp).toBe(3)
    expect(bench.getState().selection!.hasAttacked).toBe(false)
  })

  it('reports when there is nothing to step back to', () => {
    const bench = new BenchStore()
    expect(bench.undo()).toMatchObject({ ok: false })
  })
})

describe('session-scoped definition tweaks', () => {
  it('changes what the engine considers reachable, immediately', () => {
    const bench = openBench()
    bench.placeUnit('melee', 0, 0)
    bench.select(bench.getState().units[0].id)
    expect(bench.getState().selection!.moveDests).not.toContainEqual({ col: 6, row: 0 })

    expect(bench.tweakDef('melee', { moveRange: 7 }).ok).toBe(true)
    expect(bench.getState().selection!.remainingMove).toBe(7)
    expect(bench.getState().selection!.moveDests).toContainEqual({ col: 6, row: 0 })
  })

  it('changes damage the next attack deals', () => {
    const bench = openBench()
    playerPhase(bench, [{ unitType: 'melee', col: 2, row: 2 }, { unitType: 'short-range', col: 3, row: 2, hp: 9 }])
    bench.tweakDef('melee', { damage: 5 })
    bench.select(bench.getState().units[0].id)
    bench.commitSelected('attack', { col: 3, row: 2 })
    expect(bench.getState().units[1].hp).toBe(4)
  })

  it('resets back to the shipped numbers', () => {
    const bench = openBench()
    bench.tweakDef('melee', { moveRange: 9 })
    expect(bench.getState().defs.melee.movement.range).toBe(9)
    bench.resetDefs()
    expect(bench.getState().defs.melee.movement.range).toBe(4)
  })

  it('does not leak tweaks between benches sharing the engine singletons', () => {
    const a = openBench()
    const b = openBench()
    a.tweakDef('melee', { moveRange: 9 })
    expect(b.getState().defs.melee.movement.range).toBe(4)
    expect(a.getState().defs.melee.movement.range).toBe(9)
  })

  // A definition is not board state (proposal.md, "Changing a unit
  // archetype's numbers for the session is not a setup operation"), so unlike
  // every setup operation above, this stays available after the scenario has
  // started — the one deliberate exception to "setup is refused mid-round".
  it('is still accepted while the round is in progress, unlike a setup operation', () => {
    const bench = openBench()
    bench.placeUnit('melee', 0, 0)
    bench.startScenario()
    expect(bench.getState().phase).toBe('npc-move')

    const result = bench.tweakDef('melee', { moveRange: 7 })
    expect(result.ok).toBe(true)
    expect(bench.getState().defs.melee.movement.range).toBe(7)

    // A setup operation, by contrast, is refused right now.
    expect(bench.placeUnit('rogue', 3, 3)).toMatchObject({ ok: false })
  })
})

describe('board isolation', () => {
  it('keeps each bench on its own board', () => {
    const small = new BenchStore()
    small.newBoard(generateBoard({ cols: 6, rows: 4, preset: 'open' }))
    const large = new BenchStore()
    large.newBoard(generateBoard({ cols: 16, rows: 9, preset: 'open' }))

    expect(small.getState().board.cols).toBe(6)
    expect(large.getState().board.cols).toBe(16)
    expect(small.getState().board.cols).toBe(6)
  })
})

describe('reach and threat', () => {
  it('reports where each side can move', () => {
    const bench = openBench()
    bench.placeUnit('melee', 0, 0) // move 4
    bench.placeUnit('short-range', 7, 4) // move 3

    const { reach } = bench.getState().fields
    expect(reach.pc['2,0']).toBe(1)
    expect(reach.npc['2,0']).toBeUndefined()
    expect(reach.npc['5,4']).toBe(1)
  })

  it('threatens tiles a unit could reach and then attack', () => {
    const bench = openBench()
    bench.placeUnit('melee', 0, 0) // move 4, attack range 1

    const { threat } = bench.getState().fields
    // Standing still it can hit (1,0); after moving four tiles it can hit (5,0).
    expect(threat.pc['1,0']).toBe(1)
    expect(threat.pc['5,0']).toBe(1)
    expect(threat.pc['7,4']).toBeUndefined()
  })

  it('counts overlapping threat, so a doubly-covered tile reads differently', () => {
    const bench = openBench()
    bench.placeUnit('short-range', 0, 0)
    bench.placeUnit('short-range', 2, 0)

    const { threat } = bench.getState().fields
    expect(threat.npc['1,0']).toBe(2)
  })

  // A player unit demonstrates this now: an enemy has no action surface to
  // drive it through (dungeon-sequencer-guards).
  it('drops a unit out of both fields once it has attacked', () => {
    const bench = openBench()
    playerPhase(bench, [{ unitType: 'melee', col: 2, row: 2 }, { unitType: 'short-range', col: 3, row: 2 }])
    bench.select(bench.getState().units[0].id)
    bench.commitSelected('attack', { col: 3, row: 2 })

    const { reach, threat } = bench.getState().fields
    expect(Object.keys(reach.pc)).toHaveLength(0)
    expect(Object.keys(threat.pc)).toHaveLength(0)
  })

  it('grows the moment a definition changes', () => {
    const bench = openBench()
    bench.placeUnit('melee', 0, 0)
    const before = Object.keys(bench.getState().fields.threat.pc).length

    bench.tweakDef('melee', { moveRange: 6 })
    expect(Object.keys(bench.getState().fields.threat.pc).length).toBeGreaterThan(before)
  })

  it('contracts when attack range is cut, without the unit moving', () => {
    // The ranger's shipped line attack reaches the board edge, so its threat
    // already covers everything an 8x5 board has; nerfing the range is what makes
    // the field visibly move.
    const bench = openBench()
    bench.placeUnit('ranger', 0, 2)
    const before = Object.keys(bench.getState().fields.threat.pc).length

    bench.tweakDef('ranger', { minRange: 1, maxRange: 2 })
    expect(Object.keys(bench.getState().fields.threat.pc).length).toBeLessThan(before)
  })
})

describe('fields as rows', () => {
  it('draws a threat layer the way the agent reads it', () => {
    const bench = new BenchStore()
    bench.newBoard(generateBoard({ cols: 5, rows: 3, preset: 'open', powerCenters: 0 }))
    bench.placeUnit('short-range', 0, 0)
    bench.tweakDef('short-range', { moveRange: 0 })

    // Move 0, targeting band 1-2 along the cardinals. Its attack *resolves* on a
    // single tile at range 1, but its AI scans to range 2 and will shoot a PC
    // standing there — so threat covers the band, not just the footprint.
    expect(bench.fieldRows('npc', 'threat')).toEqual([
      '.11..',
      '1....',
      '1....',
    ])
    expect(bench.fieldRows('pc', 'threat')).toEqual(['.....', '.....', '.....'])
  })
})

describe('threat for single-tile attackers', () => {
  it('covers what a long-range enemy can actually shoot, not just where its shot lands', () => {
    const bench = new BenchStore()
    bench.newBoard(generateBoard({ cols: 7, rows: 3, preset: 'open', powerCenters: 0 }))
    bench.placeUnit('long-range', 0, 1)
    bench.tweakDef('long-range', { moveRange: 0 })

    // Its attack resolves on one tile, but its AI scans from range 2 outward, so
    // standing anywhere along the row from two tiles away is unsafe.
    const rows = bench.fieldRows('npc', 'threat')
    expect(rows[1]).toBe('..11111')
  })

  it('still uses the exact footprint for a shape that covers several tiles', () => {
    const bench = new BenchStore()
    bench.newBoard(generateBoard({ cols: 7, rows: 5, preset: 'open', powerCenters: 0 }))
    bench.placeUnit('magic-user', 3, 2) // plus-shaped AoE centred at range 2
    bench.tweakDef('magic-user', { moveRange: 0 })

    const rows = bench.fieldRows('pc', 'threat')
    // Aiming left centres the cross on (1,2), so its arms cover (0,2) and (2,2)
    // — the tile it "shoots over" is still caught by the blast. Only the tile it
    // stands on is untouched.
    expect(rows[2]).toBe('111.111')
  })
})

describe('round records follow the units they name', () => {
  // Found by driving the bench in a browser: clearing units left telegraphs
  // behind for enemies that no longer existed, so the UI listed a phantom as
  // pending and its Amend button refused with "No unit ... on the board".
  // Reproducing that exact scenario is no longer possible — clearUnits and
  // removeUnit are setup operations now, refused once the round has started,
  // so a designer can no longer clear or remove a unit while its telegraph is
  // pending in the first place (this change, "Setup is refused once the
  // scenario has started"). What is left to assert is that refusal, and that
  // it leaves the pending telegraph untouched. `withoutDepartedUnits` itself
  // stays reachable through a bookmark or timeline jump whose units don't
  // match its own round records — see its updated comment in bench-store.ts.
  it('refuses to clear units while enemy telegraphs are pending — clearing is setup-only', () => {
    const bench = openBench()
    startedWith(bench, [{ unitType: 'melee', col: 4, row: 1 }, { unitType: 'short-range', col: 4, row: 0 }])
    bench.planEnemyTurn()
    expect(bench.getState().telegraphs.length).toBeGreaterThan(0)

    const result = bench.clearUnits()
    expect(result).toMatchObject({ ok: false })
    expect(bench.getState().telegraphs.length).toBeGreaterThan(0) // unchanged
  })

  it('refuses to remove a unit while its enemy telegraph is pending — removing is setup-only', () => {
    const bench = openBench()
    startedWith(bench, [
      { unitType: 'melee', col: 4, row: 1 },
      { unitType: 'melee', col: 7, row: 1 },
      { unitType: 'short-range', col: 4, row: 0 },
      { unitType: 'short-range', col: 7, row: 0 },
    ])
    bench.planEnemyTurn()
    const npcs = bench.getState().units.filter((u) => u.kind === 'npc')
    expect(bench.getState().telegraphs).toHaveLength(2)

    const result = bench.removeUnit(npcs[0].id)
    expect(result).toMatchObject({ ok: false })
    expect(bench.getState().telegraphs).toHaveLength(2) // unchanged
  })

  it('does not report a telegraph whose owner died inside the window', () => {
    const bench = openBench()
    startedWith(bench, [{ unitType: 'melee', col: 4, row: 1 }, { unitType: 'short-range', col: 4, row: 2, hp: 1 }]) // 1 HP — one melee hit kills it
    bench.planEnemyTurn()
    expect(bench.getState().telegraphs).toHaveLength(1)

    const pc = bench.getState().units.find((u) => u.kind === 'pc')!
    bench.select(pc.id)
    bench.commitSelected('attack', { col: 4, row: 2 })

    // The engine will skip this telegraph at resolution, so reporting it as
    // pending would promise an attack that can never land.
    expect(bench.getState().telegraphs).toEqual([])
  })
})

describe('the timeline', () => {
  it('records every action as a frame, labelled with what produced it', () => {
    const bench = openBench()
    playerPhase(bench, [{ unitType: 'melee', col: 0, row: 0 }])
    bench.select(bench.getState().units[0].id)
    bench.commitSelected('move', { col: 2, row: 0 })

    const { timeline } = bench.getState()
    expect(timeline.cursor).toBe(timeline.labels.length - 1)
    expect(timeline.labels[0]).toMatch(/^Board /)
    expect(timeline.labels.at(-1)).toMatch(/moved to \(2, 0\)/)
  })

  it('steps back and forward again', () => {
    const bench = openBench()
    playerPhase(bench, [{ unitType: 'melee', col: 0, row: 0 }])
    bench.select(bench.getState().units[0].id)
    bench.commitSelected('move', { col: 2, row: 0 })

    expect(bench.undo().ok).toBe(true)
    expect(bench.getState().units[0]).toMatchObject({ col: 0, row: 0 })
    expect(bench.getState().canRedo).toBe(true)

    expect(bench.redo().ok).toBe(true)
    expect(bench.getState().units[0]).toMatchObject({ col: 2, row: 0 })
    expect(bench.getState().canRedo).toBe(false)
  })

  it('scrubs to any point in the session', () => {
    const bench = openBench()
    bench.placeUnit('melee', 0, 0)
    bench.placeUnit('short-range', 5, 0)
    bench.select(bench.getState().units[0].id)
    bench.commitSelected('move', { col: 3, row: 0 })

    // Frames: 0 the bench's first board, 1 this board, 2 melee placed, 3 the
    // enemy placed, 4 the move. Selecting is not an action and makes no frame.
    expect(bench.stepTo(2).ok).toBe(true)
    expect(bench.getState().units).toHaveLength(1)

    expect(bench.stepTo(1).ok).toBe(true)
    expect(bench.getState().units).toHaveLength(0)

    expect(bench.stepTo(99)).toMatchObject({ ok: false })
  })

  it('discards the abandoned line when the designer acts after stepping back', () => {
    const bench = openBench()
    playerPhase(bench, [{ unitType: 'melee', col: 0, row: 0 }])
    bench.select(bench.getState().units[0].id)
    bench.commitSelected('move', { col: 2, row: 0 })
    bench.undo()

    bench.commitSelected('move', { col: 0, row: 2 }) // a different line
    expect(bench.getState().canRedo).toBe(false)
    expect(bench.getState().units[0]).toMatchObject({ col: 0, row: 2 })
  })

  it('takes the board and the definitions back with it', () => {
    const bench = openBench()
    bench.placeUnit('melee', 1, 1)
    bench.tweakDef('melee', { moveRange: 9 })
    bench.newBoard(generateBoard({ cols: 5, rows: 5, preset: 'open', powerCenters: 0 }))

    expect(bench.getState().board.cols).toBe(5)
    bench.undo() // back before the new board
    expect(bench.getState().board.cols).toBe(8)
    expect(bench.getState().defs.melee.movement.range).toBe(9)

    bench.undo() // back before the definition change
    expect(bench.getState().defs.melee.movement.range).toBe(4)
  })

  it('reports the ends of the timeline rather than running off them', () => {
    const bench = new BenchStore()
    expect(bench.undo()).toMatchObject({ ok: false })
    expect(bench.redo()).toMatchObject({ ok: false })
    expect(bench.getState().canUndo).toBe(false)
    expect(bench.getState().canRedo).toBe(false)
  })
})

describe('details that bite', () => {
  it('keeps ids unique when placing after scrubbing back', () => {
    const bench = openBench()
    bench.placeUnit('melee', 0, 0)
    bench.placeUnit('melee', 1, 0)
    bench.undo()

    bench.placeUnit('melee', 2, 0)
    const ids = bench.getState().units.map((u) => u.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('will not park a unit on a structure during setup, with the engine\'s own reason', () => {
    const bench = new BenchStore()
    bench.newBoard(boardFromRows(['.....', '..P..', '.....']))
    bench.placeUnit('melee', 0, 0)
    const id = bench.getState().units[0].id

    const relocated = bench.relocateUnit(id, 2, 1)
    expect(relocated).toMatchObject({ ok: false })
    if (!relocated.ok) expect(relocated.error).toMatch(/holds a structure/)

    const placed = bench.placeUnit('rogue', 2, 1)
    expect(placed).toMatchObject({ ok: false })
    if (!placed.ok) expect(placed.error).toMatch(/holds a structure/)
  })

  it('reads fields against its own board when another bench is live', () => {
    // The engine's board store is a process global, so a second bench moves it.
    // A *smaller* other board is what exposes it: reach is bounded by the
    // engine's idea of the board, so without re-pointing it first, this bench's
    // melee would appear unable to walk past column 2.
    const bench = openBench()
    bench.placeUnit('melee', 0, 0) // move 4 on an 8x5 board
    expect(bench.fieldRows('pc', 'reach')[0]).toBe('.1111...')

    const other = new BenchStore()
    other.newBoard(generateBoard({ cols: 3, rows: 3, preset: 'open', powerCenters: 0 }))
    other.getState()

    expect(bench.fieldRows('pc', 'reach')[0]).toBe('.1111...')
  })
})

describe('the action log', () => {
  it('reports a structure taking a hit, not "nothing was hit"', () => {
    const bench = new BenchStore()
    bench.newBoard(boardFromRows(['.....', '..P..', '.....']))
    bench.placeUnit('melee', 1, 1)
    bench.startScenario()
    bench.planEnemyTurn() // no NPCs: one step returns straight to `player`
    bench.select(bench.getState().units[0].id)
    bench.commitSelected('attack', { col: 2, row: 1 })

    // Structures take one point per hit whatever the attacker's damage.
    expect(bench.getState().log.at(-1)).toMatch(/power-center at \(2, 1\) 3→2 HP/)
  })

  it('reports a structure being levelled', () => {
    const bench = new BenchStore()
    bench.newBoard(boardFromRows(['.....', '..P..', '.....']))
    bench.placeUnit('melee', 1, 1)
    bench.startScenario()
    const id = bench.getState().units[0].id
    for (let i = 0; i < 3; i++) {
      bench.planEnemyTurn() // no NPCs: one step returns straight to `player`
      bench.select(id)
      bench.commitSelected('attack', { col: 2, row: 1 })
      bench.endPlayerTurn()
      bench.resolveTelegraphs() // nothing pending: one step chains into the next round
    }
    expect(bench.getState().log.some((line) => /levelled/.test(line))).toBe(true)
  })

  it('still reports unit damage and deaths', () => {
    const bench = openBench()
    playerPhase(bench, [{ unitType: 'melee', col: 2, row: 2 }, { unitType: 'short-range', col: 3, row: 2, hp: 1 }])
    bench.select(bench.getState().units[0].id)
    bench.commitSelected('attack', { col: 3, row: 2 })
    expect(bench.getState().log.at(-1)).toMatch(/destroyed/)
  })
})

describe('the board the agent reads', () => {
  it('uses the same alphabet the tools document and boardFromRows accepts', () => {
    const rows = ['..f..', 'w.P.s', '..T..']
    const bench = new BenchStore()
    bench.newBoard(boardFromRows(rows))

    expect(bench.boardRows()).toEqual(rows)
  })

  it('round-trips: a board it reads is a board it could hand back', () => {
    const bench = new BenchStore()
    bench.newBoard(generateBoard({ cols: 9, rows: 6, preset: 'scattered', seed: 7 }))
    const asText = bench.boardRows()

    const echoed = new BenchStore()
    echoed.newBoard(boardFromRows(asText))
    expect(echoed.boardRows()).toEqual(asText)
  })
})

describe('the engine decides what a unit may do', () => {
  const sel = (bench: BenchStore) => bench.getState().selection!
  const action = (bench: BenchStore, id: 'move' | 'attack') =>
    sel(bench).actions.find((a) => a.id === id)!

  it('offers both actions to a unit that has not acted', () => {
    const bench = openBench()
    playerPhase(bench, [{ unitType: 'melee', col: 2, row: 2 }])
    bench.select(bench.getState().units[0].id)

    expect(action(bench, 'move').available).toBe(true)
    expect(action(bench, 'attack').available).toBe(true)
    expect(action(bench, 'move').targets.length).toBeGreaterThan(0)
  })

  it('keeps the attack when movement runs out, and says why the move is gone', () => {
    const bench = openBench()
    playerPhase(bench, [{ unitType: 'melee', col: 2, row: 2 }])
    const id = bench.getState().units[0].id
    bench.select(id)
    // Melee moves 4; spend it all in one step across the open board.
    expect(bench.commitSelected('move', { col: 6, row: 2 }).ok).toBe(true)

    expect(sel(bench).remainingMove).toBe(0)
    expect(action(bench, 'move').available).toBe(false)
    expect(action(bench, 'move').reason).toMatch(/no movement left/)
    expect(action(bench, 'attack').available).toBe(true)
  })
})

describe('aiming is by tile, never by direction', () => {
  it('offers an area attack its off-axis tiles and resolves the cross containing one', () => {
    const bench = openBench()
    // The up-cross from (2,2) centres on (2,0) and covers (1,0) and (3,0).
    playerPhase(bench, [
      { unitType: 'magic-user', col: 2, row: 2 },
      { unitType: 'short-range', col: 1, row: 0 },
      { unitType: 'short-range', col: 2, row: 0 },
    ])
    const [, offAxis, centre] = bench.getState().units
    bench.select(bench.getState().units[0].id)

    const targets = bench.getState().selection!.actions.find((a) => a.id === 'attack')!.targets
    expect(targets).toContainEqual({ col: 1, row: 0 })

    // Aiming at the off-axis arm resolves the whole cross — the centre is hit too,
    // which is the case a direction-only control could never express.
    expect(bench.commitSelected('attack', { col: 1, row: 0 }).ok).toBe(true)
    const after = bench.getState().units
    expect(after.find((u) => u.id === offAxis.id)!.hp).toBe(2)
    expect(after.find((u) => u.id === centre.id)!.hp).toBe(2)
  })

  it('refuses an aligned tile beyond reach and damages nothing', () => {
    const bench = openBench()
    bench.placeUnit('melee', 2, 2)
    bench.placeUnit('short-range', 2, 1)
    const npc = bench.getState().units[1]
    bench.select(bench.getState().units[0].id)

    // Straight up but three tiles away: the melee reaches one. The derivation
    // this replaces would have struck the adjacent enemy instead.
    expect(bench.commitSelected('attack', { col: 2, row: 4 })).toMatchObject({ ok: false })
    expect(bench.getState().units.find((u) => u.id === npc.id)!.hp).toBe(3)
  })

  // dungeon-bench-guard-adoption: the route this guarded — driving an enemy's
  // second attack through the action surface in the same round — is gone. What
  // is left to assert is the refusal itself: an enemy has no action surface at
  // all, in any phase (dungeon-sequencer-guards).
  it('refuses to drive an enemy through the action surface, carrying the engine\'s reason', () => {
    const bench = openBench()
    bench.placeUnit('melee', 2, 2)
    bench.placeUnit('short-range', 3, 2)
    const npc = bench.getState().units[1]
    bench.select(npc.id)

    const attack = bench.getState().selection!.actions.find((a) => a.id === 'attack')!
    expect(attack.available).toBe(false)
    expect(attack.reason).toMatch(/takes its turn by being planned/)
    expect(bench.commitSelected('attack', { col: 2, row: 2 })).toMatchObject({ ok: false })
  })
})

describe('previewing an action', () => {
  it('reports the damage without dealing it', () => {
    const bench = openBench()
    bench.placeUnit('melee', 2, 2)
    bench.placeUnit('short-range', 3, 2)
    bench.select(bench.getState().units[0].id)

    const preview = bench.previewSelected('attack', { col: 3, row: 2 })!
    expect(preview.hitsNothing).toBe(false)
    expect(preview.effects[0]).toMatchObject({ kind: 'damage', amount: 2 })
    // The board is untouched — a preview is a question, not an action.
    expect(bench.getState().units[1].hp).toBe(3)
  })

  it('says plainly when an attack would accomplish nothing', () => {
    const bench = openBench()
    playerPhase(bench, [{ unitType: 'melee', col: 2, row: 2 }])
    bench.select(bench.getState().units[0].id)

    const preview = bench.previewSelected('attack', { col: 3, row: 2 })!
    expect(preview.hitsNothing).toBe(true)
    // Still legal: an attack may be aimed for reasons other than damage.
    expect(bench.commitSelected('attack', { col: 3, row: 2 }).ok).toBe(true)
  })
})

describe('what a unit can hit accounts for blocking', () => {
  // The approximation this replaces ignored blocking and said so, because the
  // engine's targeting walk was private. It no longer is.
  //
  // Read off `npcPlannableAttacks` rather than the action surface: an enemy has
  // no action surface of its own (dungeon-sequencer-guards), so its targets are
  // no longer available through `selection.actions`. `plannableAttacks` is the
  // engine query the designer's own enemy-planning flow uses, and it shares the
  // same blocking-aware scan (`reachableAttackTiles`) `availableActions` used
  // to expose here directly.
  it('stops the offered targets at the first blocker', () => {
    const bench = openBench()
    // long-range scans from range 2 to the board edge; the melee stands in the way.
    bench.placeUnit('long-range', 0, 2)
    bench.placeUnit('melee', 2, 2)
    const npc = bench.getState().units[0]

    const targets = bench.npcPlannableAttacks(npc.id, { kind: 'stay' })
    expect(targets).toContainEqual({ col: 2, row: 2 }) // the blocker itself
    expect(targets).not.toContainEqual({ col: 3, row: 2 }) // nothing behind it
    expect(targets).not.toContainEqual({ col: 4, row: 2 })
  })

  // Worth stating, because it looks like a bug until you see why: the threat
  // field unions every tile a unit could attack *after moving*, so a mobile unit
  // still threatens past a blocker it can simply walk around. Blocking narrows
  // what it can hit from one spot, not what it threatens over a whole turn.
  it('still threatens past a blocker a mobile unit could walk around', () => {
    const bench = openBench()
    bench.placeUnit('long-range', 0, 2)
    bench.placeUnit('melee', 2, 2)

    expect(bench.fieldRows('npc', 'threat')[2][4]).not.toBe('.')
  })
})

describe('changing a maximum moves units already on the board', () => {
  it('heals them when the maximum rises', () => {
    const bench = openBench()
    bench.placeUnit('melee', 2, 2, 2)
    bench.tweakDef('melee', { maxHp: 5 })
    expect(bench.getState().units[0].hp).toBe(4)
  })

  it('wounds but never removes them when it falls', () => {
    const bench = openBench()
    bench.placeUnit('melee', 2, 2, 1)
    bench.tweakDef('melee', { maxHp: 1 })
    expect(bench.getState().units).toHaveLength(1)
    expect(bench.getState().units[0].hp).toBe(1)
  })
})

// dungeon-bench-enemy-planning: the designer taking the seat the AI occupies
// in the game — planning an enemy's turn by hand, mixing that with the AI,
// and retargeting a locked telegraph retroactively.
describe('the designer plans an enemy turn by hand', () => {
  it('exposes legal destinations and, for a prospective one, legal attack tiles', () => {
    const bench = openBench()
    bench.placeUnit('melee', 4, 1)
    bench.placeUnit('short-range', 4, 0) // movement 3, attack band 1-2
    const npc = bench.getState().units.find((u) => u.kind === 'npc')!

    expect(bench.npcMoveDests(npc.id)).not.toContainEqual({ col: 4, row: 0 }) // never its own tile
    expect(bench.npcMoveDests(npc.id)).toContainEqual({ col: 1, row: 0 })

    // Staying put, the melee at (4,1) is one tile away — within the 1-2 band.
    expect(bench.npcPlannableAttacks(npc.id, { kind: 'stay' })).toContainEqual({ col: 4, row: 1 })
    // Moved to (1, 0), the melee is three tiles away — out of range from there.
    expect(bench.npcPlannableAttacks(npc.id, { kind: 'move', toCol: 1, toRow: 0 })).not.toContainEqual({ col: 4, row: 1 })
  })

  it('plans a move-and-attack turn, locking a telegraph rather than resolving it', () => {
    const bench = openBench()
    bench.placeUnit('melee', 4, 1)
    bench.placeUnit('short-range', 4, 0)
    const pc = bench.getState().units.find((u) => u.kind === 'pc')!
    const npc = bench.getState().units.find((u) => u.kind === 'npc')!

    const result = bench.planEnemyByHand(npc.id, { kind: 'stay' }, { col: 4, row: 1 })
    expect(result.ok).toBe(true)
    expect(bench.getState().telegraphs).toEqual([{ unitId: npc.id, targetCol: 4, targetRow: 1 }])
    expect(bench.getState().units.find((u) => u.id === pc.id)!.hp).toBe(3) // not yet landed
    expect(bench.getState().unplannedNpcs).toEqual([])
  })

  it('plans a move with no attack at all', () => {
    const bench = openBench()
    bench.placeUnit('short-range', 0, 0)
    const npc = bench.getState().units[0]

    expect(bench.planEnemyByHand(npc.id, { kind: 'move', toCol: 2, toRow: 0 }).ok).toBe(true)
    expect(bench.getState().units[0]).toMatchObject({ col: 2, row: 0 })
    expect(bench.getState().telegraphs).toEqual([])
  })

  it('accounts for a hand-planned enemy already standing in its new tile when planning the next', () => {
    const bench = openBench()
    bench.placeUnit('short-range', 0, 0) // movement 3
    bench.placeUnit('short-range', 4, 0) // movement 3
    const [a, b] = bench.getState().units

    expect(bench.npcMoveDests(b.id)).toContainEqual({ col: 3, row: 0 })

    expect(bench.planEnemyByHand(a.id, { kind: 'move', toCol: 3, toRow: 0 }).ok).toBe(true)
    expect(bench.getState().units.find((u) => u.id === a.id)).toMatchObject({ col: 3, row: 0 })

    // (3, 0) is now occupied by the enemy just planned — no longer offered to the next.
    expect(bench.npcMoveDests(b.id)).not.toContainEqual({ col: 3, row: 0 })
  })

  it('accepts every enemy holding position — a plan the AI would never choose', () => {
    const bench = openBench()
    startedWith(bench, [{ unitType: 'short-range', col: 0, row: 0 }, { unitType: 'long-range', col: 7, row: 4 }])
    const npcs = bench.getState().units.filter((u) => u.kind === 'npc')
    const before = npcs.map((u) => ({ col: u.col, row: u.row }))

    for (const npc of npcs) {
      expect(bench.planEnemyByHand(npc.id, { kind: 'stay' }).ok).toBe(true)
    }

    expect(bench.getState().unplannedNpcs).toEqual([])
    expect(bench.getState().telegraphs).toEqual([])
    expect(bench.getState().units.filter((u) => u.kind === 'npc').map((u) => ({ col: u.col, row: u.row }))).toEqual(before)

    // Every enemy is planned, but the round only transitions once advanced.
    expect(bench.getState().phase).toBe('npc-move')
    expect(bench.step().ok).toBe(true)
    expect(bench.getState().phase).toBe('player')
  })

  it('refuses an illegal move and an illegal attack with the engine\'s own reason, changing nothing', () => {
    const bench = openBench()
    bench.placeUnit('short-range', 0, 0) // movement 3
    const npc = bench.getState().units[0]

    const badMove = bench.planEnemyByHand(npc.id, { kind: 'move', toCol: 7, toRow: 4 })
    expect(badMove).toMatchObject({ ok: false })
    expect(bench.getState().units[0]).toMatchObject({ col: 0, row: 0 })
    expect(bench.getState().unplannedNpcs).toContain(npc.id)

    const badAttack = bench.planEnemyByHand(npc.id, { kind: 'stay' }, { col: 6, row: 4 })
    expect(badAttack).toMatchObject({ ok: false })
    expect(bench.getState().telegraphs).toEqual([])
    expect(bench.getState().unplannedNpcs).toContain(npc.id)
  })

  it('refuses to plan an enemy already planned this round, from either source', () => {
    const bench = openBench()
    bench.placeUnit('short-range', 0, 0)
    const npc = bench.getState().units[0]

    expect(bench.planEnemyByHand(npc.id, { kind: 'stay' }).ok).toBe(true)
    const again = bench.planEnemyByHand(npc.id, { kind: 'stay' })
    expect(again).toMatchObject({ ok: false })
    if (!again.ok) expect(again.error).toMatch(/already been planned/)

    const viaAi = bench.planEnemyByAi(npc.id)
    expect(viaAi).toMatchObject({ ok: false })
  })

  it('refuses to plan a PC as an enemy', () => {
    const bench = openBench()
    bench.placeUnit('melee', 0, 0)
    const pc = bench.getState().units[0]
    expect(bench.planEnemyByHand(pc.id, { kind: 'stay' })).toMatchObject({ ok: false })
    expect(bench.planEnemyByAi(pc.id)).toMatchObject({ ok: false })
  })

  it('reports which enemies still need a plan rather than letting the round proceed', () => {
    const bench = openBench()
    startedWith(bench, [{ unitType: 'short-range', col: 0, row: 0 }, { unitType: 'long-range', col: 7, row: 4 }])
    const [a, b] = bench.getState().units

    bench.planEnemyByHand(a.id, { kind: 'stay' })
    const result = bench.endPlayerTurn()
    expect(result).toMatchObject({ ok: false })
    if (!result.ok) expect(result.error).toContain(b.id)
    expect(bench.getState().phase).toBe('npc-move')
  })

  it('offers only tiles that go on to commit successfully', () => {
    const bench = openBench()
    bench.placeUnit('melee', 3, 0)
    bench.placeUnit('melee', 5, 0)
    bench.placeUnit('short-range', 4, 0) // both melees sit within the 1-2 band either side
    const npc = bench.getState().units.find((u) => u.kind === 'npc')!

    const offered = bench.npcPlannableAttacks(npc.id, { kind: 'stay' })
    expect(offered.length).toBeGreaterThan(1)
    for (const tile of offered) {
      const trial = new BenchStore()
      trial.newBoard(generateBoard({ cols: 8, rows: 5, preset: 'open', powerCenters: 0 }))
      trial.placeUnit('melee', 3, 0)
      trial.placeUnit('melee', 5, 0)
      trial.placeUnit('short-range', 4, 0)
      const trialNpc = trial.getState().units.find((u) => u.kind === 'npc')!
      expect(trial.planEnemyByHand(trialNpc.id, { kind: 'stay' }, tile).ok).toBe(true)
    }
  })
})

describe('mixing hand-authored and AI plans within one round', () => {
  it('hands one named enemy to the AI, leaving the rest untouched', () => {
    const bench = openBench()
    bench.placeUnit('short-range', 0, 0)
    bench.placeUnit('short-range', 7, 4)
    const [a, b] = bench.getState().units

    expect(bench.planEnemyByAi(a.id).ok).toBe(true)
    expect(bench.getState().unplannedNpcs).toEqual([b.id])
    expect(bench.getState().npcAuthorship).toEqual({ [a.id]: 'ai' })
  })

  it('leaves hand-authored plans alone when the AI takes the rest', () => {
    const bench = openBench()
    startedWith(bench, [
      { unitType: 'melee', col: 4, row: 1 },
      { unitType: 'short-range', col: 4, row: 0 },
      { unitType: 'short-range', col: 0, row: 4 },
    ])
    const [, a, b] = bench.getState().units

    expect(bench.planEnemyByHand(a.id, { kind: 'stay' }, { col: 4, row: 1 }).ok).toBe(true)
    expect(bench.getState().unplannedNpcs).toEqual([b.id])

    expect(bench.planEnemyTurn().ok).toBe(true) // the AI takes everyone still unplanned
    expect(bench.getState().unplannedNpcs).toEqual([])
    expect(bench.getState().npcAuthorship).toMatchObject({ [a.id]: 'designer', [b.id]: 'ai' })
    // The hand-authored plan's telegraph is untouched by the AI's turn.
    expect(bench.getState().telegraphs).toContainEqual({ unitId: a.id, targetCol: 4, targetRow: 1 })
  })

  it('resolves hand-authored and AI-authored telegraphs identically', () => {
    const bench = openBench()
    startedWith(bench, [
      { unitType: 'melee', col: 4, row: 1 },
      { unitType: 'melee', col: 0, row: 4 },
      { unitType: 'short-range', col: 4, row: 0 },
      { unitType: 'short-range', col: 0, row: 3 },
    ])
    const npcs = bench.getState().units.filter((u) => u.kind === 'npc')

    expect(bench.planEnemyByHand(npcs[0].id, { kind: 'stay' }, { col: 4, row: 1 }).ok).toBe(true)
    expect(bench.planEnemyByAi(npcs[1].id).ok).toBe(true)
    expect(bench.getState().unplannedNpcs).toEqual([])

    expect(bench.step().ok).toBe(true) // phase-transition into player
    expect(bench.getState().phase).toBe('player')
    expect(bench.endPlayerTurn().ok).toBe(true)
    expect(bench.resolveTelegraphs().ok).toBe(true)
    expect(bench.getState().telegraphs).toEqual([])
    // Both attacks landed — a hand-authored plan resolves exactly like an AI one.
    expect(bench.getState().units.find((u) => u.id === 'melee-1')!.hp).toBe(2)
  })

  it('turn order is the order the designer planned in, not the AI\'s own order', () => {
    const bench = openBench()
    startedWith(bench, [
      { unitType: 'melee', col: 4, row: 1 },
      { unitType: 'short-range', col: 4, row: 0 }, // "first" by board order
      { unitType: 'short-range', col: 4, row: 2 }, // adjacent to the same PC
    ])
    const [, npcA, npcB] = bench.getState().units

    // Plan B before A — the reverse of placement order.
    expect(bench.planEnemyByHand(npcB.id, { kind: 'stay' }, { col: 4, row: 1 }).ok).toBe(true)
    expect(bench.planEnemyByHand(npcA.id, { kind: 'stay' }, { col: 4, row: 1 }).ok).toBe(true)

    expect(bench.getState().telegraphs.map((t) => t.unitId)).toEqual([npcB.id, npcA.id])

    bench.step() // phase transition to player
    bench.endPlayerTurn()
    bench.step() // resolve npcB's telegraph first
    expect(bench.getState().log.at(-1)).toContain(npcB.id)
    bench.step() // then npcA's
    expect(bench.getState().log.at(-1)).toContain(npcA.id)
  })
})

describe('provenance', () => {
  it('is absent for an unplanned enemy and present once planned, by source', () => {
    const bench = openBench()
    bench.placeUnit('short-range', 0, 0)
    const npc = bench.getState().units[0]
    expect(bench.getState().npcAuthorship[npc.id]).toBeUndefined()

    bench.planEnemyByAi(npc.id)
    expect(bench.getState().npcAuthorship[npc.id]).toBe('ai')
  })

  it('tags every enemy the AI plans through the whole-phase composite', () => {
    const bench = new BenchStore()
    bench.newBoard(generateBoard({ cols: 8, rows: 5, preset: 'open', powerCenters: 1 }))
    bench.placeUnit('short-range', 0, 0)
    bench.placeUnit('short-range', 7, 3)
    bench.startScenario()
    const npcs = bench.getState().units.filter((u) => u.kind === 'npc')

    bench.planEnemyTurn()
    for (const npc of npcs) expect(bench.getState().npcAuthorship[npc.id]).toBe('ai')
  })

  it('survives a step back and reads correctly at every frame', () => {
    const bench = openBench()
    bench.placeUnit('short-range', 0, 0)
    const npc = bench.getState().units[0]
    const beforeCursor = bench.getState().timeline.cursor

    bench.planEnemyByHand(npc.id, { kind: 'stay' })
    expect(bench.getState().npcAuthorship[npc.id]).toBe('designer')

    bench.undo()
    expect(bench.getState().npcAuthorship[npc.id]).toBeUndefined()

    bench.redo()
    expect(bench.getState().npcAuthorship[npc.id]).toBe('designer')

    bench.stepTo(beforeCursor)
    expect(bench.getState().npcAuthorship).toEqual({})
  })

  it('is cleared when the round ends, not merely when it moves to player', () => {
    const bench = openBench()
    bench.placeUnit('short-range', 0, 0)
    bench.startScenario()
    const npc = bench.getState().units[0]

    bench.planEnemyByHand(npc.id, { kind: 'stay' })
    bench.step() // into player
    expect(bench.getState().npcAuthorship[npc.id]).toBe('designer') // still attributed mid-round

    bench.endPlayerTurn()
    bench.resolveTelegraphs() // chains straight into the next npc-move: the round has ended
    expect(bench.getState().phase).toBe('npc-move')
    expect(bench.getState().npcAuthorship).toEqual({})
  })
})

describe('amending a locked telegraph', () => {
  // `amendTelegraph` is bench-only and fails closed unless the engine mode is
  // opted in (see engine-mode.ts) — covered by the file-level `beforeEach`
  // above now that every test in this file needs bench mode, not just this
  // block.

  function twoTargetBench() {
    // A short-range enemy with two PCs in range from where it stands, on
    // different cardinal arms so neither blocks the other — targeting is
    // direction-based, and two PCs on the *same* line would leave only the
    // nearer one reachable. So it can be amended from one legal target to a
    // different legal one without either the original or the new target
    // being an artifact of blocking.
    const bench = openBench()
    startedWith(bench, [
      { unitType: 'melee', col: 4, row: 1 }, // one tile up
      { unitType: 'melee', col: 4, row: 4 }, // two tiles down (the tile between is empty)
      { unitType: 'short-range', col: 4, row: 2 },
    ])
    const npc = bench.getState().units.find((u) => u.kind === 'npc')!
    return { bench, npc }
  }

  it('retargets a pending telegraph mid-window, without moving the enemy', () => {
    const { bench, npc } = twoTargetBench()
    bench.planEnemyByHand(npc.id, { kind: 'stay' }, { col: 4, row: 1 })
    bench.step() // into player
    // "after acting with a PC" — any player-phase action opens another frame.
    bench.select(bench.getState().units[0].id)

    const before = bench.getState().units.find((u) => u.id === npc.id)!
    const result = bench.amendTelegraph(npc.id, { col: 4, row: 4 })
    expect(result.ok).toBe(true)
    expect(bench.getState().telegraphs).toEqual([{ unitId: npc.id, targetCol: 4, targetRow: 4 }])

    const after = bench.getState().units.find((u) => u.id === npc.id)!
    expect(after).toMatchObject({ col: before.col, row: before.row })
  })

  it('lands the amended attack, not the original, on resolution', () => {
    const { bench, npc } = twoTargetBench()
    bench.planEnemyByHand(npc.id, { kind: 'stay' }, { col: 4, row: 1 })
    bench.step()
    bench.amendTelegraph(npc.id, { col: 4, row: 4 })
    bench.endPlayerTurn()
    bench.resolveTelegraphs()

    expect(bench.getState().units.find((u) => u.col === 4 && u.row === 1)!.hp).toBe(3) // untouched
    expect(bench.getState().units.find((u) => u.col === 4 && u.row === 4)!.hp).toBe(2) // hit instead
  })

  it('reads as though amended from the start: every frame at or after the lock shows the new target', () => {
    const { bench, npc } = twoTargetBench()
    bench.planEnemyByHand(npc.id, { kind: 'stay' }, { col: 4, row: 1 })
    const lockCursor = bench.getState().timeline.cursor
    bench.step() // into player
    const inPlayerCursor = bench.getState().timeline.cursor

    bench.amendTelegraph(npc.id, { col: 4, row: 4 })
    expect(bench.getState().telegraphs).toEqual([{ unitId: npc.id, targetCol: 4, targetRow: 4 }])

    bench.stepTo(inPlayerCursor)
    expect(bench.getState().telegraphs).toEqual([{ unitId: npc.id, targetCol: 4, targetRow: 4 }])

    bench.stepTo(lockCursor)
    expect(bench.getState().telegraphs).toEqual([{ unitId: npc.id, targetCol: 4, targetRow: 4 }])
  })

  it('discards the amendment when rewound to before the plan and re-planned', () => {
    const { bench, npc } = twoTargetBench()
    bench.planEnemyByHand(npc.id, { kind: 'stay' }, { col: 4, row: 1 })
    const beforePlanCursor = bench.getState().timeline.cursor - 1
    bench.step()
    bench.amendTelegraph(npc.id, { col: 4, row: 4 })

    bench.stepTo(beforePlanCursor)
    expect(bench.getState().unplannedNpcs).toContain(npc.id)

    bench.planEnemyByHand(npc.id, { kind: 'stay' }, { col: 4, row: 1 }) // re-plan, discarding the abandoned line
    expect(bench.getState().telegraphs).toEqual([{ unitId: npc.id, targetCol: 4, targetRow: 1 }]) // the amendment is gone
  })

  it('touches nothing outside the window: an earlier frame and another unit\'s telegraph are untouched', () => {
    const bench = openBench()
    bench.placeUnit('melee', 1, 0) // npcA's original target (right, distance 1)
    bench.placeUnit('melee', 0, 2) // npcA's amended target (down, distance 2)
    bench.placeUnit('melee', 7, 3) // npcB's target (up, distance 1)
    bench.placeUnit('short-range', 0, 0) // npcA, planned first
    bench.placeUnit('short-range', 7, 4) // npcB, planned second
    const [, , , npcA, npcB] = bench.getState().units

    const beforeAnyPlanning = bench.getState()
    const beforeAnyPlanningCursor = beforeAnyPlanning.timeline.cursor
    expect(bench.planEnemyByHand(npcA.id, { kind: 'stay' }, { col: 1, row: 0 }).ok).toBe(true)
    expect(bench.planEnemyByHand(npcB.id, { kind: 'stay' }, { col: 7, row: 3 }).ok).toBe(true)

    bench.amendTelegraph(npcA.id, { col: 0, row: 2 })

    // B's telegraph, planned after A's lock but resolved from the same still-live
    // window, is untouched — only A's entry changed.
    expect(bench.getState().telegraphs).toContainEqual({ unitId: npcB.id, targetCol: 7, targetRow: 3 })
    expect(bench.getState().telegraphs).toContainEqual({ unitId: npcA.id, targetCol: 0, targetRow: 2 })

    // The frame before any enemy was planned is bit-for-bit as it was.
    bench.stepTo(beforeAnyPlanningCursor)
    expect(bench.getState().units).toEqual(beforeAnyPlanning.units)
    expect(bench.getState().telegraphs).toEqual([])
  })

  it('is refused, changing nothing, for an enemy whose telegraph already resolved', () => {
    const { bench, npc } = twoTargetBench()
    bench.planEnemyByHand(npc.id, { kind: 'stay' }, { col: 4, row: 1 })
    bench.step()
    bench.endPlayerTurn()
    bench.resolveTelegraphs()

    const result = bench.amendTelegraph(npc.id, { col: 4, row: 4 })
    expect(result).toMatchObject({ ok: false })
  })

  it('is refused, changing nothing, for an enemy with no locked telegraph', () => {
    const bench = openBench()
    bench.placeUnit('short-range', 0, 0)
    const npc = bench.getState().units[0]
    bench.planEnemyByHand(npc.id, { kind: 'stay' }) // no attack planned
    const result = bench.amendTelegraph(npc.id, { col: 1, row: 0 })
    expect(result).toMatchObject({ ok: false })
  })

  it('is refused for an enemy killed inside the window, leaving the board as it was', () => {
    const bench = openBench()
    bench.placeUnit('melee', 4, 1)
    bench.placeUnit('melee', 4, 4)
    bench.placeUnit('short-range', 4, 2, 1) // 1 HP: one melee hit kills it
    const npc = bench.getState().units.find((u) => u.kind === 'npc')!
    bench.startScenario()

    bench.planEnemyByHand(npc.id, { kind: 'stay' }, { col: 4, row: 1 })
    bench.step() // into player

    // The designer kills the enemy inside the window instead of moving away.
    const pc = bench.getState().units.find((u) => u.col === 4 && u.row === 1)!
    bench.select(pc.id)
    expect(bench.commitSelected('attack', { col: 4, row: 2 }).ok).toBe(true) // the npc's own tile
    expect(bench.getState().units.some((u) => u.id === npc.id)).toBe(false)

    const result = bench.amendTelegraph(npc.id, { col: 4, row: 4 })
    expect(result).toMatchObject({ ok: false })

    bench.endPlayerTurn()
    bench.resolveTelegraphs()
    expect(bench.getState().units.find((u) => u.col === 4 && u.row === 4)!.hp).toBe(3) // the dead enemy's attack never lands
  })

  it('refuses an amendment to a tile the enemy cannot reach from where it stands', () => {
    const { bench, npc } = twoTargetBench()
    bench.planEnemyByHand(npc.id, { kind: 'stay' }, { col: 4, row: 1 })
    bench.step()
    const result = bench.amendTelegraph(npc.id, { col: 7, row: 4 })
    expect(result).toMatchObject({ ok: false })
    expect(bench.getState().telegraphs).toEqual([{ unitId: npc.id, targetCol: 4, targetRow: 1 }])
  })
})
