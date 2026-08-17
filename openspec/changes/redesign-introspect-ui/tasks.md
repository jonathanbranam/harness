## 1. Setup

- [x] 1.1 Add `react-resizable-panels` to `client-introspect/package.json` and install it (per design.md Decision 1).

## 2. Server: forward the `tool_result` event

- [x] 2.1 In `introspect-harness-server/src/pi-extensions/introspection-bridge.ts`, add `pi.on('tool_result', (event) => emit({ ...event }))`, mirroring the existing handlers in that file (design.md Decision 6; `introspect/event-streaming`'s modified "Capture agent lifecycle events" requirement).
- [x] 2.2 Verify a `tool_result` event round-trips end to end: appears on the browser WebSocket during a live session, and is captured/replayable through the existing recording pipeline (no schema change needed there, since events are forwarded verbatim — confirm rather than assume).

## 3. Client socket hook: token category accounting

- [x] 3.1 In `client-introspect/src/hooks/useIntrospectSocket.ts`, start reading `thinking_delta` off `message_update`'s `assistantMessageEvent` (currently received and silently dropped), accumulating thinking text per in-flight message id.
- [x] 3.2 Read `event.message.usage` off `message_end` (input/output/cacheRead/reasoning/totalTokens) and retain it per message.
- [x] 3.3 Handle the new `tool_result` event: compute a token count per call from `event.content` — use `event.usage` when a provider populates it, otherwise a chars-per-token estimate (design.md Decision 6) — and retain it keyed by `toolCallId`.
- [x] 3.4 Compute, per assistant turn, the full category breakdown from design.md Decision 5: foundation, user, skill, output, thinking (preferring `usage.reasoning` when present, else the chars-per-token estimate from the accumulated thinking text), tool-result content (summed from 3.3's entries for that turn), and reprocessed context (cache miss) as the residual — `usage.input` minus tool-result tokens minus whatever's already accounted for by the user/skill categories.
- [x] 3.5 Expose this per-entry category/token data as a new value returned from the hook, replacing `ApparatusView`'s current dependence on the shared `blocks` list for its rendering (`introspect/apparatus-view`'s "Token category breakdown" requirement).

## 4. Apparatus: grid/section/zone rendering

- [x] 4.1 Replace `ApparatusView`'s block-list body with a fixed waffle grid scaled to `usage.contextWindow` (0-100%, row-major fill), per `mockups/apparatus-mockup-grid-sections.html` and the "Context window rendering" requirement.
- [x] 4.2 Bin the category data from 3.4 into grid cells in chronological order, each cell keeping its per-kind contribution breakdown and a single dominant category (no more blended per-cell colors).
- [x] 4.3 Add a `CONTEXT_ZONES` tunable constant (design.md Decision 4) and render the three labeled zone bands ("smart zone" / "dumb zone" / "forced compaction") over the grid, replacing the old middle-danger-zone muted styling.
- [x] 4.4 Group contiguous same-dominant-category cells into sections; implement the shared hover highlight across a section's cells and a tooltip reporting the section's total tokens and cell span ("Aggregated section grouping" requirement).
- [x] 4.5 Implement deduplicated square tool-call markers: one per occupied cell, sized by call count, colored by the worst status among that cell's calls (done/running/error), with a full-cell hover target listing every call that landed there ("Tool call indicators" requirement).
- [x] 4.6 Render the pinned foundation header (system prompt snippet + skill badges) so it always stays visible at the start of the grid's fill order ("Pinned foundation zone" requirement).
- [x] 4.7 Render the token/cost/percent stat header and a category color legend, including a status-color legend distinguishing tool done/running/error (design.md Decision 7's "running" color fix).
- [x] 4.8 Remove the now-unused per-block markdown rendering path from `ApparatusView.tsx` (the old `Block`/`Gauge` components' full-text rendering), since Apparatus no longer shows full block text (BREAKING per proposal.md; `MarkdownMessage` stays in use by `ChatPanel`).

## 5. Pane layout: resize, maximize, minimize, restore

- [x] 5.1 In `IntrospectPage.tsx`, replace the fixed `grid-cols-[380px_1fr]` layout with `react-resizable-panels`' `PanelGroup`/`Panel`, with the chat pane defaulting wider than the apparatus pane ("Default pane widths" requirement). (The installed `react-resizable-panels@4.12.3` renamed `PanelGroup`→`Group` and `PanelResizeHandle`→`Separator` from the v1/v2 API design.md's wording assumed; `Panel` and its `.collapse()/.expand()/.resize()` imperative API are unchanged. Used the actual installed API.)
- [x] 5.2 Add a `PanelResizeHandle` rendered as a draggable handle on the border between panes, with a minimum width enforced per pane ("Draggable pane resize" requirement).
- [x] 5.3 Add maximize/minimize/restore icon controls to each pane's header, wired to the panel group's imperative ref API (`.collapse()`/`.expand()`/`.resize()`).
- [x] 5.4 Build the minimized vertical-rail chrome (90°-rotated title, restore/maximize icons) as custom styling layered on a collapsed panel ("Pane minimize" requirement).
- [x] 5.5 Implement freed/reclaimed-width redistribution generalized across however many panes are currently visible, not hardcoded to exactly two ("Generalized to more than two panes" requirement).
- [x] 5.6 Implement restore, returning a pane to its last explicit (non-minimized, non-maximized) width ("Pane restore" requirement).

## 6. Chat panel: stick-to-bottom scroll

- [x] 6.1 In `ChatPanel.tsx`, capture the scroll region's distance from bottom (`scrollHeight - scrollTop - clientHeight`) before each `blocks` update that will append content.
- [x] 6.2 After the DOM updates, scroll back to bottom only if that pre-update distance was within a small threshold (e.g. 48px); otherwise leave the scroll position untouched ("Stick-to-bottom auto-scroll" requirement).

## 7. Verification

- [x] 7.1 Run `npm run typecheck` and resolve any type errors introduced by the hook/view rewrite. (`introspect-harness-server` and `client-introspect` both typecheck clean in isolation. The repo-wide `npm run typecheck` chain fails on a pre-existing error in `dungeon-harness-server/src/pi-extensions/board-bridge.ts`, unrelated to and untouched by this change — out of scope here.)
- [x] 7.2 Using `playwright-cli` against the already-running `client-introspect` dev server (per CLAUDE.md), verify: pane resize/minimize/maximize/restore behavior, chat stays pinned to bottom during a live prompt but not once scrolled up, and the apparatus grid renders zones/sections/tool markers correctly during a live session. (Verified: drag-resize, minimize-to-rail with freed-width redistribution, maximize, and restore-to-last-explicit-width all work; section hover tooltip and tool-marker hover tooltip both render correctly; stick-to-bottom confirmed both ways — `distanceFromBottom: 0` after a send while pinned, `scrollTop` unchanged after a send while scrolled up. Along the way, found and fixed a real bug: `usage.reasoning ?? estimateTokens(...)` doesn't fall back when a provider reports an untrustworthy `0` alongside real thinking content — see 7.4.)
- [x] 7.3 Verify apparatus rendering against replay of an existing recording, confirming it stays agnostic to event source (the unmodified "Rendering is agnostic to event source" requirement still holds against the new grid renderer). (Loaded the "Cache test" recording — the same session design.md's Context section and the mockup were built from — jumped to its final checkpoint, and cross-checked the rendered composition totals against a standalone replay of the raw `events.jsonl` through the same reducer logic: thinking 3,231 tok and output 10,742 tok matched exactly.)
- [x] 7.4 Against a live Kimi K2.7 response, check whether `usage.reasoning` and `tool_result.usage` are actually populated (design.md's Open Questions/Risks) and note the result so the char-length estimate fallbacks can be revisited if a provider does supply exact figures. (`usage.reasoning` is `0` on every message for this provider, confirming design.md's Context note — and this recording is exactly the case that motivated keying thinking-pill *presence* off `thinking_delta` rather than `usage.reasoning`. Discovered a follow-on bug from this: sizing must also treat a reported `0` as untrustworthy when real thinking content arrived, not just an absent field — fixed, see 7.2. `tool_result.usage` was not observed populated in a live session either; the char-length fallback is exercised in practice, consistent with design.md's expectation that it's "rarely populated.")
