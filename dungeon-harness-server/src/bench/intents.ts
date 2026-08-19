// The browser's half of the bench protocol.
//
// A click in the client and a tool call from the agent land in the same place:
// one `BenchStore`, refereed by the engine. This module is the translation from
// a wire message to a bench method, and it is deliberately the *only* one — so
// there is no path by which the browser can change board state except through a
// method the engine backs.

import type { ActionId } from '@repo/dungeon-engine'
import type { BenchResult, BenchStore, UnitType } from './bench-store'
import { boardFromRows, generateBoard, type BoardPreset } from './board-gen'

export type BenchIntent =
  | { kind: 'select'; unitId: string | null }
  | { kind: 'commit'; action: ActionId; col: number; row: number }
  | { kind: 'place'; unitType: UnitType; col: number; row: number; hp?: number }
  | { kind: 'remove'; unitId: string }
  | { kind: 'relocate'; unitId: string; col: number; row: number }
  | { kind: 'setHp'; unitId: string; hp: number }
  | { kind: 'clearUnits' }
  | { kind: 'newBoard'; cols?: number; rows?: number; preset?: BoardPreset; seed?: number; powerCenters?: number; rowsText?: string[] }
  | { kind: 'runEnemyAi' }
  | { kind: 'endRound' }
  | { kind: 'undo' }
  | { kind: 'redo' }
  | { kind: 'stepTo'; index: number }
  | { kind: 'tweakDef'; unitType: UnitType; maxHp?: number; moveRange?: number; damage?: number; minRange?: number; maxRange?: number }
  | { kind: 'resetDefs' }
  | { kind: 'saveBookmark'; name: string }
  | { kind: 'loadBookmark'; name: string }
  | { kind: 'deleteBookmark'; name: string }

export function applyIntent(bench: BenchStore, intent: BenchIntent): BenchResult {
  switch (intent.kind) {
    case 'select':
      return bench.select(intent.unitId)
    case 'commit':
      return bench.commitSelected(intent.action, { col: intent.col, row: intent.row })
    case 'place':
      return bench.placeUnit(intent.unitType, intent.col, intent.row, intent.hp)
    case 'remove':
      return bench.removeUnit(intent.unitId)
    case 'relocate':
      return bench.relocateUnit(intent.unitId, intent.col, intent.row)
    case 'setHp':
      return bench.setUnitHp(intent.unitId, intent.hp)
    case 'clearUnits':
      return bench.clearUnits()
    case 'newBoard':
      try {
        const map = intent.rowsText
          ? boardFromRows(intent.rowsText)
          : generateBoard({ cols: intent.cols, rows: intent.rows, preset: intent.preset, seed: intent.seed, powerCenters: intent.powerCenters })
        return bench.newBoard(map)
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Could not build that board' }
      }
    case 'runEnemyAi':
      return bench.runEnemyAi()
    case 'endRound':
      return bench.endRound()
    case 'undo':
      return bench.undo()
    case 'redo':
      return bench.redo()
    case 'stepTo':
      return bench.stepTo(intent.index)
    case 'tweakDef':
      return bench.tweakDef(intent.unitType, {
        maxHp: intent.maxHp,
        moveRange: intent.moveRange,
        damage: intent.damage,
        minRange: intent.minRange,
        maxRange: intent.maxRange,
      })
    case 'resetDefs':
      return bench.resetDefs()
    case 'saveBookmark':
      return bench.saveBookmark(intent.name)
    case 'loadBookmark':
      return bench.loadBookmark(intent.name)
    case 'deleteBookmark':
      return bench.deleteBookmark(intent.name)
  }
}
