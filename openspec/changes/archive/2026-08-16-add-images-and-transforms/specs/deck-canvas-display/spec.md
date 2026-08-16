## ADDED Requirements

### Requirement: Objects render at their set opacity
The canvas SHALL composite every object type at its individual `opacity` (0–1), independent of any other object's opacity, so an object can be partially transparent without affecting the visibility of other objects underneath or above it.

#### Scenario: Object with reduced opacity overlaps another
- **WHEN** an object with `opacity` less than 1 overlaps another object beneath it in z-order
- **THEN** the underlying object is partially visible through the overlapping region, blended according to the overlapping object's opacity

#### Scenario: Default opacity is fully opaque
- **WHEN** an object's opacity has not been explicitly set
- **THEN** the canvas renders it fully opaque

### Requirement: Bounding-box objects render rotated about their center
Text boxes, images, boxes, and ellipses SHALL render rotated by their `rotation` (degrees) about the center of their bounding box. Line and arrow objects are unaffected by `rotation` — it does not apply to those types (see `deck-shape-elements`).

#### Scenario: Object with nonzero rotation
- **WHEN** a text box, image, box, or ellipse has a nonzero `rotation`
- **THEN** the canvas renders that object's content rotated by that amount about its bounding box's center, without changing its stored x/y/width/height

#### Scenario: Default rotation is unrotated
- **WHEN** an object's rotation has not been explicitly set
- **THEN** the canvas renders it unrotated

### Requirement: Pointer interactions account for object rotation
Clicking, dragging, and resizing a rotated object (text box, image, box, or ellipse) SHALL operate against its actual rotated on-screen footprint, not its unrotated bounding box.

#### Scenario: Clicking a rotated object
- **WHEN** the user clicks within a rotated object's visually rotated footprint but outside its unrotated axis-aligned bounding box
- **THEN** that object is selected

#### Scenario: Clicking outside a rotated object's rotated footprint
- **WHEN** the user clicks within a rotated object's unrotated axis-aligned bounding box but outside its actual rotated footprint
- **THEN** that object is not selected by that click

#### Scenario: Dragging and resizing use the object's own rotated axes
- **WHEN** the user drags or resizes a selected rotated object via its handles
- **THEN** the drag/resize is interpreted along that object's own rotated axes, matching the direction the object visually points, rather than the slide's unrotated x/y axes
