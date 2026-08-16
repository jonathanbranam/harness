## MODIFIED Requirements

### Requirement: Deck-state broadcast
The system SHALL broadcast the following to every open WebSocket connection whenever any of it changes: the list of decks (id and name), the active deck's id, the active deck's ordered list of slides (id), the active slide's id, the active slide's objects and selection, and whether undo and redo currently each have anything to act on.

#### Scenario: Tool call changes the deck
- **WHEN** a pi tool call modifies an object on the active slide (position, size, text, color, font size, or layout)
- **THEN** every connected client receives the updated state for that slide

#### Scenario: Multiple tabs share one deck
- **WHEN** two browser connections are open at once
- **THEN** a state change from either connection (an edit, or a deck/slide switch) is broadcast to both

#### Scenario: Switching the active deck or slide broadcasts the change
- **WHEN** the active deck or active slide changes, by any connected client or by a pi tool call
- **THEN** every connected client receives the updated active deck/slide identity and the newly active slide's objects and selection

#### Scenario: Undo/redo availability changes are broadcast
- **WHEN** a content-mutating operation, or an undo or redo, changes whether undo or redo currently has anything to act on
- **THEN** every connected client receives the updated availability alongside the rest of the deck state

#### Scenario: Undo or redo by one client updates every client
- **WHEN** one connected client triggers undo or redo
- **THEN** every connected client receives the resulting deck state and updated undo/redo availability
