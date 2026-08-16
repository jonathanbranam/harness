## 1. Workspace seed

- [ ] 1.1 Create `introspect-harness-server/templates/seeds/openspec-skills/` and move today's `data/workspace/.agents` tree into it as the default seed's content.
- [ ] 1.2 Add a seed-loading function (alongside `agent-workspace.ts`) that resets a target directory to a named seed's contents from `templates/seeds/<name>/`, mirroring `ensureAgentWorkspace`'s copy pattern but replacing rather than merging.
- [ ] 1.3 Wire seed reset into new-session creation in `session-store.ts`: before a new `AgentSession` is created (not on WebSocket reconnect to an existing one), reset `data/workspace/` to the default seed (`openspec-skills`).
- [ ] 1.4 Add a unit test covering: new session resets the sandbox; reconnect to an existing session does not.

## 2. Snapshot storage (workspace-manager)

- [ ] 2.1 Add `introspect-harness-server/src/workspace-manager.ts` with `createSnapshot(sandboxPath, gitDir): Promise<string>` that hashes and commits the sandbox's current files into a bare repo at `gitDir` via `git` plumbing (`hash-object -w`, `mktree`, `commit-tree`), returning the commit hash.
- [ ] 2.2 Add `restoreSnapshot(sandboxPath, gitDir, commitHash): Promise<void>` that fully replaces the sandbox's contents with the commit's tree (clear directory, then `git archive <commit> | tar -x -C <sandboxPath>`).
- [ ] 2.3 Add `initSnapshotRepo(gitDir): Promise<void>` that creates the bare repo for a new recording if it doesn't already exist.
- [ ] 2.4 Add a helper that tracks, per sandbox, which recording + commit (or "live, uncaptured") currently owns the sandbox's checked-out contents, and rejects a swap while a live turn is in flight.
- [ ] 2.5 Add unit tests: two snapshots with an unchanged file don't duplicate its blob; restoring a snapshot removes files added after it; restoring after a swap fully replaces prior contents (no leftover files).

## 3. Recording format and writer

- [ ] 3.1 Define the `RecordingEvent` union type (session/recording start, forwarded lifecycle events, `fs_snapshot` with commit hash) and the on-disk recording layout: `<recordingsDir>/<recordingId>/events.jsonl` + `<recordingsDir>/<recordingId>/snapshots.git` + `<recordingsDir>/<recordingId>/header.json` (name, createdAt, checkpoints list).
- [ ] 3.2 Add `RECORDINGS_DIR` to `env.ts` (default `introspect-harness-server/data/recordings/`), and gitignore it like `data/workspace/`.
- [ ] 3.3 Add `introspect-harness-server/src/recording-writer.ts`: `start(recordingId)`, `appendEvent(event)`, `snapshot()` (calls `workspace-manager.createSnapshot` and appends an `fs_snapshot` event + checkpoint to `header.json`), `stop()`.
- [ ] 3.4 Document the recording format (fields, event types, directory layout) in a short reference doc alongside the server code.

## 4. Recording integration in the live loop

- [ ] 4.1 Extend `introspection-bridge.ts` to call `recordingWriter.appendEvent(...)` for each event it already forwards to the browser, when recording is enabled for the session.
- [ ] 4.2 Hook `agent_settled` to call `recordingWriter.snapshot()` when recording is enabled.
- [ ] 4.3 Add server-side start/stop-recording actions to `session-store.ts` / `websocket.ts`: starting recording creates a new recording (via `recording-writer.start`) and takes an immediate snapshot of the sandbox's current state as the first checkpoint; stopping recording finalizes `header.json`.
- [ ] 4.4 Add a WebSocket message type (or REST route) for the client to toggle recording on/off for the active session, and to list existing recordings.

## 5. Replay engine

- [ ] 5.1 Add `introspect-harness-server/src/replay-engine.ts`: `load(recordingId)` reads `header.json` and `events.jsonl`; `stepTo(eventIndex | checkpointId)` restores the sandbox via `workspace-manager.restoreSnapshot` using the nearest preceding checkpoint, then emits the recorded events up to the target position.
- [ ] 5.2 Ensure the replay engine never calls `ModelRuntime`/`AgentSession` — it only reads recorded events and drives `workspace-manager`.
- [ ] 5.3 Add a harness-session mode switch (`live` | `replay`) in `session-store.ts` so a session's WebSocket messages route to either the live `AgentSession` or the `replay-engine`.
- [ ] 5.4 Add WebSocket message types for replay control: load recording, play, pause, step, jump to checkpoint.
- [ ] 5.5 Add unit tests: replaying the same recording to the same checkpoint twice yields identical sandbox file state and identical emitted event sequence.

## 6. Session timeline UI

- [ ] 6.1 Add `client-introspect/src/components/SessionTimeline.tsx`: a scrubber showing checkpoints as markers, current position, and previous/next/play/pause controls.
- [ ] 6.2 Add a record toggle control (visible during a live session) that sends the start/stop-recording message and reflects current recording state.
- [ ] 6.3 Add a recordings list/picker so the user can choose a recording to load into replay mode.
- [ ] 6.4 Wire `useIntrospectSocket.ts` (or equivalent) to handle replay-mode events the same way it handles live events, so `ApparatusView.tsx` requires no changes to render either source.

## 7. End-to-end verification

- [ ] 7.1 Manually verify: start a live session, enable recording, drive a short conversation with at least one tool call, stop recording.
- [ ] 7.2 Manually verify: load that recording into replay, step through it, and confirm the apparatus view matches what was shown live at each corresponding point.
- [ ] 7.3 Confirm no LLM calls occur during replay (e.g. via model-usage logs/metrics staying flat while replaying).
- [ ] 7.4 Run `npm run typecheck` and `npm test` and confirm both pass.
