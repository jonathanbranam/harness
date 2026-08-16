## 1. Permission gate

- [ ] 1.1 Create `introspect-harness-server/src/pi-extensions/permission-gate.ts`: `createPermissionGateExtension(opts: { cwd: string })` factory, modeled on `deck-harness-server`'s but without the `requestApproval`/`approvedThisTurn` approval flow.
- [ ] 1.2 Implement the path jail: resolve `read`/`write`/`edit` input paths against `opts.cwd` and block (`{ block: true, reason }`) any that resolve outside it.
- [ ] 1.3 Reuse deck's `DANGEROUS_BASH` static blocklist regex for `bash` calls.
- [ ] 1.4 Extend `bash` blocking to catch: `cd` to a path outside the workspace root, absolute paths outside the workspace root, and `..` traversal sequences that resolve outside the workspace root.
- [ ] 1.5 Wire the extension into `introspect-harness-server/src/session-store.ts`'s `resourceLoader.extensionFactories`, passing the session's `cwd`.

## 2. Tests

- [ ] 2.1 Add `introspect-harness-server/src/pi-extensions/permission-gate.test.ts` covering each scenario in `openspec/changes/sandbox-introspect-harness/specs/introspect/tool-permission-gate/spec.md`: in-workspace read/write/edit succeed; out-of-workspace read/write/edit blocked; destructive bash blocked; `cd`/absolute-path/`..`-traversal bash escapes blocked; blocked calls return immediately with no approval wait.

## 3. Session persistence

- [ ] 3.1 In `introspect-harness-server/src/session-store.ts`, replace `SessionManager.inMemory(cwd)` with `SessionManager.create(cwd)`.
- [ ] 3.2 Manually verify a session's `.jsonl` file is created under `~/.pi/agent/sessions/<encoded-cwd>/` and survives `disposeSession`/server restart.

## 4. Docs

- [ ] 4.1 Note the on-disk session log location for the introspect harness in the relevant dev doc (e.g. `docs/talks/deck-harness/planning.md`'s introspect counterpart or `CLAUDE.md`, wherever introspect-harness-server's workspace/session behavior is already documented), so a future sandbox-escape or bug can be reviewed from the log.

## 5. Verification

- [ ] 5.1 `npm run typecheck`
- [ ] 5.2 `npm test`
- [ ] 5.3 Run `npm run dev:introspect` and manually confirm: a prompt that tries to read/write/`bash` a path outside `INTROSPECT_WORKSPACE_DIR` is blocked with a clear reason, and normal in-workspace tool use still works.
