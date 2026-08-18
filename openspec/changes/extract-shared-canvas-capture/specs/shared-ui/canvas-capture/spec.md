## Purpose

`@harness/ui`'s canvas capture utility turns a live DOM node into a raster image at a fixed logical size, so any harness whose UI is a rendered canvas (slide, board, or a future equivalent) can let pi visually inspect it without each harness reimplementing the capture independently.

## ADDED Requirements

### Requirement: Capture a DOM node to a raster image at a fixed size
The capture utility SHALL render a given DOM node to a raster image at caller-specified fixed pixel dimensions, regardless of the node's current on-screen display size or any CSS transform scaling it for display.

#### Scenario: Node is displayed scaled down to fit its pane
- **WHEN** the capture utility is called on a node that is currently rendered smaller than its fixed logical size due to a scale-to-fit CSS transform
- **THEN** the resulting image reflects the node's full fixed logical dimensions, not its shrunken on-screen size

#### Scenario: Two harnesses request different fixed sizes
- **WHEN** one harness captures a node at one fixed width/height and another harness captures a different node at a different fixed width/height
- **THEN** each capture reflects the dimensions its own caller specified, independent of the other

### Requirement: Capture reflects the node's current state
The capture utility SHALL reflect the DOM node's contents as of the moment it is called, not a stale prior render.

#### Scenario: Node content changed just before capture
- **WHEN** the capture utility is called immediately after the target node's contents changed
- **THEN** the resulting image reflects the updated contents

### Requirement: Capture failure is reported, not thrown into an unhandled state
The capture utility SHALL surface a capture failure (e.g. the node is unmounted, or the underlying render fails) as a rejected promise with a descriptive error, rather than resolving with invalid image data.

#### Scenario: Target node is not mounted
- **WHEN** the capture utility is called with a reference to a node that is not currently attached to the DOM
- **THEN** the returned promise rejects with an error describing the failure, and no image data is produced
