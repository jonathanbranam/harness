## Purpose

Let pi and the user collaboratively edit a single live, shared, in-memory presentation deck — pi through tools, the user through a clickable canvas — with both views always reflecting the same state.

## Requirements

### Requirement: Read current deck state
The `presentation_get_state` tool SHALL return the objects of the active
deck's active slide (id, type, x, y, width, height, zIndex, and
type-specific fields — `text`, `fillColor`, `borderColor`, `fontColor`,
`fontSize` for `textBox`; stroke/fill/geometry fields for shape types), the
active slide's background color, the current selection scoped to that
slide, and the identities of the active deck and active slide. Any color
field (fill, border, or stroke) is either a color value or the literal
`"transparent"`.

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

#### Scenario: Object type and z-order reported
- **WHEN** `presentation_get_state` is called on a slide containing text
  boxes and shapes at different stacking positions
- **THEN** each returned object includes its `type` and its `zIndex`,
  matching the slide's current paint order

#### Scenario: Slide background color reported
- **WHEN** `presentation_get_state` is called
- **THEN** the result includes the active slide's current background color
  (or its default if unset)

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

### Requirement: Grid layout
`applyGridLayout` SHALL lay out all target objects left-to-right (`direction: "horizontal"`) or top-to-bottom (`direction: "vertical"`), starting from the minimum current x (or y) among the targets, each subsequent object separated from the previous one by the given gap (default 24).

#### Scenario: Horizontal layout
- **WHEN** `presentation_update` is called with `applyGridLayout`, `direction: "horizontal"`, and a set of target ids
- **THEN** the targets are repositioned left-to-right in their original relative order, each starting where the previous one's bounding box plus the gap ends

### Requirement: Set an object's z-order
The system SHALL let pi and the user change an object's stacking position
on the active slide: an explicit z-order value, or a relative
bring-forward / send-backward / bring-to-front / send-to-back operation,
applied to one or more target object ids. This applies to every object
type, including text boxes and the new shape types.

#### Scenario: Agent brings an object to front
- **WHEN** pi calls the z-order action with `bringToFront` for a target
  object id
- **THEN** that object's `zIndex` becomes higher than every other object on
  the slide, and the canvas immediately reflects it drawing on top

#### Scenario: Agent sends an object backward one step
- **WHEN** pi calls the z-order action with `sendBackward` for a target
  object id
- **THEN** that object's `zIndex` moves below the object immediately above
  it in paint order, without changing the relative order of any other
  objects

#### Scenario: User moves the selection forward via the toolbar
- **WHEN** the user selects an object and clicks the toolbar's "bring
  forward" control
- **THEN** that object's `zIndex` increases by one paint position, and the
  canvas updates immediately

#### Scenario: User moves the selection backward via the toolbar
- **WHEN** the user selects an object and clicks the toolbar's "send
  backward" control
- **THEN** that object's `zIndex` decreases by one paint position, and the
  canvas updates immediately

### Requirement: Set slide background color
Both pi (via a tool) and the user (via the canvas UI) SHALL be able to set
the active slide's background color to a specific color or clear it back
to the default.

#### Scenario: Agent sets the slide background
- **WHEN** pi calls the set-background-color action with a color value for
  the active slide
- **THEN** the active slide's background color is updated in shared deck
  state, and the canvas renders the new color

#### Scenario: User sets the slide background from the canvas
- **WHEN** the user chooses a background color from the canvas's
  slide-styling controls
- **THEN** the active slide's background color updates in shared deck
  state and every connected view reflects it

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

### Requirement: Selection injected into every turn
Before each agent turn, the system SHALL inject a non-displayed context message describing the active deck and active slide's identity, that slide's objects, and the current selection, so the model does not need to call `presentation_get_state` solely to learn this.

#### Scenario: User changes selection mid-conversation
- **WHEN** the user selects different objects on the canvas and then sends a new prompt
- **THEN** the agent's next turn includes the updated selection in its context automatically

