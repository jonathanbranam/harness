## MODIFIED Requirements

### Requirement: Deck-state broadcast
The system SHALL broadcast the following to every open WebSocket connection whenever any of it changes: the list of decks (id and name), the active deck's id, the active deck's ordered list of slides (id), the active slide's id, and the active slide's objects and selection.

#### Scenario: Tool call changes the deck
- **WHEN** a pi tool call modifies an object on the active slide (position, size, text, color, font size, or layout)
- **THEN** every connected client receives the updated state for that slide

#### Scenario: Multiple tabs share one deck
- **WHEN** two browser connections are open at once
- **THEN** a state change from either connection (an edit, or a deck/slide switch) is broadcast to both

#### Scenario: Switching the active deck or slide broadcasts the change
- **WHEN** the active deck or active slide changes, by any connected client or by a pi tool call
- **THEN** every connected client receives the updated active deck/slide identity and the newly active slide's objects and selection

### Requirement: Selection sharing
The system SHALL accept a `selection` message with a list of object ids, update the active slide's selection (dropping any ids that don't match an object on that slide), and broadcast the updated state.

#### Scenario: Selecting unknown ids
- **WHEN** a client sends a `selection` message that includes an id with no matching object on the active slide
- **THEN** that id is dropped from the resulting selection and the rest of the valid ids are applied

## ADDED Requirements

### Requirement: Server-requested browser rendering
The system SHALL be able to request that the browser connection which originated the current agent turn render the active slide to an image and return it, backing the `slide-visual-inspection` tool.

#### Scenario: Successful render round trip
- **WHEN** the server requests a render from the originating connection while it is still open
- **THEN** that connection renders the active slide and returns the image to the server, which the server then returns as the tool's result

#### Scenario: Disconnect fails a pending render request
- **WHEN** the originating connection closes while a render request it was asked to fulfill is still pending
- **THEN** the pending request is resolved as failed rather than left hanging indefinitely
