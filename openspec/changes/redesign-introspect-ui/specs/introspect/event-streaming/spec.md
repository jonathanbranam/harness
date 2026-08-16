## MODIFIED Requirements

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
