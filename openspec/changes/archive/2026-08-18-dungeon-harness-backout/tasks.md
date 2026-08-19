## 1. Delete the Gherkin authoring core

- [x] 1.1 Delete `dungeon-harness-server/src/gherkin/`
- [x] 1.2 Delete `dungeon-harness-server/src/pi-extensions/scenario-bridge.ts`
- [x] 1.3 Delete `openspec/specs/dungeon-scenario-authoring/`

## 2. Delete the baseline / changeset surface

- [x] 2.1 Delete `dungeon-harness-server/src/pi-extensions/baseline-bridge.ts`
      and its test
- [x] 2.2 Remove `DUNGEON_TRACKWEB_FEATURES_DIR` from
      `dungeon-harness-server/src/env.ts` and from `.env.example` if present
- [x] 2.3 Delete `openspec/specs/dungeon-baseline-changeset/`

## 3. Delete the freehand board

- [x] 3.1 Delete `dungeon-harness-server/src/pi-extensions/board-bridge.ts`
      and its test
- [x] 3.2 Delete `dungeon-harness-server/src/board-state.ts` and its test
- [x] 3.3 Delete `client-dungeon/src/components/BoardCanvas.tsx`
- [x] 3.4 Delete `openspec/specs/dungeon-board-bridge/`

## 4. Rewire what is left

- [x] 4.1 `session-store.ts`: drop the `BoardStore`, the three deleted
      extension factories, `getOrCreateBoardStore`, and every deleted tool name
      from `CUSTOM_TOOL_NAMES` — leaving `dungeon_board_view`
- [x] 4.2 `websocket.ts`: drop the `board_state` server message, the board
      subscription, and the `BoardState` import
- [x] 4.3 `client-dungeon/src/hooks/useDungeonSocket.ts`: drop the board-state
      types, the `boardState` value, and the `BoardCanvas` cell-size import
- [x] 4.4 `client-dungeon/src/pages/DungeonPage.tsx`: drop the board pane,
      leaving the chat pane and the auth/theme shell
- [x] 4.5 Confirm `canvasRef` / `dungeon_board_view` still has something to
      capture, or that its render path degrades cleanly with no board pane

## 5. Rewrite the workspace instructions

- [x] 5.1 Rewrite `dungeon-harness-server/templates/agent-workspace/AGENTS.md`
      so it describes the current (scaffold-only) tool surface and the
      "the engine referees, never the agent" rule, with no Gherkin or board
      drawing workflow
- [x] 5.2 Check the workspace template for other files that teach the removed
      workflow (skills, seed docs) and remove or rewrite them

## 6. Close out the open changes

- [x] 6.1 Delete `openspec/changes/dungeon-preview-lifecycle/`
- [x] 6.2 Delete `openspec/changes/dungeon-board-rules-engine/`

## 7. Verify

- [x] 7.1 `npm run typecheck` passes
- [x] 7.2 `npm test` passes
- [x] 7.3 Grep for stale references (`board_state`, `dungeon_draw`,
      `scenario-bridge`, `baseline-bridge`, `steps-catalog`,
      `DUNGEON_TRACKWEB_FEATURES_DIR`) and confirm remaining hits are only in
      docs that describe the history
