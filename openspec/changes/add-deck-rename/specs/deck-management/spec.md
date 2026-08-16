## ADDED Requirements

### Requirement: Rename a deck
The system SHALL allow renaming any existing deck by id, given a new name, independent of whether that deck is the active deck. Leading/trailing whitespace SHALL be trimmed from the new name, and renaming to an empty or whitespace-only name SHALL be rejected, leaving the deck's existing name unchanged.

#### Scenario: Renaming the active deck
- **WHEN** a client renames the currently active deck to a new, non-empty name
- **THEN** that deck's name is updated and the new name is reflected in the deck list

#### Scenario: Renaming a deck that is not active
- **WHEN** a client renames a deck other than the currently active deck
- **THEN** that deck's name is updated without changing which deck is active

#### Scenario: Renaming to an empty name is rejected
- **WHEN** a client requests renaming a deck to an empty string or a string containing only whitespace
- **THEN** the request is rejected and the deck's name is unchanged

#### Scenario: Renaming an unknown deck id
- **WHEN** a client requests renaming a deck id that doesn't exist
- **THEN** the request is rejected and no deck is modified
