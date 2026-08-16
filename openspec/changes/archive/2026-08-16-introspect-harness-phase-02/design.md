## Context

See [`proposal.md`](proposal.md) for motivation. This document covers how recording and replay are implemented on top of the Phase 1 live loop (`introspect-harness-server/src/pi-extensions/introspection-bridge.ts` forwarding pi lifecycle events over WebSocket; `client-introspect` rendering the apparatus view).

Two things from the current codebase constrain this design:

- **One hardcoded sandbox path.** Phase 1's design explicitly deferred per-recording sandbox paths (`archive/2026-08-15-introspect-harness-phase-01/design.md`, "Hardcoded sandbox path for Phase 1"). Phase 2 does not lift that — there is still one sandbox folder (`introspect-harness-server/data/workspace/`) that live sessions run against. Recording/replay work within that constraint rather than introducing multi-sandbox support.
- **`permission-gate.ts` jails `read`/`write`/`edit`/`bash` to the sandbox root.** Any new server-side storage (recordings, snapshots, seeds) must live outside `data/workspace/` so it's never reachable by the agent's own tools, and so an agent can't tamper with the record of its own session.

## Goals / Non-Goals

**Goals:**
- Decide the snapshot storage mechanism (the open question `phase-02-recording-replay.md`'s Notes section flags).
- Define the on-disk recording format precisely enough to write `specs/`.
- Define how a recording's starting file set (e.g. `.agents/` with OpenSpec skills) is declared and applied, per the workspace-seed requirement.
- Define the replay restore strategy so it's provably deterministic (same recording → same sandbox state at a given step, every time).

**Non-Goals:**
- Multiple concurrent sandboxes or per-recording sandbox paths — still one sandbox, per Phase 1.
- Tree navigation, branching, or resuming live from a checkpoint (Phase 3).
- Anything about guides, sensors, or OpenSpec indexing (Phase 4).
- Tool call trace, approval UI, or file system mirror (Phase 5).
- Recording import/export as a portable single file — worth revisiting once git bundles are needed for that (see Decisions), but not required for this phase's acceptance criteria.

## Decisions

### Decision: Snapshot storage is a bare git repository per recording, driven via the `git` CLI

Each recording gets its own bare repo at `<recordingsDir>/<recordingId>/snapshots.git`. Every snapshot (workspace seed and each later checkpoint) is a commit. `workspace-manager.ts` shells out to `git` (via `node:child_process`) rather than embedding a JS git implementation.

**Rationale:**
- Git already solves exactly this problem — content-addressed, deduplicated, compressed storage of a file tree, with correct handling of additions/deletions/renames — and the proposal's constraint ("files are always small, text, software-related") is exactly git's sweet spot.
- The server already spawns subprocesses for the agent's own `bash` tool; shelling out to `git` for snapshot management doesn't introduce a new category of risk, and the snapshot repo lives outside the sandbox root so it's never reachable by the jailed `bash`/`write`/`edit` tools (see Context).
- A real git repo is inspectable with ordinary tools (`git log`, `git show`) for debugging, the same way `.jsonl` session logs are inspected today per this repo's "Agent sandboxing" documentation.
- Using plumbing commands (`git hash-object -w`, `git mktree`, `git commit-tree`) rather than porcelain (`git add`/`git commit`) means a snapshot can be built by reading the sandbox's current files directly, with no persistent index file or working tree required for the bare repo itself.

**Alternatives considered:**
- **`isomorphic-git` (pure JS, in-process).** Avoids a subprocess per snapshot. Rejected for now: it's a nontrivial dependency to reimplement git plumbing correctness, and the server already accepts subprocess execution as a normal part of its design (the agent's own bash tool). Revisit only if subprocess overhead per checkpoint proves to be a real bottleneck.
- **Custom content-addressed blob store** (sha256-named blobs + a JSON manifest per checkpoint). Simplest mental model and zero dependencies, but requires hand-building tree diffing, deletion handling, and blob garbage collection — all of which git already provides correctly. More code, not less.
- **Git bundles as the live storage format.** Bundles are a transfer/export artifact (a packed diff between refs), not designed for incremental in-place commits during a long, possibly-branching recording session — repacking a bundle after every checkpoint would be wasteful. Kept in reserve as an **export** feature later (`git bundle create` on top of the bare repo gives a one-file, portable copy of a recording for free), but not the primary mechanism.

