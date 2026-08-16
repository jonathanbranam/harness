## ADDED Requirements

### Requirement: Slide-bounds clamping uses unrotated stored geometry
Clamping an object to the slide's bounds (on add, reposition, or resize)
SHALL be computed from the object's stored, unrotated x/y/width/height (or
endpoint-derived bounding box), regardless of that object's `rotation`. A
rotated object's visually rendered corners MAY extend beyond the slide's
0,0-960,540 bounds even though its stored geometry is fully clamped.

#### Scenario: Clamping a rotated object ignores its rotated footprint
- **WHEN** an object with a nonzero rotation is added, moved, or resized
  such that its unrotated stored bounding box lies within the slide's
  bounds
- **THEN** its stored x, y, width, and height are left as computed by the
  existing unrotated clamping rules, even if the object's rotated visual
  footprint extends past a slide edge

#### Scenario: Rotating an object does not itself trigger clamping
- **WHEN** an object's rotation is changed, with no other geometry field
  set in the same operation
- **THEN** its stored x, y, width, and height are unchanged, even if the
  resulting rotated footprint extends beyond the slide's bounds

