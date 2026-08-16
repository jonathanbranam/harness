## MODIFIED Requirements

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

## ADDED Requirements

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
