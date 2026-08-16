# Recording format

A recording captures a live session's forwarded events plus periodic
snapshots of the sandbox workspace's file state, so it can be replayed later
without re-running the agent. See `../../docs/introspect-harness/proposal.md`
and the `introspect-harness-phase-02` OpenSpec change's `design.md` for the
rationale behind these choices.

## Directory layout

Each recording lives under `RECORDINGS_DIR` (`introspect-harness-server/data/recordings/`
by default; see `src/env.ts`) as:

```
<recordingsDir>/<recordingId>/
  header.json      # metadata + checkpoint index
  events.jsonl      # one JSON event per line, in recorded order
  snapshots.git      # bare git repo; each checkpoint is a commit
```

`recordingId` is a server-generated identifier (`node:crypto`'s
`randomUUID()`), not user-facing — the human-readable name lives in
`header.json`.

## `header.json`

```ts
interface RecordingHeader {
  id: string
  name: string
  createdAt: string       // ISO 8601
  stoppedAt?: string       // ISO 8601, set when recording stops
  checkpoints: {
    index: number          // 0-based line index into events.jsonl of this checkpoint's fs_snapshot event
    commitHash: string     // commit in snapshots.git holding this checkpoint's file tree
    createdAt: string
  }[]
}
```

## `events.jsonl`

One JSON object per line, `RecordingEvent` (see `src/recording-types.ts`):

- `{ type: 'recording_start', recordingId, startedAt }` — always the first line.
- `{ type: 'fs_snapshot', commitHash, createdAt }` — written whenever a checkpoint is captured (recording start, and after each agent turn while recording is on).
- Every other forwarded lifecycle event, unchanged from what `introspection-bridge.ts` sends the browser during a live session (`session_start`, `agent_start`, `turn_start`/`turn_end`, `message_start`/`message_update`/`message_end`, `tool_execution_start`/`tool_execution_end`, `context_usage`, `foundation_update`, `agent_settled`, `agent_end`).

`recording_start` and `fs_snapshot` are **recording-internal bookkeeping** —
the live session never sends them to the browser, and replay filters them
back out before forwarding events to the client (see
`RECORDING_INTERNAL_EVENT_TYPES` in `src/recording-types.ts`). They still
occupy a line/index in `events.jsonl` so a checkpoint's `index` lines up with
the log a reader (or the replay engine) walks sequentially.

## `snapshots.git`

A bare git repository (`git init --bare`), written via plumbing commands
(`hash-object`, `mktree`, `commit-tree`, `update-ref`) rather than a working
tree or index — see `src/workspace-manager.ts`. Every checkpoint is a commit
on `refs/heads/snapshots`; content-addressed blobs mean a file unchanged
between two checkpoints is stored once. Inspect it with ordinary git tools:

```sh
git --git-dir=<recordingsDir>/<recordingId>/snapshots.git log --oneline snapshots
git --git-dir=<recordingsDir>/<recordingId>/snapshots.git show <commitHash>:path/to/file
```

## Replay semantics

Restoring a checkpoint is a full-replace checkout (clear the sandbox
directory, `git archive <commit> | tar -x`), not an incremental diff-apply —
see `workspace-manager.restoreSnapshot`. Stepping replay to event index `N`:

1. Finds the checkpoint with the greatest `index <= N`, and restores the
   sandbox to that checkpoint's `commitHash`.
2. Re-emits every event from index `0` to `N` (skipping `recording_start`/
   `fs_snapshot`) to the browser, so the client rebuilds its UI state from
   scratch every time — the same recording replayed to the same position
   always produces the same sandbox state and the same emitted event
   sequence.
