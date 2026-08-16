## Why

introspect-harness-server's sandboxed agent escaped its workspace jail by calling the `openspec` CLI directly, which wrote a new change into this repo's own `openspec/changes/` directory instead of the sandboxed workspace. The CLI's root-selection logic resolves its project root by walking up parent directories from `cwd` looking for the nearest ancestor containing a qualifying `openspec/` directory — it never takes an explicit path argument, so `permission-gate.ts`'s pattern-based bash confinement (which only catches absolute paths, `..`, `~`, and `cd` targets appearing literally in the command string) has nothing to match against and lets the call through. The escape worked because `INTROSPECT_WORKSPACE_DIR` defaults to a path nested inside this git repo, which has a real `openspec/` root a few levels up for the walk to find.

## What Changes

- Move `INTROSPECT_WORKSPACE_DIR`'s default out of the git repo tree entirely, to a persistent (not OS-temp) per-user data directory, so no ancestor-walking tool invoked via `bash` can find this repo's `openspec/`, `.git`, or other project markers above the workspace root. Explicitly not the OS temp dir: unlike `INTROSPECT_TMP_DIR` (documented scratch space that's fine to lose on reboot), the workspace directory is seeded from a template, reset between sessions, and snapshotted by `workspace-manager.ts` for recording/replay — durable session state that shouldn't be exposed to `/tmp`'s cleanup/tmpfs behavior on the NUC deployment.
- Pre-initialize an `openspec/` root inside `templates/agent-workspace/` (via `openspec init --tools none --no-animation`), so the seeded workspace already satisfies the `openspec` CLI's own root-qualification check (`specs/`/`changes/` present) at the workspace root itself. This is defense-in-depth: ancestor-walking tools resolve at distance 0 and never need to walk upward at all, regardless of where the workspace directory ends up living on disk.

## Capabilities

### New Capabilities

### Modified Capabilities
- `introspect/tool-permission-gate`: adds a requirement that the workspace root itself is isolated from ancestor project roots — not nested inside a tree with an ancestor `openspec/`/`.git`/project marker, and self-contained with its own initialized `openspec/` directory — so CLI tools that discover their project root by walking up parent directories (rather than taking an explicit path argument) cannot resolve to a root outside the sandbox.

## Impact

- `introspect-harness-server/src/env.ts`: `INTROSPECT_WORKSPACE_DIR` default changes from a path under the repo (`data/workspace`) to a persistent path outside it (e.g. under the user's home data directory).
- `introspect-harness-server/templates/agent-workspace/`: gains an initialized `openspec/` directory (`config.yaml`, `specs/`, `changes/archive/`), copied into every seeded/reset workspace by `ensureAgentWorkspace`.
- `introspect-harness-server/src/agent-workspace.ts`, `session-store.ts`: no logic changes expected — `ensureAgentWorkspace`'s copy-missing behavior already picks up new template files.
- Docs: workspace/dev docs should note the new default location so it's discoverable without reading `env.ts`.
