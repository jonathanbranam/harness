## Purpose

`@harness/ui`'s pane-management system gives any harness a resizable, focusable multi-pane layout — drag-to-resize, minimize, maximize, and restore, generalized to any ordered set of panes a harness configures — instead of each harness building its own.

## ADDED Requirements

### Requirement: Draggable pane resize
The pane layout SHALL let the user resize adjacent panes by dragging a handle on the border between them.

#### Scenario: User drags the resize handle
- **WHEN** the user presses and drags the handle between two panes
- **THEN** the pane on each side of the handle grows or shrinks continuously to track the pointer, and both panes remain at least their minimum width

### Requirement: Configurable default pane sizes
Each pane's default size SHALL be independently configurable by the harness embedding the pane layout.

#### Scenario: Harness configures default sizes
- **WHEN** a harness renders the pane layout with a set of pane IDs and per-pane default sizes
- **THEN** the layout uses those configured sizes on initial load, without the pane-management system hardcoding a specific relationship between panes

### Requirement: Pane maximize
Each pane SHALL offer a maximize control that expands it to take the space freed by minimizing every other currently-visible pane.

#### Scenario: User maximizes a pane
- **WHEN** the user clicks the maximize control on a pane while other panes are visible
- **THEN** that pane expands to fill the freed space and every other pane collapses to its minimized rail

### Requirement: Pane minimize
Each pane SHALL offer a minimize control that collapses it to a narrow vertical rail showing its rotated title and restore/maximize controls, redistributing its freed width across the remaining visible panes.

#### Scenario: User minimizes a pane
- **WHEN** the user clicks the minimize control on a pane
- **THEN** that pane collapses to a narrow rail with a 90°-rotated title, and the freed width is distributed across the other currently-visible panes

#### Scenario: Minimized pane still identifiable
- **WHEN** a pane is minimized
- **THEN** its rail shows enough of its title to identify which pane it is, plus restore and maximize controls

### Requirement: Pane restore
Each pane SHALL offer a restore control that returns it to its last explicit (non-minimized, non-maximized) size.

#### Scenario: User restores a maximized or minimized pane
- **WHEN** the user clicks restore on a pane that is currently maximized or minimized
- **THEN** the pane returns to the size it had before it was last maximized or minimized, and other panes return to sizes consistent with that pane no longer being maximized or minimized

### Requirement: Generalized to more than two panes
The maximize/minimize/restore and freed-size redistribution mechanism SHALL NOT assume exactly two panes are present.

#### Scenario: A harness configures more than two panes
- **WHEN** a harness renders the pane layout with more than two panes visible
- **THEN** minimizing or maximizing any one of them redistributes freed or reclaimed size across all other currently-visible panes, not a single hardcoded sibling
