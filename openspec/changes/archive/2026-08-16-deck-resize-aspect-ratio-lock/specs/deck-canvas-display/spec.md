## ADDED Requirements

### Requirement: Corner-handle resize can preserve aspect ratio via modifier key
While the user drags a corner resize handle of a box, ellipse, text box, or
image object, holding a designated modifier key (Shift) SHALL constrain the
object's resulting width and height to the aspect ratio it had at the start
of that drag, instead of resizing width and height independently.

#### Scenario: Resizing without the modifier held resizes each axis independently
- **WHEN** the user drags a corner resize handle without the modifier key held
- **THEN** the object's width and height each change according to the pointer's movement on that axis, unconstrained by the object's original aspect ratio

#### Scenario: Resizing with the modifier held preserves aspect ratio
- **WHEN** the user drags a corner resize handle while holding the modifier key
- **THEN** the object's resulting width and height maintain the same ratio the object had when the drag began, with the dragged corner tracking the pointer's dominant axis of movement

#### Scenario: Aspect ratio is captured at drag start
- **WHEN** the user begins a corner-handle resize drag with the modifier key held
- **THEN** the ratio preserved for the duration of that drag is the object's width-to-height ratio at the moment the drag started, not any ratio the object had earlier

#### Scenario: Pressing the modifier mid-drag starts preserving aspect ratio
- **WHEN** the user is dragging a corner resize handle without the modifier held, then presses the modifier key while still dragging
- **THEN** the object's resizing switches to aspect-ratio-preserving behavior for the remainder of that drag, using the object's width-to-height ratio at the moment the drag started

#### Scenario: Releasing the modifier mid-drag reverts to independent-axis resizing
- **WHEN** the user is dragging a corner resize handle with the modifier held, then releases the modifier key while still dragging
- **THEN** the object's resizing reverts to independent per-axis behavior for the remainder of that drag

### Requirement: Aspect-ratio constraint applies live during the drag
The aspect-ratio constraint SHALL be applied to the object's displayed size continuously as the pointer moves during the drag, not only to the size committed when the drag ends.

#### Scenario: Live visual feedback while dragging with the modifier held
- **WHEN** the user drags a corner resize handle with the modifier key held
- **THEN** the object's displayed size updates to the aspect-ratio-preserved dimensions throughout the drag, before the pointer is released

### Requirement: Aspect-ratio constraint still respects slide-bounds clamping
When an aspect-ratio-constrained resize would place the object outside the slide's bounds, the object SHALL still be clamped to the slide's bounds, even if that clamping changes the object's resulting aspect ratio away from the ratio the drag was otherwise preserving.

#### Scenario: Proportional resize pushed past the slide edge is still clamped
- **WHEN** the user drags a corner resize handle with the modifier held such that the aspect-ratio-preserved size would extend the object beyond the slide's edge
- **THEN** the object's displayed and committed size and position are clamped to the slide's bounds, the same as an unconstrained resize would be

### Requirement: Image crop-rectangle resize supports the same aspect-ratio modifier
While the user drags a corner handle of an image's crop rectangle, holding the modifier key SHALL constrain the crop rectangle's resulting width and height to its own aspect ratio at the start of that drag, independent of the image's destination box's aspect ratio.

#### Scenario: Crop-rectangle resize with the modifier held preserves the crop's own ratio
- **WHEN** the user drags a corner handle of an image's crop rectangle while holding the modifier key
- **THEN** the crop rectangle's resulting width and height maintain the width-to-height ratio the crop rectangle had when that drag began, regardless of the destination box's aspect ratio

### Requirement: Aspect-ratio modifier has no effect on endpoint-based resize
Dragging a line or arrow's endpoint SHALL be unaffected by the aspect-ratio modifier key, since those object types have no independent width/height pair to constrain a ratio between.

#### Scenario: Holding the modifier while dragging a line or arrow endpoint
- **WHEN** the user drags a line or arrow's endpoint while holding the modifier key
- **THEN** the endpoint follows the pointer exactly as it would without the modifier held
