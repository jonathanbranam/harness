## 1. Dependencies

- [x] 1.1 Add `react-markdown`, `remark-gfm`, and `@tailwindcss/typography` to `client-introspect/package.json` and install
- [x] 1.2 Register the typography plugin in `client-introspect/src/index.css` via `@plugin "@tailwindcss/typography";`

## 2. Fix empty blocks

- [x] 2.1 In `client-introspect/src/hooks/useIntrospectSocket.ts`, change the `message_start` handler to set `streamingIdRef.current` without pushing a block
- [x] 2.2 Change the `message_update`/`text_delta` handler to create the block on the first non-whitespace delta for a message id if it doesn't already exist, then append subsequent deltas (including whitespace) to it as before
- [x] 2.3 Verify: prompt a turn that only makes tool calls (no assistant text) and confirm no empty bubble appears in either window

## 3. Render assistant markdown

- [x] 3.1 Add `client-introspect/src/components/MarkdownMessage.tsx`: a shared `ReactMarkdown` + `remark-gfm` wrapper styled with `prose prose-invert prose-sm max-w-none`
- [x] 3.2 In `client-introspect/src/components/ChatPanel.tsx`, render assistant block text via `MarkdownMessage`; keep user/system blocks as plain text; filter out any residual empty/whitespace-only non-tool blocks
- [x] 3.3 In `client-introspect/src/components/ApparatusView.tsx`, render assistant block text via `MarkdownMessage`; filter empty/whitespace-only blocks before computing the muted-range indices; wrap muted assistant markdown output in `opacity-50` so danger-zone dimming still applies
- [x] 3.4 Verify: send a prompt that elicits both tool calls and markdown (headings, a bulleted list, inline code, a fenced code block) and confirm correct rendering with no empty bubbles in both the Chat panel and the Apparatus view

## 4. Manual verification

- [x] 4.1 Run `npm run typecheck` to confirm no type errors from the new dependencies/usages
- [x] 4.2 Exercise both fixes together in the browser against the running introspect harness: a multi-tool-call turn (`ls`, `read`) with a markdown-formatted final reply, confirmed via screenshot in both windows
