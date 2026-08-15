# Phase 6 — Hardening and Polish

## Status

not started

## Goal

Make the harness robust enough for live presentation and deployment. This phase focuses on reliability, performance, security, and runbook documentation.

## Scope

### In scope

- Session timeouts and idle cleanup.
- Rate limiting for prompts and tool execution.
- Recording import/export and validation.
- Replay determinism validation: same recording → same visible state.
- Security review: path jail, auth, permission gate, sandbox isolation.
- Deployment runbook.
- Final UI polish and responsive layout.
- End-to-end dry run of a complete demo: live → record → replay → branch → live.

### Out of scope

- New features not required for the demo.
- Multi-tenancy or public multi-user support.

## Acceptance Criteria

- [ ] Idle harness sessions are cleaned up after a configurable timeout.
- [ ] Prompts and tool calls are rate-limited to prevent accidental cost spikes.
- [ ] A recording can be exported and imported without corruption.
- [ ] Replaying an exported recording produces the same visible state as the original.
- [ ] The server refuses to read or write outside the configured sandbox path.
- [ ] The deployment runbook documents install, build, start, and rollback steps.
- [ ] A full demo flow can be executed end-to-end without errors.

## Reference

See [`../proposal.md`](../proposal.md) for security, deployment, and hardening details.

## Proposed OpenSpec Change

Create a new OpenSpec change named `introspect-harness-phase-06` using the default spec-driven schema. Required artifacts:

- `proposal.md` — this phase's goal, scope, and acceptance criteria.
- `specs/hardening/spec.md` — functional spec for timeouts, rate limiting, and security.
- `specs/deployment/spec.md` — functional spec for deployment and runbook.
- `design.md` — hardening and deployment design.
- `tasks.md` — implementation tasks.

## Notes

- This phase should not add new user-facing features unless required for reliability.
- Focus on making the Phase 1–5 features trustworthy on stage.
- Consider whether the harness needs a "kiosk" or "presentation" mode that hides dev controls.
