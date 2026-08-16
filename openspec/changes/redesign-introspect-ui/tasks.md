## 1. Setup

- [ ] 1.1 Add `react-resizable-panels` to `client-introspect/package.json` and install it (per design.md Decision 1).

## 2. Server: forward the `tool_result` event

- [ ] 2.1 In `introspect-harness-server/src/pi-extensions/introspection-bridge.ts`, add `pi.on('tool_result', (event) => emit({ ...event }))`, mirroring the existing handlers in that file (design.md Decision 6; `introspect/event-streaming`'s modified "Capture agent lifecycle events" requirement).
- [ ] 2.2 Verify a `tool_result` event round-trips end to end: appears on the browser WebSocket during a live session, and is captured/replayable through the existing recording pipeline (no schema change needed there, since events are forwarded verbatim — confirm rather than assume).

## 3. Client socket hook: token category accounting

- [ ] 3.1 In `client-introspect/src/hooks/useIntrospectSocket.ts`, start reading `thinking_delta` off `message_update`'s `assistantMessageEvent` (currently received and silently dropped), accumulating thinking text per in-flight message id.
- [ ] 3.2 Read `event.message.usage` off `message_end` (input/output/cacheRead/reasoning/totalTokens) and retain it per message.
- [ ] 3.3 Handle the new `tool_result` event: compute a token count per call from `event.content` — use `event.usage` when a provider populates it, otherwise a chars-per-token estimate (design.md Decision 6) — and retain it keyed by `toolCallId`.
- [ ] 3.4 Compute, per assistant turn, the full category breakdown from design.md Decision 5: foundation, user, skill, output, thinking (preferring `usage.reasoning` when present, else the chars-per-token estimate from the accumulated thinking text), tool-result content (summed from 3.3's entries for that turn), and reprocessed context (cache miss) as the residual — `usage.input` minus tool-result tokens minus whatever's already accounted for by the user/skill categories.
- [ ] 3.5 Expose this per-entry category/token data as a new value returned from the hook, replacing `ApparatusView`'s current dependence on the shared `blocks` list for its rendering (`introspect/apparatus-view`'s "Token category breakdown" requirement).

## 4. Apparatus: grid/section/zone rendering

- [ ] 4.1 Replace `ApparatusView`'s block-list body with a fixed waffle grid scaled to `usage.contextWindow` (0-100%, row-major fill), per `mockups/apparatus-mockup-grid-sections.html` and the "Context window rendering" requirement.
- [ ] 4.2 Bin the category data from 3.4 into grid cells in chronological order, each cell keeping its per-kind contribution breakdown and a single dominant category (no more blended per-cell colors).
- [ ] 4.3 Add a `CONTEXT_ZONES` tunable constant (design.md Decision 4) and render the three labeled zone bands ("smart zone" / "dumb zone" / "forced compaction") over the grid, replacing the old middle-danger-zone muted styling.
- [ ] 4.4 Group contiguous same-dominant-category cells into sections; implement the shared hover highlight across a section's cells and a tooltip reporting the section's total tokens and cell span ("Aggregated section grouping" requirement).
- [ ] 4.5 Implement deduplicated square tool-call markers: one per occupied cell, sized by call count, colored by the worst status among that cell's calls (done/running/error), with a full-cell hover target listing every call that landed there ("Tool call indicators" requirement).
- [ ] 4.6 Render the pinned foundation header (system prompt snippet + skill badges) so it always stays visible at the start of the grid's fill order ("Pinned foundation zone" requirement).
- [ ] 4.7 Render the token/cost/percent stat header and a category color legend, including a status-color legend distinguishing tool done/running/error (design.md Decision 7's "running" color fix).
- [ ] 4.8 Remove the now-unused per-block markdown rendering path from `ApparatusView.tsx` (the old `Block`/`Gauge` components' full-text rendering), since Apparatus no longer shows full block text (BREAKING per proposal.md; `MarkdownMessage` stays in use by `ChatPanel`).

## 5. Pane layout: resize, maximize, minimize, restore

- [ ] 5.1 In `IntrospectPage.tsx`, replace the fixed `grid-cols-[380px_1fr]` layout with `react-resizable-panels`' `PanelGroup`/`Panel`, with the chat pane defaulting wider than the apparatus pane ("Default pane widths" requirement).
- [ ] 5.2 Add a `PanelResizeHandle` rendered as a draggable handle on the border between panes, with a minimum width enforced per pane ("Draggable pane resize" requirement).
- [ ] 5.3 Add maximize/minimize/restore icon controls to each pane's header, wired to the panel group's imperative ref API (`.collapse()`/`.expand()`/`.resize()`).
- [ ] 5.4 Build the minimized vertical-rail chrome (90°-rotated title, restore/maximize icons) as custom styling layered on a collapsed panel ("Pane minimize" requirement).
- [ ] 5.5 Implement freed/reclaimed-width redistribution generalized across however many panes are currently visible, not hardcoded to exactly two ("Generalized to more than two panes" requirement).
- [ ] 5.6 Implement restore, returning a pane to its last explicit (non-minimized, non-maximized) width ("Pane restore" requirement).

## 6. Chat panel: stick-to-bottom scroll

- [ ] 6.1 In `ChatPanel.tsx`, capture the scroll region's distance from bottom (`scrollHeight - scrollTop - clientHeight`) before each `blocks` update that will append content.
- [ ] 6.2 After the DOM updates, scroll back to bottom only if that pre-update distance was within a small threshold (e.g. 48px); otherwise leave the scroll position untouched ("Stick-to-bottom auto-scroll" requirement).

## 7. Verification

- [ ] 7.1 Run `npm run typecheck` and resolve any type errors introduced by the hook/view rewrite.
- [ ] 7.2 Using `playwright-cli` against the already-running `client-introspect` dev server (per CLAUDE.md), verify: pane resize/minimize/maximize/restore behavior, chat stays pinned to bottom during a live prompt but not once scrolled up, and the apparatus grid renders zones/sections/tool markers correctly during a live session.
- [ ] 7.3 Verify apparatus rendering against replay of an existing recording, confirming it stays agnostic to event source (the unmodified "Rendering is agnostic to event source" requirement still holds against the new grid renderer).
- [ ] 7.4 Against a live Kimi K2.7 response, check whether `usage.reasoning` and `tool_result.usage` are actually populated (design.md's Open Questions/Risks) and note the result so the char-length estimate fallbacks can be revisited if a provider does supply exact figures.
