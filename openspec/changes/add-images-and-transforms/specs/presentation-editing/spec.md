## MODIFIED Requirements

### Requirement: Read current deck state
The `presentation_get_state` tool SHALL return the objects of the active
deck's active slide (id, type, x, y, width, height, zIndex, opacity, and —
for bounding-box types `textBox`, `image`, `box`, `ellipse` — rotation,
plus type-specific fields — `text`, `fillColor`, `borderColor`,
`fontColor`, `fontSize` for `textBox`; stroke/fill/geometry fields for
shape types; source/crop/destination fields for `image`), the active
slide's background color, the current selection scoped to that slide, and
the identities of the active deck and active slide. Any color field (fill,
border, or stroke) is either a color value or the literal `"transparent"`.

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

#### Scenario: Opacity and rotation reported
- **WHEN** `presentation_get_state` is called on a slide containing objects
  with non-default opacity or rotation
- **THEN** each returned object includes its current `opacity`, and, for
  bounding-box types, its current `rotation`

### Requirement: Update objects
The `presentation_update` tool SHALL support the actions `setPosition`
(absolute `x`/`y` or relative `dx`/`dy`), `setSize` (`width`/`height`),
`setText`, `setFillColor` (a color value or `"transparent"`), `setFontColor`,
`setBorderColor` (a color value or `"transparent"`), `setFontSize`,
`setOpacity` (0–1, any object type), `setRotation` (degrees,
bounding-box types only — `textBox`, `image`, `box`, `ellipse`), and
`applyGridLayout` (`direction`, optional `gap`), applied to a list of
target object ids on the active deck's active slide. Object ids are scoped
to the slide they belong to, not globally unique across the deck.

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

#### Scenario: Set an object's opacity
- **WHEN** `presentation_update` is called with `setOpacity` and a value
  between 0 and 1 for a target object
- **THEN** that object's opacity in shared deck state is updated, and the
  canvas renders it blended accordingly

#### Scenario: Set a bounding-box object's rotation
- **WHEN** `presentation_update` is called with `setRotation` and a degree
  value for a target text box, image, box, or ellipse
- **THEN** that object's rotation in shared deck state is updated, and the
  canvas renders it rotated about its bounding box's center

#### Scenario: Rotation does not apply to lines or arrows
- **WHEN** `presentation_update` is called with `setRotation` for a target
  line or arrow object
- **THEN** that target id is reported in the result's errors, and its
  endpoints are unchanged
