import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
    store.placeUnit('melee', 0, 0)
    store.select(store.getState().units[0].id)
    store.moveSelectedTo(3, 0)
    store.saveBookmark('Half moved')

    // Round end refreshes the budget; the bookmark should still hold the spent one.
    store.endRound()
    expect(store.getState().selection!.remainingMove).toBe(4)

    store.loadBookmark('Half moved')
    store.select(store.getState().units[0].id)
    expect(store.getState().selection!.remainingMove).toBe(1)
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
