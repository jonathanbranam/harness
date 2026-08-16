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
