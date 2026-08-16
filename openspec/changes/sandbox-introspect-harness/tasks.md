## 1. Permission gate

- [x] 1.1 Create `introspect-harness-server/src/pi-extensions/permission-gate.ts`: `createPermissionGateExtension(opts: { cwd: string })` factory, modeled on `deck-harness-server`'s but without the `requestApproval`/`approvedThisTurn` approval flow.
- [x] 1.2 Implement the path jail: resolve `read`/`write`/`edit` input paths against `opts.cwd` and block (`{ block: true, reason }`) any that resolve outside it.
- [x] 1.3 Reuse deck's `DANGEROUS_BASH` static blocklist regex for `bash` calls.
- [x] 1.4 Extend `bash` blocking to catch: `cd` to a path outside the workspace root, absolute paths outside the workspace root, and `..` traversal sequences that resolve outside the workspace root.
- [x] 1.5 Wire the extension into `introspect-harness-server/src/session-store.ts`'s `resourceLoader.extensionFactories`, passing the session's `cwd`.

## 2. Tests

- [x] 2.1 Add `introspect-harness-server/src/pi-extensions/permission-gate.test.ts` covering each scenario in `openspec/changes/sandbox-introspect-harness/specs/introspect/tool-permission-gate/spec.md`: in-workspace read/write/edit succeed; out-of-workspace read/write/edit blocked; destructive bash blocked; `cd`/absolute-path/`..`-traversal bash escapes blocked; blocked calls return immediately with no approval wait.

## 3. Session persistence

- [x] 3.1 In `introspect-harness-server/src/session-store.ts`, replace `SessionManager.inMemory(cwd)` with `SessionManager.create(cwd)`.
- [x] 3.2 Manually verify a session's `.jsonl` file is created under `~/.pi/agent/sessions/<encoded-cwd>/` and survives `disposeSession`/server restart.

## 4. Docs

- [x] 4.1 Note the on-disk session log location for the introspect harness in the relevant dev doc (e.g. `docs/talks/deck-harness/planning.md`'s introspect counterpart or `CLAUDE.md`, wherever introspect-harness-server's workspace/session behavior is already documented), so a future sandbox-escape or bug can be reviewed from the log.

## 5. Verification

- [x] 5.1 `npm run typecheck`
- [x] 5.2 `npm test`
- [x] 5.3 Run `npm run dev:introspect` and manually confirm: a prompt that tries to read/write/`bash` a path outside `INTROSPECT_WORKSPACE_DIR` is blocked with a clear reason, and normal in-workspace tool use still works.

## 6. Expanded jail coverage (gap found in manual testing)

- [x] 6.1 Add `ls`, `find`, `grep` to the jailed-tool set in `permission-gate.ts` (same `path` field as `read`/`write`/`edit`; skip the check when `path` is omitted, since those tools default to the workspace root).
- [x] 6.2 Add `realpath`-based symlink-escape detection: canonicalize both the jail and the resolved candidate path (walking up to the nearest existing ancestor for not-yet-existing targets) and block if the canonical candidate falls outside the canonical jail. Apply to both the path-jailed tools and, as defense-in-depth, `bash` path tokens.
- [x] 6.3 Extend `checkBashConfinement` to block `~`/`~user` (shell home-directory expansion).
- [x] 6.4 Hook `before_agent_start` in `permission-gate.ts` to append a system-prompt notice naming the workspace directory and instructing the agent not to access anything outside it.
- [x] 6.5 Add `checkLinkCreation()`: block any `bash` command invoking `ln` (any flags), or `cp` with a symlink-creating flag (`-s`/`--symbolic-link`), as a static-policy block (same tier as `DANGEROUS_BASH`, checked pre-execution so a compound create-and-read command is rejected as a whole).
- [x] 6.6 Update `permission-gate.test.ts`: in/out-of-workspace `ls`/`find`/`grep`; a real symlink (created in a temp dir) pointing outside the jail blocked for both a path-jailed tool and a `bash` `cd`; `~` bash escape blocked; `ln`/`cp -s` blocked (including a compound create-and-read command); system-prompt notice includes the workspace path.
- [x] 6.7 `npm run typecheck` && `npm test`.
- [x] 6.8 Manually re-verify against the real server: `ls ../../`, `find`/`grep` with an out-of-workspace `path`, a `bash` command referencing `~`, and `ln -s /etc /workspace/x && cat /workspace/x/passwd` are all blocked; in-workspace `ls`/`find`/`grep` still work.
