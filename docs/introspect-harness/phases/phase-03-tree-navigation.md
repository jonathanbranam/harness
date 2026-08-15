# Phase 3 — Tree Navigation and Branching

## Status

not started

## Goal

Add checkpoints, tree navigation, and the ability to branch from any replay position into a new live session. This makes the demo interactive and resilient: the presenter can rewind, branch, and resume live experimentation at any point.

## Scope

### In scope

- Checkpoint creation during live and replay modes.
- Tree data model for checkpoints and branches.
- UI for navigating the tree: jump to checkpoint, step backward/forward, see branches.
- Branching: from any checkpoint, start a new live session rooted at that state.
- Recording branches as separate or extended recordings.
- End-to-end verification: branch from a replay checkpoint, continue live, and record the new branch.

### Out of scope

- Merging branches back together.
- OpenSpec artifact integration.
- Guide/sensor editing.
- Tool call trace, approval flow, or file system mirror.

## Acceptance Criteria

- [ ] A user can create a named checkpoint during a live session.
- [ ] A user can navigate to any checkpoint during replay.
- [ ] The sandbox workspace is restored to the exact state at the selected checkpoint.
- [ ] A user can click "Go Live" from any checkpoint to start a new live session.
- [ ] The new live session can be recorded as a separate branch.
- [ ] The tree UI shows checkpoints and branches clearly.

## Reference

See [`../proposal.md`](../proposal.md) for checkpoint, tree, and branching semantics.

## Proposed OpenSpec Change

Create a new OpenSpec change named `introspect-harness-phase-03` using the default spec-driven schema. Required artifacts:

- `proposal.md` — this phase's goal, scope, and acceptance criteria.
- `specs/tree/spec.md` — functional spec for checkpoints, tree navigation, and branching.
- `design.md` — tree data model, UI, and live-mode transition design.
- `tasks.md` — implementation tasks.

## Notes

- Align checkpoint semantics with pi's `/tree`, `/fork`, and `/clone` concepts where possible.
- Branches should be first-class recordings so they can be replayed independently.
- Consider whether the UI should show a single tree or a forest of recordings.
