## 1. Relocate the default workspace directory

- [ ] 1.1 In `introspect-harness-server/src/env.ts`, import `homedir` from `node:os` alongside the existing `tmpdir` import
- [ ] 1.2 Change `INTROSPECT_WORKSPACE_DIR`'s default from `join(import.meta.dirname, '..', 'data', 'workspace')` to `join(homedir(), '.local', 'share', 'introspect-harness', 'workspace')`
- [ ] 1.3 Confirm `session-store.ts`'s `ensureAgentWorkspace(env.INTROSPECT_WORKSPACE_DIR, TEMPLATES_DIR)` call needs no changes (it already `mkdirSync`s the target recursively)

## 2. Pre-initialize an OpenSpec root in the seed template

- [ ] 2.1 Run `openspec init --tools none --no-animation` inside `introspect-harness-server/templates/agent-workspace/`, producing `openspec/{config.yaml, specs/, changes/archive/}`
- [ ] 2.2 Verify no AI-tool instruction files were written (confirm `--tools none` produced no `CLAUDE.md`/`AGENTS.md`/etc. beyond the harness's own existing `templates/agent-workspace/AGENTS.md`)
- [ ] 2.3 `git add` the new template files so they're tracked alongside the existing `templates/agent-workspace/` content

## 3. Update docs referencing the old default

- [ ] 3.1 Update `CLAUDE.md`'s "Agent sandboxing" section (the `introspect-harness-server/data/workspace/` bullet) to describe the new default location and that it's no longer inside the repo tree
- [ ] 3.2 Note in the same section (or nearby) that a pre-existing `introspect-harness-server/data/workspace/` from before this change is orphaned and safe to delete by hand

## 4. Verify

- [ ] 4.1 Delete any local `introspect-harness-server/data/workspace/` left over from before this change (developer's own machine only — confirm with `git status`/`ls` that it's the gitignored runtime copy, not template source, before removing)
- [ ] 4.2 Ask the user to restart `introspect-harness-server` (per CLAUDE.md, dev servers are never restarted directly) and confirm the new workspace directory is created at the new default path with `openspec/`, `AGENTS.md`, `.pi/`, `.agents/` all present
- [ ] 4.3 Via the running introspect chat client, prompt the agent to run an `openspec` command with no path argument (e.g. `openspec list`) and confirm — from the server logs or the tool-call result — that it resolves inside the new workspace root, not this harness repo's `openspec/`
- [ ] 4.4 Run `npm run typecheck` and `npm test` from the repo root
