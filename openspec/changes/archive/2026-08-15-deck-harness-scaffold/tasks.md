## 1. Monorepo scaffold

- [x] 1.1 Create `harness/` as an npm-workspaces root (`package.json`, workspaces: `deck-harness-server`, `client-deck`) separate from `track-web/`
- [x] 1.2 Add root `vitest.config.mts` scoped to `deck-harness-server/src/**/*.test.ts`
- [x] 1.3 Update `.gitignore` for the new layout (`data/` runtime dirs, `.env`, build artifacts)
- [x] 1.4 Copy `pi-harness.md`, `track-web-architecture.md`, and `deck-harness/planning.md` into `harness/docs/` for a self-contained repo

## 2. harness-auth

- [x] 2.1 Implement in-memory cookie-session store (`deck-harness-server/src/auth.ts`): token creation, hashing, expiry, sweep
- [x] 2.2 Implement `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` (`deck-harness-server/src/routes/auth.ts`)
- [x] 2.3 Implement `requireAuth` middleware gating protected routes
- [x] 2.4 Add `scripts/hash-password.ts` for generating `HARNESS_PASSWORD_HASH`
- [x] 2.5 Wire logout to dispose the caller's `AgentSession`

## 3. deck-agent-session

- [x] 3.1 Implement `sessionId -> AgentSession` map keyed by auth token (`deck-harness-server/src/session-store.ts`)
- [x] 3.2 Implement the `/ws` WebSocket handler: auth gating, prompt/selection/approval-response message handling, agent-event and deck-state forwarding (`deck-harness-server/src/websocket.ts`)
- [x] 3.3 Handle reconnect (reuse existing `AgentSession`) and disconnect (deny pending approvals, unsubscribe)
- [x] 3.4 Assemble the Hono app (`app.ts`) and entrypoint (`index.ts`), including static hosting of the built `client-deck` SPA

## 4. presentation-editing

- [x] 4.1 Implement the in-memory deck store (`deck-harness-server/src/editor-state.ts`): seed objects, `getState`, `setSelection`, `selectByText`, `applyUpdate` (setPosition/setSize/setText/setFillColor/setFontSize/applyGridLayout)
- [x] 4.2 Implement the `presentation-bridge` extension registering `presentation_get_state`, `presentation_update`, `presentation_select_by_text`, and the `before_agent_start` selection-context injection (`deck-harness-server/src/pi-extensions/presentation-bridge.ts`)
- [x] 4.3 Build the `client-deck` deck canvas: render objects, click/shift-click selection, empty-canvas deselect (`client-deck/src/components/DeckCanvas.tsx`)
- [x] 4.4 Wire canvas selection to the WebSocket `selection` message and deck-state broadcasts to canvas re-render (`client-deck/src/hooks/useDeckSocket.ts`)

## 5. tool-permission-gate

- [x] 5.1 Implement the static dangerous-bash regex and the write/edit path jail (`deck-harness-server/src/pi-extensions/permission-gate.ts`)
- [x] 5.2 Implement the per-session interactive approval flow (factory closing over a per-connection `requestApproval` callback) and the per-turn approved-call dedupe
- [x] 5.3 Wire the approval request/response round trip through the WebSocket protocol and the browser `ApprovalDialog` component

## 6. Agent workspace sandbox

- [x] 6.1 Create `templates/agent-workspace/AGENTS.md` and `.pi/skills/presentation/SKILL.md` (committed defaults)
- [x] 6.2 Implement `ensureAgentWorkspace` to seed the gitignored, runtime `data/workspace/` directory from the templates on first run (`deck-harness-server/src/agent-workspace.ts`)

## 7. client-deck shell

- [x] 7.1 Scaffold Vite + React 19 + React Router 7 + Tailwind 4 client workspace
- [x] 7.2 Implement `AuthProvider`/`useAuth`/`AuthGuard` and `LoginPage`
- [x] 7.3 Implement `ChatPanel` (streamed text + tool-call status badges) and `DeckPage` composing chat + canvas + approval dialog

## 8. Ops scaffolding (optional, for later use)

- [x] 8.1 Add `dev-local.sh` (tmux) for local multi-pane dev
- [x] 8.2 Add `Caddyfile`/`Caddyfile.local` (LAN-only, no public TLS) and `ecosystem.config.cjs` (PM2)
- [x] 8.3 Add `server-deploy.sh` and `scripts/build-deploy.sh` for manual deploy to an always-on local box

## 9. Verification

- [x] 9.1 Unit tests for the deck store and the bash blocklist regex (`editor-state.test.ts`, `permission-gate.test.ts`)
- [x] 9.2 `npm run typecheck`, `npm test`, and `npm run build` all pass
- [x] 9.3 Live smoke test: login, WebSocket upgrade, extension loading, agent-workspace seeding, and deck-state broadcast all verified working end to end (blocked only on the final model call, which needs a `pi login` this sandbox doesn't have)
