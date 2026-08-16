## Why

`introspect-harness-server`'s `session-store.ts` allowlists `bash`, `write`, `edit`, `read`, `grep`, `find`, and `ls` for its `AgentSession` with no path restriction at all — unlike `deck-harness-server`, which gates the same tools through `permission-gate.ts`. This was caught when the introspect harness escaped its workspace directory and wrote files elsewhere in the repo. It also currently keeps no record of what an agent turn did: `SessionManager.inMemory(cwd)` discards session history on disposal or restart, so an escape like this can't be reviewed after the fact.

## What Changes

- Add a per-session path jail so `read`, `write`, `edit`, and `bash` cannot access anything outside `INTROSPECT_WORKSPACE_DIR`, mirroring `deck-harness-server`'s defense-in-depth approach (static bash blocklist + path jail) but extended to cover `read` too, since the introspect harness has no interactive approval UI to fall back on.
- Switch `session-store.ts` from `SessionManager.inMemory(cwd)` to a persisting `SessionManager` so introspect chat sessions are written to disk as `.jsonl`, in the same layout the pi SDK already uses for interactive `pi` CLI sessions.
- Surface the on-disk session log location in the workspace/dev docs so a sandbox escape (or any other unexpected tool behavior) can be reviewed after the fact by inspecting the log.

## Capabilities

### New Capabilities
- `introspect/tool-permission-gate`: path jail for `read`/`write`/`edit`/`ls`/`find`/`grep`/`bash` in `introspect-harness-server`, blocking any resolved path or working directory outside the session's workspace root — including through a symlink, or via `bash` home-directory (`~`) expansion — and stating that boundary explicitly in the agent's system prompt.

### Modified Capabilities
- `introspect/agent-session`: session creation persists to disk (`.jsonl`) instead of `SessionManager.inMemory`, so a session's full tool-call history survives disposal/restart and can be inspected later.

## Impact

- `introspect-harness-server/src/session-store.ts`: adds the permission-gate extension factory to `resourceLoader`'s `extensionFactories`, and swaps `SessionManager.inMemory(cwd)` for a persisting `SessionManager`.
- New file `introspect-harness-server/src/pi-extensions/permission-gate.ts` (or a shared module if warranted — see design.md), analogous to `deck-harness-server`'s.
- No API/WebSocket protocol changes — this is enforcement inside the existing tool-call path, not a new user-facing capability.
