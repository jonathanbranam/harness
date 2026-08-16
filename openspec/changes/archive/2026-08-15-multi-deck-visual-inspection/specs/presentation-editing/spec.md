## MODIFIED Requirements

### Requirement: Read current deck state
The `presentation_get_state` tool SHALL return the objects of the active deck's active slide (id, x, y, width, height, text, fillColor, fontSize), the current selection scoped to that slide, and the identities of the active deck and active slide.

#### Scenario: Query before making changes
- **WHEN** pi calls `presentation_get_state`
- **THEN** the tool returns the active slide's current list of objects and selection, reflecting any changes made since the slide was last read

#### Scenario: Query reflects the active slide only
- **WHEN** the active deck has more than one slide and pi calls `presentation_get_state`
- **THEN** the tool returns only the active slide's objects, not objects from the deck's other slides

### Requirement: Update objects
The `presentation_update` tool SHALL support the actions `setPosition` (absolute `x`/`y` or relative `dx`/`dy`), `setSize` (`width`/`height`), `setText`, `setFillColor`, `setFontSize`, and `applyGridLayout` (`direction`, optional `gap`), applied to a list of target object ids on the active deck's active slide. Object ids are scoped to the slide they belong to, not globally unique across the deck.

#### Scenario: Unknown target id
- **WHEN** `presentation_update` is called with a target id that has no matching object on the active slide
- **THEN** that id is reported in the result's errors, and any other valid target ids in the same call are still updated

#### Scenario: Relative move
- **WHEN** `presentation_update` is called with `setPosition` and `dx`/`dy` instead of absolute `x`/`y`
- **THEN** the target objects move by the given offset from their current position

#### Scenario: Target id from a different slide
- **WHEN** `presentation_update` is called with a target id that exists on a slide other than the active one
- **THEN** that id is treated as unknown and reported in the result's errors

### Requirement: Find objects by text
The `presentation_select_by_text` tool SHALL return the ids of objects on the active deck's active slide whose text contains the given query, matching case-insensitively by default and case-sensitively when `caseSensitive: true` is passed.

#### Scenario: Case-insensitive match
- **WHEN** `presentation_select_by_text` is called with a lowercase query
- **THEN** objects on the active slide whose text contains that query in any letter case are matched

#### Scenario: Matches are scoped to the active slide
- **WHEN** an object on a different slide (or a different deck) contains matching text
- **THEN** that object's id is not included in the result

### Requirement: Selection injected into every turn
Before each agent turn, the system SHALL inject a non-displayed context message describing the active deck and active slide's identity, that slide's objects, and the current selection, so the model does not need to call `presentation_get_state` solely to learn this.

#### Scenario: User changes selection mid-conversation
- **WHEN** the user selects different objects on the canvas and then sends a new prompt
- **THEN** the agent's next turn includes the updated selection in its context automatically

#### Scenario: User switches slides mid-conversation
- **WHEN** the user (or pi) switches the active slide and then a new prompt is sent
- **THEN** the agent's next turn context reflects the newly active slide's objects, not the previous slide's

### Requirement: Canvas reflects live state
The browser deck canvas SHALL re-render to match the active deck's active slide whenever that state changes — whether from the user's own selection, another browser tab, a pi tool call, or the active deck/slide itself changing.

#### Scenario: pi moves an object
- **WHEN** pi calls `presentation_update` to move or restyle an object on the active slide
- **THEN** the canvas updates to show the new position/style without the user needing to refresh

#### Scenario: Active slide changes
- **WHEN** the active deck or active slide changes (by either the user or pi)
- **THEN** the canvas re-renders to show the newly active slide's objects

## ADDED Requirements

### Requirement: Selection resets when the active slide changes
Because object ids are scoped to the slide they belong to, the current selection SHALL be cleared whenever the active deck or active slide changes.

#### Scenario: Switching slides clears the old selection
- **WHEN** one or more objects are selected on the current slide and the active slide is then changed
- **THEN** the selection on the newly active slide starts empty, rather than carrying over ids from the previous slide