#### Scenario: User switches slides mid-conversation
- **WHEN** the user (or pi) switches the active slide and then a new prompt is sent
- **THEN** the agent's next turn context reflects the newly active slide's objects, not the previous slide's

### Requirement: Canvas reflects live state
The browser deck canvas SHALL re-render to match the active deck's active slide whenever that state changes — whether from the user's own selection, another browser tab, a pi tool call, or the active deck/slide itself changing.

#### Scenario: pi moves an object
- **WHEN** pi calls `presentation_update` to move or restyle an object on the active slide
- **THEN** the canvas updates to show the new position/style without the user needing to refresh

#### Scenario: Active slide changes
- **WHEN** the active deck or active slide changes (by either the user or pi)
- **THEN** the canvas re-renders to show the newly active slide's objects

### Requirement: User selection interaction
Clicking an object on the canvas SHALL replace the selection with that object. Shift-clicking an object SHALL toggle it in or out of the existing selection. Clicking anywhere on the canvas that is not an object — including the slide's own background, not just the margin around it — SHALL clear the selection. Clicks outside the canvas (e.g. in the chat panel or other UI chrome) SHALL NOT affect the selection.

#### Scenario: Multi-select with shift-click
- **WHEN** the user clicks one object and then shift-clicks a second object
- **THEN** both objects end up selected

#### Scenario: Clear selection
- **WHEN** the user clicks an empty area of the canvas outside the slide
- **THEN** the selection becomes empty

#### Scenario: Clicking the slide background clears selection
- **WHEN** one or more objects are selected and the user clicks the slide's own background (inside the slide bounds, but not on any object)
- **THEN** the selection becomes empty

#### Scenario: Clicking outside the canvas does not affect selection
- **WHEN** one or more objects are selected and the user clicks in the chat panel or other UI chrome outside the canvas
- **THEN** the selection is unchanged

### Requirement: Selection resets when the active slide changes
Because object ids are scoped to the slide they belong to, the current selection SHALL be cleared whenever the active deck or active slide changes.

#### Scenario: Switching slides clears the old selection
- **WHEN** one or more objects are selected on the current slide and the active slide is then changed
- **THEN** the selection on the newly active slide starts empty, rather than carrying over ids from the previous slide

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

### Requirement: Selection chrome renders above all slide objects
The selection outline and resize handles for a selected object SHALL be visually rendered above every object on the slide, regardless of the selected object's position in the slide's z-order (stacking order).

#### Scenario: Selected object is behind an overlapping object
- **WHEN** an object that is behind another, overlapping object in z-order is selected
- **THEN** the selection outline and resize handles are fully visible over the overlapping region, not obscured by the object in front

#### Scenario: Selected object is already frontmost
- **WHEN** an object that is already frontmost in z-order is selected
- **THEN** the selection outline and resize handles render above it exactly as before, with no visible change in behavior

### Requirement: Floating format toolbar renders above all slide objects
While a text box is being edited, its floating format toolbar SHALL be visually rendered above every object on the slide, regardless of the edited object's position in the slide's z-order.

#### Scenario: Edited object is behind an overlapping object
- **WHEN** a text box that is behind another, overlapping object in z-order is double-clicked into edit mode
- **THEN** the floating format toolbar is fully visible and clickable, not obscured by the overlapping object

### Requirement: Edited object itself renders above all other slide objects while being edited
While a text box is being edited, the object SHALL render above every other object on the slide — not just its selection chrome, but the object's own content (background fill and text) — regardless of its position in the slide's stored z-order, so its content stays visible while the user edits it. The slide's stored z-order SHALL remain unchanged throughout; when editing ends, the object SHALL return to its stored z-order position.

#### Scenario: Editing an object that is behind another, overlapping object
- **WHEN** a text box that is behind another, overlapping object in z-order is double-clicked into edit mode
- **THEN** the edited text box, including its background fill and text content, renders above the overlapping object for the duration of editing

#### Scenario: Ending edit mode restores the object's original z-order
- **WHEN** the user finishes editing a text box that was temporarily brought to the front
- **THEN** the object returns to its stored position in the slide's z-order, and the slide's stored object order was never changed
