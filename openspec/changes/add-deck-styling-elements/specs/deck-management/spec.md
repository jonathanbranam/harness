## MODIFIED Requirements

### Requirement: Create a deck
The system SHALL allow creating a new deck given a name. The new deck SHALL start with exactly one blank slide (no objects, default background color), and SHALL become the active deck with that slide as its active slide.

#### Scenario: New deck becomes active
- **WHEN** a client creates a new deck
- **THEN** the deck is added to the deck list, becomes the active deck, and its single blank slide becomes the active slide

#### Scenario: New deck's slide starts with the default background color
- **WHEN** a client creates a new deck
- **THEN** that deck's initial slide has the system's default background color rather than an unset value

### Requirement: Add a slide
The system SHALL allow adding a new, blank (no objects, default background color) slide to the active deck, appended after its existing slides, and SHALL make the new slide the active slide.

#### Scenario: New slide becomes active and starts blank
- **WHEN** a client adds a slide to the active deck
- **THEN** the slide is appended to that deck's slide list, becomes the active slide, and has no objects

#### Scenario: New slide starts with the default background color
- **WHEN** a client adds a slide to the active deck
- **THEN** that slide's background color is the system's default rather than unset
