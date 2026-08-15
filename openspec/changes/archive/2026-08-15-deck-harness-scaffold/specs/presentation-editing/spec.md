## Purpose

Let pi and the user collaboratively edit a single live, shared, in-memory presentation deck — pi through tools, the user through a clickable canvas — with both views always reflecting the same state.

## ADDED Requirements

### Requirement: Read current deck state
The `presentation_get_state` tool SHALL return every object in the deck (id, x, y, width, height, text, fillColor, fontSize) and the current selection.

#### Scenario: Query before making changes
- **WHEN** pi calls `presentation_get_state`
- **THEN** the tool returns the full, current list of objects and the current selection, reflecting any changes made since the deck was last read

### Requirement: Update objects
The `presentation_update` tool SHALL support the actions `setPosition` (absolute `x`/`y` or relative `dx`/`dy`), `setSize` (`width`/`height`), `setText`, `setFillColor`, `setFontSize`, and `applyGridLayout` (`direction`, optional `gap`), applied to a list of target object ids.

#### Scenario: Unknown target id
- **WHEN** `presentation_update` is called with a target id that has no matching object
- **THEN** that id is reported in the result's errors, and any other valid target ids in the same call are still updated

#### Scenario: Relative move
- **WHEN** `presentation_update` is called with `setPosition` and `dx`/`dy` instead of absolute `x`/`y`
- **THEN** the target objects move by the given offset from their current position

### Requirement: Grid layout
`applyGridLayout` SHALL lay out all target objects left-to-right (`direction: "horizontal"`) or top-to-bottom (`direction: "vertical"`), starting from the minimum current x (or y) among the targets, each subsequent object separated from the previous one by the given gap (default 24).

#### Scenario: Horizontal layout
- **WHEN** `presentation_update` is called with `applyGridLayout`, `direction: "horizontal"`, and a set of target ids
- **THEN** the targets are repositioned left-to-right in their original relative order, each starting where the previous one's bounding box plus the gap ends

### Requirement: Find objects by text
The `presentation_select_by_text` tool SHALL return the ids of objects whose text contains the given query, matching case-insensitively by default and case-sensitively when `caseSensitive: true` is passed.

#### Scenario: Case-insensitive match
- **WHEN** `presentation_select_by_text` is called with a lowercase query
- **THEN** objects whose text contains that query in any letter case are matched

### Requirement: Selection injected into every turn
Before each agent turn, the system SHALL inject a non-displayed context message describing the current deck objects and selection, so the model does not need to call `presentation_get_state` solely to learn the current selection.

#### Scenario: User changes selection mid-conversation
- **WHEN** the user selects different objects on the canvas and then sends a new prompt
- **THEN** the agent's next turn includes the updated selection in its context automatically

### Requirement: Canvas reflects live state
The browser deck canvas SHALL re-render to match the shared deck state whenever that state changes, regardless of whether the change originated from the user's own selection, another browser tab, or a pi tool call.

#### Scenario: pi moves an object
- **WHEN** pi calls `presentation_update` to move or restyle an object
- **THEN** the canvas updates to show the new position/style without the user needing to refresh

### Requirement: User selection interaction
Clicking an object on the canvas SHALL replace the selection with that object. Shift-clicking an object SHALL toggle it in or out of the existing selection. Clicking empty canvas SHALL clear the selection.

#### Scenario: Multi-select with shift-click
- **WHEN** the user clicks one object and then shift-clicks a second object
- **THEN** both objects end up selected

#### Scenario: Clear selection
- **WHEN** the user clicks an empty area of the canvas
- **THEN** the selection becomes empty
