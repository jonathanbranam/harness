# deck-preview-mode Specification

## Purpose

Lets a user view the active deck as a full-screen, chrome-free slideshow they can step through with keyboard controls, so they can rehearse or present without exposing the editor UI.

## Requirements

### Requirement: Entering preview mode
The system SHALL provide a control on the deck editor page that, when activated, enters preview mode for the currently active deck.

#### Scenario: Entering preview from the editor
- **WHEN** the user activates the "Present" control while a deck is loaded
- **THEN** the system hides the header, deck switcher, slide switcher, and chat panel and displays only the currently active slide, filling the browser viewport

#### Scenario: No deck loaded
- **WHEN** no deck is currently active
- **THEN** the "Present" control SHALL be disabled or absent, and preview mode cannot be entered

### Requirement: Full-screen presentation
While in preview mode, the system SHALL attempt to use the browser Fullscreen API to present the slide edge-to-edge.

#### Scenario: Fullscreen API available and granted
- **WHEN** the user enters preview mode and the browser grants a fullscreen request
- **THEN** the slide is displayed in true browser fullscreen with no visible harness chrome

#### Scenario: Fullscreen API unavailable or denied
- **WHEN** the user enters preview mode and the Fullscreen API is unsupported or the request is denied
- **THEN** the system SHALL fall back to a full-viewport overlay that still hides all harness chrome and displays only the current slide

### Requirement: Keyboard slide navigation
While in preview mode, the system SHALL let the user navigate between slides using standard presenter keys.

#### Scenario: Advance to next slide
- **WHEN** the user presses ArrowRight, ArrowDown, Space, or PageDown while previewing a slide that is not the last slide
- **THEN** the system displays the next slide in the deck

#### Scenario: Return to previous slide
- **WHEN** the user presses ArrowLeft, ArrowUp, or PageUp while previewing a slide that is not the first slide
- **THEN** the system displays the previous slide in the deck

#### Scenario: Advancing past the last slide
- **WHEN** the user presses a next-slide key while the last slide is displayed
- **THEN** the system SHALL remain on the last slide and take no navigation action

#### Scenario: Reversing past the first slide
- **WHEN** the user presses a previous-slide key while the first slide is displayed
- **THEN** the system SHALL remain on the first slide and take no navigation action

### Requirement: Exiting preview mode
The system SHALL let the user exit preview mode and return to the normal editor layout at any time.

#### Scenario: Exit via Escape key
- **WHEN** the user presses Escape while in preview mode
- **THEN** the system exits preview mode, exits browser fullscreen if it is active, and restores the header, deck switcher, slide switcher, and chat panel

#### Scenario: Exit via browser fullscreen gesture
- **WHEN** the user exits fullscreen through a browser-native control or gesture (not the Escape key handled by the application) while in preview mode
- **THEN** the system detects the fullscreen-exit and also exits preview mode, restoring the normal editor layout

#### Scenario: Slide selection preserved on exit
- **WHEN** the user exits preview mode after navigating to a different slide than the one active when preview was entered
- **THEN** the editor's active slide after exiting SHALL be the slide that was last displayed in preview mode

### Requirement: Read-only presentation
While in preview mode, the system SHALL NOT allow editing of slide content and SHALL NOT emit selection or object-update events.

#### Scenario: Clicking slide content in preview mode
- **WHEN** the user clicks or attempts to select an element on the slide while in preview mode
- **THEN** the system SHALL NOT enter an editing or selection state and SHALL NOT send a selection or object-update event
