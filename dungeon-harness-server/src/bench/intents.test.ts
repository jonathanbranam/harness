import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setEngineMode } from '@repo/dungeon-engine'
import { BenchStore } from './bench-store'
import { applyIntent } from './intents'
import { generateBoard } from './board-gen'

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
    const [pc, npc] = store.getState().units

    expect(applyIntent(store, { kind: 'setHp', unitId: pc.id, hp: 2 })).toMatchObject({ ok: true })
    expect(applyIntent(store, { kind: 'relocate', unitId: pc.id, col: 2, row: 3 })).toMatchObject({ ok: true })
    expect(applyIntent(store, { kind: 'select', unitId: npc.id })).toMatchObject({ ok: true })
    expect(applyIntent(store, { kind: 'commit', action: 'attack', col: 3, row: 3 })).toMatchObject({ ok: true })
    // Adjacent to the NPC, so planning is guaranteed to lock a telegraph.
    expect(applyIntent(store, { kind: 'relocate', unitId: pc.id, col: 3, row: 1 })).toMatchObject({ ok: true })
    expect(applyIntent(store, { kind: 'planEnemyTurn' })).toMatchObject({ ok: true })
    expect(store.getState().telegraphs.length).toBeGreaterThan(0)
    expect(applyIntent(store, { kind: 'planEnemyTurn' })).toMatchObject({ ok: false }) // phase has moved past npc-move
    expect(applyIntent(store, { kind: 'step' })).toMatchObject({ ok: false }) // player phase: ending the turn is `endPlayerTurn`, not a round step
    expect(applyIntent(store, { kind: 'endPlayerTurn' })).toMatchObject({ ok: true })
    expect(applyIntent(store, { kind: 'resolveTelegraphs' })).toMatchObject({ ok: true })
    expect(store.getState().telegraphs).toHaveLength(0)
    expect(applyIntent(store, { kind: 'tweakDef', unitType: 'melee', moveRange: 6 })).toMatchObject({ ok: true })
    expect(store.getState().defs.melee.movement.range).toBe(6)
    expect(applyIntent(store, { kind: 'resetDefs' })).toMatchObject({ ok: true })
    expect(applyIntent(store, { kind: 'undo' })).toMatchObject({ ok: true })
    expect(applyIntent(store, { kind: 'remove', unitId: npc.id })).toMatchObject({ ok: true })
    expect(applyIntent(store, { kind: 'clearUnits' })).toMatchObject({ ok: true })
    expect(store.getState().units).toHaveLength(0)
    expect(applyIntent(store, { kind: 'select', unitId: null })).toMatchObject({ ok: true })
  })

  describe('enemy turn planning', () => {
    beforeEach(() => setEngineMode('bench'))
    afterEach(() => setEngineMode('game'))

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
