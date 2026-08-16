## Why

`deck-chat-panel-ux` fixed two rendering bugs in the deck harness's "Chat with pi" panel (empty bubbles between tool calls, unstyled markdown). The introspect harness has two windows built on the same underlying `ContextBlock` event stream — the "Chat with pi" chat pane and the "Apparatus" context-window view — and both had the identical bugs for the identical reason: a block was created eagerly on `message_start` before any text existed, and assistant text was rendered as raw unformatted text in both places.

## What Changes

- Stop rendering empty blocks in `useIntrospectSocket.ts`: defer creating an assistant `ContextBlock` until its first non-whitespace text delta arrives, instead of creating one eagerly on `message_start`. (This hook prepends new blocks rather than appending, unlike the deck harness's `useDeckSocket.ts`, but the same defer-until-content approach applies.)
- Render assistant block text as styled markdown — via `react-markdown` + `remark-gfm`, `@tailwindcss/typography`'s `prose`/`prose-invert` — in both places that render a `ContextBlock`: `ChatPanel.tsx` and `ApparatusView.tsx`. A shared `MarkdownMessage` component avoids duplicating the `ReactMarkdown` wrapper in both files.
- `ApparatusView`'s "middle danger zone" muting (`introspect/apparatus-view`'s existing requirement) dims blocks via a text-color utility class, which doesn't reach text colored by `@tailwindcss/typography`'s CSS variables — add an `opacity-50` wrapper around muted assistant blocks so muting still visibly applies to markdown-rendered content.
- User and system blocks continue to render as plain text (no markdown parsing) in both windows.

## Capabilities

### New Capabilities
- `introspect/chat-panel-ux`: Client-side behavior of the introspect harness's "Chat with pi" panel — how user/assistant/tool/system blocks render, including suppression of empty message bubbles and markdown styling of assistant text.

### Modified Capabilities
- `introspect/apparatus-view`: Adds the same no-empty-blocks and markdown-rendering behavior to the context-window view, plus the muting adjustment needed for markdown-rendered blocks to still dim correctly in the "danger zone".

## Impact

- `client-introspect/src/hooks/useIntrospectSocket.ts`: defer `ContextBlock` creation to the first non-whitespace `text_delta`.
- `client-introspect/src/components/ChatPanel.tsx`: render assistant text via the new `MarkdownMessage` component; filter out any residual empty/whitespace-only non-tool blocks.
- `client-introspect/src/components/ApparatusView.tsx`: same markdown rendering for assistant blocks; filter empty/whitespace-only blocks before computing the muted-range indices; wrap muted assistant markdown in `opacity-50`.
- `client-introspect/src/components/MarkdownMessage.tsx` (new): shared `react-markdown` + `remark-gfm` wrapper used by both components above.
- `client-introspect/package.json`: add `react-markdown`, `remark-gfm`, `@tailwindcss/typography` dependencies.
- `client-introspect/src/index.css`: register the `@tailwindcss/typography` plugin.
