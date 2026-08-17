## ADDED Requirements

### Requirement: Corner-handle resize keeps the anchor corner visually fixed under rotation
When the user resizes a rotated text box, image, box, or ellipse via a corner handle, the on-screen position of the opposite (anchor) corner SHALL remain fixed throughout the drag, matching the anchoring behavior already guaranteed for unrotated objects.

#### Scenario: Anchor corner stays put on screen while resizing a rotated object
- **WHEN** the user drags a corner resize handle of an object with a nonzero `rotation`
- **THEN** the on-screen position of that handle's opposite corner does not move during the drag, even though the object's stored x/y (center) changes as width and height change

#### Scenario: Unrotated resize behavior is unchanged
- **WHEN** the user drags a corner resize handle of an object with `rotation` equal to `0`
- **THEN** the anchor corner is pinned using its unrotated local x/y coordinates, exactly as before this change

#### Scenario: Anchor pinning composes with aspect-ratio lock
- **WHEN** the user drags a corner resize handle of a rotated object while holding the aspect-ratio-lock modifier key
- **THEN** the object's width and height are constrained to the ratio captured at drag start, and the anchor corner's on-screen position remains fixed for the resulting size, exactly as it would be for an unconstrained resize
