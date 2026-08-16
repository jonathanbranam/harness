# dungeon-agent-session Specification

## Purpose

Provide one long-lived pi `AgentSession` per authenticated browser session on `dungeon-harness-server`, so the web UI can prompt the agent and receive streaming events over a persistent WebSocket connection.

## Requirements

### Requirement: WebSocket requires authentication
The `/ws` endpoint SHALL require a valid session cookie (see `harness-auth`) before completing the WebSocket upgrade.

#### Scenario: Unauthenticated upgrade attempt
- **WHEN** a client attempts to open `/ws` without a valid session cookie
- **THEN** the connection is rejected and no `AgentSession` is created

### Requirement: One AgentSession per login
The system SHALL key `AgentSession`s by the caller's auth session token, so one browser login reuses the same `AgentSession` across reconnects until logout.

#### Scenario: Reconnect reuses the session
- **WHEN** a client with an existing `AgentSession` reconnects (e.g. after a page reload) using the same valid session cookie
- **THEN** the server reuses the existing `AgentSession` instead of creating a new one

#### Scenario: Logout ends the AgentSession
- **WHEN** a client logs out
- **THEN** its `AgentSession` is disposed, and logging in again (a new session token) starts a fresh `AgentSession`

### Requirement: Prompt streaming
The system SHALL forward a client's `prompt` message to the `AgentSession`, and SHALL stream the resulting agent events (assistant text deltas, tool execution start/end) back over the same connection.

#### Scenario: Prompt while idle
- **WHEN** a client sends a `prompt` message and the `AgentSession` is idle
- **THEN** the server starts a new agent turn and streams its events back to the client

#### Scenario: Prompt while streaming
- **WHEN** a client sends a `prompt` message while the `AgentSession` is already streaming a response
- **THEN** the server steers the in-progress turn with the new message rather than starting a second concurrent turn

### Requirement: Malformed messages don't break the connection
The system SHALL respond with an `error` message and keep the connection open when it receives a message that isn't valid JSON or lacks a recognized `type`.

#### Scenario: Invalid JSON payload
- **WHEN** a client sends a WebSocket message that fails to parse as JSON
- **THEN** the server sends back an `error` message and the connection remains open

### Requirement: Disconnect resolves its pending approvals
When a WebSocket connection closes while one or more tool-call approvals it originated are still pending, the system SHALL resolve those approvals as denied so the agent turn does not hang indefinitely.

#### Scenario: Browser tab closes mid-approval
- **WHEN** a client disconnects while a `bash`/`write`/`edit` approval it triggered is still awaiting a response
- **THEN** that approval is resolved as denied and the corresponding tool call is blocked

### Requirement: No dungeon-tactics tools registered
The `AgentSession` SHALL be created with only pi's built-in tools (`bash`, `write`, `edit`, `read`, `grep`, `find`, `ls`), with no dungeon-tactics-specific tools registered.

#### Scenario: Agent has no board or Gherkin tools
- **WHEN** the agent lists its available tools
- **THEN** only pi's built-in tools are present; no board-manipulation or Gherkin-authoring tools exist yet
