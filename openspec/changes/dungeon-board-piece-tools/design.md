## Context

See proposal.md - Why. `BoardStore` (`dungeon-harness-server/src/board-state.ts`)
currently exposes only `getState`, `placeUnit`, and `setTerrain`; both
mutation methods validate, mutate `this.cells`/`this.units`, then call
`this.emit()` to broadcast to WebSocket subscribers. `board-bridge.ts`
registers one `pi.registerTool` call per `BoardStore` operation, and
`session-store.ts` keeps a separate allowlist of tool names that must match
or the tool silently isn't exposed to the agent. `dungeon_preview_movement`
already computes range-limited, occupancy-aware pathing via `findPath` in
`board-engine/movement.ts`, which returns either a `Cell[]` path or a
`PathError`.

## Goals / Non-Goals

**Goals:**
- Add `removeUnit`, `moveUnit`, `clearBoard` to `BoardStore`, following the
  existing validate-then-mutate-then-emit shape of `placeUnit`/`setTerrain`.
- Reuse `findPath` as-is for `moveUnit`'s validation instead of duplicating
  pathing logic.

**Non-Goals:**
- No change to `dungeon_preview_movement`/`dungeon_preview_attack` — they
  stay read-only previews; `dungeon_move_unit` is a new, separate commit
  path.
- No undo/redo for these new mutations — the board already has none (see
  `board-state.ts`'s header comment), and this change doesn't add it.
- No batch/multi-unit variants (e.g. clearing only units of one faction) —
  `dungeon_clear_board` clears everything, matching the "fresh session"
  state the proposal ties it to.

## Decisions

**`moveUnit` reuses `findPath` for validation, then mutates in `BoardStore`.**
`findPath(board.getState(), unitId, dest)` already returns a `PathError`
distinguishing "no unit with that id" from "out of range"/"blocked," which
is exactly the error set `dungeon_move_unit`'s spec requires. `BoardStore.moveUnit`
calls `findPath(this.getState(), unitId, dest)`; on success it looks up the
unit in `this.units` by id and overwrites its `position`, then `emit()`s.
Alternative considered: duplicate a lighter-weight reachability check
directly against `this.units`/`this.cells` inside `BoardStore` to avoid the
`board-engine` → `board-state` import direction — rejected because it
would duplicate range/occupancy logic that already exists and is tested,
for no behavioral benefit; `board-state.ts` importing from `board-engine/`
is not a new dependency direction (`board-bridge.ts` already imports both).

**`clearBoard` resets to the same initial state as construction**, i.e.
`this.units = []` and `this.cells = emptyCells()` (or equivalent
per-cell reset to `{ terrain: 'plains' }`), matching
`dungeon-board-bridge`'s existing "Board initializes with a fixed grid and
no units" requirement exactly rather than introducing a second definition
of "empty."

**`removeUnit` is a simple filter-by-id.** `this.units =
this.units.filter(u => u.id !== unitId)`, after checking the unit exists
(to return the required "unknown id" error rather than silently no-op'ing).

**Tool parameter shapes mirror existing tools.** `dungeon_remove_unit` takes
`{ unitId: Type.String() }` (same shape as `dungeon_preview_movement`'s
`unitId` param); `dungeon_move_unit` takes `{ unitId, col, row }` (same
shape as `dungeon_preview_movement`'s full param set, since it's the same
operation, committed); `dungeon_clear_board` takes `Type.Object({})` (same
shape as `dungeon_get_board_state`, the only other no-argument tool).

## Risks / Trade-offs

- **`dungeon_clear_board` is destructive and irreversible** (no undo) →
  Mitigation: this matches the existing risk profile of the board overall
  (no undo/redo anywhere yet, per `board-state.ts`'s header comment) and
  the proposal's explicit ask for a full reset; not a new category of risk
  introduced by this change.
- **Forgetting the `session-store.ts` allowlist addition silently drops a
  tool** (per CLAUDE.md's noted gotcha) → Mitigation: tasks.md calls this
  out as an explicit, separately-checkable step, and `board-bridge.test.ts`
  gains tests that would fail if a tool were unreachable end-to-end via the
  session.
