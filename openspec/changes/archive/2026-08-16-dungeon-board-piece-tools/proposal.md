## Why

The dungeon-harness agent can currently only add units (`dungeon_place_unit`),
paint terrain (`dungeon_set_terrain`), and *preview* (not commit) movement —
there is no way to remove a placed unit, reposition one that's already
placed, or reset the board to empty. A designer iterating on a scenario has
to describe a new empty layout by hand or abandon the session and start
over; the agent itself has already run into this gap and reported back that
it has "no dungeon_remove_unit tool" and "no dedicated reset board tool"
when asked to clear the board. Scenario authoring (`dungeon-scenario-authoring`)
needs the ability to iterate — place a few units, move one into position,
preview, remove one that's wrong, try again, or wipe the board entirely
between scenario drafts.

This gap wasn't deferred by design: the original tool sketch
(`docs/dungeon-harness/phases/phase-03-harness-board-interpreter.md`)
only ever planned a setup pair (place/terrain) and a read-only preview pair
(movement/attack) — no phase document mentions remove/clear/move. It
surfaced from actually using the harness, not from a known backlog item.

## What Changes

- Add a `dungeon_remove_unit` tool that removes a single placed unit by id.
- Add a `dungeon_move_unit` tool that commits a placed unit's movement to a
  destination cell, using the same range-limited, occupancy-aware pathing
  `dungeon_preview_movement` already computes (`findPath` in
  `board-engine/movement.ts`) — but updates the unit's position on success
  instead of only reporting the path.
- Add a `dungeon_clear_board` tool that removes every placed unit and resets
  every cell's terrain back to `"plains"` in one call — a full reset to the
  fresh-session state described in `dungeon-board-bridge`'s "Board
  initializes with a fixed grid and no units" requirement.
- Extend `BoardStore` (`board-state.ts`) with `removeUnit(unitId)`,
  `moveUnit(unitId, dest)`, and `clearBoard()` methods backing the three new
  tools, each broadcasting the updated state over the existing WebSocket
  subscription like `placeUnit`/`setTerrain` already do.
- Register all three new tools in `board-bridge.ts` and add them to
  `session-store.ts`'s tool allowlist (required for `pi.registerTool` to
  actually expose a tool to the agent — see CLAUDE.md).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `dungeon-board-bridge`: adds `dungeon_remove_unit` (remove one placed unit
  by id, erroring on an unknown id), `dungeon_move_unit` (commit a
  range-limited, occupancy-aware move to a destination cell, erroring under
  the same conditions `dungeon_preview_movement` does instead of moving the
  unit), and `dungeon_clear_board` (remove all units and reset all terrain
  to `"plains"`), all three broadcasting the updated board state to the
  connected browser like existing mutation tools.

## Impact

- `dungeon-harness-server/src/board-state.ts`: new
  `removeUnit`/`moveUnit`/`clearBoard` methods on `BoardStore`.
- `dungeon-harness-server/src/pi-extensions/board-bridge.ts`: three new
  registered tools.
- `dungeon-harness-server/src/session-store.ts`: tool allowlist addition.
- Existing tests (`board-state.test.ts`, `board-bridge.test.ts`) gain
  coverage for the new operations.
