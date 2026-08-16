## 1. Env & provisioning

- [x] 1.1 Add `INTROSPECT_TMP_DIR` to `introspect-harness-server/src/env.ts`, defaulting to `join(tmpdir(), 'introspect-harness', 'tmp')`.
- [x] 1.2 In `session-store.ts`, create/ensure `env.INTROSPECT_TMP_DIR` exists (`mkdirSync(..., { recursive: true })`) alongside the existing `ensureAgentWorkspace(env.INTROSPECT_WORKSPACE_DIR, TEMPLATES_DIR)` call. No seed template, no reset-to-seed for this directory.

## 2. Permission gate: generalize jail to multiple roots

- [x] 2.1 In `permission-gate.ts`, rename `isOutsideJail`/`escapesJail` to operate over `roots: string[]` (e.g. `escapesAllRoots(raw, roots)`), returning true only when the resolved+canonicalized path is outside every root.
- [x] 2.2 Update `checkPathJail(path, jail)` → `checkPathJail(path, roots)`.
- [x] 2.3 Update `checkBashConfinement(command, jail)` → `checkBashConfinement(command, roots)`, updating the `cd`, `~`, and path-token checks to use `escapesAllRoots`.
- [x] 2.4 Update `jailPolicyNotice(jail)` → `jailPolicyNotice(roots)` to list each allowed directory by path in the system-prompt text.
- [x] 2.5 Update `createPermissionGateExtension(opts: { cwd: string })` → `createPermissionGateExtension(opts: { cwd: string; tempDir: string })`, building `const roots = [resolve(opts.cwd), resolve(opts.tempDir)]` and passing `roots` through to the checks above and the `tool_call`/`before_agent_start` handlers.

## 3. Wire it up

- [x] 3.1 Update the `createPermissionGateExtension({ cwd })` call site in `session-store.ts` to pass `{ cwd, tempDir: env.INTROSPECT_TMP_DIR }`.

## 4. Tests

- [x] 4.1 Update `permission-gate.test.ts` call sites that construct a single-root jail (`checkPathJail`, `checkBashConfinement`) to pass a `roots` array.
- [x] 4.2 Add coverage for the new multi-root behavior: a path inside the temp dir succeeds; a path inside the workspace still succeeds; a path outside both is blocked; a `cd` into the temp dir succeeds; a symlink inside the temp dir pointing outside both roots is blocked.
- [x] 4.3 Run `npm run typecheck` and `npm test` and confirm both pass.
