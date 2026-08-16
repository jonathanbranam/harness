## 1. Dependencies

- [x] 1.1 Add `react-markdown`, `remark-gfm`, and `@tailwindcss/typography` to `client-deck/package.json` and install
- [x] 1.2 Register the typography plugin in `client-deck/src/index.css` via `@plugin "@tailwindcss/typography";`

## 2. Fix empty message bubbles

- [x] 2.1 In `client-deck/src/hooks/useDeckSocket.ts`, change the `message_start` handler to set `streamingIdRef.current` without pushing a transcript entry
- [x] 2.2 Change the `message_update`/`text_delta` handler to create the `ChatMessageEntry` (role `assistant`, `streaming: true`) on the first delta for a message id if it doesn't already exist in the transcript, then append subsequent deltas to it as before
- [x] 2.3 Change the `message_end` handler to no-op (aside from clearing `streamingIdRef`) when no entry was ever created for that message id
- [x] 2.4 Verify: prompt a turn that only makes tool calls (no assistant text) and confirm no empty bubble appears before, between, or after the tool badges

## 3. Render assistant markdown

- [x] 3.1 In `client-deck/src/components/ChatPanel.tsx`, import `ReactMarkdown` and the `remark-gfm` plugin
- [x] 3.2 For `entry.role === 'assistant'` message bubbles, render `entry.text` through `<ReactMarkdown remarkPlugins={[remarkGfm]}>` wrapped in `<div className="prose prose-invert prose-sm max-w-none">`, instead of the current raw `{entry.text}` text
- [x] 3.3 Keep `entry.role === 'user'` bubbles rendering plain text (no markdown parsing)
- [x] 3.4 Keep the streaming cursor (`▍`) as a trailing sibling element outside the `ReactMarkdown` output, so it never lands inside markdown source being parsed
- [x] 3.5 Verify: send a prompt that elicits markdown (headings, a bulleted list, inline code, a fenced code block) and confirm each renders as styled HTML, not raw markdown characters, including while the message is still streaming

## 4. Manual verification

- [x] 4.1 Run `npm run dev` + `npm run dev:client-deck` and exercise both fixes together in the browser: a multi-tool-call turn with a markdown-formatted final reply
- [x] 4.2 Run `npm run typecheck` to confirm no type errors from the new dependencies/usages
