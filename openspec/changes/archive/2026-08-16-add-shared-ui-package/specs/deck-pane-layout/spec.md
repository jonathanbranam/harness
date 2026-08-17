## Purpose

Defines resizable, focusable pane layout for the deck harness's canvas and chat panes, so a user can widen, minimize, or maximize either instead of being stuck with a fixed-width split.

## ADDED Requirements

### Requirement: Draggable pane resize
The deck page SHALL let the user resize the canvas and chat panes by dragging a handle on the border between them.

#### Scenario: User drags the resize handle
- **WHEN** the user presses and drags the handle between the canvas pane and the chat pane
- **THEN** the pane on each side of the handle grows or shrinks continuously to track the pointer, and both panes remain at least their minimum width

### Requirement: Default pane widths
The canvas pane SHALL default to a wider width than the chat pane on initial load.

#### Scenario: Fresh page load
- **WHEN** the deck page loads with no prior layout adjustment in the session
- **THEN** the canvas pane occupies more horizontal space than the chat pane

### Requirement: Pane maximize
Each pane SHALL offer a maximize control that expands it to take the space freed by minimizing the other pane.

#### Scenario: User maximizes the chat pane
- **WHEN** the user clicks the maximize control on the chat pane
- **THEN** the chat pane expands to fill the freed space and the canvas pane collapses to its minimized rail

### Requirement: Pane minimize
Each pane SHALL offer a minimize control that collapses it to a narrow vertical rail showing its rotated title and restore/maximize controls, redistributing its freed width to the other pane.

#### Scenario: User minimizes the chat pane
- **WHEN** the user clicks the minimize control on the chat pane
- **THEN** the chat pane collapses to a narrow rail with a 90°-rotated title, and the canvas pane grows to fill the freed width

### Requirement: Pane restore
Each pane SHALL offer a restore control that returns it to its last explicit (non-minimized, non-maximized) width.

#### Scenario: User restores a maximized or minimized pane
- **WHEN** the user clicks restore on a pane that is currently maximized or minimized
- **THEN** the pane returns to the width it had before it was last maximized or minimized, and the other pane returns to a width consistent with that pane no longer being maximized or minimized
