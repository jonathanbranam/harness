## Why

The introspect harness's two-pane layout is fixed-width, non-resizable, and gives the user no way to focus on one pane at a time. Worse, the Apparatus pane — meant to visualize the agent's actual context window — currently just re-renders the same chat transcript the chat pane already shows, muted in the middle, which duplicates content instead of showing what's actually filling the context (tool calls vs. input vs. output vs. thinking) or how close the session is to the model's real limit. As sessions get longer and more panes are planned for the future, the layout needs to support resizing, focusing, and collapsing panes, and Apparatus needs to become a genuine capacity visualization rather than a second transcript.

## What Changes

- Chat pane and Apparatus pane scroll independently (they already do structurally; this change adds the missing piece — **stick-to-bottom** auto-scroll: new content only pulls the view down when the user was already near the bottom, never yanking them away from history they're reading).
- Chat pane gets a wider default width and a draggable resize handle on the border between panes.
- Each pane gains maximize / minimize / restore controls with icons in its header:
  - **Minimize** collapses a pane to a narrow vertical rail with its title rotated 90° and restore/maximize icons visible.
  - **Maximize** expands a pane to take the freed space; with only two panes today this means the other pane minimizes to a rail, but the mechanism is designed to generalize — minimizing/maximizing any pane redistributes the freed or reclaimed width across whichever other panes are currently visible, not just a hardcoded second pane.
  - **Restore** returns a pane to its last explicit (non-minimized, non-maximized) width.
- Apparatus is redesigned from a duplicated-text transcript into a compact, **never-scrolling** capacity visualization, per the selected mockup [`mockups/apparatus-mockup-grid-sections.html`](mockups/apparatus-mockup-grid-sections.html) (the plain-grid and linear-stack mockups explored during design are superseded and kept only for history):
  - Content fills a fixed waffle grid (0–100% of the context window, row-major top-left → bottom-right) rather than a stack of blocks, colored by category — foundation, user prompt, skill auto-load, thinking (detected from the SDK's `thinking_delta` stream whenever the provider emits it — see design.md; the *pill size* falls back to a rough estimate only if the provider omits exact reasoning-token accounting), assistant output, tool-result content, and reprocessed context (see next bullet).
  - **Input tokens split into two distinct categories instead of one blended "input" bucket**: genuinely-new **tool-result content** (measured exactly from the tool call's actual result, not estimated from the surrounding message's aggregate usage — see next section) and **reprocessed context (cache miss)** (whatever's left over). This directly surfaces the finding in [`docs/introspect-harness/prompt-cache-reprocessing-investigation.md`](../../../docs/introspect-harness/prompt-cache-reprocessing-investigation.md) — that a large share of every "new input" pill was actually stale-conversation reprocessing, not new content — instead of hiding it inside one bucket.
  - Contiguous grid cells sharing the same dominant category are grouped into one hoverable **section** rather than N independently-colored cells: hovering any cell in the run highlights the whole run and reports the section's total tokens and cell span, while the gaps between the individual cells remain visible so the section's size is still visually countable.
  - Tool calls render as a single square indicator per occupied grid cell (deduplicated, sized by how many calls landed there) rather than one dot per call — hovering lists every call that landed in that cell (name, status, turn). Indicator color reflects the worst status among those calls: green (done), neutral gray (running — in flight, live sessions only), or red (error).
  - The visualization is scaled against the model's real context window (the existing `context_usage` event's `contextWindow` field, e.g. 262,144 for the currently configured Kimi K2.7), not a hardcoded number.
  - The existing single "middle danger zone" muted-styling requirement is replaced with labeled zone bands — "smart zone," "dumb zone," and "forced compaction" — as tunable percentage boundaries of the real context window. Exact default percentages are a design decision, not fixed by this proposal.
  - **BREAKING** (spec-level): Apparatus no longer renders full assistant/tool/user block text or markdown content — that stays the chat pane's job. Apparatus now shows a summary visualization only.
- **New:** the harness now captures each tool call's exact result content instead of only its start/end lifecycle, so Apparatus can measure "tool-result content" tokens directly rather than inferring them from a message's aggregate `usage.input`. The pi SDK already emits a `tool_result` event carrying the exact `content` blocks inserted into the conversation (and `usage`, when a provider reports it) — `introspection-bridge.ts` just isn't subscribed to it yet.

## Capabilities

### New Capabilities
- `introspect/pane-layout`: resizable pane widths with a drag handle, and per-pane maximize/minimize/restore with a vertical-rail collapsed state, generalized to support more than two panes.

### Modified Capabilities
- `introspect/chat-panel-ux`: adds stick-to-bottom scroll preservation to the existing independent scroll region.
- `introspect/apparatus-view`: replaces the duplicated-transcript rendering and "middle danger zone" requirement with the token-capacity grid/section visualization described above, including the tool-result-vs-reprocessed-context category split.
- `introspect/event-streaming`: adds forwarding of the SDK's `tool_result` event (currently received by no one), which is what makes exact tool-result token accounting possible.

## Impact

- `client-introspect/src/pages/IntrospectPage.tsx`: hosts the new resizable/collapsible pane shell instead of a fixed CSS grid.
- `client-introspect/src/components/ChatPanel.tsx`: stick-to-bottom scroll logic.
- `client-introspect/src/components/ApparatusView.tsx`: full rewrite of its rendering model (grid/sections/zones instead of block list), per `mockups/apparatus-mockup-grid-sections.html`.
- `client-introspect/src/hooks/useIntrospectSocket.ts`: `context_usage` consumption changes shape/usage (drives zone boundaries); needs finer-grained per-block token data; must start reading `thinking_delta` from `message_update` (currently received and silently dropped — see design.md); and must consume the newly-forwarded `tool_result` event to compute the tool-result-content token category.
- `introspect-harness-server/src/pi-extensions/introspection-bridge.ts`: **new server-side change** — subscribe to the SDK's `tool_result` event (`pi.on('tool_result', ...)`, mirroring the existing handlers in that file) and forward it verbatim, same as every other lifecycle event already handled there.
- Likely a new client dependency for drag-resize handling (evaluated in design.md).
- Layout/interaction state (resize, minimize/maximize) remains local to the browser and untouched by the `tool_result` addition above. (Recording that state is the separate `add-ui-layout-recording` change, which depends on the `introspect/pane-layout` capability this change introduces.)
