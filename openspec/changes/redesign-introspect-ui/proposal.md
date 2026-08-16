## Why

The introspect harness's two-pane layout is fixed-width, non-resizable, and gives the user no way to focus on one pane at a time. Worse, the Apparatus pane — meant to visualize the agent's actual context window — currently just re-renders the same chat transcript the chat pane already shows, muted in the middle, which duplicates content instead of showing what's actually filling the context (tool calls vs. input vs. output vs. thinking) or how close the session is to the model's real limit. As sessions get longer and more panes are planned for the future, the layout needs to support resizing, focusing, and collapsing panes, and Apparatus needs to become a genuine capacity visualization rather than a second transcript.

## What Changes

- Chat pane and Apparatus pane scroll independently (they already do structurally; this change adds the missing piece — **stick-to-bottom** auto-scroll: new content only pulls the view down when the user was already near the bottom, never yanking them away from history they're reading).
- Chat pane gets a wider default width and a draggable resize handle on the border between panes.
- Each pane gains maximize / minimize / restore controls with icons in its header:
  - **Minimize** collapses a pane to a narrow vertical rail with its title rotated 90° and restore/maximize icons visible.
  - **Maximize** expands a pane to take the freed space; with only two panes today this means the other pane minimizes to a rail, but the mechanism is designed to generalize — minimizing/maximizing any pane redistributes the freed or reclaimed width across whichever other panes are currently visible, not just a hardcoded second pane.
  - **Restore** returns a pane to its last explicit (non-minimized, non-maximized) width.
- Apparatus is redesigned from a duplicated-text transcript into a compact, **never-scrolling** capacity visualization:
  - Content renders as pills/squares stacked top-to-bottom in the same chronological order as the chat pane (foundation/system prompt and skills first, filling downward as the turn progresses), colored by category — tool call, input tokens, output tokens, and thinking (detected from the SDK's `thinking_delta` stream whenever the provider emits it — see design.md; the *pill size* falls back to a rough estimate only if the provider omits exact reasoning-token accounting).
  - The visualization is scaled against the model's real context window (the existing `context_usage` event's `contextWindow` field, e.g. 262,144 for the currently configured Kimi K2.7), not a hardcoded number.
  - The existing single "middle danger zone" muted-styling requirement is replaced with labeled zone bands — "smart zone," "dumb zone," and "forced compaction" — as tunable percentage boundaries of the real context window. Exact default percentages are a design decision, not fixed by this proposal.
  - **BREAKING** (spec-level): Apparatus no longer renders full assistant/tool/user block text or markdown content — that stays the chat pane's job. Apparatus now shows a summary visualization only.

## Capabilities

### New Capabilities
- `introspect/pane-layout`: resizable pane widths with a drag handle, and per-pane maximize/minimize/restore with a vertical-rail collapsed state, generalized to support more than two panes.

### Modified Capabilities
- `introspect/chat-panel-ux`: adds stick-to-bottom scroll preservation to the existing independent scroll region.
- `introspect/apparatus-view`: replaces the duplicated-transcript rendering and "middle danger zone" requirement with the token-capacity pill/zone visualization described above.

## Impact

- `client-introspect/src/pages/IntrospectPage.tsx`: hosts the new resizable/collapsible pane shell instead of a fixed CSS grid.
- `client-introspect/src/components/ChatPanel.tsx`: stick-to-bottom scroll logic.
- `client-introspect/src/components/ApparatusView.tsx`: full rewrite of its rendering model (pills/zones instead of block list).
- `client-introspect/src/hooks/useIntrospectSocket.ts`: `context_usage` consumption changes shape/usage (drives zone boundaries); needs finer-grained per-block token data, and must also start reading `thinking_delta` from `message_update` (currently received and silently dropped) — see design.md.
- Likely a new client dependency for drag-resize handling (evaluated in design.md).
- No server-side or protocol changes in this change — layout/interaction state is local to the browser. (Recording that state is the separate `add-ui-layout-recording` change, which depends on the `introspect/pane-layout` capability this change introduces.)
