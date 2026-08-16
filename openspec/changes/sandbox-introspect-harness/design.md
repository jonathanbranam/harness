## Context

`introspect-harness-server/src/session-store.ts` builds its `AgentSession` with `ALLOWED_TOOLS = ['read', 'bash', 'write', 'edit', 'grep', 'find', 'ls']` and no extension in `resourceLoader.extensionFactories` to gate any of them — every call executes unchecked. `deck-harness-server` has an equivalent gap for `read`, since its `permission-gate.ts` treats `read` as always-bypass (see `openspec/specs/tool-permission-gate/spec.md`); this change does not touch deck-harness-server, only introspect. Both harnesses currently call `SessionManager.inMemory(cwd)` (see `deck-harness-server/src/session-store.ts:92` and `introspect-harness-server/src/session-store.ts:38`) — this change switches only the introspect harness to a persisting `SessionManager`.

introspect-harness-server also has no WebSocket-routed approval flow analogous to deck's `permission-gate.ts` `requestApproval` callback (see `websocket.ts` / `pi-extensions/introspection-bridge.ts` — neither has approval plumbing). Building one is out of scope here; see Non-Goals.

## Goals / Non-Goals

**Goals:**
- Block `read`/`write`/`edit`/`bash` from touching anything outside `INTROSPECT_WORKSPACE_DIR` for the introspect harness's `AgentSession`.
- Persist introspect harness sessions to disk as `.jsonl` so a turn's full tool-call history can be inspected after the fact.

**Non-Goals:**
- Building an interactive approval UI/WebSocket flow for introspect-harness-server (deck-harness-server's pattern). Blocked calls fail hard instead.
- Kernel-level process sandboxing (`sandbox-exec`, `bwrap`, containers) for the `bash` tool. See Risks below — this change ships the same class of defense deck-harness-server already relies on (pattern-based blocking), not a stronger mechanism.
- Changing deck-harness-server's tools, its `read` gate gap, or its `SessionManager.inMemory` usage.
- Extracting a shared `packages/` permission-gate module. Per `CLAUDE.md`, `packages/` is built "incrementally as a second harness makes the shared surface obvious" — this change duplicates the pattern a second time, which is the trigger to consider extraction, but doing that extraction here would expand this change's blast radius beyond the sandboxing fix. Flagged as a natural follow-up once this lands.

## Decisions

**Path jail scope: cover `read` too, not just `write`/`edit`.**
deck-harness-server's gate exempts `read` from any path check because its interactive approval flow is the actual backstop for anything the static rules miss. introspect-harness-server has no such backstop, so `read` needs the same jail as `write`/`edit`: resolve the input path against the workspace root, block if it doesn't stay under it.

**New module, not a shared one:** `introspect-harness-server/src/pi-extensions/permission-gate.ts`, structured like deck's (`createPermissionGateExtension(opts: { cwd, ... })` factory called once per session in `session-store.ts`, closing over that session's workspace root) minus the `requestApproval` callback and `approvedThisTurn` turn-scoped cache, since there's no approval UI to call back into and nothing to re-approve.

**Bash confinement: extend the static blocklist, not a subprocess sandbox.**
Reuse deck's `DANGEROUS_BASH` regex outright (same destructive-pattern class applies here), and add pattern checks for: (a) `cd` to a path outside the workspace root, (b) absolute paths outside the workspace root appearing in the command string, (c) `..` traversal sequences that resolve outside the workspace root. This is heuristic, not airtight — see Risks. Alternative considered: wrap the spawned `bash` process in an OS sandbox (`sandbox-exec` on macOS, `bwrap`/`firejail` on Linux) for real filesystem-level confinement. Rejected for this change because it's platform-specific, requires wrapping the SDK's own subprocess spawn (not just the `tool_call` hook this extension uses), and is a materially larger effort than the proposal's scope — noted as a residual risk with a follow-up path instead.

**Blocked calls fail immediately, no approval fallback.**
Consistent with there being no approval channel: `tool_call` handler returns `{ block: true, reason }` the same way deck's static blocklist and path-jail branches already do (deck's *interactive-approval* branch is what's not being replicated).

**Session persistence: `SessionManager.create(cwd)` in place of `SessionManager.inMemory(cwd)`.**
`SessionManager.create()` is the SDK's persisting constructor and, when no `sessionDir` override is given, writes to the SDK's default `~/.pi/agent/sessions/<encoded-cwd>/<timestamp>_<id>.jsonl` layout — the same location and format already used by interactive `pi` CLI sessions, so no new log-viewing tooling is needed to inspect them. Alternative considered: `SessionManager.continueRecent(cwd)`, which would resume the previous session's history into a new browser login instead of starting fresh — rejected because it would silently carry old conversation context into a new login, changing session-boundary behavior beyond what was asked.

## Risks / Trade-offs

- **[Risk]** Pattern-based bash confinement can be bypassed by anything that doesn't look like a path literal to the regex — e.g. a command built from string concatenation, environment-variable expansion (`$HOME/..`), or a non-shell interpreter invoked via `bash` (`python3 -c "..."`, `node -e "..."`) reading/writing outside the workspace without ever putting a matching path token in the command string.
  → **Mitigation**: this matches the rigor level deck-harness-server already ships (also pattern-based) and materially narrows the currently-unrestricted surface. Document the limitation in the workspace/dev docs per the proposal's third bullet, and treat real subprocess sandboxing as explicit follow-up work, not a silent gap.
- **[Risk]** Symlinks inside the workspace pointing outside it would resolve the jail check's `resolve()` call to a workspace-relative path while the filesystem operation actually lands outside.
  → **Mitigation**: none in this change (deck's existing jail has the same gap). Worth a follow-up `realpath`-based check if this harness ever handles untrusted workspace content.
- **[Trade-off]** Switching to persisted sessions means introspect harness chat history now survives on disk indefinitely (no rotation/cleanup), unlike today's in-memory sessions which vanish on disposal.
  → **Mitigation**: this is the same lifecycle the SDK's interactive `pi` sessions already have on this machine; no new retention policy is introduced by this change, and cleanup can be handled the same way (manual, if ever needed).

## Migration Plan

No data migration. Existing in-memory sessions are lost on deploy (already true today on any restart), and new sessions start persisting immediately. No rollback concerns beyond reverting the two changed files if the jail proves too strict.