### Decision: A recording's starting files are a named "seed," applied at session start, independent of the recording toggle

Seeds live at `introspect-harness-server/data/seeds/<seed-name>/` (gitignored, runtime data — same treatment as `data/workspace/`), seeded from `templates/seeds/<seed-name>/` the same way `agent-workspace.ts` seeds `data/workspace/` today. The default seed, `openspec-skills`, is the `.agents/` tree that already lives in `data/workspace/.agents` — moving it under `templates/seeds/openspec-skills/.agents/` makes it a reusable, named starting point instead of ambient state.

When a new live session is created, the server resets the sandbox to the selected seed's contents (default: `openspec-skills`) before creating the `AgentSession`. This happens regardless of whether recording is enabled — it's a session-start behavior, not a recording-start behavior. If the user then turns the recording toggle on (immediately or partway through the session), the recording's first `fs_snapshot` commit is simply the sandbox's current state, which — for a session that just started — is the seed's state.

**Rationale:** Decouples "what files does the sandbox start with" (a session-level concern) from "are we persisting a replayable log" (a recording-level concern). This matches the in-scope acceptance criterion "toggle to start/stop recording during a live session" — recording can start mid-session, in which case its first snapshot legitimately reflects whatever the sandbox looks like at that moment, not necessarily a pristine seed.

**Alternative considered:** Tie seed selection to the recording toggle (starting a recording always resets the sandbox). Rejected: it would silently discard in-progress live edits if a user turns recording on after already working, which is surprising and not requested by the acceptance criteria.

### Decision: Snapshot at `agent_settled` only, plus one at session start

`introspection-bridge.ts` already has an `agent_settled` hook (see `docs/introspect-harness/proposal.md` §4.4). Recording adds: on session start, commit the seed state; on each `agent_settled` while recording is on, read the sandbox's current files and commit. No snapshot on every `tool_execution_end`.

**Rationale:** Matches this phase's Notes ("keep the timeline simple: a scrubber with previous/next and a list of checkpoints") — one checkpoint per turn is enough granularity for a presenter to step through, and avoids a snapshot (and a git commit) on every single tool call in a multi-tool turn.

**Alternative considered:** Snapshot on every `tool_execution_end` for finer-grained stepping. Rejected for this phase as unnecessary complexity; revisit if Phase 3's tree navigation wants tool-level granularity.

### Decision: Replay restores by full-replace checkout, not incremental diff-apply

To restore checkpoint N, the replay engine clears the sandbox folder and extracts the commit's full tree (`git archive <commit> | tar -x -C <sandboxPath>`), rather than applying incremental diffs forward from the nearest earlier snapshot.

**Rationale:** Every checkpoint is already a full commit (git stores it as a complete tree; the object model handles the space efficiency internally), so there's no need to replay diffs — this also sidesteps needing to correctly handle deletions across a series of forward-applied diffs, which is exactly the failure mode described in the acceptance criteria's determinism requirement.

**Alternative considered:** The original proposal doc's sketch (§4.5) of "replay subsequent `tool_execution_*` events by re-applying their effects." Superseded: full-tree commits make this unnecessary and remove a whole class of replay bugs.

### Decision: Snapshot repos never live inside the sandbox; only one recording's tree is checked out into it at a time

Every `git` invocation for a recording's snapshots targets that recording's bare repo via `--git-dir=<recordingsDir>/<recordingId>/snapshots.git`, with the sandbox passed only as `--work-tree` (for checkout) or as a plain file path (for `hash-object`/`archive`-restore). No recording's `.git` ever lives inside `data/workspace/`, and the sandbox itself is never a git working tree of its own (no `.git` directory checked into it) — it's just a plain folder that different recordings' checkouts happen to write into at different times.

