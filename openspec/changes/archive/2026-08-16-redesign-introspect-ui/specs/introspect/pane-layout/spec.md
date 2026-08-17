## Purpose

Defines resizable, focusable pane layout for the introspect harness's multi-pane UI (chat and apparatus today, with room for more panes later), so a user can widen, minimize, or maximize any pane instead of being stuck with a fixed split.

## ADDED Requirements

### Requirement: Draggable pane resize
The pane layout SHALL let the user resize adjacent panes by dragging a handle on the border between them.

#### Scenario: User drags the resize handle
- **WHEN** the user presses and drags the handle between two panes
- **THEN** the pane on each side of the handle grows or shrinks continuously to track the pointer, and both panes remain at least their minimum width

### Requirement: Default pane widths
The chat pane SHALL default to a wider width than the apparatus pane on initial load.

#### Scenario: Fresh page load
- **WHEN** the introspect page loads with no prior layout adjustment in the session
- **THEN** the chat pane occupies more horizontal space than the apparatus pane

### Requirement: Pane maximize
Each pane SHALL offer a maximize control that expands it to take the space freed by minimizing every other currently-visible pane.

#### Scenario: User maximizes the apparatus pane
- **WHEN** the user clicks the maximize control on the apparatus pane while other panes are visible
- **THEN** the apparatus pane expands to fill the freed space and every other pane collapses to its minimized rail

### Requirement: Pane minimize
Each pane SHALL offer a minimize control that collapses it to a narrow vertical rail showing its rotated title and restore/maximize controls, redistributing its freed width across the remaining visible panes.

#### Scenario: User minimizes a pane
- **WHEN** the user clicks the minimize control on a pane
- **THEN** that pane collapses to a narrow rail with a 90°-rotated title, and the freed width is distributed across the other currently-visible panes

#### Scenario: Minimized pane still identifiable
- **WHEN** a pane is minimized
- **THEN** its rail shows enough of its title to identify which pane it is, plus restore and maximize controls

### Requirement: Pane restore
Each pane SHALL offer a restore control that returns it to its last explicit (non-minimized, non-maximized) width.

#### Scenario: User restores a maximized or minimized pane
- **WHEN** the user clicks restore on a pane that is currently maximized or minimized
- **THEN** the pane returns to the width it had before it was last maximized or minimized, and other panes return to widths consistent with that pane no longer being maximized or minimized

### Requirement: Generalized to more than two panes
The maximize/minimize/restore and freed-width redistribution mechanism SHALL NOT assume exactly two panes are present.

#### Scenario: A third pane is added later
- **WHEN** more than two panes are visible in the layout
- **THEN** minimizing or maximizing any one of them redistributes freed or reclaimed width across all other currently-visible panes, not a single hardcoded sibling
