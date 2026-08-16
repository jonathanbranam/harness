# dungeon-tool-permission-gate Specification

## Purpose

Provide defense-in-depth around `dungeon-harness-server`'s `bash`/`write`/`edit` tools, mirroring the deck and introspect harnesses' permission gates, so a single-user local tool doesn't carry an unchecked tool-execution blast radius.

## Requirements

### Requirement: Static bash blocklist
Bash commands matching known-destructive patterns (`rm -rf`/`-fr`, `mkfs`, `dd` writing to a device, redirecting into a non-null `/dev` device, or `curl`/`wget` piped into a shell) SHALL be blocked outright, without requesting approval, and SHALL terminate the tool call.

#### Scenario: Destructive rm
- **WHEN** the agent attempts to run a `bash` command matching the blocklist (e.g. `rm -rf /`)
- **THEN** the tool call is blocked with a policy reason and the agent turn terminates early

### Requirement: Path jail for write/edit
`write` and `edit` calls whose target path resolves outside the agent's working directory SHALL be blocked, regardless of user approval.

#### Scenario: Attempted write outside the workspace
- **WHEN** the agent attempts to `write` or `edit` a path that resolves outside its sandboxed working directory
- **THEN** the tool call is blocked with a reason identifying the offending path, and no approval prompt is shown

### Requirement: Interactive approval for bash/write/edit
Every `bash`, `write`, or `edit` call that isn't blocked by the static blocklist or path jail SHALL require explicit approval, requested from the browser over the caller's WebSocket connection, before executing.

#### Scenario: User approves
- **WHEN** the user approves a pending `bash`/`write`/`edit` call
- **THEN** the tool executes normally

#### Scenario: User denies
- **WHEN** the user denies a pending `bash`/`write`/`edit` call
- **THEN** the tool call is blocked with reason "Denied by user"

### Requirement: Read-only tools bypass the gate
The tools `read`, `grep`, `find`, and `ls` SHALL never require approval.

#### Scenario: Reading a file
- **WHEN** the agent calls `read` on a file
- **THEN** the call proceeds without an approval prompt

### Requirement: Identical repeat calls within a turn aren't re-prompted
Once a specific tool name + input combination has been approved within the current turn, an identical repeat of that exact call within the same turn SHALL proceed without a second approval prompt. A new turn SHALL reset this.

#### Scenario: Same command retried in one turn
- **WHEN** the agent calls the exact same approved `bash` command a second time before the turn ends
- **THEN** the second call proceeds without re-prompting

#### Scenario: New turn requires approval again
- **WHEN** the agent calls the same command again in a later turn
- **THEN** the user is prompted for approval again

### Requirement: Per-session isolation
The permission gate SHALL be instantiated per `AgentSession` rather than shared module-level state, so concurrent sessions each have an isolated approval queue and pending-repeat cache.

#### Scenario: Two sessions never cross-wire approvals
- **WHEN** two separate `AgentSession`s each have a pending `bash`/`write`/`edit` approval at the same time
- **THEN** each approval is routed only to the browser connection for its own session, never the other
