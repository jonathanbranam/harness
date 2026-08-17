# Event Streaming Specification

## Purpose

Forward pi agent lifecycle events from the in-process runtime to connected browser clients so the apparatus view and chat pane can update in real time.

## Requirements

### Requirement: Capture agent lifecycle events
The introspection extension SHALL subscribe to pi lifecycle events and forward them to the harness server.

#### Scenario: Assistant streams text
- **WHEN** the model emits a `message_update` event during a turn
- **THEN** the extension forwards a serialized event to the server within one event loop tick

#### Scenario: Tool executes
- **WHEN** a tool call starts or finishes
- **THEN** the extension forwards `tool_execution_start` and `tool_execution_end` events to the server

#### Scenario: Tool call produces a result
- **WHEN** a tool call's result is finalized and about to be inserted into the conversation
- **THEN** the extension forwards a `tool_result` event containing that result's exact content (and usage, when the provider reports it) to the server

### Requirement: Broadcast events to all connected clients
The server SHALL forward every captured event to every WebSocket client connected to the same harness session.

#### Scenario: Multiple tabs open
- **WHEN** two browser tabs are connected to the same harness session
- **THEN** both tabs receive the same stream of events

### Requirement: Stable event schema
Every forwarded event SHALL include a stable `type` field and a JSON-serializable payload so the client can render it without parsing free-form text.

#### Scenario: Client receives message_update
- **WHEN** the client receives a `message_update` event
- **THEN** it can read `type`, `entryId`, and `delta` fields without parsing nested strings

### Requirement: Client discards events from a superseded connection
The client SHALL discard any WebSocket message received on a connection that is no longer the client's current connection, so that no single logical event is processed more than once within one browser tab.

#### Scenario: A superseded connection receives a trailing message
- **WHEN** a browser tab has opened a new WebSocket connection to replace a previous one, and the previous (now-superseded) connection still receives a message before fully closing
- **THEN** the client does not apply that message's event to any client-side state

#### Scenario: The current connection receives a message
- **WHEN** the client's current WebSocket connection receives a message
- **THEN** the client applies that message's event to client-side state exactly once

### Requirement: Context usage events
The extension SHALL forward context usage information when available so the apparatus can render the context gauge.

#### Scenario: Usage available
- **WHEN** `ctx.getContextUsage()` returns a value during a streaming update
- **THEN** the extension forwards a `context_usage` event with `tokens` and `percentage`
