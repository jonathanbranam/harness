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

**Path jail scope, expanded: `ls`/`find`/`grep` also need the jail, not just `read`/`write`/`edit`.**
Manual testing after the initial implementation showed the agent could still walk the filesystem freely via `ls ../../` — the built-in `ls`, `find`, and `grep` tools all take the same optional `path` argument `read`/`write`/`edit` take, but the gate only checked those three tool names. Since all three tools default to the workspace root when `path` is omitted, the fix is additive: add `ls`/`find`/`grep` to the same jailed-tool set and reuse the existing per-path check, skipping it when `path` is absent.

**Symlink escapes: resolve via `realpath`, not just lexical `resolve()`.**
The original implementation only compared the lexically-resolved path against the jail, which a symlink planted inside the workspace (pointing outside it) would bypass — flagged as an accepted risk at the time (see Risks below, since superseded). This change adds a `realpath`-based canonicalization pass on top of the lexical check: for existing paths, resolve the real path directly; for paths that don't exist yet (e.g. a `write` target), walk up to the nearest existing ancestor, resolve *that*, and reattach the non-existent tail. Both the jail and the candidate path are canonicalized before comparison, so this doesn't misfire on the host's own symlinks (e.g. macOS's `/tmp` → `/private/tmp`) as long as the workspace and the escape target are compared using the same representation. This check also runs against `bash` path tokens (defense-in-depth on top of the pattern checks below), not just the path-jailed tools.

**Bash confinement, expanded: block `~`/`~user` (home-directory expansion) too.**
`cd`/absolute-path/`..`-traversal checks don't catch a command that references `~` (which a real shell would expand to the user's home directory, well outside the workspace). Added as a fourth pattern check alongside the existing three.

**Link creation: disallow outright, not target-resolves-outside-jail checking.**
The realpath-based symlink defense only catches a symlink that already exists at check time — it can't see one a command is about to create. A compound command like `ln -s /etc /workspace/x && cat /workspace/x/passwd` would plant the symlink and read through it inside a single `bash` call, before there's anything on disk to resolve. Considered checking whether `ln -s`'s target argument resolves outside the jail instead of a blanket ban, but that's fragile (flag ordering, `cp -s`/`--symbolic-link` is an equivalent primitive, relative targets computed at runtime) and there's no legitimate reason for this agent to create links in its workspace at all — so `checkLinkCreation()` blocks any `ln` invocation and any `cp` with a symlink-creating flag, full stop, as a static-policy block (same tier as `DANGEROUS_BASH`).

**System prompt states the workspace boundary explicitly.**
Beyond blocking violations after the fact, the extension now hooks `before_agent_start` and appends a short notice to the system prompt naming the workspace directory and stating that nothing outside it is reachable. This doesn't change what's enforced (the server-side checks are still the actual backstop), but it means the agent isn't discovering the boundary by trial and error, which wastes turns and looks like probing/jailbreak behavior even when unintentional.

**New module, not a shared one:** `introspect-harness-server/src/pi-extensions/permission-gate.ts`, structured like deck's (`createPermissionGateExtension(opts: { cwd, ... })` factory called once per session in `session-store.ts`, closing over that session's workspace root) minus the `requestApproval` callback and `approvedThisTurn` turn-scoped cache, since there's no approval UI to call back into and nothing to re-approve.

**Bash confinement: extend the static blocklist, not a subprocess sandbox.**
Reuse deck's `DANGEROUS_BASH` regex outright (same destructive-pattern class applies here), and add pattern checks for: (a) `cd` to a path outside the workspace root, (b) absolute paths outside the workspace root appearing in the command string, (c) `..` traversal sequences that resolve outside the workspace root. This is heuristic, not airtight — see Risks. Alternative considered: wrap the spawned `bash` process in an OS sandbox (`sandbox-exec` on macOS, `bwrap`/`firejail` on Linux) for real filesystem-level confinement. Rejected for this change because it's platform-specific, requires wrapping the SDK's own subprocess spawn (not just the `tool_call` hook this extension uses), and is a materially larger effort than the proposal's scope — noted as a residual risk with a follow-up path instead.

**Blocked calls fail immediately, no approval fallback.**
Consistent with there being no approval channel: `tool_call` handler returns `{ block: true, reason }` the same way deck's static blocklist and path-jail branches already do (deck's *interactive-approval* branch is what's not being replicated).

**Session persistence: `SessionManager.create(cwd)` in place of `SessionManager.inMemory(cwd)`.**
`SessionManager.create()` is the SDK's persisting constructor and, when no `sessionDir` override is given, writes to the SDK's default `~/.pi/agent/sessions/<encoded-cwd>/<timestamp>_<id>.jsonl` layout — the same location and format already used by interactive `pi` CLI sessions, so no new log-viewing tooling is needed to inspect them. Alternative considered: `SessionManager.continueRecent(cwd)`, which would resume the previous session's history into a new browser login instead of starting fresh — rejected because it would silently carry old conversation context into a new login, changing session-boundary behavior beyond what was asked.

## Risks / Trade-offs

- **[Risk]** Pattern-based bash confinement can still be bypassed by anything that doesn't look like a path literal to the regex — e.g. a command built from string concatenation, environment-variable expansion (`$HOME/..`), or a non-shell interpreter invoked via `bash` (`python3 -c "..."`, `node -e "..."`) reading/writing outside the workspace without ever putting a matching path token in the command string.
  → **Mitigation**: this matches the rigor level deck-harness-server already ships (also pattern-based) and materially narrows the currently-unrestricted surface. Document the limitation in the workspace/dev docs per the proposal's third bullet, and treat real subprocess sandboxing as explicit follow-up work, not a silent gap. `~`/`~user` expansion is now covered (see Decisions); env-var expansion and non-shell interpreters reading/writing via string arguments are not, since that requires actually parsing/executing the command rather than pattern-matching it.
- ~~**[Risk]** Symlinks inside the workspace pointing outside it would resolve the jail check's `resolve()` call to a workspace-relative path while the filesystem operation actually lands outside.~~ **Mitigated.** See "Symlink escapes: resolve via `realpath`" in Decisions above — the path jail (and, as defense-in-depth, the bash path-token checks) now resolve symlinks before comparing against the workspace root.
- **[Trade-off]** Switching to persisted sessions means introspect harness chat history now survives on disk indefinitely (no rotation/cleanup), unlike today's in-memory sessions which vanish on disposal.
  → **Mitigation**: this is the same lifecycle the SDK's interactive `pi` sessions already have on this machine; no new retention policy is introduced by this change, and cleanup can be handled the same way (manual, if ever needed).

## Migration Plan

No data migration. Existing in-memory sessions are lost on deploy (already true today on any restart), and new sessions start persisting immediately. No rollback concerns beyond reverting the two changed files if the jail proves too strict.
