import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setEngineMode } from '@repo/dungeon-engine'
import { BenchStore } from './bench-store'
import { applyIntent } from './intents'
import { generateBoard } from './board-gen'

// The real server sets this once at startup (`engine-startup.ts`) and never
// toggles it. A fresh `BenchStore` now starts in `placement` (`scenario.
// newScenario`, bench-store.ts's `freshScenario`) and this suite starts the
// scenario before driving moves and attacks on both sides out of sequence,
// the bench's own spec'd capability that `dungeon-sequencer-guards`' phase
// guard fences behind this mode. Set for every test, not just the block that
// already needed it for `amendTelegraph` — and needed even to construct a
// `BenchStore` at all now, since authoring a scenario is itself bench-only.
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
    // A second enemy, never hand-driven, for `planEnemyTurn` to plan below.
    // The first is spent by the hand-driven `commit` a few lines down, and
    // since `dungeon-sequencer-guards` an enemy spent through the action
    // surface is not planned again — the very double-act this test used to
    // rely on to produce a telegraph from the same unit it had just attacked
    // with by hand.
    applyIntent(store, { kind: 'place', unitType: 'short-range', col: 3, row: 0 })
    const [pc, npc, npc2] = store.getState().units

    expect(applyIntent(store, { kind: 'setHp', unitId: pc.id, hp: 2 })).toMatchObject({ ok: true })
    expect(applyIntent(store, { kind: 'relocate', unitId: pc.id, col: 2, row: 3 })).toMatchObject({ ok: true })
    // Adjacent to npc2 (not the soon-to-be-spent npc), so planning is
    // guaranteed to lock a telegraph for it once npc has attacked and can't
    // be planned again. Relocated here, during placement — `relocate` is a
    // setup operation now and is refused once the round has started, so this
    // has to happen before dungeon_start_scenario, not after npc's attack.
    expect(applyIntent(store, { kind: 'relocate', unitId: pc.id, col: 3, row: 1 })).toMatchObject({ ok: true })

    // Structures, still during placement — the setup surface this change adds.
    expect(applyIntent(store, { kind: 'placeStructure', structureKind: 'tower', col: 6, row: 4 })).toMatchObject({ ok: true })
    expect(applyIntent(store, { kind: 'moveStructure', fromCol: 6, fromRow: 4, toCol: 7, toRow: 4 })).toMatchObject({ ok: true })
    expect(applyIntent(store, { kind: 'removeStructure', col: 7, row: 4 })).toMatchObject({ ok: true })

    // The board is set: leave placement and begin the round.
    expect(applyIntent(store, { kind: 'startScenario' })).toMatchObject({ ok: true })
    // Setup is refused now that the scenario has started.
    expect(applyIntent(store, { kind: 'place', unitType: 'melee', col: 0, row: 4 })).toMatchObject({ ok: false })

    expect(applyIntent(store, { kind: 'select', unitId: npc.id })).toMatchObject({ ok: true })
    expect(applyIntent(store, { kind: 'commit', action: 'attack', col: 3, row: 3 })).toMatchObject({ ok: true })
    expect(applyIntent(store, { kind: 'planEnemyTurn' })).toMatchObject({ ok: true })
    expect(store.getState().telegraphs.length).toBeGreaterThan(0)
    expect(store.getState().unplannedNpcs).not.toContain(npc2.id)
    expect(applyIntent(store, { kind: 'planEnemyTurn' })).toMatchObject({ ok: false }) // phase has moved past npc-move
    expect(applyIntent(store, { kind: 'step' })).toMatchObject({ ok: false }) // player phase: ending the turn is `endPlayerTurn`, not a round step
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
