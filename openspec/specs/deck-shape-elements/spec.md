# deck-shape-elements Specification

## Purpose

Defines the shape object types (line, box, ellipse, arrow) that can be placed on a slide alongside text boxes — their JSON representation, line and fill styling, and the pi tools and canvas UI used to create, style, and remove them.

## Requirements

### Requirement: Object type discriminator
Every slide object SHALL carry a `type` field identifying it as one of `textBox`, `line`, `box`, `ellipse`, or `arrow`, so any consumer of deck state can distinguish which kind of object it is without inferring it from which fields are present.

#### Scenario: Existing text boxes are typed
- **WHEN** `presentation_get_state` or the canvas reads an object created before shape types existed (a text box)
- **THEN** that object's `type` is `textBox`

#### Scenario: Newly created shape is typed
- **WHEN** a line, box, ellipse, or arrow is created
- **THEN** that object's `type` matches the shape kind that was created

### Requirement: Add a line
Both pi (via a dedicated shape-creation tool) and the user (via the canvas) SHALL be able to add a straight line to the current slide, specifying its two endpoints, stroke color, and stroke thickness.

#### Scenario: Agent adds a line
- **WHEN** pi calls the add-line tool with two endpoint positions, a stroke color, and a thickness
- **THEN** a new `line` object is created on the current slide with those endpoints and style, is included in subsequent `presentation_get_state` results, and appears on the canvas

#### Scenario: User adds a line
- **WHEN** the user triggers add-line from the canvas toolbar
- **THEN** a new line appears on the canvas at a default or user-drawn position and becomes the current selection

### Requirement: Add a box
Both pi and the user SHALL be able to add a rectangular box to the current slide, specifying at minimum its position and size, with fill color, border color, border thickness, and an optional corner radius.

#### Scenario: Agent adds a box with rounded corners
- **WHEN** pi calls the add-box tool with position, size, and a nonzero corner radius
- **THEN** a new `box` object is created with that corner radius, and the canvas renders it with rounded corners

#### Scenario: Corner radius defaults to sharp corners
- **WHEN** a box is created without specifying a corner radius
- **THEN** its corner radius is 0 and the canvas renders sharp corners

### Requirement: Add an ellipse
Both pi and the user SHALL be able to add an ellipse to the current slide, specifying its bounding box position and size, fill color, and border color/thickness. A circle is an ellipse whose width and height are equal — no separate object type is needed.

#### Scenario: Agent adds a circle
- **WHEN** pi calls the add-ellipse tool with equal width and height
- **THEN** a new `ellipse` object is created that renders as a circle

#### Scenario: Agent adds a non-circular ellipse
- **WHEN** pi calls the add-ellipse tool with unequal width and height
- **THEN** a new `ellipse` object is created that renders as an oval matching that bounding box

### Requirement: Add an arrow
Both pi and the user SHALL be able to add a straight arrow to the current slide, specifying its two endpoints, stroke color, stroke thickness, and which end(s) show an arrowhead (start, end, or both).

#### Scenario: Agent adds a single-headed arrow
- **WHEN** pi calls the add-arrow tool with two endpoints and no explicit arrowhead placement
- **THEN** a new `arrow` object is created with an arrowhead at its end point only (the default)

#### Scenario: Agent adds a double-headed arrow
- **WHEN** pi calls the add-arrow tool specifying arrowheads at both ends
- **THEN** the created arrow renders an arrowhead at both endpoints

### Requirement: Remove a shape
Both pi and the user SHALL be able to remove any shape object (line, box, ellipse, or arrow) from the current slide by id, using the same removal mechanism as text boxes.

#### Scenario: Agent removes a shape
- **WHEN** pi calls the remove action with a shape's target id
- **THEN** that shape no longer appears in `presentation_get_state` results or on the canvas

#### Scenario: User removes a shape
- **WHEN** the user deletes a selected shape from the canvas
- **THEN** that shape is removed from shared deck state and disappears from every connected view

### Requirement: Line and stroke styling
Line and arrow objects SHALL support an independently settable stroke color and stroke thickness (width in logical units). Box and ellipse objects SHALL support an independently settable border color (or `"transparent"`) and border thickness, separate from their fill.

#### Scenario: Set a line's thickness
- **WHEN** pi calls a dedicated shape-styling tool (or the user adjusts it from the canvas) to set a line or arrow's stroke thickness
- **THEN** the canvas renders that line/arrow's stroke at the new width

#### Scenario: Set a box's border thickness
- **WHEN** pi or the user sets a box or ellipse's border thickness
- **THEN** the canvas renders that shape's border at the new width, independent of its fill color

### Requirement: Fill styling for closed shapes
Box and ellipse objects SHALL support a fill color or `"transparent"` (no fill), reusing the same fill semantics as text boxes.

#### Scenario: Set an ellipse's fill to transparent
- **WHEN** pi or the user sets an ellipse's fill to `"transparent"`
- **THEN** the canvas renders that ellipse with only its border visible, no background fill

### Requirement: Shapes are draggable, resizable, and selectable like text boxes
Line, box, ellipse, and arrow objects SHALL support the same canvas selection, drag-to-move, and resize-via-handles interactions already available for text boxes. For line and arrow objects, resizing means dragging one of the two endpoint handles.

#### Scenario: User drags a box
- **WHEN** the user presses down on a box and drags it to a new location
- **THEN** that box's position in shared deck state matches the drop location

#### Scenario: User resizes a line by its endpoints
- **WHEN** the user drags an endpoint handle of a selected line or arrow
- **THEN** that endpoint's position in shared deck state matches the dragged location

### Requirement: Box and ellipse support rotation
Box and ellipse objects SHALL support an independently settable `rotation`
(degrees, about the bounding box's center), rendered by the canvas per
`deck-canvas-display`'s rotation requirement.

#### Scenario: Set a box's rotation
- **WHEN** pi or the user sets a box or ellipse's rotation
- **THEN** the canvas renders that shape rotated by the new amount about
  its bounding box's center

### Requirement: All shape types support opacity
Line, box, ellipse, and arrow objects SHALL support an independently
settable `opacity` (0–1), rendered by the canvas per
`deck-canvas-display`'s opacity requirement.

#### Scenario: Set a shape's opacity
- **WHEN** pi or the user sets a line, box, ellipse, or arrow's opacity
- **THEN** the canvas renders that shape blended at the new opacity value

### Requirement: Lines and arrows do not support rotation
Line and arrow objects SHALL NOT expose a `rotation` field; their angle is
already fully expressed by their two endpoints. Attempting to set rotation
on one of these types SHALL be rejected as a type mismatch (per
`presentation-editing`'s `setRotation` action).

#### Scenario: Rotation is not a recognized field for a line or arrow
- **WHEN** `presentation_get_state` returns a line or arrow object
- **THEN** that object has no `rotation` field
