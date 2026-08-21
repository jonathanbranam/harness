import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setEngineMode } from '@repo/dungeon-engine'
import { BenchStore } from './bench-store'
import { applyIntent } from './intents'
import { generateBoard } from './board-gen'

// The real server sets this once at startup (`engine-startup.ts`) and never
// toggles it.
//
// Bench mode buys **no** latitude over the round: `dungeon-sequencer-guards`'
// phase guard is unconditional, and this suite plays by it like the game
// does. What bench mode fences is narrower — authoring a scenario at all
// (`scenario.newScenario`, which a fresh `BenchStore` calls in its
// constructor, so this is needed even to build one here) and retargeting a
// locked telegraph (`amendTelegraph`). Set for every test, not just the block
// that already needed it for `amendTelegraph`, because constructing a
// `BenchStore` now needs it too.
beforeEach(() => setEngineMode('bench'))
afterEach(() => setEngineMode('game'))

function bench(): BenchStore {
  const store = new BenchStore()
  store.newBoard(generateBoard({ cols: 8, rows: 5, preset: 'open', powerCenters: 0 }))
  return store
}

describe('bench intents', () => {
  it('routes a designer click through the same rules the agent gets', () => {
    const store = bench()
    applyIntent(store, { kind: 'place', unitType: 'melee', col: 1, row: 1 })
    const unitId = store.getState().units[0].id

    // No enemies on this board, so planning the (empty) enemy turn steps
    // straight through to the player phase, where a PC may act
    // (dungeon-sequencer-guards' unconditional phase guard).
    expect(applyIntent(store, { kind: 'startScenario' })).toMatchObject({ ok: true })
    expect(applyIntent(store, { kind: 'planEnemyTurn' })).toMatchObject({ ok: true })

    applyIntent(store, { kind: 'select', unitId })
    expect(store.getState().selection?.unitId).toBe(unitId)

    expect(applyIntent(store, { kind: 'commit', action: 'move', col: 3, row: 1 })).toMatchObject({ ok: true })
    expect(store.getState().units[0]).toMatchObject({ col: 3, row: 1 })

    // Out of reach: the engine refuses, and the refusal is reported rather than
    // silently ignored, because "not legal" is an answer the designer wants.
    expect(applyIntent(store, { kind: 'commit', action: 'move', col: 7, row: 4 })).toMatchObject({ ok: false })
  })

  it('builds a board from explicit rows and reports a malformed one', () => {
    const store = bench()
    expect(applyIntent(store, { kind: 'newBoard', rowsText: ['....', '.PP.', '....'] })).toMatchObject({ ok: true })
    expect(store.getState().board.cols).toBe(4)
    expect(applyIntent(store, { kind: 'newBoard', rowsText: ['....', '..'] })).toMatchObject({ ok: false })
  })

  it('covers the whole intent surface', () => {
    const store = bench()
    applyIntent(store, { kind: 'place', unitType: 'melee', col: 2, row: 2 })
    applyIntent(store, { kind: 'place', unitType: 'short-range', col: 3, row: 2 })
    // A second enemy, planned by the AI once the first has been planned by
    // hand — `planEnemyTurn` only ever takes over what is still unplanned
    // ("mixing hand-authored and AI plans", design.md), so planning npc by
    // hand below is what "spends" it for the round.
    applyIntent(store, { kind: 'place', unitType: 'short-range', col: 3, row: 0 })
    const [pc, npc, npc2] = store.getState().units

    expect(applyIntent(store, { kind: 'setHp', unitId: pc.id, hp: 2 })).toMatchObject({ ok: true })
    expect(applyIntent(store, { kind: 'relocate', unitId: pc.id, col: 2, row: 3 })).toMatchObject({ ok: true })
    // Adjacent to both enemies, so both are in range once the round starts.
    // Relocated here, during placement — `relocate` is a setup operation now
    // and is refused once the round has started, so this has to happen before
    // dungeon_start_scenario, not after.
    expect(applyIntent(store, { kind: 'relocate', unitId: pc.id, col: 3, row: 1 })).toMatchObject({ ok: true })

    // Structures, still during placement — the setup surface this change adds.
    expect(applyIntent(store, { kind: 'placeStructure', structureKind: 'tower', col: 6, row: 4 })).toMatchObject({ ok: true })
    expect(applyIntent(store, { kind: 'moveStructure', fromCol: 6, fromRow: 4, toCol: 7, toRow: 4 })).toMatchObject({ ok: true })
    expect(applyIntent(store, { kind: 'removeStructure', col: 7, row: 4 })).toMatchObject({ ok: true })

    // The board is set: leave placement and begin the round.
    expect(applyIntent(store, { kind: 'startScenario' })).toMatchObject({ ok: true })
    // Setup is refused now that the scenario has started.
    expect(applyIntent(store, { kind: 'place', unitType: 'melee', col: 0, row: 4 })).toMatchObject({ ok: false })

    // An enemy is planned, never driven — an enemy has no action surface of
    // its own, in any phase (dungeon-sequencer-guards). Planning npc by hand
    // is the designer's own choice; `planEnemyTurn` below hands the AI only
    // what is still unplanned.
    expect(
      applyIntent(store, { kind: 'planEnemyByHand', unitId: npc.id, move: { kind: 'stay' }, attackTile: { col: 3, row: 1 } }),
    ).toMatchObject({ ok: true })
    expect(applyIntent(store, { kind: 'planEnemyTurn' })).toMatchObject({ ok: true }) // the AI takes npc2
    expect(store.getState().telegraphs.length).toBeGreaterThan(0)
    expect(store.getState().unplannedNpcs).not.toContain(npc2.id)
    expect(applyIntent(store, { kind: 'planEnemyTurn' })).toMatchObject({ ok: false }) // phase has moved past npc-move
    expect(applyIntent(store, { kind: 'step' })).toMatchObject({ ok: false }) // player phase: ending the turn is `endPlayerTurn`, not a round step

    // The player answers: a PC's attack still goes through `commit`, same as ever.
    expect(applyIntent(store, { kind: 'select', unitId: pc.id })).toMatchObject({ ok: true })
    expect(applyIntent(store, { kind: 'commit', action: 'attack', col: 3, row: 2 })).toMatchObject({ ok: true })

    expect(applyIntent(store, { kind: 'endPlayerTurn' })).toMatchObject({ ok: true })
    expect(applyIntent(store, { kind: 'resolveTelegraphs' })).toMatchObject({ ok: true })
    expect(store.getState().telegraphs).toHaveLength(0)
    expect(applyIntent(store, { kind: 'tweakDef', unitType: 'melee', moveRange: 6 })).toMatchObject({ ok: true })
    expect(store.getState().defs.melee.movement.range).toBe(6)
    expect(applyIntent(store, { kind: 'resetDefs' })).toMatchObject({ ok: true })
    expect(applyIntent(store, { kind: 'undo' })).toMatchObject({ ok: true })
    // remove/clearUnits are setup operations too, refused the same way once
    // the round has started — there is no more "always available" setup tool
    // short of dungeon_new_board, which discards the round outright instead.
    const beforeRefusedRemoval = store.getState().units.length
    expect(applyIntent(store, { kind: 'remove', unitId: npc.id })).toMatchObject({ ok: false })
    expect(applyIntent(store, { kind: 'clearUnits' })).toMatchObject({ ok: false })
    expect(store.getState().units).toHaveLength(beforeRefusedRemoval)
    expect(applyIntent(store, { kind: 'select', unitId: null })).toMatchObject({ ok: true })
  })

  describe('enemy turn planning', () => {
    it('routes hand-planning, AI-planning, and amendment through the same rules the agent gets', () => {
      const store = bench()
      applyIntent(store, { kind: 'place', unitType: 'melee', col: 4, row: 1 })
      applyIntent(store, { kind: 'place', unitType: 'melee', col: 4, row: 4 })
      applyIntent(store, { kind: 'place', unitType: 'short-range', col: 4, row: 2 })
      const npc = store.getState().units.find((u) => u.kind === 'npc')!

      expect(applyIntent(store, { kind: 'setNpcPlanCandidate', unitId: npc.id, move: { kind: 'stay' } })).toMatchObject({ ok: true })
      expect(store.getState().npcPlanPreview?.attackTiles).toContainEqual({ col: 4, row: 1 })

      expect(
        applyIntent(store, { kind: 'planEnemyByHand', unitId: npc.id, move: { kind: 'stay' }, attackTile: { col: 4, row: 1 } }),
      ).toMatchObject({ ok: true })
      expect(store.getState().npcAuthorship[npc.id]).toBe('designer')
      expect(store.getState().telegraphs).toEqual([{ unitId: npc.id, targetCol: 4, targetRow: 1 }])

      expect(applyIntent(store, { kind: 'amendTelegraph', unitId: npc.id, tile: { col: 4, row: 4 } })).toMatchObject({ ok: true })
      expect(store.getState().telegraphs).toEqual([{ unitId: npc.id, targetCol: 4, targetRow: 4 }])
    })

    it('hands one named enemy to the AI via the intent surface', () => {
      const store = bench()
      applyIntent(store, { kind: 'place', unitType: 'short-range', col: 0, row: 0 })
      const npc = store.getState().units[0]

      expect(applyIntent(store, { kind: 'planEnemyByAi', unitId: npc.id })).toMatchObject({ ok: true })
      expect(store.getState().npcAuthorship[npc.id]).toBe('ai')
      expect(store.getState().unplannedNpcs).toEqual([])
    })
  })
})
