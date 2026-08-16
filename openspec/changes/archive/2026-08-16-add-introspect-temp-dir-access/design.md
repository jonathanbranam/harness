## Context

See proposal.md - Why. `permission-gate.ts` currently hardcodes one `jail` string (`opts.cwd`, i.e. `INTROSPECT_WORKSPACE_DIR`) and every check (`checkPathJail`, `checkBashConfinement`, `escapesJail`, the system-prompt notice) is written against that single root. `session-store.ts` provisions the workspace once at process start (single global session, per CLAUDE.md's "exactly one user and one process" model) and resets it to a seed on each new session via `resetWorkspaceToSeed`; `workspace-manager.ts` snapshots/restores that same directory for recording and replay.

## Goals / Non-Goals

**Goals:**
- Grant the agent read/write access to a second, harness-defined directory without weakening the existing jail semantics (symlink resolution, `..`/absolute-path/`~` bash confinement, link-creation ban) for either root.
- Keep the temp directory out of the recording/replay/snapshot system — it's scratch space, not part of the presentation state being edited.

**Non-Goals:**
- No per-session temp directories or cleanup scheduling. The harness runs as a single long-lived process for one user (per CLAUDE.md); the temp directory is provisioned once at startup and lives for the process lifetime, same as the workspace directory.
- No change to how the workspace directory itself is seeded, reset, snapshotted, or replayed.

## Decisions

**Generalize `jail: string` to `roots: string[]`.** `permission-gate.ts`'s `escapesJail(raw, jail)` becomes `escapesAllRoots(raw, roots)`, returning true only if the resolved (and symlink-canonicalized) path is outside *every* root. `checkPathJail` and `checkBashConfinement` take `roots: string[]` instead of `jail: string`. `createPermissionGateExtension(opts: { cwd: string })` becomes `createPermissionGateExtension(opts: { cwd: string; tempDir: string })`, building `const roots = [resolve(opts.cwd), resolve(opts.tempDir)]` internally.
  - Alternative considered: keep a single jail but symlink the temp dir into the workspace tree. Rejected — mixes the temp dir into the workspace's directory listing (`ls`/`find` from the workspace root would surface it) and into `workspace-manager.ts`'s snapshot scope unless separately excluded, which is more special-casing than generalizing the jail to a list.

**Temp directory defaults under the OS temp dir, override via `INTROSPECT_TMP_DIR`.** Mirrors `INTROSPECT_WORKSPACE_DIR`'s override pattern in `env.ts`. Default: `join(tmpdir(), 'introspect-harness', 'tmp')`, created with `mkdirSync(..., { recursive: true })` at the same point `session-store.ts` currently calls `ensureAgentWorkspace`.
  - Alternative considered: default under `data/tmp` inside the repo (co-located with `data/workspace`, `data/recordings`). Rejected — the whole point is a directory the recording/snapshot machinery doesn't need to know about; putting it under `data/` invites someone to later wire it into a backup or snapshot step by habit. OS temp dir makes "this is scratch, not state" the default reading.

**No reset-to-seed for the temp directory.** Unlike the workspace, the temp directory has no seed template and is never reset between sessions — it's just ensured to exist. Anything the agent leaves there persists for the life of the process (and across OS reboots is naturally cleared, since it's OS temp space).

**System prompt lists both roots.** `jailPolicyNotice` takes the roots array and lists each directory by path, so the agent knows both are available and nothing else is.

## Risks / Trade-offs

- [Two allowed roots widen the bash pattern-matching surface slightly (one more path prefix to check per token)] → Negligible; the check is still O(roots) per path token, and the existing "pattern-based, not a kernel sandbox" caveat in `permission-gate.ts`'s module comment already covers residual bypass risk — unchanged by adding a second root.
- [A stray absolute path that happens to resolve under the OS temp dir but isn't `INTROSPECT_TMP_DIR` itself (e.g. `/tmp/other-app-dir`) must still be blocked] → `escapesAllRoots` compares against the resolved `INTROSPECT_TMP_DIR` path specifically, not `tmpdir()` broadly, so this is already excluded by construction — no separate mitigation needed.
