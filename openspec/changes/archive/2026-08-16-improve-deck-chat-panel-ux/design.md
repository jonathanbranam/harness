## Context

See proposal.md - Why. Two relevant pieces of current behavior:

- `useDeckSocket.ts`'s `handleAgentEvent` creates a `ChatMessageEntry` in the transcript on every `message_start` for an assistant message, before any text has arrived (`client-deck/src/hooks/useDeckSocket.ts:198-206`). `ChatPanel.tsx` renders every `kind: 'message'` entry as a bubble unconditionally (`client-deck/src/components/ChatPanel.tsx:42-56`), so a tool-only assistant turn (no `text_delta` between `message_start` and `message_end`) shows as a blank bubble.
- `client-deck` is Tailwind v4 via `@tailwindcss/vite`, configured through `@import "tailwindcss";` in `client-deck/src/index.css` (no JS `tailwind.config.*` file exists). Plugins are registered with the CSS-native `@plugin` directive in that same file.

## Goals / Non-Goals

**Goals:**
- Never show a message bubble with no text content, at any point in the streaming lifecycle (not just after the fact).
- Render assistant markdown with standard formatting (headings, emphasis, lists, inline/fenced code, links, GFM tables/strikethrough) styled to fit the existing dark bubble UI.

**Non-Goals:**
- Rendering markdown in user-authored messages (proposal explicitly excludes this).
- Rendering rich content inside tool badges (`ToolBadge` stays plain text/summary).
- Any change to the WebSocket/agent-event protocol itself — this is purely how the client interprets events it already receives.

## Decisions

### Suppress empty bubbles by deferring entry creation, not by filtering after the fact
On `message_start`, keep tracking `streamingIdRef` (later deltas and `message_end` need it) but do **not** push a transcript entry. Push the `ChatMessageEntry` lazily on the *first* `text_delta` for that message id; subsequent deltas append as before. If `message_end` arrives and no entry was ever created for `streamingIdRef.current` (a tool-only turn), just clear the ref — there's nothing to mark non-streaming.

Alternative considered: create the entry at `message_start` as today, then splice it out at `message_end` if still empty. Rejected because it still renders (and briefly flashes) an empty bubble during the turn before removal, which is the exact symptom being fixed — deferred creation never renders anything until there's real text.

### `react-markdown` + `remark-gfm` for rendering, `@tailwindcss/typography` for styling
Already decided in proposal.md; carried through here as the implementation basis. `ReactMarkdown` renders directly to React elements (no `dangerouslySetInnerHTML`), so agent-produced text can't inject raw HTML into the page. `remark-gfm` adds table/strikethrough/task-list support, which plain CommonMark markdown doesn't cover and pi's assistant output may use.

Register the typography plugin the Tailwind v4 way, in `client-deck/src/index.css`:
```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";
```
Wrap rendered markdown in `<div className="prose prose-invert prose-sm max-w-none">` inside the assistant bubble. `max-w-none` is required because `prose`'s default `max-width: 65ch` would fight the bubble's own `max-w-[85%]` sizing and cause unwanted wrapping/shrinking inside narrow bubbles. `prose-sm` matches the panel's existing `text-sm` scale.

Alternative considered: hand-write CSS for markdown elements instead of `@tailwindcss/typography`. Rejected as more code to maintain for no benefit — `prose-invert` already targets dark backgrounds and the project has no existing precedent for hand-rolled markdown styling to stay consistent with.

### Streaming cursor stays outside the markdown tree
The `▍` streaming indicator (`entry.streaming && <span className="animate-pulse">▍</span>`) renders as a sibling after the `ReactMarkdown` output, not inside the markdown source string. Concatenating it into the text before parsing would risk it landing mid-token (e.g. inside an unclosed code fence) and rendering incorrectly; keeping it as a separate trailing element sidesteps that entirely and matches current behavior.

## Risks / Trade-offs

- [Markdown parsing on every streamed delta re-renders the whole message's markdown tree, which is more work per keystroke-equivalent than the current raw-text append] → In practice message text is short-to-moderate (chat replies, not long documents) and React/`react-markdown` re-parsing on each delta is the same cost pattern already accepted by other `react-markdown`-based streaming chat UIs; no virtualization or debouncing needed at this scale.
- [`remark-gfm` table rendering inside an 85%-width chat bubble could overflow on narrow viewports] → Not addressed by this change (no horizontal-scroll wrapper added); acceptable since the deck harness is a fixed-layout desktop tool, not a narrow mobile client.
- [Deferring entry creation to first `text_delta` means an assistant turn that eventually does produce text has a brief window with no visible placeholder at all, versus today's immediate-but-empty bubble] → This is the intended trade: no placeholder is preferable to a wrong (empty) one, and tool badges already appear immediately for tool calls, so the panel isn't silent during that window.

## Migration Plan

No data migration; this only changes in-memory client transcript construction and one new CSS plugin import. Roll out as a normal deploy of `client-deck`; rollback is reverting the commit (no persisted state depends on the new behavior).
