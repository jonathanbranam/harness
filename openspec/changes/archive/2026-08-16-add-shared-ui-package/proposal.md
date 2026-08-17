## Why

Deck, dungeon, and introspect's chat panels have converged on the same needs — legible message/tool-call rendering, auto-scroll, resizable/minimize/maximize panes, and a usable multi-line input — but only introspect has actually solved auto-scroll and resizable panes, and none of the three have an auto-growing input. Deck and dungeon's chat panel is a fixed-width sidebar behind a plain single-line `<input>`, and their `ChatPanel.tsx` files are already near-byte-identical copies of each other. Continuing to build each harness's chat UI independently means re-solving (or, as with auto-scroll, simply not solving) the same interaction problems per harness, and every future harness starts from zero again. Extracting a shared `packages/ui` package now — while there are three harnesses to validate the split — lets deck and dungeon adopt introspect's proven interactions directly and gives future harnesses a ready-made chat UI.

## What Changes

- Add a new `packages/ui` workspace package (`@harness/ui`), following track-web's `packages/ui` pattern: plain TypeScript source, no build step, consumed directly via npm workspace resolution.
- Extract a shared `ChatPanel` component (message bubbles, tool badges, markdown rendering, no-empty-bubble filtering) and its supporting pieces into `@harness/ui`: `useStickToBottom` (stick-to-bottom auto-scroll hook), `ToolBadge`, `MarkdownMessage`, `ChatInput`, and the canonical `TranscriptEntry` type.
- Add an auto-growing chat input (`ChatInput`): the text box grows with typed content up to ~6 lines, then scrolls internally using the browser's native caret-follow behavior; Enter submits, Shift+Enter inserts a newline; the box returns to single-line height after a message is sent. **BREAKING** for existing muscle memory: the chat input changes from a single-line `<input>` (Enter always submits, no multi-line entry) to a `<textarea>` with Shift+Enter for newlines, across all three harnesses.
- Extract introspect's resizable/minimize/maximize/restore pane-management system (`usePaneManager` hook, `PaneRail`, `PaneHeader`) into `@harness/ui`, generalized to any ordered set of panes (already written generically over a `PaneId` list, per introspect's existing implementation).
- `client-deck` and `client-dungeon`: replace their local `ChatPanel` with `@harness/ui`'s version; replace their static `grid-cols-[1fr_380px]` layout with a resizable two-pane split (canvas/board pane + chat pane) built on the shared pane-management system, giving both harnesses drag-to-resize plus minimize/maximize/restore parity with introspect.
- `client-introspect`: keeps its own `ChatPanel` (its `ContextBlock` data model has a `system` role, newest-first ordering, and a replay-mode `disabled` prop that `TranscriptEntry`-shaped harnesses don't have) but switches to the shared `useStickToBottom`, `MarkdownMessage`, `ChatInput`, and pane-management pieces instead of its local copies.
- `dungeon-harness-server`'s socket hook's `TranscriptEntry` type extends the canonical shared type (adding its `result` field, used by `BoardCanvas`'s movement/attack preview overlay) instead of redefining the whole shape.

## Capabilities

### New Capabilities
- `shared-ui/chat-panel`: `@harness/ui`'s `ChatPanel`/`ChatInput` contract — message and tool-call rendering, stick-to-bottom auto-scroll, and the auto-growing multi-line input, as a reusable component any `TranscriptEntry`-shaped harness composes.
- `shared-ui/panes`: `@harness/ui`'s resizable/minimize/maximize/restore pane-layout contract, generalized to any ordered set of panes.
- `deck-pane-layout`: resizable, minimize/maximize/restore pane layout for deck's canvas + chat panes (deck currently has a fixed-width split with no resize at all).
- `dungeon-pane-layout`: resizable, minimize/maximize/restore pane layout for dungeon's board + chat panes (same starting point as deck).
- `dungeon-chat-panel-ux`: dungeon's "Chat with pi" panel behavior — no-empty-bubbles, markdown rendering, stick-to-bottom auto-scroll, and the auto-growing input (dungeon has never had a dedicated chat-panel-ux spec, despite already having the no-empty-bubbles/markdown behavior in code).

### Modified Capabilities
- `deck-chat-panel-ux`: adds stick-to-bottom auto-scroll and the auto-growing multi-line input (Enter submits, Shift+Enter newline, resets to one line after send) — deck's chat panel has neither today.
- `introspect/chat-panel-ux`: adds the auto-growing multi-line input (Enter submits, Shift+Enter newline, resets to one line after send) — introspect already has stick-to-bottom auto-scroll, but its input is still a single-line `<input>` today.

## Impact

- New workspace member `packages/ui` — root `package.json` workspaces array, `npm run typecheck` glob, and `vitest.config.mts` `include` glob all need the "Keep in sync" treatment CLAUDE.md calls out for new harness pairs (this isn't a harness pair, but the same principle applies to a new workspace member).
- `client-deck/src/components/ChatPanel.tsx`, `client-dungeon/src/components/ChatPanel.tsx` deleted, replaced by an `@harness/ui` import.
- `client-deck/src/pages/DeckPage.tsx`, `client-dungeon/src/pages/DungeonPage.tsx`: layout rewritten from a CSS grid to `Group`/`Panel`/`Separator` plus the shared pane-manager hook.
- `client-deck/package.json`, `client-dungeon/package.json`: new deps `@harness/ui` and `react-resizable-panels` (already a `client-introspect` dependency).
- `client-introspect/src/components/ChatPanel.tsx`, `client-introspect/src/pages/IntrospectPage.tsx`: internal refactor to consume shared pieces; the only user-visible change is the new auto-growing input.
- `client-dungeon/src/hooks/useDungeonSocket.ts`: `TranscriptEntry`'s `ToolCallEntry` extends the shared type instead of redefining it.
