# Phase 2 — Recording and Replay Scaffold

## Status

in progress — OpenSpec change [`introspect-harness-phase-02`](../../../openspec/changes/introspect-harness-phase-02/proposal.md) created (proposal done; specs, design, and tasks not yet drafted).

## Goal

Add the ability to record a live session and replay it deterministically. The replay engine restores the sandbox workspace from snapshots and emits recorded events without calling the LLM.

## Scope

### In scope

- File snapshotting for the sandbox workspace.
- Recording writer that appends events and snapshot references during live mode.
- Recording format defined and documented.
- Replay engine that loads a recording and restores the sandbox to any checkpoint.
- Session timeline UI with play/pause/step controls.
- Toggle to start/stop recording during a live session.
- End-to-end verification: record a short live session, replay it, and see the same apparatus state.

### Out of scope

- Tree navigation beyond linear stepping.
- Branching or going live from replay.
- OpenSpec artifact integration.
- Guide/sensor editing.
- Tool call trace, approval flow, or file system mirror.

## Acceptance Criteria

- [ ] A user can start recording a live session from the UI.
- [ ] The recording captures all events forwarded by the introspection extension plus file snapshots at boundaries.
- [ ] A recorded session can be loaded into replay mode.
- [ ] Stepping forward in replay emits the same events and restores the sandbox to the recorded state.
- [ ] The apparatus view in replay matches the live session at the same point.
- [ ] Replay does not make any LLM calls.

## Reference

See [`../proposal.md`](../proposal.md) for recording format, replay engine, and snapshot details.

## Proposed OpenSpec Change

Create a new OpenSpec change named `introspect-harness-phase-02` using the default spec-driven schema. Required artifacts:

- `proposal.md` — this phase's goal, scope, and acceptance criteria.
- `specs/recording/spec.md` — functional spec for the recording format and writer.
- `specs/replay/spec.md` — functional spec for the replay engine.
- `design.md` — snapshot storage, replay engine, and timeline UI design.
- `tasks.md` — implementation tasks.

## Notes

- Decide on snapshot storage in this phase (tar archives, content-addressed store, or git). The choice affects the replay engine design.
- Keep the timeline simple: a scrubber with previous/next and a list of checkpoints.
- Recordings are stored server-side in a configured directory.
