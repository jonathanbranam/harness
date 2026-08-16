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

### Requirement: Edited object itself renders above all other slide objects while being edited
While a text box is being edited, the object SHALL render above every other object on the slide — not just its selection chrome, but the object's own content (background fill and text) — regardless of its position in the slide's stored z-order, so its content stays visible while the user edits it. The slide's stored z-order SHALL remain unchanged throughout; when editing ends, the object SHALL return to its stored z-order position.

#### Scenario: Editing an object that is behind another, overlapping object
- **WHEN** a text box that is behind another, overlapping object in z-order is double-clicked into edit mode
- **THEN** the edited text box, including its background fill and text content, renders above the overlapping object for the duration of editing

#### Scenario: Ending edit mode restores the object's original z-order
- **WHEN** the user finishes editing a text box that was temporarily brought to the front
- **THEN** the object returns to its stored position in the slide's z-order, and the slide's stored object order was never changed
