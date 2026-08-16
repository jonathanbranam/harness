## ADDED Requirements

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
