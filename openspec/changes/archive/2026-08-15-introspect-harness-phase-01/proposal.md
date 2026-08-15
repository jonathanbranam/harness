## Why

The AI Engineering Introspection Harness needs a working live loop before any recording, replay, or constraint features can be built. A browser-based chat that drives an in-process pi `AgentSession` and visualizes the agent's context window is the foundational capability that all later phases depend on.

## What Changes

- Create `introspect-harness-server/` and `client-introspect/` npm workspaces.
- Add a Hono server with WebSocket endpoint and cookie-session auth.
- Add an in-process `AgentSession` per authenticated browser session.
- Add an `introspection-bridge.ts` pi extension that captures agent lifecycle events and forwards them to the server.
- Add a React client with a chat pane and an apparatus view (context window, pinned foundation zone, context gauge, token/cost counter).
- Verify end-to-end that a browser prompt streams events and updates the apparatus.

## Capabilities

### New Capabilities
- `introspect/agent-session`: Provide one long-lived pi `AgentSession` per authenticated browser session, streaming prompts and agent events over WebSocket.
- `introspect/event-streaming`: Forward pi lifecycle events (`message_update`, `tool_execution_start`, `tool_execution_end`, `agent_settled`, etc.) from the in-process agent runtime to connected browser clients.
- `introspect/apparatus-view`: Render the ADM talk apparatus in the browser: context window with pinned foundation zone, context gauge, and token/cost counter.

### Modified Capabilities
- `harness-auth`: Extend the existing cookie-session auth pattern to cover the new introspection harness routes and WebSocket endpoint. No change to the auth contract itself.

## Impact

- New server workspace `introspect-harness-server/`.
- New client workspace `client-introspect/`.
- New pi extension `introspect-harness-server/src/pi-extensions/introspection-bridge.ts`.
- Reuses auth primitives from the deck harness.
- Adds a new PM2 app and subdomain entry (deployment details in Phase 6).
