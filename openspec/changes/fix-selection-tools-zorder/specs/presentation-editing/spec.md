## ADDED Requirements

### Requirement: Selection chrome renders above all slide objects
The selection outline and resize handles for a selected object SHALL be visually rendered above every object on the slide, regardless of the selected object's position in the slide's z-order (stacking order).

#### Scenario: Selected object is behind an overlapping object
- **WHEN** an object that is behind another, overlapping object in z-order is selected
- **THEN** the selection outline and resize handles are fully visible over the overlapping region, not obscured by the object in front

#### Scenario: Selected object is already frontmost
- **WHEN** an object that is already frontmost in z-order is selected
- **THEN** the selection outline and resize handles render above it exactly as before, with no visible change in behavior

### Requirement: Floating format toolbar renders above all slide objects
While a text box is being edited, its floating format toolbar SHALL be visually rendered above every object on the slide, regardless of the edited object's position in the slide's z-order.

#### Scenario: Edited object is behind an overlapping object
- **WHEN** a text box that is behind another, overlapping object in z-order is double-clicked into edit mode
- **THEN** the floating format toolbar is fully visible and clickable, not obscured by the overlapping object
