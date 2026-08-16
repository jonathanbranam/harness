## Context

See proposal.md - Why, and the deck harness's prior `deck-chat-panel-ux` change (`openspec/changes/deck-chat-panel-ux/` if not yet archived, else `openspec/specs/deck-chat-panel-ux/spec.md`), which fixed the identical pair of bugs for `client-deck`. This change ports the same fix to `client-introspect`, which shares the shape of the problem but not the code:

- `useIntrospectSocket.ts`'s `handleEvent` created a `ContextBlock` on every `message_start` for an assistant message, before any text arrived — the same root cause as the deck harness's bug. Unlike `useDeckSocket.ts`, this hook **prepends** new blocks (`setBlocks((b) => [newBlock, ...b])`), and `ContextBlock` is a `role`-discriminated union (not `kind`) with an extra `system` variant used for connection/parse errors.
- Two components render `ContextBlock[]`, not one: `ChatPanel.tsx` (chronological, oldest-first, via a local reverse) and `ApparatusView.tsx` (newest-first, with a "middle danger zone" muting effect on top). Both had unstyled assistant text.
- `client-introspect` is Tailwind v4 via `@tailwindcss/vite`, same as `client-deck`: `@import "tailwindcss";` in `client-introspect/src/index.css`, no JS config file.

## Goals / Non-Goals

**Goals:**
- Never show a block with no text content, at any point in the streaming lifecycle, in either window.
- Render assistant markdown consistently in both windows without duplicating the markdown-rendering JSX.
- Preserve `apparatus-view`'s existing "middle danger zone" muting behavior for markdown-rendered blocks.

**Non-Goals:**
- Rendering markdown for `user` or `system` blocks.
- Changing `event-streaming` or `agent-session` — this is purely a client-side rendering fix, same as the deck harness change.

## Decisions

### Defer block creation to the first non-whitespace delta (refined from the deck harness's original approach)
`deck-chat-panel-ux`'s first pass deferred entry creation to the first `text_delta`, full stop — then live verification against the deck harness (screenshot from the user) showed that whitespace-only deltas (e.g. a bare `"\n"` between tool calls) still created a visible-but-empty bubble, because "first delta" isn't the same as "first *content*". The fix applied there, and carried into this port from the start, is: on `message_update`, only create a new block if `delta.trim() !== ''`; if a block already exists for that message id, always append (even whitespace) since real content already exists there. `message_end`/`agent_settled` already no-op safely when no block was ever created (`.map()` over a non-matching id is a no-op).

### Shared `MarkdownMessage` component
`client-deck` only has one render site (`ChatPanel.tsx`), so it inlined the `ReactMarkdown`/`remark-gfm` JSX directly. `client-introspect` has two (`ChatPanel.tsx` and `ApparatusView.tsx`) rendering the same `ContextBlock[]`, so a small shared `MarkdownMessage` component (`client-introspect/src/components/MarkdownMessage.tsx`) avoids duplicating the wrapper and keeps both in sync if the rendering approach ever changes.

### Muted markdown blocks need `opacity`, not just a text-color class
`ApparatusView`'s existing muting applies `text-gray-500` to dim blocks in the middle danger zone. `@tailwindcss/typography`'s `prose`/`prose-invert` classes set their own text colors via CSS custom properties (`--tw-prose-body` etc.), which don't inherit a parent's `text-*` utility class. Left alone, a muted assistant block's markdown content would render at full brightness despite being in the danger zone. Fix: wrap muted assistant blocks' `MarkdownMessage` output in `opacity-50`, which dims the rendered content regardless of its internal color scheme. Non-assistant (tool/user/system) muted blocks are unaffected — they still use the original `text-gray-500` approach, which works fine for plain text.

## Risks / Trade-offs

- [Same per-delta markdown re-parse cost noted in `deck-chat-panel-ux`] → Same mitigation: message text is short-to-moderate, no virtualization/debouncing needed at this scale.
- [`opacity-50` dims the whole markdown block uniformly, which is a slightly different visual effect than `text-gray-500`'s color shift] → Acceptable; both read as "de-emphasized" and the danger zone's purpose (indicate lower attention, not convey precise state) doesn't depend on the exact dimming mechanism.

## Migration Plan

No data migration; client-only rendering change plus one new CSS plugin import, mirroring `deck-chat-panel-ux`'s rollout. Rollback is reverting the commit.
