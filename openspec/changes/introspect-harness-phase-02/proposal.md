## Why

Phase 1 proved the live loop: a browser chat driving an in-process `AgentSession`, with events streamed to the apparatus view. But every session is ephemeral and every demo run calls a real LLM — risky for a stage demo and useless for iterating on a story offline. Recording and replay let a presenter capture a live session once, then play it back deterministically (no LLM calls, no drift) while the apparatus view shows the same state it showed live. This is the foundation Phase 3 (branching) and Phase 5 (tool trace/approval) build on.

## What Changes

- Add file snapshotting for the sandbox workspace: capture the workspace's file tree at a point in time, keyed so that unchanged files across checkpoints aren't duplicated. Storage mechanism (git-backed, content-addressed store, etc.) is a design decision, not fixed here — see `design.md`.
- Add a workspace seed mechanism: a recording declares the starting file set for the sandbox (e.g. an `.agents/` directory with OpenSpec skills) as its first snapshot, so replay — and a fresh live session started from a recording — always begins from a known, reproducible state rather than an ambient folder.
- Add a recording writer that appends events (from the same lifecycle events `introspection-bridge.ts` already forwards) plus snapshot references to a recording file during live mode.
- Define and document the recording format: a `.jsonl` file of timestamped events, with file snapshots stored separately and referenced by ID.
- Add a replay engine that loads a recording, restores the sandbox to any checkpoint from its snapshot, and emits the recorded events to the browser at user-controlled pace — without calling the LLM.
- Add a session timeline UI with play/pause/step controls and a record toggle for live sessions.
- Verify end-to-end: record a short live session seeded from a known starting file set, replay it, and confirm the apparatus view matches the live run at each step.

## Capabilities

### New Capabilities
- `introspect/recording`: Capture live-session events and sandbox file snapshots (starting from a declared workspace seed) to a recording file; define the recording format, snapshot storage mechanism, and the writer that produces it.
- `introspect/replay`: Load a recording, restore the sandbox to a given checkpoint from its snapshots, and emit recorded events to the browser without invoking the LLM.

### Modified Capabilities
- `introspect/apparatus-view`: Must render identically whether its events originate from a live `AgentSession` or from the replay engine — no new requirements on what it renders, but its event source is no longer assumed to be live-only.
- `introspect/agent-session`: A new live session now resets the sandbox workspace to a declared seed's file set before creating the `AgentSession`, instead of relying on whatever files happen to already be in the sandbox from a previous session.

## Impact

- New server modules: `introspect-harness-server/src/recording-writer.ts`, `introspect-harness-server/src/replay-engine.ts`, `introspect-harness-server/src/workspace-manager.ts` (snapshot/restore; storage mechanism decided in `design.md`).
- Extends `introspection-bridge.ts` to write recording events and trigger snapshots at boundaries (e.g. `agent_settled`) when recording is enabled, plus an initial seed snapshot at recording start.
- New on-disk storage under a configured recordings directory: one `.jsonl` event log plus snapshot storage per recording, server-side only.
- New default workspace seed (`.agents/` with OpenSpec skills) available for recordings to start from; seed sets are small text-file trees, selectable per recording.
- New client component: session timeline (play/pause/step, record toggle), reusing the existing apparatus view and WebSocket event pipeline from Phase 1.
- No change to auth, tool permission gate, or the live `AgentSession` lifecycle itself.
