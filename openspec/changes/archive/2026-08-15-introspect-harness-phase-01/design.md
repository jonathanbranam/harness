## Context

This change builds the first working increment of the AI Engineering Introspection Harness. The overall architecture and goals are in [`docs/introspect-harness/proposal.md`](../../docs/introspect-harness/proposal.md). This phase focuses only on the live event-capture loop: browser → WebSocket → Hono → pi `AgentSession` → events back to the browser.

The harness reuses patterns from the deck harness (`docs/arch/pi-harness.md` and `docs/talks/deck-harness/planning.md`) and track-web (`docs/arch/track-web-architecture.md`): npm workspaces, Hono, cookie-session auth, React + Vite, and independent deployment.

## Goals / Non-Goals

**Goals:**
- Establish the `introspect-harness-server` and `client-introspect` workspaces.
- Run pi in-process behind a Hono server.
- Stream pi lifecycle events to a React client over WebSocket.
- Render the ADM talk apparatus: context window, foundation zone, gauge, token/cost counter.

**Non-Goals:**
- Recording or replay.
- Tree navigation, branching, or going live from replay.
- OpenSpec artifact integration.
- Guides, sensors, or skill editing.
- Tool call trace, approval flow, or file system mirror.
- Production deployment hardening.

## Decisions

### Decision: Reuse the deck harness auth pattern
**Rationale:** The deck harness already solved single-owner password auth with bcrypt and opaque session cookies. Reusing it avoids inventing a new auth model and keeps the harness family consistent.
**Alternative considered:** A separate OAuth or API-token flow. Rejected as unnecessary for a single-owner tool.

### Decision: One `AgentSession` per authenticated browser session
**Rationale:** This matches the deck harness model, simplifies reconnects, and keeps the WebSocket handler stateless except for the session map.
**Alternative considered:** One `AgentSession` per WebSocket connection. Rejected because reconnects would lose context and cost more.

### Decision: WebSocket as the real-time transport
**Rationale:** The event volume is high (every `message_update`, tool lifecycle event, etc.), and WebSocket gives low-latency bidirectional messaging for prompts and approvals later.
**Alternative considered:** Server-Sent Events (SSE). Rejected because we need bidirectional messaging for prompts and future approval flows.

### Decision: Capture events via a pi extension
**Rationale:** Extensions can subscribe to all lifecycle events and access `ExtensionContext` (usage, cwd, etc.). This is the supported pi mechanism for introspection.
**Alternative considered:** Parse pi session files or intercept stdout. Rejected as fragile and incomplete.

### Decision: Minimal React UI in this phase
**Rationale:** The goal is to validate event streaming, not to build polished visuals. A simple chat pane and apparatus diagram are sufficient.
**Alternative considered:** Full polished dashboard. Rejected to keep Phase 1 small and demoable.

### Decision: Hardcoded sandbox path for Phase 1
**Rationale:** Recording/replay/workspace management comes in Phase 2. For now, a single configured folder is enough to prove the live loop.
**Alternative considered:** Per-recording sandbox paths. Rejected as premature.

## Risks / Trade-offs

- **Risk:** The pi SDK's event shapes may change between versions. → Mitigation: wrap events in a harness-specific schema at the extension boundary so the client depends on stable harness events, not raw pi events.
- **Risk:** Running pi in-process in a long-lived server may leak memory or hold resources. → Mitigation: dispose `AgentSession` on logout/WebSocket disconnect and add session timeouts in Phase 6.
- **Risk:** The apparatus view may be too minimal to tell the story. → Mitigation: Phase 1 only needs to show context flow; visuals are refined in later phases.
- **Trade-off:** Steering an in-progress turn requires careful handling of pi's streaming behavior. The initial implementation may queue prompts until idle; full steering can be added later.

## Migration Plan

Not applicable for this phase. Deployment and process management are covered in Phase 6.

## Open Questions

- Should the initial sandbox path be configured via environment variable or a settings file?
- Which model provider/credentials should the server use for the first `AgentSession`?
