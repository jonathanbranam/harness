## MODIFIED Requirements

### Requirement: Content mutations are captured in history
Every content-mutating operation on the deck — object add/remove (including
shape creation via `presentation_add_shape`) and all `presentation_update`
actions (`setPosition`, `setSize`, `setText`, `setFillColor`,
`setFontColor`, `setBorderColor`, `setFontSize`, `applyGridLayout`,
`addObject`, `removeObject`, `applyTextStyle`, `setEndpoint`, shape-style
fields such as `strokeWidth`/`borderWidth`/`cornerRadius`/`arrowStart`/
`arrowEnd`, and the z-order actions `setZIndex`/`bringForward`/
`sendBackward`/`bringToFront`/`sendToBack`), slide add/remove, deck
create/delete, and setting the active slide's background color — SHALL push
one entry onto a single shared undo/redo history.

#### Scenario: Object edit is captured
- **WHEN** an object's position, size, text, or styling is changed by
  either actor
- **THEN** a new history entry is pushed reflecting that change

#### Scenario: Structural changes are captured
- **WHEN** a slide is added or removed, or a deck is created or deleted
- **THEN** a new history entry is pushed reflecting that change

#### Scenario: Navigation is not captured
- **WHEN** the selection changes, or the active deck or active slide is
  switched, with no accompanying content change
- **THEN** no history entry is pushed

#### Scenario: Shape creation and removal are captured
- **WHEN** pi or the user adds a line, box, ellipse, or arrow to the active
  slide, or removes one
- **THEN** a new history entry is pushed reflecting that change

#### Scenario: A failed shape-creation call is not captured
- **WHEN** `presentation_add_shape` is called with invalid or missing
  required geometry and no object is actually created
- **THEN** no history entry is pushed

#### Scenario: Z-order changes are captured
- **WHEN** an object's stacking position is changed via an explicit
  `zIndex`, a relative bring-forward/send-backward step, or bring-to-front/
  send-to-back, by either actor
- **THEN** a new history entry is pushed reflecting that change

#### Scenario: Slide background color change is captured
- **WHEN** pi or the user changes the active slide's background color
- **THEN** a new history entry is pushed reflecting that change
