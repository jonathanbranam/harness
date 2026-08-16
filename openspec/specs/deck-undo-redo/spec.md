# deck-undo-redo Specification

## Purpose

Let the user and pi reverse and reapply content changes to the shared live
deck through one global undo/redo history, with each entry's provenance
(who made it, and when) visible enough that pi can reason about how far
back to step.

## Requirements

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

### Requirement: History is capped at approximately 100 entries
The history SHALL retain at most approximately 100 entries. When a new
entry would exceed the cap, the oldest entry SHALL be discarded first.

#### Scenario: Cap reached
- **WHEN** the history already holds the maximum number of entries and a
  new content-mutating operation occurs
- **THEN** the oldest entry is discarded and the new entry is added

### Requirement: Undo reverts the most recent entry
Undo SHALL revert the single most recently added entry that has not
already been undone, restoring the deck content, selection, and active
deck/slide to their state immediately before that entry's change.

#### Scenario: Undo a single edit
- **WHEN** undo is invoked after one content-mutating operation
- **THEN** the deck returns to the state it was in immediately before that
  operation, including selection and active deck/slide

#### Scenario: Undo with an empty history
- **WHEN** undo is invoked and there is no entry to undo
- **THEN** the deck is unchanged and the caller is told nothing was undone

#### Scenario: Repeated undo walks backward in order
- **WHEN** undo is invoked multiple times in a row
- **THEN** each invocation reverts one additional entry, in the exact
  reverse order the entries were added

### Requirement: Redo reapplies the most recently undone entry
Redo SHALL reapply the most recently undone entry, restoring the deck to
the state it was in immediately after that entry's original change.

#### Scenario: Redo after undo
- **WHEN** redo is invoked immediately after an undo
- **THEN** the deck returns to the state it was in immediately after the
  undone operation originally occurred

#### Scenario: Redo with nothing to redo
- **WHEN** redo is invoked and no entry has been undone since the last new
  content-mutating operation
- **THEN** the deck is unchanged and the caller is told nothing was redone

### Requirement: A new edit discards the redo tail
When a content-mutating operation occurs after one or more undos, any
entries available for redo SHALL be discarded before the new entry is
added.

#### Scenario: Editing after undo clears redo
- **WHEN** the user or pi undoes an edit and then makes a new
  content-mutating change
- **THEN** the previously undone entry is no longer available to redo

### Requirement: Entries record actor and timestamp
Every history entry SHALL record which actor made the change — `user` or
`agent` — and the time the change was made.

#### Scenario: User edit is attributed to the user
- **WHEN** the user makes a content-mutating change from the canvas
- **THEN** the resulting history entry's actor is `user`

#### Scenario: Agent edit is attributed to the agent
- **WHEN** pi makes a content-mutating change via a tool call
- **THEN** the resulting history entry's actor is `agent`

### Requirement: pi can inspect the history
A tool SHALL let pi list recent history entries, most-recent-first, each
with its actor, timestamp, and a human-readable description of the
change, along with whether undo and redo currently have anything to act
on.

#### Scenario: Listing recent entries
- **WHEN** pi calls the history-inspection tool
- **THEN** the result includes, for each recent entry, its actor,
  timestamp, and description, in most-recent-first order

### Requirement: pi can undo and redo via tools
Tools SHALL let pi undo or redo, optionally stepping more than one entry
at once via a count, stopping early if the history is exhausted before the
requested count is reached. These tools act on the same shared strict
LIFO history as the user's keyboard/toolbar controls — pi cannot skip over
an intervening entry to reach an older one out of order.

#### Scenario: Agent undoes its own recent edits
- **WHEN** pi calls the undo tool with a count matching the number of its
  own consecutive most-recent entries
- **THEN** exactly that many entries are undone, and the tool reports
  which entries (actor and description) were undone

#### Scenario: Agent count exceeds available history
- **WHEN** pi calls the undo tool with a count larger than the number of
  entries currently available to undo
- **THEN** all available entries are undone, the tool reports how many
  were actually undone, and no error is raised

### Requirement: User can undo and redo from the canvas
The user SHALL be able to trigger undo (Ctrl/Cmd+Z) and redo
(Ctrl/Cmd+Shift+Z) via keyboard shortcut, and via toolbar buttons on the
canvas, whenever they are not actively editing text in place on a text
box.

#### Scenario: Keyboard undo
- **WHEN** the user presses Ctrl/Cmd+Z while not editing text in place
- **THEN** the most recent history entry is undone

#### Scenario: Keyboard shortcut suppressed during text editing
- **WHEN** the user presses Ctrl/Cmd+Z while actively editing a text box
  in place
- **THEN** the deck-level undo is not triggered, leaving the browser's
  native in-field undo behavior unaffected

#### Scenario: Toolbar buttons reflect availability
- **WHEN** the history has nothing left to undo, or nothing left to redo
- **THEN** the corresponding toolbar button is disabled
