# slide-visual-inspection Specification

## Purpose

Let pi see a rendered image of the active slide, so it can catch layout problems — text overflow, overlapping objects, sizing that looks wrong — that aren't obvious from numeric bounds alone.

## Requirements

### Requirement: Render the active slide to an image
A tool SHALL render the active deck's active slide to an image and return it as image content in the tool result, reflecting that slide's objects, positions, sizes, text, and colors as of the moment the tool is called.

#### Scenario: View reflects the latest edits
- **WHEN** pi calls the slide-rendering tool after making changes to the active slide
- **THEN** the returned image reflects those changes, not a stale render from before they were made

### Requirement: Rendered image visually matches the canvas
The rendered image SHALL visually match what the browser deck canvas displays for that slide — the same object bounds, text layout/wrapping, and colors — so pi's visual read of the slide corresponds to what the user actually sees.

#### Scenario: Overflowing text is visible in the render
- **WHEN** an object's text is long enough to overflow its box on the browser canvas
- **THEN** the rendered image also shows that text overflowing the box, rather than being silently clipped or omitted

### Requirement: Rendered image is sized for model input
The rendered image SHALL be encoded in a widely-supported raster format and sized to stay within typical model image-input limits, regardless of how many objects are on the slide.

#### Scenario: Slide with many objects
- **WHEN** the active slide contains a large number of objects
- **THEN** the rendered image is still a single, reasonably sized image rather than growing unbounded with object count
