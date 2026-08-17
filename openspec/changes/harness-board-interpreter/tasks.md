## 1. Board engine (pure module)

- [x] 1.1 Create `dungeon-harness-server/src/board-engine/types.ts`:
  `Archetype`, `Faction`, `Direction`, `TerrainType`, `UnitDef`, `Cell`,
  `PlacedUnit`, `BoardState` types per design.md/spec.md.
- [x] 1.2 Create `dungeon-harness-server/src/board-engine/unit-catalog.ts`:
  hardcoded `Record<Archetype, UnitDef>` for `melee`/`rogue`/`ranger`/
  `magic-user`/`short-range`/`long-range`, values from spec.md's "Units are
  placed from a fixed archetype catalog" requirement, with a header comment
  naming the exact track-web source file/path these were transcribed from
  (per design.md's "Hand-copied, hardcoded archetype catalog" decision).
- [x] 1.3 Create `dungeon-harness-server/src/board-engine/movement.ts`:
  `findPath(board, unitId, dest): Cell[] | { error: string }` — 4-directional
  BFS shortest path, cells occupied by other units excluded, capped at the
  unit's `movement.range`.
- [x] 1.4 Create `dungeon-harness-server/src/board-engine/attack.ts`:
  `computeFootprint(unit, dir): Cell[]` (single/line/plus geometry per
  `targeting`/`propagation`, clipped to board bounds) and
  `resolveHits(footprint, board, penetration): Cell[]` (occupancy +
  `none`/`stop_at_first` rule).
- [x] 1.5 Add `board-engine/*.test.ts` covering: movement in-range/
  out-of-range/blocked-by-unit; single/line/plus footprint geometry
  including board-edge clipping; `stop_at_first` hitting only the nearest
  occupied cell vs. `none` hitting every occupied cell in the footprint.

## 2. Board store

- [x] 2.1 Create `dungeon-harness-server/src/board-state.ts`: `BoardStore`
  class mirroring `deck-harness-server/src/editor-state.ts`'s
  subscribe/emit shape — private 16x8 grid of `{ terrain }` cells and a
  `PlacedUnit[]` list, `subscribe(listener)`, `getState()`, `placeUnit(...)`,
  `setTerrain(...)`, each validating bounds/occupancy per spec.md and
  calling `emit()` on success. No persistence, no undo/redo (design.md's
  "scratch space, not an artifact" decision).
- [x] 2.2 Export a per-session `BoardStore` factory (not a module-level
  singleton like `deck-harness-server`'s `editorStore` — this harness's
  board is per design-session state, not one shared global deck) and thread
  it alongside the `AgentSession` in `session-store.ts`'s `SessionRecord`.
- [x] 2.3 Add `board-state.test.ts`: placement validation (occupied cell,
  out-of-bounds, unknown archetype rejected), terrain validation
  (out-of-bounds rejected), `getState()` reflects prior mutations.

## 3. Tool bridge

- [x] 3.1 Create `dungeon-harness-server/src/pi-extensions/board-bridge.ts`:
  register `dungeon_get_board_state`, `dungeon_preview_movement`,
  `dungeon_preview_attack`, `dungeon_place_unit`, `dungeon_set_terrain`
  (typebox parameter schemas per spec.md's per-tool requirements), each
  `execute` calling the session's `BoardStore` and `board-engine` functions.
- [x] 3.2 Wire `boardBridge` into `session-store.ts`'s
  `DefaultResourceLoader` `extensionFactories` list, alongside the existing
  `createPermissionGateExtension` call.
- [x] 3.3 Add a `CUSTOM_TOOL_NAMES` list to `session-store.ts` (this harness
  had none before this change) containing the five `dungeon_*` tool names,
  and change the `tools:` array passed to `createAgentSession` from
  `[...BUILTIN_TOOLS]` to `[...BUILTIN_TOOLS, ...CUSTOM_TOOL_NAMES]` — a
  tool registered via `pi.registerTool` but left off this array is silently
  unavailable to the agent even though registration itself succeeds.
- [x] 3.4 Add `board-bridge.test.ts` covering each tool's success and error
  paths (unknown unit id, out-of-range destination, occupied cell, unknown
  archetype, out-of-bounds terrain).

## 4. WebSocket protocol

- [x] 4.1 Add a `board_state` message to `websocket.ts`'s `ServerMessage`
  union, and in `onOpen`, subscribe to the session's `BoardStore` (alongside
  the existing `session.subscribe` for `agent_event`) so every board
  mutation pushes a fresh `board_state` message to the connection; send one
  immediately on `onOpen` too, so a reconnecting client gets current state
  without waiting for the next mutation. Unsubscribe in `onClose` alongside
  `unsubscribeAgent`.
- [x] 4.2 Update `useDungeonSocket.ts`: add a `boardState` field to its
  returned state, populated from incoming `board_state` messages.

## 5. Client board canvas

- [x] 5.1 Create `client-dungeon/src/components/BoardCanvas.tsx`: plain SVG
  rendering of the grid — one rect per cell colored/labeled by terrain type,
  a marker per placed unit labeled by archetype and faction (per
  `deck-harness`'s precedent of plain SVG/Canvas over Phaser for its own
  live-state view).
- [x] 5.2 Add movement-preview and attack-preview overlay rendering to
  `BoardCanvas`: a highlighted path line for the most recent
  `dungeon_preview_movement` result, and footprint-cell highlighting (hit
  cells visually distinct from not-hit footprint cells) for the most recent
  `dungeon_preview_attack` result — sourced from the relevant tool-call
  results in the agent-event stream (`useDungeonSocket`'s transcript), not a
  new server message.
- [x] 5.3 Wire `BoardCanvas` into `DungeonPage.tsx` alongside `ChatPanel`
  (split layout, mirroring `client-deck`'s `PresentationView` composing
  `DeckCanvas` + chat).

## 6. End-to-end verification

- [x] 6.1 Run `npm run typecheck` and `npm test` and confirm both pass with
  the new `board-engine`/`board-state`/`board-bridge` code included.
- [x] 6.2 Start `dungeon-harness-server`/`client-dungeon`, log in, and ask
  the agent to place two units and preview a movement path; verify the path
  renders on the board.
- [x] 6.3 Ask the agent to place a `ranger` and a target unit in its line of
  fire beyond another unit, preview the attack, and verify the board shows
  the full line footprint with only the nearer unit's cell marked as hit.
- [x] 6.4 Ask the agent to set a cell's terrain and verify it renders, and
  that a movement path through that cell is unaffected by it.
- [x] 6.5 Run `openspec validate harness-board-interpreter --type change
  --strict` and fix any issues.
