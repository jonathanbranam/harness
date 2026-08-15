# Phase 1 — Live Event Capture and Basic Apparatus

## Status

not started

## Goal

Establish the core live loop: a browser-based chat UI that talks to an in-process `AgentSession`, with pi lifecycle events streamed over WebSocket and rendered in the ADM talk apparatus view.

This phase proves the hardest foundational pieces:
- Running pi in-process behind a Hono server.
- Forwarding pi events over WebSocket to a React client.
- Rendering the context window, pinned foundation zone, context gauge, and token/cost counter.

## Scope

### In scope

- Create `introspect-harness-server/` and `client-introspect/` npm workspaces.
- Hono server with WebSocket endpoint and cookie-session auth.
- `AgentSession` lifecycle: create, prompt, destroy.
- `introspection-bridge.ts` pi extension that captures lifecycle events and forwards them to the server.
- React client with:
  - Chat input and streaming message display.
  - Apparatus view: context window, foundation zone, context gauge, token/cost counter.
- End-to-end verification: a browser prompt produces streaming text and updates the apparatus.

### Out of scope

- Recording or replay.
- Tree navigation or branching.
- OpenSpec integration.
- Guides, sensors, or skill editing.
- Tool call trace, approval flow, or file system mirror.
- Permission gate (basic tool allowlist only).

## Acceptance Criteria

- [ ] A user can open the web UI, type a prompt, and see the assistant response stream in.
- [ ] The apparatus view updates in real time: messages appear in the context window, the gauge fills, and the token counter increases.
- [ ] The server can create and hold one `AgentSession` per WebSocket connection.
- [ ] The introspection extension forwards at least `message_update`, `tool_execution_start`, `tool_execution_end`, and `agent_settled` events.
- [ ] The system prompt and loaded skills appear in the pinned foundation zone.

## Reference

See [`../proposal.md`](../proposal.md) for architecture, data model, and UI design details.

## Proposed OpenSpec Change

Create a new OpenSpec change named `introspect-harness-phase-01` using the default spec-driven schema. Required artifacts:

- `proposal.md` — this phase's goal, scope, and acceptance criteria.
- `specs/phase-01/spec.md` — functional spec for the live event capture system.
- `design.md` — server, WebSocket, extension, and client design.
- `tasks.md` — implementation tasks.

## Notes

- Keep the UI minimal. The goal is validated event streaming, not polished visuals.
- Reuse auth and workspace patterns from [`docs/arch/pi-harness.md`](../../arch/pi-harness.md) and [`docs/arch/track-web-architecture.md`](../../arch/track-web-architecture.md).
- The sandbox folder can be a hardcoded path for this phase.
