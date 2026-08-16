## Purpose

Confine introspect-harness-server's `read`/`write`/`edit`/`bash` tools to the session's workspace directory, so a coding-agent turn cannot read or write files anywhere else on disk.

## ADDED Requirements

### Requirement: Path jail for read/write/edit
`read`, `write`, and `edit` calls whose target path resolves outside the session's workspace directory SHALL be blocked.

#### Scenario: Attempted read outside workspace
- **WHEN** the agent calls `read` on a path that resolves outside the session's workspace directory
- **THEN** the tool call is blocked with a reason identifying the offending path

#### Scenario: Attempted write outside workspace
- **WHEN** the agent calls `write` or `edit` on a path that resolves outside the session's workspace directory
- **THEN** the tool call is blocked with a reason identifying the offending path

#### Scenario: Path inside workspace succeeds
- **WHEN** the agent calls `read`, `write`, or `edit` on a path that resolves inside the session's workspace directory
- **THEN** the tool call proceeds normally

### Requirement: Static bash blocklist
Bash commands matching known-destructive patterns (`rm -rf`/`-fr`, `mkfs`, `dd` writing to a device, redirecting into a non-null `/dev` device, or `curl`/`wget` piped into a shell) SHALL be blocked outright.

#### Scenario: Destructive rm
- **WHEN** the agent attempts to run a `bash` command matching the blocklist (e.g. `rm -rf /`)
- **THEN** the tool call is blocked with a policy reason

### Requirement: Bash commands confined to the workspace directory
`bash` tool calls SHALL be confined to the session's workspace directory: a command SHALL be blocked if it changes the working directory outside that root (e.g. via `cd`) or references an absolute path outside it.

#### Scenario: cd escape attempt
- **WHEN** the agent runs a `bash` command that changes directory outside the workspace root
- **THEN** the tool call is blocked with a reason identifying the workspace violation

#### Scenario: Absolute path outside workspace
- **WHEN** the agent runs a `bash` command referencing an absolute path outside the workspace root
- **THEN** the tool call is blocked with a reason identifying the workspace violation

#### Scenario: Relative traversal outside workspace
- **WHEN** the agent runs a `bash` command whose arguments contain a `..` traversal sequence that would resolve outside the workspace root
- **THEN** the tool call is blocked with a reason identifying the workspace violation

This confinement is pattern-based, not a kernel-level sandbox — see design.md for the known residual risk and mitigation.

### Requirement: Blocked calls fail without an approval prompt
introspect-harness-server has no interactive approval channel, so a blocked `read`, `write`, `edit`, or `bash` call SHALL fail immediately with a reason instead of waiting on user approval.

#### Scenario: Blocked write fails immediately
- **WHEN** a `write` call is blocked by the path jail
- **THEN** the tool call fails immediately with a reason and no approval prompt is shown
