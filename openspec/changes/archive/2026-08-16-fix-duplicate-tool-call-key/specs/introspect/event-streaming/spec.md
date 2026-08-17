## ADDED Requirements

### Requirement: Client discards events from a superseded connection
The client SHALL discard any WebSocket message received on a connection that is no longer the client's current connection, so that no single logical event is processed more than once within one browser tab.

#### Scenario: A superseded connection receives a trailing message
- **WHEN** a browser tab has opened a new WebSocket connection to replace a previous one, and the previous (now-superseded) connection still receives a message before fully closing
- **THEN** the client does not apply that message's event to any client-side state

#### Scenario: The current connection receives a message
- **WHEN** the client's current WebSocket connection receives a message
- **THEN** the client applies that message's event to client-side state exactly once
