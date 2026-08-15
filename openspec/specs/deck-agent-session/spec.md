## Purpose

Provide one long-lived pi `AgentSession` per logged-in browser session, streaming prompts, agent events, and shared deck-state updates between the browser and the in-process agent runtime over WebSocket.

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

### Requirement: Deck-state broadcast
The shared deck state SHALL be broadcast to every open WebSocket connection whenever it changes, regardless of whether the change originated from a tool call or from a client's own selection message.

#### Scenario: Tool call changes the deck
- **WHEN** a pi tool call modifies the shared deck (position, size, text, color, font size, or layout)
- **THEN** every connected client receives the updated deck state

#### Scenario: Multiple tabs share one deck
- **WHEN** two browser connections are open at once
- **THEN** a deck-state change from either connection is broadcast to both

### Requirement: Selection sharing
The system SHALL accept a `selection` message with a list of object ids, update the shared deck's selection (dropping any ids that don't match a current object), and broadcast the updated deck state.

#### Scenario: Selecting unknown ids
- **WHEN** a client sends a `selection` message that includes an id with no matching deck object
- **THEN** that id is dropped from the resulting selection and the rest of the valid ids are applied

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
