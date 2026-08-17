## 1. BoardStore mutations

- [x] 1.1 Add `BoardStore.removeUnit(unitId: string): OpResult` to
      `board-state.ts`: error if no unit has `unitId`; otherwise filter it
      out of `this.units`, `emit()`, and return `{ ok: true }`.
- [x] 1.2 Add `BoardStore.moveUnit(unitId: string, dest: Cell): OpResult`
      to `board-state.ts`: call `findPath(this.getState(), unitId, dest)`
      from `board-engine/movement.ts`; on a `PathError`, return
      `{ ok: false, error }`; on success, overwrite the matching unit's
      `position` with `dest`, `emit()`, and return `{ ok: true }`.
- [x] 1.3 Add `BoardStore.clearBoard(): OpResult` to `board-state.ts`:
      reset `this.units = []` and `this.cells = emptyCells()`, `emit()`,
      and return `{ ok: true }`.
- [x] 1.4 Add unit tests in `board-state.test.ts` for all three methods:
      success cases, the unknown-id error case for
      `removeUnit`/`moveUnit`, the out-of-range and blocked error cases
      for `moveUnit`, and clearing both an empty and a non-empty board.

## 2. Tool registration

- [x] 2.1 Register `dungeon_remove_unit` in `board-bridge.ts`:
      `Type.Object({ unitId: Type.String() })`, calling
      `board.removeUnit(params.unitId)`.
- [x] 2.2 Register `dungeon_move_unit` in `board-bridge.ts`:
      `Type.Object({ unitId: Type.String(), col: Type.Number(), row: Type.Number() })`,
      calling `board.moveUnit(params.unitId, { col: params.col, row: params.row })`.
- [x] 2.3 Register `dungeon_clear_board` in `board-bridge.ts`:
      `Type.Object({})`, calling `board.clearBoard()`.
- [x] 2.4 Add `dungeon_remove_unit`, `dungeon_move_unit`, and
      `dungeon_clear_board` to `session-store.ts`'s tool allowlist —
      otherwise these tools compile and register but are silently
      unavailable to the agent (see CLAUDE.md / design.md's noted
      gotcha).
- [x] 2.5 Add tests in `board-bridge.test.ts` exercising all three new
      tools end-to-end through the registered extension (not just the
      underlying `BoardStore` methods), covering one success case and one
      error case each.

## 3. Verification

- [x] 3.1 Run `npm run typecheck` and `npm test` from the repo root.
- [x] 3.2 Manually exercise the new tools against a running
      `dungeon-harness-server` + `client-dungeon` session (place a couple
      of units, move one, remove one, clear the board) and confirm the
      browser's board view updates live for each operation.
