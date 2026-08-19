import { describe, expect, it } from 'vitest'
import { BenchStore } from './bench-store'
import { boardFromRows, boardToRows, generateBoard } from './board-gen'

/** An open 8×5 board with no terrain and no structures to complicate pathing. */
function openBench(): BenchStore {
  const bench = new BenchStore()
  bench.newBoard(generateBoard({ cols: 8, rows: 5, preset: 'open', powerCenters: 0 }))
  return bench
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

  it('refuses an occupied tile and an off-board tile', () => {
    const bench = openBench()
    bench.placeUnit('melee', 1, 1)
    expect(bench.placeUnit('rogue', 1, 1)).toMatchObject({ ok: false })
    expect(bench.placeUnit('rogue', 99, 1)).toMatchObject({ ok: false })
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

describe('playing by hand', () => {
  it('derives move options from the engine and charges the budget', () => {
    const bench = openBench()
    bench.placeUnit('melee', 0, 0) // move range 4
    const id = bench.getState().units[0].id
    bench.select(id)

    const before = bench.getState().selection!
    expect(before.remainingMove).toBe(4)
    expect(before.moveDests).toContainEqual({ col: 2, row: 0 })

    expect(bench.moveSelectedTo(2, 0).ok).toBe(true)
    const after = bench.getState().selection!
    expect([after.col, after.row]).toEqual([2, 0])
    expect(after.remainingMove).toBe(2)
    expect(after.moveDests).not.toContainEqual({ col: 6, row: 0 })
  })

  it('refuses a move the engine says is out of reach', () => {
    const bench = openBench()
    bench.placeUnit('melee', 0, 0)
    bench.select(bench.getState().units[0].id)
    expect(bench.moveSelectedTo(7, 4)).toMatchObject({ ok: false })
  })

  it('resolves a PC attack against an adjacent NPC for the def damage', () => {
    const bench = openBench()
    bench.placeUnit('melee', 2, 2)
    bench.placeUnit('short-range', 3, 2)
    const [pc, npc] = bench.getState().units
    bench.select(pc.id)

    expect(bench.getState().selection!.attackByDir.right).toContainEqual({ col: 3, row: 2 })
    expect(bench.attackSelected('right').ok).toBe(true)

    const hit = bench.getState().units.find((u) => u.id === npc.id)!
    expect(hit.hp).toBe(1) // 3 HP - 2 melee damage
  })

  it('makes an attack committal, as the game does', () => {
    const bench = openBench()
    bench.placeUnit('melee', 2, 2)
    bench.placeUnit('short-range', 3, 2)
    bench.select(bench.getState().units[0].id)
    bench.attackSelected('right')

    const selection = bench.getState().selection!
    expect(selection.hasAttacked).toBe(true)
    expect(selection.remainingMove).toBe(0)
    expect(bench.moveSelectedTo(2, 3)).toMatchObject({ ok: false })
    expect(bench.attackSelected('right')).toMatchObject({ ok: false })
  })

  it('drives an NPC attack by hand against a PC', () => {
    const bench = openBench()
    bench.placeUnit('melee', 2, 2)
    bench.placeUnit('short-range', 3, 2)
    const [pc, npc] = bench.getState().units
    bench.select(npc.id)

    expect(bench.attackSelected('left', { col: 2, row: 2 }).ok).toBe(true)
    expect(bench.getState().units.find((u) => u.id === pc.id)!.hp).toBe(2) // 3 - 1
  })

  it('refuses an NPC target outside the engine footprint', () => {
    const bench = openBench()
    bench.placeUnit('melee', 6, 4)
    bench.placeUnit('short-range', 0, 0)
    bench.select(bench.getState().units[1].id)
    expect(bench.attackSelected('right', { col: 6, row: 4 })).toMatchObject({ ok: false })
  })

  it('runs the game AI for the enemy side on request', () => {
    // The NPC goal is a structure, not a PC — so the board needs one for the AI
    // to have anywhere to go. See board-gen's `powerCenters`.
    const bench = new BenchStore()
    // Power center lands at (4, 2) on this board; start the NPC out of its
    // 2-tile scan band so the AI has to walk rather than stand and telegraph.
    bench.newBoard(generateBoard({ cols: 8, rows: 5, preset: 'open', powerCenters: 1 }))
    bench.placeUnit('short-range', 0, 0)
    const start = bench.getState().units[0]

    expect(bench.runEnemyAi().ok).toBe(true)

    const npc = bench.getState().units.find((u) => u.kind === 'npc')!
    const distance = (u: { col: number; row: number }) => Math.abs(u.col - 4) + Math.abs(u.row - 2)
    expect(distance(npc)).toBeLessThan(distance(start))
  })

  it('has the enemy AI stay put when there is nothing on the board to attack', () => {
    // Documents real engine behavior rather than papering over it: NPCs walk
    // toward structures and shoot PCs that stray into range; with neither, the
    // right answer is to do nothing.
    const bench = openBench()
    bench.placeUnit('short-range', 4, 0)
    expect(bench.runEnemyAi().ok).toBe(true)
    expect(bench.getState().units.find((u) => u.kind === 'npc')!.row).toBe(0)
  })

  it('has the enemy AI telegraph an attack on a PC in its band', () => {
    const bench = openBench()
    bench.placeUnit('melee', 4, 1)
    bench.placeUnit('short-range', 4, 0)
    bench.runEnemyAi()
    expect(bench.getState().telegraphs).toEqual([{ unitId: expect.any(String), targetCol: 4, targetRow: 1 }])
    expect(bench.getState().units.find((u) => u.kind === 'pc')!.hp).toBe(2)
  })

  it('ends a round and restores movement', () => {
    const bench = openBench()
    bench.placeUnit('melee', 0, 0)
    bench.select(bench.getState().units[0].id)
    bench.moveSelectedTo(3, 0)
    expect(bench.getState().selection!.remainingMove).toBe(1)
    bench.endRound()
    expect(bench.getState().selection!.remainingMove).toBe(4)
  })
})

describe('stepping back', () => {
  it('reverses a move', () => {
    const bench = openBench()
    bench.placeUnit('melee', 0, 0)
    bench.select(bench.getState().units[0].id)
    bench.moveSelectedTo(2, 0)
    bench.undo()
    const selection = bench.getState().selection!
    expect([selection.col, selection.row]).toEqual([0, 0])
    expect(selection.remainingMove).toBe(4)
  })

  it('reverses an attack, which the engine undo alone cannot', () => {
    const bench = openBench()
    bench.placeUnit('melee', 2, 2)
    bench.placeUnit('short-range', 3, 2)
    const npcId = bench.getState().units[1].id
    bench.select(bench.getState().units[0].id)
    bench.attackSelected('right')
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
    bench.placeUnit('melee', 2, 2)
    bench.placeUnit('short-range', 3, 2, 9)
    bench.tweakDef('melee', { damage: 5 })
    bench.select(bench.getState().units[0].id)
    bench.attackSelected('right')
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
