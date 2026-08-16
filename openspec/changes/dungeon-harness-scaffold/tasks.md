## 1. Workspace setup

- [x] 1.1 Create `dungeon-harness-server/` workspace: `package.json` (mirroring `deck-harness-server/package.json`'s dependencies — `@earendil-works/pi-coding-agent`, `@hono/node-server`, `@hono/node-ws`, `bcrypt`, `dotenv`, `hono`, `typebox`; devDependencies `@types/bcrypt`, `@types/node`, `@types/ws`, `tsx`, `typescript`), `tsconfig.json`, `src/` directory, `.env.example` (copy `deck-harness-server/.env.example`, set `PORT=4300`).
- [x] 1.2 Create `client-dungeon/` workspace: `package.json` (mirroring `client-deck/package.json`'s dependencies minus `html-to-image`, which is only needed for deck's canvas render capture), `vite.config.ts` (`DEV_PORT=5177`, `BACKEND_PORT=4300`), `tsconfig.json`, `index.html`, `src/` directory.
- [x] 1.3 Add `dungeon-harness-server` and `client-dungeon` to root `package.json`'s `workspaces` array.
- [x] 1.4 Add root `package.json` scripts: `dev:dungeon-server`, `dev:dungeon-client`, `build:client-dungeon` (also add it to the `build` script's chain), `start:dungeon`, and extend `typecheck` to include both new workspaces.
- [x] 1.5 Add `hash-password:dungeon` root script (`npm run hash-password -w dungeon-harness-server`) and a `scripts/hash-password.ts` in `dungeon-harness-server` copied from `deck-harness-server`.

## 2. Server foundation

- [x] 2.1 Create `src/env.ts`: `requireEnv('HARNESS_PASSWORD_HASH')`, `PORT` (default 4300), `DUNGEON_WORKSPACE_DIR` (default `dungeon-harness-server/data/workspace`), `COOKIE_SECURE`, `isProd` — mirrors `deck-harness-server/src/env.ts` minus the deck-state-file/images-dir entries.
- [x] 2.2 Create `src/types.ts` with `AppEnv` (`Variables: { authenticated: true }`), copied from `deck-harness-server/src/types.ts`.
- [x] 2.3 Create `src/auth.ts`, copied from `deck-harness-server/src/auth.ts` (opaque token, sha256-hashed in-memory session `Map`, bcrypt password check, `SESSION_COOKIE`, `createSession`/`destroySession`/`isSessionTokenValid`/`requireAuth`).
- [x] 2.4 Create `src/routes/auth.ts`, copied from `deck-harness-server/src/routes/auth.ts` (`POST /login`, `POST /logout` calling `disposeSession`, `GET /me`).
- [x] 2.5 Create `src/app.ts`: Hono app wiring `/api/health`, `/api/auth` routes, `/ws` upgrade behind `requireAuth`, and SPA static hosting of `../client-dungeon/dist` — mirrors `deck-harness-server/src/app.ts` minus the images route.
- [x] 2.6 Create `src/index.ts`: `serve()` + `injectWebSocket`, `SIGINT`/`SIGTERM` handlers — mirrors `deck-harness-server/src/index.ts` minus the deck-persistence auto-save wiring (no persisted domain state in this phase).

## 3. Agent workspace and session

- [x] 3.1 Create `templates/agent-workspace/AGENTS.md` with dungeon-harness-appropriate rules (agent is assisting inside a chat-only harness with no board tools yet; `bash`/`write`/`edit` are for incidental scripting only and are gated behind browser approval).
- [x] 3.2 Create `src/agent-workspace.ts`, copied from `deck-harness-server/src/agent-workspace.ts` (`ensureAgentWorkspace`, seeding `data/workspace/` from `templates/agent-workspace/` without clobbering existing files).
- [x] 3.3 Create `src/session-store.ts`: `sessionId -> AgentSession` map keyed by auth session token, `ModelRuntime.create()` once per process, `getOrCreateSession(sessionId, callbacks)` / `disposeSession(sessionId)` — mirrors `deck-harness-server/src/session-store.ts`'s shape but with only a `requestApproval` callback (no `requestRender`, no custom tool names — see design.md's "no domain-state broadcast" decision) and `tools: ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls']`.

## 4. Permission-gate extension

- [x] 4.1 Create `src/pi-extensions/permission-gate.ts`, copied from `deck-harness-server/src/pi-extensions/permission-gate.ts`: `DANGEROUS_BASH` blocklist, path jail for `write`/`edit` resolved against the session's `cwd`, `READ_ONLY_TOOLS` (`read`, `grep`, `find`, `ls` — no `presentation_*` entries), `GATED_TOOLS` (`bash`, `write`, `edit`), per-turn `approvedThisTurn` dedupe, `createPermissionGateExtension({ cwd, requestApproval })` factory.
- [x] 4.2 Wire `createPermissionGateExtension` into `session-store.ts`'s `DefaultResourceLoader` extension factories list.
- [x] 4.3 Add `src/pi-extensions/permission-gate.test.ts`, copied and adapted from `deck-harness-server/src/pi-extensions/permission-gate.test.ts` (drop the deck-specific tool assertions).

## 5. WebSocket protocol

- [x] 5.1 Create `src/websocket.ts`: `createDungeonSocketHandlers(c)` returning `WSEvents` — `onOpen` sends `history` and subscribes to `session.subscribe` for `agent_event`; `onMessage` handles `prompt` (steering via `session.isStreaming`) and `approval_response`; `onClose` denies any pending approvals and unsubscribes. Mirrors `deck-harness-server/src/websocket.ts` minus `deck_state`/`selection`/`object_update`/shape/image/deck/slide/`undo`/`redo`/render-request handling.
- [x] 5.2 Define the `ClientMessage`/`ServerMessage` types for this reduced protocol: `prompt`, `approval_response` in; `history`, `agent_event`, `approval_required`, `error` out.

## 6. React client

- [x] 6.1 Scaffold `client-dungeon/src/main.tsx`, `index.css` (Tailwind), and `index.html` with the pre-mount dark-mode script, copied from `client-deck`'s equivalents.
- [x] 6.2 Create `src/api.ts` with `authApi` (`login`/`logout`/`me`), copied from `client-deck/src/api.ts` minus `imagesApi`.
- [x] 6.3 Create `src/hooks/useAuth.tsx` and `src/hooks/useTheme.ts`, copied from `client-deck`'s equivalents (swap the `localStorage` theme key to `dungeon-harness-theme`).
- [x] 6.4 Create `src/components/AuthGuard.tsx`, copied from `client-deck`'s equivalent.
- [x] 6.5 Create `src/pages/LoginPage.tsx`, copied from `client-deck/src/pages/LoginPage.tsx` with the heading changed to "Dungeon Harness".
- [x] 6.6 Create `src/hooks/useDungeonSocket.ts`: WebSocket lifecycle, `prompt`/`agent_event`/`approval_required`/`approval_response`/`error` handling and transcript-building — trimmed from `client-deck/src/hooks/useDeckSocket.ts` per design.md's decision (no `DeckState`, no `canvasRef`/render-request handling, no shape/image/deck/slide senders).
- [x] 6.7 Create `src/components/ChatPanel.tsx`, copied from `client-deck`'s equivalent (drop the deck-specific placeholder text, e.g. "Ask pi to edit the deck…" → "Ask pi…").
- [x] 6.8 Create `src/components/ApprovalDialog.tsx`, copied from `client-deck`'s equivalent, importing `ApprovalRequest` from `useDungeonSocket`.
- [x] 6.9 Create `src/pages/DungeonPage.tsx`: renders `ChatPanel` full-pane (no canvas yet) plus `ApprovalDialog` when a request is pending, wired to `useDungeonSocket`.
- [x] 6.10 Create `src/App.tsx`: `BrowserRouter` + `AuthProvider` + `/login` and `/` routes behind `AuthGuard`, copied from `client-deck/src/App.tsx` with `DeckPage` swapped for `DungeonPage`.

## 7. Keep-in-sync repo files

- [x] 7.1 Add a `dungeon-harness-server` PM2 app entry to `ecosystem.config.cjs`, mirroring the existing two entries.
- [x] 7.2 Add a `dungeon.local { reverse_proxy localhost:4300 }` block to `Caddyfile` and a `dungeon-local.test:80 { reverse_proxy localhost:5177 }` block to `Caddyfile.local`.
- [x] 7.3 Add a `dungeon-harness-server` tmux pane (bottom-left, alongside the existing panes) and a `client-dungeon` tmux pane to `dev-local.sh`.
- [x] 7.4 Add `dungeon-harness-server/src/**/*.test.ts` to `vitest.config.mts`'s `include` glob, plus any test-only env var overrides this harness's tests need (following the pattern of `INTROSPECT_WORKSPACE_DIR`/`RECORDINGS_DIR`).
- [x] 7.5 Update this repo's `CLAUDE.md`: add `dungeon-harness-server` + `client-dungeon` to the "Commands" section's dev/build/start/typecheck script list, and to the "Never kill or restart the dev servers" and "Keep in sync" notes.

## 8. End-to-end verification

- [x] 8.1 Run `npm run typecheck` and `npm test` and confirm both pass with the new workspaces included.
- [x] 8.2 Generate a password hash (`npm run hash-password:dungeon -- '<password>'`), set `dungeon-harness-server/.env`, and start `npm run dev:dungeon-server` + `npm run dev:dungeon-client`.
- [x] 8.3 Log in via the browser at the client dev port, send a chat prompt, and verify the assistant response streams into the chat panel.
- [x] 8.4 Trigger a `bash`/`write`/`edit` tool call and verify the approval dialog appears, and that both Approve and Deny behave correctly.
- [x] 8.5 Attempt (via a prompt) to have the agent write outside its workspace directory and verify the path jail blocks it without a dialog.
- [x] 8.6 Verify reconnect (page reload) reuses the same `AgentSession` (chat history / in-flight turn isn't lost), and that logout disposes it (a fresh login starts a new session).
- [x] 8.7 Run `openspec validate dungeon-harness-scaffold --type change` and fix any issues.
