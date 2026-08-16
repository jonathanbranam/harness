# deck-object-bounds Specification

## Purpose

Defines the constraints that keep every object on a slide fully within the slide's fixed logical bounds (0,0 to 960,540), applied consistently whether the object is placed/moved/resized by the user in the editor UI or by an agent tool call.

## Requirements

### Requirement: Added objects are placed within slide bounds
When a new object is added to a slide, its resulting position and size SHALL be clamped so the object lies entirely within the slide's 0,0 to 960,540 bounds.

#### Scenario: Adding an object at coordinates beyond the slide edge
- **WHEN** an object is added with x/y/width/height that would place any part of it outside the slide's 0,0-960,540 bounds
- **THEN** the object's stored x, y, width, and height are adjusted so the object lies entirely within those bounds

#### Scenario: Adding an object that fits entirely within bounds
- **WHEN** an object is added with x/y/width/height that already lies entirely within the slide's bounds
- **THEN** the object's stored x, y, width, and height are unchanged

### Requirement: Repositioning an object keeps it within slide bounds
When an object's position is set (directly or via a relative offset), its resulting position SHALL be clamped so the object, at its current size, lies entirely within the slide's 0,0 to 960,540 bounds.

#### Scenario: Moving an object past the slide edge
- **WHEN** an object's position is set such that, combined with its current width and height, any part of it would lie outside the slide's bounds
- **THEN** the object's stored x and y are adjusted so the object lies entirely within those bounds, without changing its width or height

#### Scenario: Moving an object to a position fully within bounds
- **WHEN** an object's position is set to a location where it lies entirely within the slide's bounds
- **THEN** the object's stored x and y match the requested position exactly

### Requirement: Resizing an object keeps it within slide bounds
When an object's size is set, its resulting size and position SHALL be clamped so the object lies entirely within the slide's 0,0 to 960,540 bounds.

#### Scenario: Growing an object past the slide edge
- **WHEN** an object's width or height is set such that, combined with its current position, any part of it would extend outside the slide's bounds
- **THEN** the object's stored width, height, x, and y are adjusted so the object lies entirely within those bounds

#### Scenario: Requesting a size larger than the slide itself
- **WHEN** an object's width or height is set to a value larger than the slide's corresponding dimension (960 or 540)
- **THEN** the object's stored width or height is clamped to that slide dimension

### Requirement: Dragging an object in the editor stops at the slide edge
While a user drags an object in the slide canvas, the object's displayed position SHALL be constrained to the slide's bounds for the duration of the drag, matching the bounds enforced when the move is committed.

#### Scenario: Dragging an object toward and past the slide edge
- **WHEN** the user drags an object such that the pointer moves it toward and beyond a slide edge
- **THEN** the object's displayed position stops at the slide edge and does not visually move further in that direction, even while the pointer continues moving past it

### Requirement: Resizing an object in the editor stops at the slide edge
While a user resizes an object in the slide canvas via a resize handle, the object's displayed size and position SHALL be constrained to the slide's bounds for the duration of the resize, matching the bounds enforced when the resize is committed.

#### Scenario: Resizing an object past the slide edge
- **WHEN** the user drags a resize handle such that the object would grow or shift beyond a slide edge
- **THEN** the object's displayed edge on that side stops at the slide boundary and does not visually extend further, even while the pointer continues moving past it

### Requirement: Pre-existing off-canvas objects are left unchanged until touched
Objects that already lie partially or fully outside the slide's bounds (for example, from before this constraint existed) SHALL NOT be automatically repositioned or resized by this constraint; clamping only applies when that object's position or size is next set.

#### Scenario: Loading a slide with an object already outside slide bounds
- **WHEN** a slide is loaded whose stored object data places an object partially or fully outside the slide's 0,0-960,540 bounds
- **THEN** that object's stored position and size are left unchanged until its position or size is explicitly set again
