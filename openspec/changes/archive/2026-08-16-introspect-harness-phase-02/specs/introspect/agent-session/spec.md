## ADDED Requirements

### Requirement: Sandbox workspace is seeded at session start
The system SHALL reset the sandbox workspace to a declared seed's file set before creating a new live `AgentSession`, so every new session starts from a known, reproducible file state rather than whatever files remain from a previous session.

#### Scenario: New session starts from seed
- **WHEN** a new live session is created
- **THEN** the sandbox workspace's contents are replaced with the selected seed's file set before the `AgentSession` is created

#### Scenario: Reconnect does not reseed
- **WHEN** a client reconnects to an existing, already-running `AgentSession`
- **THEN** the sandbox workspace is not reset, since no new session is being created
