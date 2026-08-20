> # ⏸ PAUSED — proposed 2026-08-16, not started
>
> Proposal only: no design, no specs, no `tasks.md`, no code. The first task
> it lists is itself an **investigation** (whether the pi SDK exposes any way
> to seed an `AgentSession`'s conversation state), so its feasibility is
> genuinely unknown — that is part of why it has not been picked up.
>
> Paused, not abandoned: the underlying defect is real and confirmed by hand
> (exiting replay leaves the live session's context out of sync with the
> restored files). All harness effort is currently on the dungeon-harness
> rebuild — see `docs/dungeon-harness/harness-rebuild/phase-plan.md`.

## Why

Exiting replay is meant to let the user pick up exactly where the replayed
recording left off — both the sandbox's files and the live agent's
conversation context. Today it only does half of that, silently. Replaying a
recording swaps the sandbox to a checkpoint's file state (`workspace-manager.
restoreSnapshot`), but `exitReplayMode` (`session-store.ts`) only flips an
in-memory `mode` flag back to `'live'` — it never touches the underlying
`AgentSession`, which is explicitly designed to be untouched by replay
(`replay-engine.ts`: "Never touches ModelRuntime or AgentSession — replay
makes no LLM calls, ever"). So after exiting replay, the next prompt is
answered by the same `AgentSession` with whatever conversation history it had
*before* replay began (or none, if it's a fresh session), while the files it
will actually see on disk reflect a different point in a different
conversation entirely. This mismatch between what the model believes it did
and what's actually on disk was observed directly: exiting replay does not
restore the expected continuation state, either for files (confirmed
separately via `isolate-introspect-workspace-root`, where an old recording's
snapshot silently dropped a newly-seeded template file) or for context
(confirmed by hand: prompting after replay-exit does not reflect the
replayed conversation).

## What Changes

- Investigate how to make the live `AgentSession`'s conversation context
  reflect the replayed recording's history up to the point replay was
  exited at, without making any LLM calls during replay itself (preserving
  the existing "replay makes no LLM calls" invariant) — likely by
  reconstructing/seeding conversation state from the recording's event log,
  using whatever mechanism `SessionManager`/`AgentSession` expose for this
  (needs investigation against the pi SDK; may not be directly supported).
- On `replay_exit`, apply that reconstructed context so the next prompt
  continues naturally from the exited checkpoint, rather than from whatever
  the `AgentSession` had before replay started.
- Confirm/document that the sandbox's on-disk file state after exit
  continues to reflect the exited checkpoint (already the de facto
  behavior — currently unspecified, not covered by any requirement).
- Add explicit `introspect/replay` spec requirement(s) for what exiting
  replay leaves behind, since no such requirement exists today (the
  behavior was never specified — only entering/stepping/playing replay is
  covered).

## Capabilities

### New Capabilities

### Modified Capabilities
- `introspect/replay`: adds requirement(s) for what exiting replay leaves
  behind — sandbox file state and live conversation context both matching
  the exited checkpoint.
- `introspect/agent-session`: may need a requirement covering how the live
  `AgentSession`'s context can be updated to reflect a replayed history
  without an LLM call, if that turns out to require a session-identity or
  session-log change (to be confirmed in design.md).

## Impact

- `introspect-harness-server/src/session-store.ts` (`exitReplayMode`)
- `introspect-harness-server/src/websocket.ts` (`replay_exit` handler)
- `introspect-harness-server/src/replay-engine.ts` (may need to expose the
  replayed event/message prefix for context reconstruction)
- Possibly the pi SDK's `AgentSession`/`SessionManager` surface, if it
  offers a way to seed/replace conversation history — needs investigation
  before design.md can commit to an approach
- `client-introspect`: likely no changes, unless the UX needs to signal
  that context was restored
