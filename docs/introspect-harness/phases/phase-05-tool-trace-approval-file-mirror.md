# Phase 5 — Tool Call Trace, Approval Flow, and File System Mirror

## Status

not started

## Goal

Add the remaining visibility and safety layers: a detailed tool call trace, browser-mediated approval for sensitive operations, and a file system mirror that shows what actually changed on disk.

## Scope

### In scope

- Tool call trace pane with filtering, search, and expandable details.
- Permission-gate extension for `bash`/`write`/`edit` approval.
- Browser approval dialogs for blocked tool calls.
- File system mirror: tree view of the sandbox folder.
- Change highlighting for files modified during the current turn.
- Diff view for text files against the previous checkpoint.
- End-to-end verification: a blocked `bash` command shows an approval dialog, and approved changes appear in the file system mirror.

### Out of scope

- OpenSpec artifact editing.
- Guide/sensor authoring (covered in Phase 4).
- Deployment hardening (covered in Phase 6).

## Acceptance Criteria

- [ ] Every tool call appears in the trace with name, input, output, duration, and success/error status.
- [ ] The trace can be filtered by tool name and searched by content.
- [ ] Dangerous or unapproved `bash`/`write`/`edit` calls are blocked pending browser approval.
- [ ] Approved calls proceed; denied calls return an error to the agent.
- [ ] The file system mirror shows the sandbox folder tree.
- [ ] Files changed during the current turn are highlighted.
- [ ] A diff view shows changes between the current state and the previous checkpoint.

## Reference

See [`../proposal.md`](../proposal.md) for tool trace, approval flow, and file system mirror details.

## Proposed OpenSpec Change

Create a new OpenSpec change named `introspect-harness-phase-05` using the default spec-driven schema. Required artifacts:

- `proposal.md` — this phase's goal, scope, and acceptance criteria.
- `specs/tool-trace/spec.md` — functional spec for the tool call trace pane.
- `specs/approval/spec.md` — functional spec for the permission-gate extension and approval flow.
- `specs/file-mirror/spec.md` — functional spec for the file system mirror and diff view.
- `design.md` — extension, server, and UI design.
- `tasks.md` — implementation tasks.

## Notes

- The permission gate should reuse the pattern from the deck harness but adapted for browser-mediated approval.
- The file system mirror should be read-only during replay and editable during live mode.
- Diff view can be computed on demand from snapshots or git.
