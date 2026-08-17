## Why

Phase 03 of `docs/dungeon-harness/proposal.md` (see
`docs/dungeon-harness/phases/phase-03-harness-board-interpreter.md`) gives
dungeon-harness its own live game board plus a local, pure reimplementation
of just enough of the movement/attack model to preview a scenario's steps
while the designer writes them. Phase 01 (`dungeon-harness-scaffold`,
archived) stood up the harness's auth/session/chat scaffold with no
dungeon-tactics tools at all; this phase is the first to give the agent and
the browser UI a shared piece of domain state to look at, which phase 05's
Gherkin-authoring tools (out of scope here) and phase 08's round-one
scenario coverage both depend on existing first.

## What Changes

- Add `dungeon-harness-server/src/board-engine/`: a pure TS module —
  range-limited grid movement/pathing, and single/line/plus attack-footprint
  calculation with cardinal-direction targeting — matching today's simple
  `UnitDef` shape's behavior (flat `maxHp`/`movement.range`/`attack`), a
  fresh implementation, not a port of track-web's `pc.ts`/`npc.ts`/
  `attackFootprint.ts`/`pathfinding.ts` (dungeon-harness never gets
  `write`/`edit`/import access into track-web's engine code — see
  `docs/dungeon-harness/proposal.md`'s "The game board" section).
- Add `dungeon-harness-server/src/board-state.ts`: an in-memory board store
  (grid dimensions, terrain, unit placements), analogous in shape to
  `deck-harness-server/src/editor-state.ts`.
- Add `dungeon-harness-server/src/pi-extensions/board-bridge.ts`: register
  `dungeon_get_board_state`, `dungeon_preview_movement`,
  `dungeon_preview_attack`, `dungeon_place_unit`, `dungeon_set_terrain` (per
  `docs/dungeon-harness/proposal.md`'s tool sketch), operating on the board
  store and board-engine module.
- Wire `board-bridge`'s tool names into `session-store.ts`'s
  `CUSTOM_TOOL_NAMES` allowlist (per this repo's rule that a registered tool
  not added there is silently unavailable to the agent).
- Add a board-state broadcast to `websocket.ts`, mirroring how
  `deck-harness-server`'s socket broadcasts `DeckState` on every
  `editorStore` change, so the browser's board view always reflects the
  live store without polling.
- Add `client-dungeon`'s board canvas: plain SVG/Canvas (not Phaser, per
  `docs/dungeon-harness/proposal.md`: client-deck already made this call for
  its own live-state view) rendering the grid, terrain, unit placements, and
  a movement-path / attack-footprint preview overlay when the agent (or a
  direct tool call) previews one.
- No Gherkin I/O in this phase (`dungeon_load_baseline`,
  `dungeon_read_feature`, etc.) — that's phase 05. This phase is purely the
  visual/interpreter half: a board the designer and agent can both look at
  and manipulate.

## Capabilities

### New Capabilities
- `dungeon-board-bridge`: the board store's read/write contract
  (state shape, terrain, unit placement), the local movement/attack
  interpreter's rules (range-limited pathing; single/line/plus footprint
  calculation with cardinal-direction targeting), the five
  `dungeon_*` tools' behavior, and the board canvas rendering the same state
  and previews the tools compute — one capability because, unlike
  deck-harness's `deck-canvas-display` (pure viewport-fit/display mechanics,
  independent of any tool), the board canvas in this phase has no
  presentation concern separate from the domain model it renders.

### Modified Capabilities
(none)

## Impact

- New pure module `dungeon-harness-server/src/board-engine/` (no
  dependency on `@earendil-works/pi-coding-agent` or Hono — plain TS,
  unit-testable in isolation).
- New `dungeon-harness-server/src/board-state.ts` and
  `src/pi-extensions/board-bridge.ts`.
- Modifies `dungeon-harness-server/src/session-store.ts` (tool allowlist,
  extension registration) and `src/websocket.ts` (board-state broadcast
  message).
- New `client-dungeon/src/components/BoardCanvas.tsx` (or similar) plus
  whatever socket-hook changes are needed to receive the board-state
  broadcast, mirroring `useDeckSocket`'s `deck_state` handling in
  `useDungeonSocket`.
- No changes to `dungeon-harness-auth`/`dungeon-agent-session`/
  `dungeon-tool-permission-gate`'s existing contracts. `dungeon-tool-
  permission-gate`'s gate only inspects `bash`/`write`/`edit` calls (see
  `deck-harness-server/src/pi-extensions/permission-gate.ts`'s
  `GATED_TOOLS`); the new `dungeon_*` tools mutate in-memory board state
  only, no filesystem or shell access, so — like `presentation_*`/`deck_*`
  in deck-harness — they fall outside the gate entirely and need no new
  approval-flow work.
