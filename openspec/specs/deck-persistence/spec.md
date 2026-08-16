# deck-persistence Specification

## Purpose

Make deck state (decks, slides, objects, and active selection) survive a
server restart by automatically saving it to server-side storage and
restoring it on startup, with no manual save action required from the user.

## Requirements

### Requirement: Debounced auto-save on change
The system SHALL persist the full deck state (all decks, their slides and
objects, and which deck/slide is active) to server-side storage
automatically whenever it changes, without any explicit save request from
the client. Saves SHALL be debounced: a burst of rapid changes SHALL result
in one persisted write after activity settles, not one write per change.

#### Scenario: Edit triggers an automatic save
- **WHEN** a client changes deck state (e.g. moves an object, edits text, adds a slide, creates a deck)
- **THEN** the system persists the updated full deck state to storage after a short quiet period, with no explicit save request from the client

#### Scenario: Rapid successive edits coalesce into one save
- **WHEN** multiple deck state changes occur in quick succession (e.g. continuous dragging)
- **THEN** the system performs a single persisted write reflecting the final state, not one write per intermediate change

#### Scenario: No manual save action is required
- **WHEN** a client makes any change to deck state
- **THEN** that change is eventually persisted without the client sending any explicit "save" action

### Requirement: Restore deck state on startup
The system SHALL, on startup, load previously persisted deck state, if any
exists, and use it as the initial in-memory deck state, instead of
discarding it in favor of a default deck.

#### Scenario: Restart restores prior decks
- **WHEN** the server starts and deck state was persisted before the previous shutdown or crash
- **THEN** the decks, slides, objects, and active deck/slide from that persisted state are available immediately, without needing to be recreated by a client

### Requirement: First run falls back to a default deck
The system SHALL start with a single default deck when no deck state has
ever been persisted.

#### Scenario: No persisted state on first run
- **WHEN** the server starts and no deck state has ever been persisted
- **THEN** the system starts with a single default deck, matching current no-persistence startup behavior

### Requirement: Lenient loading of persisted state
The system SHALL tolerate persisted deck data that does not fully match
what the current system expects: unrecognized fields or structures SHALL be
ignored rather than causing the load to fail, and missing or malformed
values for expected fields SHALL fall back to safe defaults rather than
crashing the server at startup. The system SHALL NOT require or perform any
versioned migration of persisted data between formats — dropping
unrecognized data is the only accommodation for format changes.

#### Scenario: Persisted data contains unrecognized fields
- **WHEN** persisted deck state includes fields or structures the current system does not recognize
- **THEN** the system loads successfully, ignoring the unrecognized data, rather than failing to start

#### Scenario: Persisted data has malformed or missing expected fields
- **WHEN** persisted deck state is missing, or has malformed values for, fields the system expects
- **THEN** the system substitutes safe defaults for the affected fields rather than failing to start
