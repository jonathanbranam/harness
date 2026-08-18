## Why

deck-harness's `slide_view` tool lets pi visually inspect the active slide by capturing a browser-rendered DOM node to a PNG and returning it as tool image content. dungeon-harness needs the identical capability for its board (`BoardCanvas`), and the proposal.md for a future visually-oriented harness explicitly anticipates a third consumer. Investigation (see conversation) found the capability splits cleanly along a boundary this repo has already drawn twice: pure client-side UI mechanics (no session/security semantics) belong in `@harness/ui` alongside `ChatPanel`/`usePaneManager`; per-session server-side pi-extension/WebSocket wiring stays copied per harness, the same way `permission-gate.ts` is copied three times today rather than parameterized through a shared abstraction.

## What Changes

- Add a `captureNode` utility to `@harness/ui` (a new `canvas-capture` module) wrapping `html-to-image`'s `toPng` with the fixed-size/style-override behavior `useDeckSocket.ts` already relies on, so both harnesses call the same capture code instead of maintaining independent copies.
- Refactor `client-deck`'s `useDeckSocket.ts` render-request handler to call the shared `captureNode` instead of calling `toPng` directly. No behavior change.
- Give `client-dungeon`'s `BoardCanvas` a forwarded ref (mirroring `DeckCanvas`'s `canvasRef` forwarding) and wire a `render_request`/`render_response` handler into `useDungeonSocket.ts`, using the shared `captureNode` utility.
- Add a `dungeon_board_view` pi tool to dungeon-harness-server, modeled directly on deck-harness-server's `slide-visual-inspection.ts`: a new `board-visual-inspection.ts` extension, `requestRender` plumbing in `websocket.ts` (`pendingRenders` map + timeout, mirroring deck's), and per-session wiring plus tool-allowlist registration in `session-store.ts`.
- `@harness/ui`'s `package.json` gains `html-to-image` as a dependency; `client-dungeon`'s gains `@harness/ui`'s existing capture export (no new direct dependency needed if already consumed via `@harness/ui`).

## Capabilities

### New Capabilities
- `shared-ui/canvas-capture`: `@harness/ui`'s DOM-node-to-PNG capture utility, used by any harness that needs to let pi visually inspect a live canvas.
- `dungeon-board-visual-inspection`: the `dungeon_board_view` tool, dungeon-harness's analogue of `slide-visual-inspection`.

### Modified Capabilities
(none — `slide-visual-inspection`'s behavior is unchanged; only its client-side implementation is refactored to call the shared utility.)

## Impact

- **New**: `packages/ui/src/canvas/captureNode.ts` (+ export from `packages/ui/src/index.ts`), `dungeon-harness-server/src/pi-extensions/board-visual-inspection.ts`.
- **Modified**: `client-deck/src/hooks/useDeckSocket.ts` (call shared util), `client-dungeon/src/components/BoardCanvas.tsx` (forwardRef), `client-dungeon/src/hooks/useDungeonSocket.ts` (render-request handling), `client-dungeon/src/pages/DungeonPage.tsx` (wire canvasRef through to `BoardCanvas`), `dungeon-harness-server/src/websocket.ts` (render_request/render_response protocol), `dungeon-harness-server/src/session-store.ts` (extension wiring + tool allowlist).
- **Dependencies**: `packages/ui/package.json` adds `html-to-image`.
- No changes to deck-harness-server or to `slide_view`'s observable behavior.
