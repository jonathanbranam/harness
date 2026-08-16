# deck-canvas-display Specification

## Purpose

Defines how the deck harness's slide canvas is visually presented in the browser — its size relative to the available editing area and browser window, and the margin/border that make the slide's boundary unambiguous — independent of the fixed logical coordinate space objects are positioned in.

## Requirements

### Requirement: Slide scales to fill the available editing area
The slide canvas SHALL be displayed at the largest size that fits entirely within the editing area (the space not occupied by the chat panel or other chrome) while preserving its aspect ratio, without requiring the user to scroll to see the whole slide.

#### Scenario: Editing area is wider than tall relative to the slide
- **WHEN** the available editing area's aspect ratio is wider than the slide's aspect ratio
- **THEN** the slide's height is scaled to fill the available vertical space and its width scales proportionally, leaving extra horizontal space on the sides

#### Scenario: Editing area is taller than wide relative to the slide
- **WHEN** the available editing area's aspect ratio is taller than the slide's aspect ratio
- **THEN** the slide's width is scaled to fill the available horizontal space and its height scales proportionally, leaving extra vertical space above and below

#### Scenario: Slide never overlaps the chat panel
- **WHEN** the slide is scaled to fit the editing area at any window size
- **THEN** no part of the scaled slide overlaps the chat panel

### Requirement: Slide rescales live as the browser window resizes
The displayed slide size SHALL track the browser window's dimensions, recalculating its scale whenever the available editing area changes size.

#### Scenario: User resizes the browser window
- **WHEN** the user resizes the browser window (or the editing area otherwise changes size, e.g. the chat panel width changes)
- **THEN** the slide's displayed size updates to remain the largest size that fits the new available area, without requiring a page reload

### Requirement: Slide coordinate space is unaffected by display scale
The slide's underlying object coordinate space SHALL remain fixed regardless of its displayed (visual) size, so object positions, sizes, and any rendering that depends on the slide's logical dimensions are unaffected by the browser window size.

#### Scenario: Objects keep their logical position across window sizes
- **WHEN** the browser window is resized, changing the slide's displayed scale
- **THEN** object x/y/width/height values in the slide's data are unchanged, and the slide's screenshot/render tooling continues to produce output at the slide's fixed logical dimensions

### Requirement: Slide is surrounded by a contrasting margin
The editing area SHALL show a visible gap on every side between the scaled slide and the edges of the editing area (and the chat panel), rendered in a background color that visibly contrasts with the slide's own background color.

#### Scenario: Margin visible on all sides at any window size
- **WHEN** the slide is displayed at any scale produced by fitting it to the editing area
- **THEN** a non-zero gap is visible between the slide and the top, bottom, and side edges of the editing area

### Requirement: Slide boundary is marked with a visible border
The slide SHALL be outlined with a border that traces its full extent, subtle enough not to distract from its content but visible enough that the slide's edge is unambiguous regardless of the slide's own background color.

#### Scenario: Slide has no background color set
- **WHEN** the slide's own background is transparent or otherwise close in color to the surrounding margin
- **THEN** the border is still visible and clearly marks where the slide ends

### Requirement: Pointer interactions remain accurate at any display scale
Dragging, resizing, and clicking objects on the slide SHALL map on-screen pointer positions to the correct logical coordinates regardless of the slide's current display scale.

#### Scenario: Dragging an object at a non-1:1 display scale
- **WHEN** the user drags an object while the slide is displayed scaled down (or up) from its logical size
- **THEN** the object moves by the amount of logical distance implied by the pointer's on-screen movement, not by the raw on-screen pixel distance

#### Scenario: Resizing an object at a non-1:1 display scale
- **WHEN** the user drags a resize handle while the slide is displayed at a non-1:1 scale
- **THEN** the object's resulting width/height reflect the logical distance implied by the pointer's on-screen movement

### Requirement: Slide background color is rendered
The canvas SHALL render the active slide's background color (or a default background when unset) filling the entire slide area beneath its objects.

#### Scenario: Slide with a custom background color
- **WHEN** the active slide has a background color set
- **THEN** the canvas renders that color across the full slide bounds, with objects drawn on top of it

#### Scenario: Slide with no background color set
- **WHEN** the active slide's background color is unset
- **THEN** the canvas renders the slide's default background

### Requirement: Objects paint in z-order
The canvas SHALL paint the active slide's objects in ascending z-order (lowest first, so higher z-order objects are drawn on top), regardless of the order objects appear in the underlying object list.

#### Scenario: Overlapping objects
- **WHEN** two objects overlap and one has a higher z-order value than the other
- **THEN** the higher z-order object is drawn on top, obscuring the overlapping portion of the lower one

#### Scenario: Z-order changes are reflected immediately
- **WHEN** an object's z-order is changed (by pi or the user)
- **THEN** the canvas re-renders with the new paint order without requiring a page reload

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
