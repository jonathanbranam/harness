## Why

A live introspect-harness session can process a single server-sent event twice on the same browser tab, because `useIntrospectSocket.ts`'s `ws.onmessage` handler is missing the staleness guard (`wsRef.current !== ws`) that its sibling `onopen`/`onclose`/`onerror` handlers already carry. When a superseded/throwaway socket (e.g. from React StrictMode's documented dev-mode double-mount, or an unclean reconnect) lingers open long enough to receive even one more message, both it and the current socket invoke the same `handleEvent` closure for that message. The only currently *visible* symptom is a "duplicate key" React warning in the chat pane (tool-call blocks are keyed by `toolCallId`, and `tool_execution_start`'s state update blindly prepends a new block without checking whether one already exists for that id) — but the same double-delivery silently double-counts tokens wherever a handler accumulates rather than replaces (e.g. `tool_result`'s running token tally), corrupting the Apparatus token-category numbers with no visible symptom at all. That's a correctness bug in exactly the feature `redesign-introspect-ui` just built, worth fixing on its own rather than folding into that change's already-large scope.

## What Changes

- `useIntrospectSocket.ts`'s `ws.onmessage` handler gains the same `wsRef.current !== ws` (and `active`) staleness guard already used by `onopen`/`onclose`/`onerror` in the same effect, so a superseded socket can no longer drive state updates at all. This is the root-cause fix — it protects every event type uniformly, not just tool calls, since all events flow through `handleEvent` via `onmessage`.
- `tool_execution_start`'s state updates (`setBlocks` and the parallel `setApparatusEntries` push) become upsert-safe by id — replace-if-a-block-with-this-id-already-exists, else prepend/push — mirroring the pattern `message_update`'s `text_delta` handler already uses. This is a defense-in-depth fix: even if some other, not-yet-identified path ever redelivers a `tool_execution_start` for the same `toolCallId`, state no longer ends up with two blocks sharing one id.
- Explicitly **not** in scope: any change to the server's `attachListener`/broadcast behavior in `websocket.ts` or `session-store.ts`. The existing `introspect/event-streaming` spec already requires the server to broadcast every event to every connected client for a session (deliberately supporting multiple simultaneous tabs) — that fan-out is correct and untouched. The bug is narrower: a single browser tab failing to ignore its own superseded connection.

## Capabilities

### Modified Capabilities
- `introspect/event-streaming`: adds a client-side requirement that events arriving on a superseded WebSocket connection are discarded, so a single logical event is never processed twice within one browser tab.

## Impact

- `client-introspect/src/hooks/useIntrospectSocket.ts`: `onmessage` staleness guard; upsert-by-id fix in the `tool_execution_start` handler's `setBlocks`/`setApparatusEntries` calls.
- No server-side changes.
- No changes to `client-introspect/src/components/ChatPanel.tsx` itself — the duplicate-key warning was a downstream symptom of the hook's state management, not of how `ChatPanel` renders `blocks`.
