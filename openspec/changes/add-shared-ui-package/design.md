## Context

See proposal.md - Why. Today: `client-deck/src/components/ChatPanel.tsx` and `client-dungeon/src/components/ChatPanel.tsx` are near-byte-identical, driven by each harness's own `TranscriptEntry` type (chronological, append-only, `resultSummary` on tool entries). `client-introspect/src/components/ChatPanel.tsx` is driven by a differently-shaped `ContextBlock` (newest-first, an extra `system` role, a `disabled`/replay prop, `text` instead of `resultSummary` on tool entries) because that same array also feeds introspect's context-window visualizer elsewhere in the app. Introspect already has a working stick-to-bottom auto-scroll effect and a generalized (`PaneId`-list-driven) resizable/minimize/maximize/restore pane system in `IntrospectPage.tsx`; deck and dungeon have neither — their chat pane is a fixed `380px` CSS grid column with a plain single-line `<input>`. No `packages/` tier exists yet in this repo; track-web's `packages/ui` (plain TS source, `main: ./src/index.ts`, no build step, workspace-resolved) is the precedent to follow, and all three clients already share compatible versions of React 19, Tailwind 4 (+ `@tailwindcss/typography`), `react-markdown`, and `remark-gfm`.

## Goals / Non-Goals

**Goals:**
- One source of truth for the `TranscriptEntry`-shaped chat UI (message rendering, auto-scroll, auto-growing input, tool badges) and for the pane-management system, shared by deck, dungeon, and any future `TranscriptEntry`-shaped harness.
- Let introspect reuse the pieces that don't depend on its `ContextBlock` shape (`useStickToBottom`, `MarkdownMessage`, `ChatInput`, the pane system) without forcing its whole `ChatPanel` into a shape it doesn't fit.
- Client-only change — no backend or WebSocket protocol changes.

**Non-Goals:**
- Not unifying `ContextBlock` and `TranscriptEntry` into a single type, or making `ChatPanel` generic over entry shape.
- Not touching `DeckCanvas`/`BoardCanvas` internals — only the page-level layout around them.
- Not adding a build step to `packages/ui` — it stays source-direct like track-web's.
- Not extracting anything beyond chat panel + panes into `packages/ui` speculatively (no auth/config/dev-ports package yet — that's a separate extraction if it ever becomes real duplication).

## Decisions

**1. Package shape: `@harness/ui`, plain TS source, no build.** Same as track-web's `packages/ui` — `main`/`exports` point at `./src/index.ts`, added to root `package.json` workspaces, consumed as `"@harness/ui": "*"`. Alternative considered: a built package (`tsc` to `dist/`). Rejected — none of this repo's other workspace members have a build step outside the client Vite builds themselves, and Vite/tsc already resolve TS source across npm workspaces without one (track-web runs this exact pattern in production).

**2. Hoist the canonical `TranscriptEntry` type; dungeon extends it.** `@harness/ui` exports the base `TranscriptEntry` (`ChatMessageEntry | ToolCallEntry`, matching deck's current shape exactly). Dungeon's `useDungeonSocket.ts` changes its `ToolCallEntry` to `SharedToolCallEntry & { result?: unknown }` (the extra field `BoardCanvas` reads for movement/attack preview overlays) instead of redefining the whole type. TS's structural typing means this needs no cast anywhere `TranscriptEntry[]` is consumed. Alternative: leave both copies as-is. Rejected — this was the last bit of copy-paste between the two socket hooks once `ChatPanel` itself is shared.

**3. `ChatPanel` stays `TranscriptEntry`-only; introspect keeps its own, built from shared pieces.** Rather than a generic `ChatPanel<T>` with a render-adapter, introspect's `ChatPanel.tsx` stays a distinct file that imports `useStickToBottom`, `MarkdownMessage`, and `ChatInput` from `@harness/ui` and keeps its own block-rendering and `ToolBadge` (which reads `block.text`, not `resultSummary`). A generic adapter is premature for a two-shape problem — revisit only if a third genuinely distinct entry shape shows up.

**4. Pane manager extracted as a parameterized hook + two presentational components.** `usePaneManager(paneIds, defaultSizes)` returns `{ paneModes, panelRefs, minimizePane, maximizePane, restorePane, handleLayoutChanged }`, replacing introspect's module-level `PANE_IDS`/`DEFAULT_SIZES` constants with function arguments. `PaneRail`/`PaneHeader` take a `title` prop instead of looking it up from a module-level `PANE_TITLES` map. Each page (`IntrospectPage`, `DeckPage`, `DungeonPage`) still assembles its own `Group`/`Panel`/`Separator` JSX around this, since the panes' content differs — the hook/components carry the reusable behavior, not the page composition.

**5. `ChatInput`: textarea, auto-grow to ~6 lines, native overflow scroll, Enter-submits/Shift+Enter-newline.** Height is set imperatively from `scrollHeight` on each change, capped at a max-height corresponding to ~6 lines; past the cap, `overflow-y: auto` takes over and the browser's native caret-follow scrolling keeps the cursor's line in view with no extra JS. `onKeyDown` submits on `Enter` (checking `!e.shiftKey`) and lets `Shift+Enter` fall through to the browser's default newline insertion. On successful submit, both the draft text and the inline height override are cleared, returning the box to single-line height.

**6. IME composition guard on Enter.** A composing Enter (confirming an IME candidate, e.g. Japanese/Chinese input) must not submit the message. `onKeyDown` checks `e.nativeEvent.isComposing` (and the legacy `e.keyCode === 229` fallback some browsers still need) before treating `Enter` as submit.

**7. Spec files: one per harness-visible surface, plus two for the package's own contract.** Follows this repo's existing convention of per-harness capability files even when behavior (and now implementation) is shared — `deck-chat-panel-ux` and `introspect/chat-panel-ux` already duplicate near-identical requirements today. `shared-ui/chat-panel` and `shared-ui/panes` describe the package's contract; `deck-chat-panel-ux`, `dungeon-chat-panel-ux`, `introspect/chat-panel-ux` (modified), `deck-pane-layout`, and `dungeon-pane-layout` describe each harness's resulting user-visible behavior.

## Risks / Trade-offs

- [Risk] A composing Enter (IME) submits the message mid-composition → Mitigation: `isComposing`/`keyCode === 229` guard in `ChatInput`'s `onKeyDown` (Decision 6).
- [Risk] Tailwind v4's automatic content scan might not reach class names that only appear inside `packages/ui/src` if a client's Vite scan root doesn't extend there → Mitigation: verify with a dev-server smoke check as an early task; fall back to an explicit `@source` directive in each client's `index.css` if classes don't get generated.
- [Risk] Deck/dungeon's chat pane changes from a fixed 380px sidebar to a draggable/collapsible panel — a bigger interaction change than "just autoscroll" → Mitigation: default the chat pane's size close to today's 380px so the initial layout looks familiar; this was confirmed in-conversation as the desired scope (full pane parity), not an accidental scope increase.
- [Trade-off] Per-harness spec duplication (chat-panel-ux requirements repeated across three capability files) mirrors the code duplication this change removes at the implementation layer. Accepted as consistent with this repo's existing spec convention rather than introducing a new cross-harness spec-organization scheme mid-change.

## Migration Plan

- Additive at the package level: `packages/ui` ships first, then each client migrates independently (deck, then dungeon, then introspect) so the repo is shippable after every step.
- No server, WebSocket protocol, or persisted-state changes — this is a client-only refactor plus new UI behavior.
- Rollback is per-client: reverting a client's commits drops it back to its own local `ChatPanel`/static grid; `packages/ui` can remain unused with no effect on any server.
