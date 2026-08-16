## Why

introspect-harness-server's coding agent is currently jailed to a single root — the session's persistent workspace directory (`INTROSPECT_WORKSPACE_DIR`), which is also what gets snapshotted/restored for recording and replay. The agent has no place to put scratch files (intermediate output, working notes, downloaded/generated artifacts it doesn't want tracked) without polluting that persistent, replay-tracked workspace. A second, harness-defined temporary directory that the agent can also read/write — outside the snapshot/replay system — gives it that scratch space without changing what the workspace directory means.

## What Changes

- Add a harness-defined temporary directory (`INTROSPECT_TMP_DIR`, defaulting to a subdirectory under the OS temp dir) that the agent's `read`/`write`/`edit`/`ls`/`find`/`grep`/`bash` tools may also access.
- Extend the permission-gate's path jail from a single allowed root to a set of allowed roots (workspace dir + temp dir), so the existing escape checks (symlink resolution, `..` traversal, absolute paths, `~` expansion, link-creation ban) apply equally to both.
- Update the system-prompt workspace-boundary notice to list both directories as the agent's full available filesystem.
- The temp directory is provisioned (created if missing) at server startup, is not seeded from `templates/agent-workspace/`, and is excluded from `workspace-manager.ts`'s snapshot/restore (recording and replay only cover the persistent workspace, unchanged).

## Capabilities

### Modified Capabilities
- `introspect/tool-permission-gate`: the path jail and bash confinement checks accept multiple allowed roots instead of one; the system-prompt notice describes both the workspace and temp directories.

## Impact

- `introspect-harness-server/src/env.ts`: new `INTROSPECT_TMP_DIR` env var with a default.
- `introspect-harness-server/src/pi-extensions/permission-gate.ts`: `createPermissionGateExtension` takes multiple roots; `escapesJail`/`checkPathJail`/`checkBashConfinement` generalize from a single `jail` string to a list of allowed roots.
- `introspect-harness-server/src/session-store.ts`: provisions and wires the temp directory into the permission gate alongside `cwd`.
- No change to `workspace-manager.ts`'s snapshot/restore behavior or to recording/replay.
