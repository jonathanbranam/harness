## 1. Data model

- [ ] 1.1 In `dungeon-harness-server/src/board-state.ts`, replace `BoardCell { terrain }` with `BoardCell { fillColor: string }` and add the `BoardObject` discriminated union (`kind: "shape" | "line" | "overlay" | "label"`) per design.md's "One discriminated-union `BoardObject` type" decision, moving the surviving `Cell`/point-coordinate types in from `board-engine/types.ts`.
- [ ] 1.2 Replace `emptyCells()`'s `{ terrain: 'plains' }` default with the fixed neutral `fillColor` default.
- [ ] 1.3 Delete `dungeon-harness-server/src/board-engine/` (`movement.ts`, `movement.test.ts`, `attack.ts`, `attack.test.ts`, `unit-catalog.ts`, `types.ts`) — no successor code needs them per design.md's "`board-engine/` is deleted, not repurposed."

## 2. BoardStore methods

- [ ] 2.1 Replace `BoardStore.placeUnit` and `setTerrain` with `drawShape`, `drawLine`, `drawOverlay`, `drawLabel`, and `setCellFill`, each validating per its spec requirement (bounds checks for `setCellFill`/`drawOverlay`; ≥2 points for `drawLine`) and returning a server-assigned `id` via `randomUUID()`, following the existing validate/mutate/`emit()`/return-`OpResult` pattern.
- [ ] 2.2 Replace `removeUnit` with `removeObject(id)`, kind-agnostic, matching the "Any drawn object can be removed" spec requirement.
- [ ] 2.3 Replace `moveUnit` with `moveObject(id, geometry)`, looking up the object's existing kind by id and validating the new geometry against that kind (position for shape/label, points for line, cells for overlay) per design.md's "kind-appropriate payload, not a generic JSON blob" decision.
- [ ] 2.4 Update `clearBoard()` to reset `objects` to `[]` and every cell's `fillColor` to the default.
- [ ] 2.5 Update `getState()` to return `{ width, height, cells, objects }`.

## 3. Tool registration

- [ ] 3.1 In `dungeon-harness-server/src/pi-extensions/board-bridge.ts`, replace the `dungeon_place_unit`/`dungeon_preview_movement`/`dungeon_move_unit`/`dungeon_preview_attack`/`dungeon_set_terrain`/`dungeon_remove_unit` tool registrations with `dungeon_draw_shape`, `dungeon_draw_line`, `dungeon_draw_overlay`, `dungeon_draw_label`, `dungeon_set_cell_fill`, `dungeon_move_object`, `dungeon_remove_object`, wired to the new `BoardStore` methods from section 2. Keep `dungeon_get_board_state` and `dungeon_clear_board` registered, updated for the new return/behavior shape.
- [ ] 3.2 Update `dungeon-harness-server/src/session-store.ts`'s `CUSTOM_TOOL_NAMES` array to the new tool name list (remove the six retired names, add the seven new ones) — a tool left off this array silently isn't exposed to the agent even though registration compiles without error.

## 4. Client rendering

- [ ] 4.1 In `client-dungeon/src/components/BoardCanvas.tsx`, replace unit-glyph/terrain-enum rendering with generic rendering per object `kind`: shape (circle/rectangle with optional label), line (styled path through points), overlay (semi-transparent color wash over its cells, above cell fill), label (standalone text) — and render each cell's `fillColor` directly instead of mapping a terrain enum to a color.
- [ ] 4.2 Remove any client-side type/import referencing the old `PlacedUnit`/`Archetype`/`TerrainType` shapes; replace with the new `BoardObject`/`BoardCell` shapes (mirrored or imported from the server types, matching however client-dungeon currently shares board-state types with the server).

## 5. Tests

- [ ] 5.1 Update `dungeon-harness-server/src/board-state.test.ts` to cover the new methods: `setCellFill` (success + out-of-bounds), `drawShape`/`drawLine` (success + <2-point rejection)/`drawOverlay` (success + out-of-bounds cell rejection)/`drawLabel`, `moveObject` (success + unknown-id rejection), `removeObject` (success + unknown-id rejection), and `clearBoard`/`getState` against the new shape. Remove the old unit/terrain/movement/attack test cases.
- [ ] 5.2 Update `dungeon-harness-server/src/pi-extensions/board-bridge.test.ts` to exercise the new tool registrations end-to-end (tool call → `BoardStore` mutation → broadcast), removing the retired unit/movement/attack tool tests.

## 6. Verification

- [ ] 6.1 Run `npm run typecheck` and `npm test` from the repo root and confirm both pass with no references to the removed archetype/movement/attack types remaining.
- [ ] 6.2 Start `dungeon-harness-server`/`client-dungeon` (or ask the user to, per this repo's "never kill or restart the dev servers" rule if they're already running) and use `playwright-cli` to drive the chat UI through the new tools — draw a labeled shape, a dashed line, a colored overlay, set a cell's fill color, move an object, remove an object — and confirm the board canvas renders each correctly and updates live.
