## ADDED Requirements

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
