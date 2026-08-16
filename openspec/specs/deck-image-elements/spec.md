# deck-image-elements Specification

## Purpose

Defines the `image` object type — its JSON representation (source reference, crop rectangle, destination size) — and the pi tools and canvas UI used to insert, crop, scale, and remove images on a slide.

## Requirements

### Requirement: Image object type discriminator
Every image placed on a slide SHALL carry `type: "image"`, distinguishing it from text boxes and shape objects.

#### Scenario: Newly created image is typed
- **WHEN** an image is added to a slide
- **THEN** the created object's `type` is `"image"`

### Requirement: Add an image
Both pi (via a dedicated tool) and the user (via the canvas) SHALL be able to add an image to the current slide, specifying its source, an initial crop rectangle (defaulting to the full source image), and a destination position/size on the slide.

#### Scenario: Agent adds an image
- **WHEN** pi calls the add-image tool with a source reference and a destination position/size
- **THEN** a new `image` object is created on the current slide with that source and destination geometry, is included in subsequent `presentation_get_state` results, and appears on the canvas

#### Scenario: User inserts an image from the canvas
- **WHEN** the user triggers image insert from the canvas and selects/uploads an image file
- **THEN** a new `image` object appears on the canvas at a default position and becomes the current selection

### Requirement: Image source reference
An image object SHALL carry a `src` field, readable via `presentation_get_state`, identifying the image's uploaded/embedded bytes independent of the object's crop or destination geometry. Both pi and the user SHALL be able to change an existing image's source.

#### Scenario: Source is stable across other edits
- **WHEN** an image's crop rectangle or destination size is changed
- **THEN** its `src` value is unchanged

#### Scenario: Agent changes an image's source
- **WHEN** pi calls the set-source action with a new source reference for an existing image object
- **THEN** that image's `src` updates in shared deck state, its crop rectangle resets to the new source's full extents, and its destination position, width, and height are all unchanged — a source change never touches the destination box, whatever the new crop's aspect ratio turns out to be (per "Cropped image content is always rendered at a single uniform scale" below)

### Requirement: Independent crop rectangle position and size
An image object SHALL carry a crop rectangle expressed in the source image's own coordinates. The crop's position (`cropX`/`cropY` — which region of the source is shown) and its size (`cropWidth`/`cropHeight` — how much of the source is captured) SHALL each be settable independently of one another, of the crop rectangle's own aspect ratio, and of the object's on-slide destination geometry, so a user can pan, resize, and reshape a crop selection without affecting where or how large the image appears on the slide.

#### Scenario: Agent sets a crop rectangle
- **WHEN** pi calls the set-crop action with a rectangle in source-image coordinates for an image object
- **THEN** the canvas renders that cropped region of the source image, fit uniformly within the object's current destination width/height per "Cropped image content is always rendered at a single uniform scale" below

#### Scenario: Agent pans the crop without changing its size
- **WHEN** pi calls the set-crop action with only `cropX` and/or `cropY` for an image object
- **THEN** the crop rectangle's position changes to show a different region of the source image, and its `cropWidth`/`cropHeight` are unchanged

#### Scenario: Agent resizes one crop dimension independently of the other
- **WHEN** pi calls the set-crop action with only `cropWidth` or only `cropHeight` for an image object
- **THEN** only that dimension changes; the other crop dimension and `cropX`/`cropY` are unchanged — the crop rectangle's aspect ratio is free to change as a result

#### Scenario: Agent sets both crop dimensions to an arbitrary aspect ratio
- **WHEN** pi calls the set-crop action with both `cropWidth` and `cropHeight` for an image object, in any ratio
- **THEN** both dimensions are set to exactly the requested values — neither is recalculated or overridden to match the other

#### Scenario: User crops interactively
- **WHEN** the user drags the crop handles on a selected image in the canvas
- **THEN** the image object's crop rectangle in shared deck state matches the dragged region — including its aspect ratio, which the drag is free to change — and the canvas immediately shows the newly cropped result

#### Scenario: Crop defaults to the full source image
- **WHEN** an image is added without an explicit crop rectangle
- **THEN** its crop rectangle covers the entire source image

### Requirement: Destination size independent of crop position and size
An image object's destination width/height (its on-slide bounding box) SHALL be settable independently of the crop rectangle's position, size, and aspect ratio; the cropped region SHALL be scaled uniformly to fit within the destination width/height (per "Cropped image content is always rendered at a single uniform scale" below), whether or not the two rectangles share an aspect ratio.

#### Scenario: Resizing the destination does not change the crop
- **WHEN** pi or the user resizes an image object on the canvas
- **THEN** its crop rectangle in shared deck state is unchanged, and the canvas re-fits the same cropped region into the new destination size

#### Scenario: Setting a destination dimension leaves the other unchanged
- **WHEN** `presentation_update`'s `setSize` is called with only `width` (or only `height`) for an image object
- **THEN** only that dimension changes; the other destination dimension is left exactly as it was — it is never recalculated from the crop's aspect ratio

#### Scenario: User drags a corner resize handle
- **WHEN** the user drags a selected image's corner resize handle
- **THEN** the image's destination width and height change independently per axis from the anchored opposite corner, the same as a `box`/`ellipse` resize — the destination box is free to end up with any aspect ratio

### Requirement: Cropped image content is always rendered at a single uniform scale
Regardless of whether an image object's crop rectangle and destination box share an aspect ratio, the cropped source content SHALL always be scaled by one factor applied equally to both axes when rendered — never stretched or squished by different amounts horizontally and vertically. When the two rectangles' aspect ratios don't match, the rendered content SHALL be fit to the *larger* size that entirely fits within the destination box (matching CSS `object-fit: contain`), centered, with the leftover space on whichever axis has slack left transparent — the render never discards any part of the selected crop to avoid that leftover space.

#### Scenario: Crop and destination share an aspect ratio
- **WHEN** an image object's crop rectangle and destination box have the same aspect ratio
- **THEN** the cropped content fills the destination box exactly, with no transparent space on either axis

#### Scenario: Crop is relatively wider than the destination box
- **WHEN** an image object's crop rectangle is wider (relative to its height) than the destination box's own aspect ratio
- **THEN** the cropped content is scaled so its full width fits the destination box's width, and transparent space appears above and below it, centered vertically

#### Scenario: Crop is relatively taller than the destination box
- **WHEN** an image object's crop rectangle is taller (relative to its width) than the destination box's own aspect ratio
- **THEN** the cropped content is scaled so its full height fits the destination box's height, and transparent space appears to either side of it, centered horizontally

### Requirement: Remove an image
Both pi and the user SHALL be able to remove an image object from the current slide by id, using the same removal mechanism as text boxes and shapes.

#### Scenario: Agent removes an image
- **WHEN** pi calls the remove action with an image's target id
- **THEN** that image no longer appears in `presentation_get_state` results or on the canvas

#### Scenario: User removes an image
- **WHEN** the user deletes a selected image from the canvas
- **THEN** that image is removed from shared deck state and disappears from every connected view

### Requirement: Images are draggable, resizable, and selectable like other objects
Image objects SHALL support the same canvas selection, drag-to-move, and independent-axis corner-resize interactions already available for text boxes and shapes. Resizing acts on the image's destination width/height, not its crop rectangle.

#### Scenario: User drags an image
- **WHEN** the user presses down on an image and drags it to a new location
- **THEN** that image's destination position in shared deck state matches the drop location