Because there's one shared sandbox (see Context), only one recording (or the live, unrecorded session) can be "checked out" into it at any moment. `workspace-manager.ts` tracks which recording + checkpoint (or "live, uncaptured") currently owns the sandbox's contents. Switching — replaying a different recording, jumping to a different recording's checkpoint, or starting a new live session — always goes through the same full-replace checkout described above, just pointed at a different repo: clear the sandbox, extract the target tree into it. No copy-out step is needed first, since each recording's repo already has its own history independent of what's currently sitting in the sandbox.

**Rationale:** This reuses one mechanism (full-replace checkout from an external bare repo) for every case that touches the sandbox's contents — starting a session from a seed, taking a snapshot, restoring a replay checkpoint, and switching between recordings are all "point the sandbox at tree T" — rather than inventing a separate cross-recording copy/export step.

**Alternative considered:** Keep a single bare repo shared across all recordings (e.g. one recording per branch or tag) and "extract" a recording's history into its own storage when the session ends. Rejected: this requires an explicit export/migration step per recording and a shared-repo cleanup story (deleting a recording means deleting one branch out of a shared object store, not just removing a directory), for no benefit over giving each recording its own repo from the start.

## Risks / Trade-offs

- **Risk:** Spawning `git` as a subprocess for every checkpoint adds latency to each turn while recording is on. → **Mitigation:** use plumbing commands operating directly on the bare repo (no working-tree checkout, no index) to keep each snapshot to a handful of fast, non-interactive git invocations; measure against real turn cadence before optimizing further.
- **Risk:** A recording's snapshot repo could grow large over a long session. → **Mitigation:** out of scope for this phase per the "files are always small" constraint from the proposal; `git gc` per recording is a cheap follow-up if it ever matters.
- **Risk:** Moving `.agents/` from ad hoc `data/workspace/` content into a named `templates/seeds/openspec-skills/` changes how the existing OpenSpec skills get into the sandbox. → **Mitigation:** `ensureAgentWorkspace`'s copy-missing behavior means existing sandboxes are unaffected; the seed mechanism only changes how a *new* session's sandbox is populated.
- **Trade-off:** Full-replace checkout on every replay step is simpler and more correct than incremental diff-apply, at the cost of doing more I/O per step (rewriting the whole sandbox tree even for a one-file change). Acceptable given the proposal's "always small" file constraint.
- **Risk:** Switching the sandbox to a different recording (or a fresh seed) while the current sandbox holds live edits that were never snapshotted (recording was off, or a live turn hasn't hit `agent_settled` yet) silently discards those edits — the swap is a full overwrite, not a merge. → **Mitigation:** `workspace-manager.ts` refuses to swap while a live turn is in flight, and the UI must warn/confirm before swapping if the sandbox's current state doesn't match the last snapshot it took (or, for a never-recorded live session, before switching away from it at all).

## Migration Plan

Net-new feature; no existing data to migrate. New pieces to provision:
- `RECORDINGS_DIR` config (default `introspect-harness-server/data/recordings/`), gitignored like `data/workspace/`.
- `introspect-harness-server/templates/seeds/openspec-skills/` (containing today's `.agents/` tree), plus a `data/seeds/` runtime directory seeded from it the same way `agent-workspace.ts` seeds `data/workspace/`.

Rollback is trivial: the recording toggle and timeline UI are additive to the Phase 1 live loop, so leaving recording off reproduces Phase 1 behavior exactly.

## Open Questions

- Recording identification: auto-generated ID vs. a user-provided name at record-start. Doesn't change the storage design or specs — can be settled in `tasks.md`.
- Whether to expose a "reset sandbox to seed" action independent of starting a new session (useful for iterating on a demo without restarting the whole session). Deferred — not required by this phase's acceptance criteria.
