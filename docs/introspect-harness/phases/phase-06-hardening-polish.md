# Phase 6 — Hardening and Polish

## Status

not started — but a substantial slice of the "Security review: path jail ... sandbox isolation" scope item is already done ahead of schedule, landed in `2026-08-16-sandbox-introspect-harness` (archived) as `openspec/specs/introspect/tool-permission-gate/spec.md` + `introspect-harness-server/src/pi-extensions/permission-gate.ts` (60 passing tests in `permission-gate.test.ts`). See "Already implemented" note below before scoping this phase's tasks.

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

## Already implemented (jailbreak / sandbox hardening)

The `2026-08-16-sandbox-introspect-harness` change (archived) implemented the tool-permission-gate portion of this phase's "Security review" item before this phase formally started:

- **Path jail** for `read`/`write`/`edit`/`ls`/`find`/`grep`, including `realpath`-based symlink-escape detection (both pre-existing symlinks and ones the agent tries to create mid-command).
- **`bash` confinement** to the workspace root: blocks `cd`/absolute paths/`..` traversal/`~` expansion outside the workspace, a static destructive-command blocklist (`rm -rf`, `mkfs`, `dd` to a device, `curl|sh`-style pipes, etc.), and outright blocking of `ln`/`cp -s` link creation (checked before execution, so compound "create symlink then read through it" commands are blocked as a whole).
- **No approval-prompt fallback** — blocked calls fail immediately with a reason, since introspect-harness-server has no interactive approval channel (unlike deck-harness-server's permission-gate).
- **System prompt** states the workspace boundary explicitly.

Spec: `openspec/specs/introspect/tool-permission-gate/spec.md`. Implementation: `introspect-harness-server/src/pi-extensions/permission-gate.ts`, tested by `permission-gate.test.ts` (60 tests, passing as of 2026-08-16).

Remaining for this phase's security-review scope item: this hardening is pattern-based (documented residual risk in design.md), not a kernel-level sandbox — worth a fresh look before a public demo. Session timeouts/idle cleanup, rate limiting, recording import/export, replay determinism, and the deployment runbook are all still not started.
