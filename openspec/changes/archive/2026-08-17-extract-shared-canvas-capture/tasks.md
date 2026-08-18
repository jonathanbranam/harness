## 1. Shared client capture utility

- [x] 1.1 Add `html-to-image` as a dependency of `packages/ui/package.json`.
- [x] 1.2 Create `packages/ui/src/canvas/captureNode.ts` exporting `captureNode(node, opts)`, wrapping `html-to-image`'s `toPng` with caller-supplied `{ width, height, style? }` (design.md Decision 2).
- [x] 1.3 Export `captureNode` from `packages/ui/src/index.ts`.

## 2. Refactor deck-harness to use the shared utility

- [x] 2.1 Update `client-deck/src/hooks/useDeckSocket.ts`'s `handleRenderRequest` to call `captureNode` from `@harness/ui` instead of calling `toPng` directly, passing the existing `{ width: 960, height: 540, style: { transform: 'none' } }` options.
- [x] 2.2 Verify `slide_view` still renders correctly end-to-end (no change to `slide-visual-inspection.ts`, `websocket.ts`, or `session-store.ts` is expected).

## 3. dungeon-harness-server: board render-request plumbing

- [x] 3.1 Add `render_request`/`render_response` message types to `dungeon-harness-server/src/websocket.ts`'s `ClientMessage`/`ServerMessage` unions, mirroring deck's.
- [x] 3.2 Add a `pendingRenders` Map, `RENDER_TIMEOUT_MS` (15s), and a `requestRender` implementation to `createDungeonSocketHandlers`, mirroring deck's `websocket.ts`.
- [x] 3.3 Resolve/reject pending renders in the `render_response` message case and in `onClose`, mirroring deck's.

## 4. dungeon-harness-server: board_view tool

- [x] 4.1 Create `dungeon-harness-server/src/pi-extensions/board-visual-inspection.ts`, mirroring `slide-visual-inspection.ts`'s shape: a factory taking `{ requestRender }`, registering `dungeon_board_view`, parsing the returned data URL, and returning image content or an error tool result.
- [x] 4.2 Wire `createBoardVisualInspectionExtension({ requestRender })` into dungeon's per-session extension list in `session-store.ts`, passing `requestRender` through the same way `getOrCreateSession`/`getOrCreateBoardStore` already thread `requestApproval`.
- [x] 4.3 Add `dungeon_board_view` to `session-store.ts`'s `CUSTOM_TOOL_NAMES` array — a registered-but-not-allowlisted tool is silently unavailable to the agent.

## 5. client-dungeon: capture wiring

- [x] 5.1 Give `client-dungeon/src/components/BoardCanvas.tsx` a forwarded ref onto its root DOM node, mirroring `DeckCanvas`'s `canvasRef` forwarding.
- [x] 5.2 Add a `canvasRef` and a `render_request` handler to `client-dungeon/src/hooks/useDungeonSocket.ts`, calling the shared `captureNode` with the board's fixed pixel dimensions (no style override needed — `BoardCanvas` has no scale-to-fit transform) and replying with `render_response`, mirroring `useDeckSocket.ts`.
- [x] 5.3 Wire `canvasRef` from `useDungeonSocket` through `DungeonPage.tsx` onto the rendered `<BoardCanvas>`, mirroring `DeckPage.tsx`.

## 6. Specs and verification

- [x] 6.1 Confirm `openspec validate` passes for the new `shared-ui/canvas-capture` and `dungeon-board-visual-inspection` delta specs.
- [x] 6.2 Manually verify `dungeon_board_view` end-to-end: draw an object on the board, call the tool, confirm the returned image reflects it.
- [x] 6.3 Run `npm run typecheck` and `npm test` across the workspace.
