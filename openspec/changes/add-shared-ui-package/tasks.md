## 1. Package scaffolding

- [ ] 1.1 Create `packages/ui` workspace (`package.json` with `main`/`exports` pointing at `./src/index.ts`, `tsconfig.json`) following track-web's `packages/ui` pattern — no build step
- [ ] 1.2 Add `packages/ui` to root `package.json`'s `workspaces` array
- [ ] 1.3 Add `packages/ui` to `npm run typecheck` and `vitest.config.mts`'s `include` glob (CLAUDE.md's "Keep in sync" treatment for a new workspace member)
- [ ] 1.4 Add `react`, `react-markdown`, `remark-gfm`, and `react-resizable-panels` as dependencies/peerDependencies of `packages/ui` as appropriate

## 2. Shared chat panel pieces

- [ ] 2.1 Add the canonical `TranscriptEntry` type to `packages/ui` (matching deck's current `ChatMessageEntry | ToolCallEntry` shape)
- [ ] 2.2 Extract `useStickToBottom(scrollRef, deps)` from `client-introspect/src/components/ChatPanel.tsx` into `packages/ui`
- [ ] 2.3 Move `MarkdownMessage` from `client-introspect/src/components/MarkdownMessage.tsx` into `packages/ui`
- [ ] 2.4 Build `ChatInput` (auto-growing textarea capped at ~6 lines with internal scroll past that, Enter-submits/Shift+Enter-newline, IME `isComposing`/`keyCode === 229` guard, resets to single-line height after submit) per design.md Decisions 5–6
- [ ] 2.5 Build `ToolBadge` (reads `entry.resultSummary`, matching deck/dungeon's current `TranscriptEntry`-shaped tool badge)
- [ ] 2.6 Build the shared `ChatPanel(transcript, connected, onSend, placeholder?)` composing 2.1–2.5, including the existing no-empty-bubble filter and message-bubble layout
- [ ] 2.7 Export all of the above from `packages/ui/src/index.ts`

## 3. Shared pane-management pieces

- [ ] 3.1 Extract `usePaneManager(paneIds, defaultSizes)` from `client-introspect/src/pages/IntrospectPage.tsx`, replacing its module-level `PANE_IDS`/`DEFAULT_SIZES` constants with hook arguments (returns `paneModes`, `panelRefs`, `minimizePane`, `maximizePane`, `restorePane`, `handleLayoutChanged`)
- [ ] 3.2 Extract `PaneRail` and `PaneHeader` as presentational components taking a `title` prop instead of looking it up from a module-level `PANE_TITLES` map
- [ ] 3.3 Export `usePaneManager`, `PaneRail`, `PaneHeader` from `packages/ui/src/index.ts`

## 4. client-deck migration

- [ ] 4.1 Add `@harness/ui` and `react-resizable-panels` to `client-deck/package.json`
- [ ] 4.2 Delete `client-deck/src/components/ChatPanel.tsx`; update `DeckPage.tsx` to import `ChatPanel` from `@harness/ui`
- [ ] 4.3 Rewrite `DeckPage.tsx`'s layout from `grid-cols-[1fr_380px]` to a `Group`/`Panel`/`Separator` split (canvas pane + chat pane) built on `usePaneManager`/`PaneRail`/`PaneHeader`, with the canvas pane defaulting wider than the chat pane
- [ ] 4.4 Smoke-test in the browser via `playwright-cli` against the already-running dev client: stick-to-bottom auto-scroll, drag-resize, minimize/maximize/restore, auto-growing input, Enter submits, Shift+Enter inserts a newline

## 5. client-dungeon migration

- [ ] 5.1 Change `client-dungeon/src/hooks/useDungeonSocket.ts`'s `ToolCallEntry` to extend `@harness/ui`'s shared `ToolCallEntry` with its own `result?: unknown` field, instead of redefining the whole `TranscriptEntry` type
- [ ] 5.2 Add `@harness/ui` and `react-resizable-panels` to `client-dungeon/package.json`
- [ ] 5.3 Delete `client-dungeon/src/components/ChatPanel.tsx`; update `DungeonPage.tsx` to import `ChatPanel` from `@harness/ui`
- [ ] 5.4 Rewrite `DungeonPage.tsx`'s layout from `grid-cols-[1fr_380px]` to a `Group`/`Panel`/`Separator` split (board pane + chat pane) built on `usePaneManager`/`PaneRail`/`PaneHeader`, with the board pane defaulting wider than the chat pane
- [ ] 5.5 Verify `findLatestPreview` (movement/attack preview overlay in `BoardCanvas`) still reads `result` off transcript entries correctly after the type change in 5.1
- [ ] 5.6 Smoke-test in the browser via `playwright-cli`: stick-to-bottom auto-scroll, drag-resize, minimize/maximize/restore, auto-growing input, Enter/Shift+Enter, movement/attack preview overlay still renders

## 6. client-introspect migration

- [ ] 6.1 Add `@harness/ui` to `client-introspect/package.json`
- [ ] 6.2 Update `client-introspect/src/components/ChatPanel.tsx` to import `useStickToBottom`, `MarkdownMessage`, and `ChatInput` from `@harness/ui` instead of its local copies, keeping its own `ContextBlock`-shaped rendering, reversed-order display, `ToolBadge` (reads `block.text`), and `disabled`/replay-mode handling
- [ ] 6.3 Update `client-introspect/src/pages/IntrospectPage.tsx` to use the shared `usePaneManager`/`PaneRail`/`PaneHeader` from `@harness/ui` instead of its local pane-management code, passing its existing `CHAT_PANE`/`APPARATUS_PANE` IDs and default sizes
- [ ] 6.4 Smoke-test in the browser via `playwright-cli`: existing pane and auto-scroll behavior unchanged, new auto-growing input works, replay-mode `disabled` state still disables the input

## 7. Verification

- [ ] 7.1 Run `npm run typecheck` across the whole workspace
- [ ] 7.2 Run `npm test`
- [ ] 7.3 Verify Tailwind classes used inside `packages/ui/src` (e.g. `prose prose-sm dark:prose-invert`) are actually generated in each client's built CSS; if Tailwind v4's automatic content scan doesn't reach `packages/ui`, add an explicit `@source` directive to each client's `index.css` (see design.md's Tailwind scan risk)
- [ ] 7.4 Manually verify Enter during IME composition does not submit the message in at least one harness
