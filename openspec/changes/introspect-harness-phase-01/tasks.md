## 1. Workspace and project setup

- [ ] 1.1 Create `introspect-harness-server/` workspace with `package.json`, `tsconfig.json`, and source directory.
- [ ] 1.2 Create `client-introspect/` workspace with `package.json`, `vite.config.ts`, `tsconfig.json`, and `index.html`.
- [ ] 1.3 Add both workspaces to the root `package.json` workspaces array.
- [ ] 1.4 Install shared dependencies (`hono`, `@hono/node-server`, `tsx`, `typescript`) in the server workspace.
- [ ] 1.5 Install client dependencies (`react`, `react-dom`, `vite`, `typescript`, tailwind if already used in repo).
- [ ] 1.6 Add a root dev script to run server and client concurrently for local development.

## 2. Server foundation

- [ ] 2.1 Create `src/index.ts` Hono entry that creates an HTTP server and upgrades `/ws` to WebSocket.
- [ ] 2.2 Create `src/auth-middleware.ts` that validates the session cookie on protected routes and `/ws` upgrade.
- [ ] 2.3 Create `src/session-store.ts` with `Map<sessionToken, HarnessSession>` and helpers to get or create a session.
- [ ] 2.4 Create `src/env.ts` with `requireEnv()` for required config (port, password hash, sandbox path, session secret).
- [ ] 2.5 Add `/api/auth/login`, `/api/auth/logout`, and `/api/auth/me` routes.

## 3. In-process agent runtime

- [ ] 3.1 Add a function to create an `AgentSession` using `createAgentSession`, `ModelRuntime.create()`, and `SessionManager.inMemory(cwd)`.
- [ ] 3.2 Configure the initial tool allowlist (`read`, `bash`, `write`, `edit`, `grep`, `find`, `ls`).
- [ ] 3.3 Implement prompt forwarding: when a WebSocket client sends `{ type: "prompt", text: "..." }`, call `session.prompt(text)`.
- [ ] 3.4 Implement steering: queue or buffer prompts sent while the agent is already streaming.

## 4. Introspection extension

- [ ] 4.1 Create `src/pi-extensions/introspection-bridge.ts` that exports a default factory function.
- [ ] 4.2 Subscribe to `session_start`, `agent_start`, `turn_start`, `turn_end`, `agent_end`, `agent_settled`.
- [ ] 4.3 Subscribe to `message_start`, `message_update`, `message_end`.
- [ ] 4.4 Subscribe to `tool_execution_start`, `tool_execution_end`.
- [ ] 4.5 Forward each event to the harness server via an in-process channel (e.g. a registered callback or a small event emitter shared with the extension loader).
- [ ] 4.6 Capture `ctx.getContextUsage()` during streaming and forward `context_usage` events.
- [ ] 4.7 Capture loaded skills during `resources_discover` and forward a `foundation_update` event.

## 5. Event bus and WebSocket broadcast

- [ ] 5.1 Create an event bus in the server that receives events from the extension and forwards them to all connected WebSocket clients for the session.
- [ ] 5.2 Define a stable JSON schema for events sent to the browser.
- [ ] 5.3 Handle malformed WebSocket messages by returning an `error` event and keeping the connection open.
- [ ] 5.4 On WebSocket disconnect, mark pending approvals as denied and dispose the `AgentSession` on logout.

## 6. React client

- [ ] 6.1 Create `src/App.tsx` with a simple layout: chat pane on the left, apparatus view on the right.
- [ ] 6.2 Create `src/api.ts` to open the WebSocket, send prompts, and listen for events.
- [ ] 6.3 Create `src/ChatPanel.tsx` with an input field and streaming message display.
- [ ] 6.4 Create `src/ApparatusView.tsx` with context window, pinned foundation zone, context gauge, and token/cost counter.
- [ ] 6.5 Render `message_update` deltas into the chat pane and context window.
- [ ] 6.6 Update the context gauge from `context_usage` events.
- [ ] 6.7 Update the token/cost counter from event usage data.

## 7. End-to-end verification

- [ ] 7.1 Start the server and client in dev mode.
- [ ] 7.2 Log in, type a prompt in the browser, and verify the assistant response streams in.
- [ ] 7.3 Verify the apparatus view updates: messages appear, gauge fills, token counter increases.
- [ ] 7.4 Verify reconnect reuses the same `AgentSession`.
- [ ] 7.5 Verify logout disposes the `AgentSession`.
- [ ] 7.6 Run `openspec validate --change introspect-harness-phase-01` and fix any issues.
