import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BenchStore } from './bench-store'
import { BookmarkStore, slugify } from './bookmark-store'
import { generateBoard } from './board-gen'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bench-bookmarks-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function bench(): BenchStore {
  const store = new BenchStore({ bookmarks: new BookmarkStore(dir) })
  store.newBoard(generateBoard({ cols: 8, rows: 5, preset: 'open', powerCenters: 0 }))
  return store
}

describe('bookmark names', () => {
  it('reduces a name to a safe filename', () => {
    expect(slugify('Rogue flanks the brute')).toBe('rogue-flanks-the-brute')
    expect(slugify('  ../../etc/passwd  ')).toBe('etc-passwd')
    expect(slugify('!!!')).toBe('')
  })
})

describe('saving and reloading a position', () => {
  it('restores the board, the units, and the session tweaks', () => {
    const store = bench()
    store.placeUnit('melee', 2, 2)
    store.placeUnit('short-range', 5, 2)
    store.tweakDef('melee', { moveRange: 7 })
    expect(store.saveBookmark('Standoff').ok).toBe(true)

    // Move on: different board, no units, no tweaks.
    store.newBoard(generateBoard({ cols: 5, rows: 5, preset: 'open', powerCenters: 0 }))
    store.resetDefs()
    expect(store.getState().units).toHaveLength(0)

    expect(store.loadBookmark('Standoff').ok).toBe(true)
    const state = store.getState()
    expect(state.board.cols).toBe(8)
    expect(state.units.map((u) => [u.unitType, u.col, u.row])).toEqual([
      ['melee', 2, 2],
      ['short-range', 5, 2],
    ])
    expect(state.defs.melee.movement.range).toBe(7)
  })

  it('saves mid-play state, spent movement and all', () => {
    const store = bench()
    store.planEnemyTurn() // no NPCs: one step returns straight to `player`
    store.placeUnit('melee', 0, 0)
    store.select(store.getState().units[0].id)
    store.commitSelected('move', { col: 3, row: 0 })
    store.saveBookmark('Half moved')

    // Round end refreshes the budget; the bookmark should still hold the spent one.
    store.endPlayerTurn()
    store.resolveTelegraphs() // nothing pending: one step chains into the next round
    expect(store.getState().selection!.remainingMove).toBe(4)

    store.loadBookmark('Half moved')
    store.select(store.getState().units[0].id)
    expect(store.getState().selection!.remainingMove).toBe(1)
  })

  // A bookmark saved before the bench ran on the engine's round has no
  // `npcPlannedThisRound`/`npcPlansResolved` at all, and `advance` reads both.
  // Rather than migrate — a stale bookmark is cheap to re-save during
  // development, and guessing what round a saved position was in would be
  // worse than refusing — loading one is refused with a reason that says what
  // to do about it.
  it('refuses a bookmark saved before the bench ran on the engine round', () => {
    const store = bench()
    store.placeUnit('melee', 1, 1)
    store.placeUnit('short-range', 1, 0)
    store.planEnemyTurn()
    store.saveBookmark('Legacy shape')

    // Rewrite the file to match what those bookmarks actually look like.
    const path = join(dir, 'legacy-shape.json')
    const raw = JSON.parse(readFileSync(path, 'utf8'))
    delete raw.state.npcPlannedThisRound
    delete raw.state.npcPlansResolved
    writeFileSync(path, JSON.stringify(raw), 'utf8')

    const fresh = bench()
    const result = fresh.loadBookmark('Legacy shape')
    expect(result).toMatchObject({ ok: false })
    const error = (result as { ok: false; error: string }).error
    expect(error).toMatch(/saved before the bench ran on the engine/i)
    expect(error).toMatch(/save the position again/i)
    // Refused means untouched: no board was swapped in behind the failure.
    expect(fresh.getState().units).toHaveLength(0)
  })

  it('lists what is saved, newest first, and deletes on request', () => {
    const store = bench()
    store.placeUnit('melee', 1, 1)
    store.saveBookmark('First')
    store.placeUnit('rogue', 2, 1)
    store.saveBookmark('Second')

    const names = store.getState().bookmarks.map((b) => b.name)
    expect(names).toContain('First')
    expect(names).toContain('Second')
    expect(store.getState().bookmarks.find((b) => b.name === 'Second')!.units).toBe(2)

    expect(store.deleteBookmark('First').ok).toBe(true)
    expect(store.getState().bookmarks.map((b) => b.name)).toEqual(['Second'])
    expect(store.deleteBookmark('First')).toMatchObject({ ok: false })
  })

  it('replaces a bookmark saved under the same name', () => {
    const store = bench()
    store.placeUnit('melee', 1, 1)
    store.saveBookmark('Same')
    store.placeUnit('rogue', 2, 2)
    store.saveBookmark('Same')

    expect(store.getState().bookmarks).toHaveLength(1)
    store.clearUnits()
    store.loadBookmark('Same')
    expect(store.getState().units).toHaveLength(2)
  })

  it('reports a missing bookmark and an unusable name', () => {
    const store = bench()
    expect(store.loadBookmark('nothing here')).toMatchObject({ ok: false })
    expect(store.saveBookmark('!!!')).toMatchObject({ ok: false })
  })

  it('can be stepped back out of, like any other action', () => {
    const store = bench()
    store.placeUnit('melee', 1, 1)
    store.saveBookmark('Saved')
    store.placeUnit('rogue', 4, 4)
    store.loadBookmark('Saved')
    expect(store.getState().units).toHaveLength(1)

    store.undo()
    expect(store.getState().units).toHaveLength(2)
  })

  it('gives a fresh id to a unit placed after loading a bookmark with gaps in its ids', () => {
    // Ids are handed out as <type>-<n>, so a collision needs same-type units and
    // a gap: melee-1 and melee-3 saved, then a new melee placed after loading.
    // Counting the units rather than reading their ids hands out melee-3 again.
    const store = bench()
    store.placeUnit('melee', 0, 0)
    store.placeUnit('melee', 1, 0)
    store.placeUnit('melee', 2, 0)
    store.removeUnit(store.getState().units[1].id)
    store.saveBookmark('gappy')
    store.clearUnits()
    store.loadBookmark('gappy')

    store.placeUnit('melee', 4, 0)
    const ids = store.getState().units.map((u) => u.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('survives a corrupt file in the directory', () => {
    const store = bench()
    store.placeUnit('melee', 1, 1)
    store.saveBookmark('Good')
    writeFileSync(join(dir, 'broken.json'), '{ not json', 'utf8')

    expect(store.getState().bookmarks.map((b) => b.name)).toEqual(['Good'])
  })

  it('says so when no bookmark store is configured', () => {
    const store = new BenchStore()
    expect(store.saveBookmark('x')).toMatchObject({ ok: false })
    expect(store.getState().bookmarks).toEqual([])
  })
})
