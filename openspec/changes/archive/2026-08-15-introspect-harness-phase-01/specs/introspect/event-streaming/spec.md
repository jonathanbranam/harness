## Purpose

Forward pi agent lifecycle events from the in-process runtime to connected browser clients so the apparatus view and chat pane can update in real time.

## ADDED Requirements

### Requirement: Capture agent lifecycle events
The introspection extension SHALL subscribe to pi lifecycle events and forward them to the harness server.

#### Scenario: Assistant streams text
- **WHEN** the model emits a `message_update` event during a turn
- **THEN** the extension forwards a serialized event to the server within one event loop tick

#### Scenario: Tool executes
- **WHEN** a tool call starts or finishes
- **THEN** the extension forwards `tool_execution_start` and `tool_execution_end` events to the server

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

### Requirement: Context usage events
The extension SHALL forward context usage information when available so the apparatus can render the context gauge.

#### Scenario: Usage available
- **WHEN** `ctx.getContextUsage()` returns a value during a streaming update
- **THEN** the extension forwards a `context_usage` event with `tokens` and `percentage`
