## 1. Client: guard against a superseded WebSocket connection

- [x] 1.1 In `client-introspect/src/hooks/useIntrospectSocket.ts`, add the same `!active || wsRef.current !== ws` staleness guard already used by `onopen`/`onclose`/`onerror` to the `ws.onmessage` handler, so a superseded/throwaway socket can no longer drive `handleEvent` (`introspect/event-streaming`'s new "Client discards events from a superseded connection" requirement).

## 2. Client: make `tool_execution_start`'s state updates upsert-safe

- [x] 2.1 In the same file's `tool_execution_start` handler, change the `setBlocks` call from a blind prepend to an upsert: if a block with that `toolCallId` already exists, replace it in place; otherwise prepend a new one — mirroring the existing-block check `message_update`'s `text_delta` handler already uses.
- [x] 2.2 Apply the same upsert treatment to the parallel `setApparatusEntries` push in the same handler (keyed by the same `toolCallId`).

## 3. Verification

- [x] 3.1 Run `npm run typecheck -w client-introspect` and resolve any type errors.
- [x] 3.2 Using `playwright-cli` against the already-running `client-introspect` dev server (per CLAUDE.md), reproduce the original repro (a live prompt that makes several same-named tool calls in one turn, e.g. "run ls three times") and confirm: no "duplicate key" console error, and the Apparatus composition totals (tool-result content, tool call count) look sane rather than inflated.
- [x] 3.3 With the same repro, force the original failure mode if possible (e.g. briefly throttle/reload to encourage an overlapping reconnect) to build confidence the guard actually suppresses double-processing rather than the repro simply not triggering the race this time; note the result either way, since this is a timing-dependent bug that can't be proven absent by a single clean run.
