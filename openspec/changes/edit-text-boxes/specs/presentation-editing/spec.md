## MODIFIED Requirements

### Requirement: Read current deck state
The `presentation_get_state` tool SHALL return the objects of the active
deck's active slide (id, x, y, width, height, text, fillColor, borderColor,
fontColor, fontSize), the current selection scoped to that slide, and the
identities of the active deck and active slide. `text` is the object's
structured rich-text content. `fillColor` and `borderColor` are each either
a color value or the literal `"transparent"`.

#### Scenario: Query before making changes
- **WHEN** pi calls `presentation_get_state`
- **THEN** the tool returns the active slide's current list of objects and
  selection, reflecting any changes made since the slide was last read

#### Scenario: Query reflects the active slide only
- **WHEN** the active deck has more than one slide and pi calls
  `presentation_get_state`
- **THEN** the tool returns only the active slide's objects, not objects
  from the deck's other slides

#### Scenario: Transparent fill or border reported
- **WHEN** an object's fill or border has been set to transparent
- **THEN** `presentation_get_state` returns `"transparent"` for the
  corresponding field rather than a color value

### Requirement: Update objects
The `presentation_update` tool SHALL support the actions `setPosition`
(absolute `x`/`y` or relative `dx`/`dy`), `setSize` (`width`/`height`),
`setText`, `setFillColor` (a color value or `"transparent"`), `setFontColor`,
`setBorderColor` (a color value or `"transparent"`), `setFontSize`, and
`applyGridLayout` (`direction`, optional `gap`), applied to a list of target
object ids on the active deck's active slide. Object ids are scoped to the
slide they belong to, not globally unique across the deck.

#### Scenario: Unknown target id
- **WHEN** `presentation_update` is called with a target id that has no
  matching object on the active slide
- **THEN** that id is reported in the result's errors, and any other valid
  target ids in the same call are still updated

#### Scenario: Relative move
- **WHEN** `presentation_update` is called with `setPosition` and `dx`/`dy`
  instead of absolute `x`/`y`
- **THEN** the target objects move by the given offset from their current
  position

#### Scenario: Target id from a different slide
- **WHEN** `presentation_update` is called with a target id that exists on a
  slide other than the active one
- **THEN** that id is treated as unknown and reported in the result's errors

#### Scenario: Set fill to transparent
- **WHEN** `presentation_update` is called with `setFillColor` and the value
  `"transparent"`
- **THEN** the target objects are stored with no fill, and the canvas
  renders them with no background fill

### Requirement: Find objects by text
The `presentation_select_by_text` tool SHALL return the ids of objects on
the active deck's active slide whose text content contains the given query,
matching case-insensitively by default and case-sensitively when
`caseSensitive: true` is passed. Matching is performed against the
plain-text content of an object's structured text (the concatenation of its
runs' characters, ignoring formatting and list markers).

#### Scenario: Case-insensitive match
- **WHEN** `presentation_select_by_text` is called with a lowercase query
- **THEN** objects on the active slide whose text contains that query in
  any letter case are matched

#### Scenario: Matches are scoped to the active slide
- **WHEN** an object on a different slide (or a different deck) contains
  matching text
- **THEN** that object's id is not included in the result

#### Scenario: Match ignores formatting
- **WHEN** the query matches a phrase that spans a bold run and a
  non-bold run within the same text box
- **THEN** the object is still matched, since matching operates on the
  concatenated plain-text content

## ADDED Requirements

### Requirement: Add a text box
Both pi (via a `presentation_update` action or sibling tool) and the user
(via the canvas) SHALL be able to add a new text box to the current slide,
specifying at minimum its position and size.

#### Scenario: Agent adds a text box
- **WHEN** pi calls the add-text-box action with position and size
- **THEN** a new object is created on the current slide, is included in
  subsequent `presentation_get_state` results, and appears on the canvas

#### Scenario: User adds a text box
- **WHEN** the user triggers add-text-box from the canvas
- **THEN** a new empty text box appears on the canvas at a default or
  user-chosen position and becomes the current selection

### Requirement: Remove a text box
Both pi (via a `presentation_update` action or sibling tool) and the user
(via the canvas) SHALL be able to remove an existing text box from the
current slide by id.

#### Scenario: Agent removes a text box
- **WHEN** pi calls the remove-text-box action with a target object id
- **THEN** that object no longer appears in `presentation_get_state`
  results or on the canvas

#### Scenario: User removes a text box
- **WHEN** the user deletes a selected text box from the canvas
- **THEN** that object is removed from shared deck state and disappears
  from every connected view

#### Scenario: Removing an unknown id
- **WHEN** the remove-text-box action is called with an id that has no
  matching object
- **THEN** that id is reported in the result's errors, and no other object
  is affected

### Requirement: User moves a text box by dragging
The user SHALL be able to move a text box by pressing and dragging it on the
canvas, with its position updating in shared deck state to match the drag.

#### Scenario: Drag to a new position
- **WHEN** the user presses down on a text box and drags it to a new
  location, then releases
- **THEN** the object's position in shared deck state matches the drop
  location, and every connected view reflects the new position

### Requirement: User resizes a text box via handles
A selected text box SHALL display resize handles that let the user change
its width and/or height by dragging, with its size updating in shared deck
state to match.

#### Scenario: Drag a corner handle
- **WHEN** the user drags a selected text box's corner resize handle
- **THEN** the object's width and height in shared deck state match the
  dragged dimensions, and every connected view reflects the new size

### Requirement: User edits text in place on the canvas
The user SHALL be able to enter text-editing mode on a text box directly on
the canvas (for example, by double-clicking it) and edit its structured
text content, with edits reflected in shared deck state as they are made or
when editing ends.

#### Scenario: Edit and commit text
- **WHEN** the user double-clicks a text box, types new content, and clicks
  away to end editing
- **THEN** the object's text content in shared deck state reflects the
  edited content, and every connected view shows the updated text

### Requirement: Font color styling
Both pi and the user SHALL be able to set a text box's font color
independently of its fill and border colors, and the canvas SHALL render
the text box's text in that color.

#### Scenario: Set font color
- **WHEN** pi calls `presentation_update` with `setFontColor`, or the user
  sets font color from the canvas, for a target text box
- **THEN** the object's font color in shared deck state is updated, and the
  canvas renders that text box's text in the new color

### Requirement: Border color and transparency
Both pi and the user SHALL be able to set a text box's border (line) color
to a specific color or to transparent (no visible border), independently of
its fill color, and the canvas SHALL render the border accordingly.

#### Scenario: Set a visible border color
- **WHEN** pi calls `presentation_update` with `setBorderColor` set to a
  color value, or the user sets border color from the canvas, for a target
  text box
- **THEN** the object's border color in shared deck state is updated, and
  the canvas renders a border in that color

#### Scenario: Set border to transparent
- **WHEN** a text box's border color is set to `"transparent"`
- **THEN** the canvas renders that text box with no visible border

### Requirement: User controls fill and border transparency from the canvas
The user SHALL be able to set a selected text box's fill color or border
color to transparent from the canvas, without needing to issue a tool call.

#### Scenario: User clears a fill via the canvas
- **WHEN** the user selects a text box and chooses a "no fill" /
  transparent option from the canvas's styling controls
- **THEN** the object's fill color in shared deck state becomes
  `"transparent"`, and the canvas renders it with no background fill
