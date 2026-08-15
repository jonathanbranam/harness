# Agent Session Specification

## Purpose

Provide one long-lived pi `AgentSession` per authenticated browser session, so the web UI can prompt the agent and receive streaming events over a persistent connection.

## Requirements

### Requirement: WebSocket requires authentication
The `/ws` endpoint SHALL require a valid session cookie before completing the WebSocket upgrade.

#### Scenario: Unauthenticated upgrade attempt
- **WHEN** a client attempts to open `/ws` without a valid session cookie
- **THEN** the connection is rejected and no `AgentSession` is created

### Requirement: One AgentSession per login
The system SHALL key `AgentSession`s by the caller's auth session token, so one browser login reuses the same `AgentSession` across reconnects until logout.

#### Scenario: Reconnect reuses the session
- **WHEN** a client with an existing `AgentSession` reconnects using the same valid session cookie
- **THEN** the server reuses the existing `AgentSession` instead of creating a new one

#### Scenario: Logout ends the AgentSession
- **WHEN** a client logs out
- **THEN** its `AgentSession` is disposed, and logging in again starts a fresh `AgentSession`

### Requirement: Prompt streaming
The system SHALL forward a client's `prompt` message to the `AgentSession`, and SHALL stream the resulting agent events back over the same connection.

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
