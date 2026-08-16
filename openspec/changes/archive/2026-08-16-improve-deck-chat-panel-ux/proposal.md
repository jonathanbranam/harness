## Why

The deck harness's "Chat with pi" panel has two rendering bugs that make multi-step turns hard to follow: (1) when the agent makes several tool calls in one turn, empty message bubbles appear between the tool badges because a chat bubble is created eagerly on every `message_start` even if that assistant message carries no text; (2) assistant replies containing markdown (lists, code fences, bold) render as raw unstyled text, since nothing in `client-deck` parses or styles markdown.

## What Changes

- Stop rendering empty chat bubbles: only create/keep a message entry in the transcript once it has non-empty text (or collapse/drop empty-text entries at `message_end`), so a turn with multiple tool calls shows tool badges without blank boxes between them.
- Render assistant message text as styled markdown instead of raw preformatted text, using `react-markdown` (with the `remark-gfm` plugin for tables/strikethrough/task lists) — chosen because it renders to React elements directly (no `dangerouslySetInnerHTML`, avoiding an XSS surface for agent-produced text) and is the standard choice for React chat UIs.
- Add `@tailwindcss/typography`'s `prose` classes (scoped to a dark-friendly `prose-invert` variant) to style the rendered markdown consistently with the panel's existing dark theme, without hand-rolling heading/list/code CSS.
- User messages continue to render as plain text (no markdown parsing needed for the user's own input).

## Capabilities

### New Capabilities
- `deck-chat-panel-ux`: Client-side behavior of the deck harness's chat transcript — how assistant/tool/user turns are rendered, including suppression of empty message bubbles and markdown styling of assistant text.

### Modified Capabilities
(none — `deck-agent-session` covers the WebSocket/session protocol, not client rendering behavior)

## Impact

- `client-deck/src/hooks/useDeckSocket.ts`: change transcript entry creation so `message_start` doesn't immediately add a visible empty bubble.
- `client-deck/src/components/ChatPanel.tsx`: render assistant `entry.text` through `react-markdown`; filter/skip empty message entries.
- `client-deck/package.json`: add `react-markdown`, `remark-gfm`, `@tailwindcss/typography` dependencies.
- `client-deck/tailwind.config.*` (or Tailwind v4 CSS-based config): register the `@tailwindcss/typography` plugin.
