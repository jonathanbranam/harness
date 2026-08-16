## ADDED Requirements

### Requirement: Workspace root is not nested inside an ancestor project tree
The default workspace directory SHALL NOT be located inside a directory tree that contains an ancestor project marker (`openspec/`, `.git`, or equivalent) above the workspace root, so that a CLI tool invoked via `bash` which discovers its own project root by walking up parent directories from `cwd` — rather than accepting an explicit path argument — cannot resolve to a root outside the session's allowed roots.

#### Scenario: Default workspace location has no ancestor project markers
- **WHEN** the workspace directory is provisioned at its default location (no `INTROSPECT_WORKSPACE_DIR` override)
- **THEN** no ancestor directory above the workspace root contains an `openspec/` or `.git` directory

### Requirement: Workspace is seeded with a self-contained OpenSpec root
The seeded workspace template SHALL include an already-initialized `openspec/` directory (with `specs/` and `changes/` present), so that the `openspec` CLI's own root-qualification check resolves at the workspace root itself and never needs to walk up to a parent directory, regardless of where the workspace directory is located on disk.

#### Scenario: openspec CLI resolves within the workspace
- **WHEN** the agent runs an `openspec` command from within the workspace root, with no `--store` flag
- **THEN** the CLI resolves its project root as the workspace's own `openspec/` directory, not any ancestor directory

#### Scenario: Seeded workspace already qualifies as an OpenSpec root
- **WHEN** a session's workspace is seeded or reset from the template
- **THEN** the workspace contains an `openspec/` directory with `specs/` and `changes/` subdirectories present
