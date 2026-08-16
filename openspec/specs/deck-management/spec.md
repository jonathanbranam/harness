# deck-management Specification

## Purpose

Let the harness hold multiple presentation decks, each containing an ordered list of slides that can be added or removed, with exactly one deck and one slide active at a time for editing and viewing.

## Requirements

### Requirement: Create a deck
The system SHALL allow creating a new deck given a name. The new deck SHALL start with exactly one blank slide (no objects), and SHALL become the active deck with that slide as its active slide.

#### Scenario: New deck becomes active
- **WHEN** a client creates a new deck
- **THEN** the deck is added to the deck list, becomes the active deck, and its single blank slide becomes the active slide

### Requirement: List decks
The system SHALL make the full list of decks (id, name, and slide count for each) available.

#### Scenario: Newly created deck is listed
- **WHEN** a client creates a new deck
- **THEN** that deck subsequently appears in the deck list

### Requirement: Select active deck
The system SHALL allow selecting which existing deck is active, given a deck id. Each deck SHALL remember its own active slide across deck switches, so switching back to a deck restores whichever slide was last active on it (its first slide the first time it's activated).

#### Scenario: Switching to an unknown deck id
- **WHEN** a client requests activating a deck id that doesn't exist
- **THEN** the request is rejected and the active deck is unchanged

#### Scenario: Switching decks restores the deck's own last-active slide
- **WHEN** a client activates deck A, changes its active slide to slide 2, activates deck B, then re-activates deck A
- **THEN** deck A's active slide is slide 2, not deck A's first slide

### Requirement: Delete a deck
The system SHALL allow deleting a deck by id, removing it and all of its slides. The system SHALL always retain at least one deck: deleting the only remaining deck SHALL be rejected. If the deleted deck was the active deck, another remaining deck SHALL become active.

#### Scenario: Deleting the last remaining deck is rejected
- **WHEN** a client requests deleting the only deck that exists
- **THEN** the request is rejected and the deck is not deleted

#### Scenario: Deleting the active deck activates another deck
- **WHEN** a client deletes the currently active deck while at least one other deck exists
- **THEN** the deck is deleted and a remaining deck becomes active

### Requirement: Add a slide
The system SHALL allow adding a new, blank (no objects) slide to the active deck, appended after its existing slides, and SHALL make the new slide the active slide.

#### Scenario: New slide becomes active and starts blank
- **WHEN** a client adds a slide to the active deck
- **THEN** the slide is appended to that deck's slide list, becomes the active slide, and has no objects

### Requirement: Remove a slide
The system SHALL allow removing a slide from the active deck by id. The system SHALL always retain at least one slide per deck: removing the last remaining slide in a deck SHALL be rejected. If the removed slide was the active slide, another slide in that deck SHALL become active.

#### Scenario: Removing the last remaining slide is rejected
- **WHEN** a client requests removing the only slide in the active deck
- **THEN** the request is rejected and the slide is not removed

#### Scenario: Removing the active slide activates another slide
- **WHEN** a client removes the currently active slide while the active deck has at least one other slide
- **THEN** the slide is removed and another slide in that deck becomes active

### Requirement: Select active slide
The system SHALL allow selecting which slide within the active deck is active, given a slide id belonging to that deck.

#### Scenario: Switching to an unknown or out-of-deck slide id
- **WHEN** a client requests activating a slide id that doesn't exist, or that belongs to a deck other than the active deck
- **THEN** the request is rejected and the active slide is unchanged
