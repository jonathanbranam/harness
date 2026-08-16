# Tool Permission Gate Specification

## Purpose

Confine introspect-harness-server's `read`/`write`/`edit`/`ls`/`find`/`grep`/`bash` tools to the session's workspace directory, so a coding-agent turn cannot read, write, list, or search files anywhere else on disk — including through a symlink that already exists inside the workspace, or one the agent tries to create itself — and cannot use `bash` to escape the workspace either.

## Requirements

### Requirement: Path jail for read/write/edit/ls/find/grep
`read`, `write`, `edit`, `ls`, `find`, and `grep` calls whose target path resolves outside the session's workspace directory SHALL be blocked. `ls`/`find`/`grep` calls that omit their optional `path` argument (defaulting to the workspace root) are unaffected.

#### Scenario: Attempted read outside workspace
- **WHEN** the agent calls `read` on a path that resolves outside the session's workspace directory
- **THEN** the tool call is blocked with a reason identifying the offending path

#### Scenario: Attempted write outside workspace
- **WHEN** the agent calls `write` or `edit` on a path that resolves outside the session's workspace directory
- **THEN** the tool call is blocked with a reason identifying the offending path

#### Scenario: Attempted ls/find/grep outside workspace
- **WHEN** the agent calls `ls`, `find`, or `grep` with a `path` argument that resolves outside the session's workspace directory
- **THEN** the tool call is blocked with a reason identifying the offending path

#### Scenario: Path inside workspace succeeds
- **WHEN** the agent calls `read`, `write`, `edit`, `ls`, `find`, or `grep` on a path that resolves inside the session's workspace directory
- **THEN** the tool call proceeds normally

### Requirement: Symlink escapes are blocked
A path that resolves lexically inside the session's workspace directory but, once symlinks are followed (via `realpath`), points outside it SHALL be blocked — for both the path-jailed tools (`read`/`write`/`edit`/`ls`/`find`/`grep`) and paths referenced in `bash` commands. For a target that doesn't exist yet (e.g. a `write` destination), the check resolves the nearest existing ancestor directory's real path instead.

#### Scenario: Read through a symlink pointing outside the workspace
- **WHEN** the agent calls `read` on a path inside the workspace that is, or passes through, a symlink resolving outside the workspace directory
- **THEN** the tool call is blocked with a reason identifying the offending path

#### Scenario: Write into a symlinked directory pointing outside the workspace
- **WHEN** the agent calls `write` to a not-yet-existing path whose parent directory is, or passes through, a symlink resolving outside the workspace directory
- **THEN** the tool call is blocked with a reason identifying the offending path

### Requirement: Link creation is blocked
`bash` commands that invoke `ln` (any flags), or `cp` with a symlink-creating flag (`-s`/`--symbolic-link`), SHALL be blocked outright, regardless of whether the link target or destination would themselves resolve inside or outside the workspace. This check runs before the command executes, so a single compound command that creates a symlink and immediately reads through it (e.g. `ln -s /etc /workspace/x && cat /workspace/x/passwd`) is blocked as a whole, not just the read.

#### Scenario: ln blocked
- **WHEN** the agent runs a `bash` command that invokes `ln`
- **THEN** the tool call is blocked with a policy reason, before any part of the command runs

#### Scenario: Compound create-and-read blocked
- **WHEN** the agent runs a single `bash` command that creates a symlink pointing outside the workspace and then reads through it in the same command
- **THEN** the entire command is blocked before execution

### Requirement: Static bash blocklist
Bash commands matching known-destructive patterns (`rm -rf`/`-fr`, `mkfs`, `dd` writing to a device, redirecting into a non-null `/dev` device, or `curl`/`wget` piped into a shell) SHALL be blocked outright.

#### Scenario: Destructive rm
- **WHEN** the agent attempts to run a `bash` command matching the blocklist (e.g. `rm -rf /`)
- **THEN** the tool call is blocked with a policy reason

### Requirement: Bash commands confined to the workspace directory
`bash` tool calls SHALL be confined to the session's workspace directory: a command SHALL be blocked if it changes the working directory outside that root (e.g. via `cd`), references an absolute path outside it, or references the home directory via `~` (or `~user`) expansion.

#### Scenario: cd escape attempt
- **WHEN** the agent runs a `bash` command that changes directory outside the workspace root
- **THEN** the tool call is blocked with a reason identifying the workspace violation

#### Scenario: Absolute path outside workspace
- **WHEN** the agent runs a `bash` command referencing an absolute path outside the workspace root
- **THEN** the tool call is blocked with a reason identifying the workspace violation

#### Scenario: Relative traversal outside workspace
- **WHEN** the agent runs a `bash` command whose arguments contain a `..` traversal sequence that would resolve outside the workspace root
- **THEN** the tool call is blocked with a reason identifying the workspace violation

#### Scenario: Home-directory expansion
- **WHEN** the agent runs a `bash` command referencing `~` or `~user` (shell home-directory expansion)
- **THEN** the tool call is blocked with a reason identifying the workspace violation

This confinement is pattern-based, not a kernel-level sandbox — see design.md for the known residual risk and mitigation.

### Requirement: Blocked calls fail without an approval prompt
introspect-harness-server has no interactive approval channel, so a blocked `read`, `write`, `edit`, `ls`, `find`, `grep`, or `bash` call SHALL fail immediately with a reason instead of waiting on user approval.

#### Scenario: Blocked write fails immediately
- **WHEN** a `write` call is blocked by the path jail
- **THEN** the tool call fails immediately with a reason and no approval prompt is shown

### Requirement: System prompt states the workspace boundary
The agent's system prompt SHALL include an explicit instruction that its tools are confined to the session's workspace directory and that it must not attempt to read, write, list, search, or execute anything outside it (via parent-directory traversal, absolute paths, the home directory, symlinks, or otherwise).

#### Scenario: System prompt includes the workspace boundary
- **WHEN** a turn starts and the system prompt is assembled
- **THEN** the system prompt text includes the workspace directory path and an instruction not to access anything outside it
