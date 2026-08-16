## Purpose

Defines the `image` object type — its JSON representation (source reference, crop rectangle, destination size) — and the pi tools and canvas UI used to insert, crop, scale, and remove images on a slide.

## ADDED Requirements

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
- **THEN** that image's `src` updates in shared deck state, its crop rectangle resets to the new source's full extents, its destination position and width are unchanged, and its destination height is recalculated from that width and the new crop's aspect ratio (per "Image edits never change the rendered aspect ratio" below)

### Requirement: Independent crop rectangle position and zoom
An image object SHALL carry a crop rectangle expressed in the source image's own coordinates. The crop's position (`cropX`/`cropY` — which region of the source is shown) SHALL be settable independently of its size (`cropWidth`/`cropHeight` — how much of the source is captured, i.e. zoom), and both SHALL be independent of the object's on-slide destination position, so a user can pan and zoom into a source image without affecting where it appears on the slide.

#### Scenario: Agent sets a crop rectangle
- **WHEN** pi calls the set-crop action with a rectangle in source-image coordinates for an image object
- **THEN** the canvas renders only that cropped region of the source image, scaled to fit the object's current destination width/height

#### Scenario: Agent pans the crop without changing zoom
- **WHEN** pi calls the set-crop action with only `cropX` and/or `cropY` for an image object
- **THEN** the crop rectangle's position changes to show a different region of the source image, and its `cropWidth`/`cropHeight` (and so the destination width/height, per the aspect-ratio requirement below) are unchanged

#### Scenario: Agent zooms without changing pan position
- **WHEN** pi calls the set-crop action with only `cropWidth` or only `cropHeight` for an image object
- **THEN** the crop rectangle's size changes (a smaller crop zooms in, a larger crop zooms out, up to the full source image), its `cropX`/`cropY` are unchanged, and the other crop dimension is recalculated to preserve the crop rectangle's aspect ratio

#### Scenario: User crops interactively
- **WHEN** the user drags the crop handles on a selected image in the canvas
- **THEN** the image object's crop rectangle in shared deck state matches the dragged region, and the canvas immediately shows the newly cropped result

#### Scenario: Crop defaults to the full source image
- **WHEN** an image is added without an explicit crop rectangle
- **THEN** its crop rectangle covers the entire source image

### Requirement: Destination size independent of crop position
An image object's destination width/height (its on-slide bounding box) SHALL be settable independently of the crop rectangle's position and size; the cropped region SHALL be scaled uniformly to fill the destination width/height.

#### Scenario: Resizing the destination does not change the crop
- **WHEN** pi or the user resizes an image object on the canvas
- **THEN** its crop rectangle in shared deck state is unchanged, and the canvas scales the same cropped region to the new size

### Requirement: Image edits never change the rendered aspect ratio
An image object's destination width/height SHALL always be proportional to its crop rectangle's `cropWidth`/`cropHeight` (the same aspect ratio), so the image is always scaled uniformly and never appears stretched or squished. No pi tool call or canvas interaction SHALL be able to produce a destination size or crop size that breaks this proportionality — the system, not the caller, is responsible for maintaining it.

#### Scenario: Setting only a destination width scales height to match
- **WHEN** `presentation_update`'s `setSize` is called with only `width` for an image object
- **THEN** the object's height is recalculated to preserve the current crop's aspect ratio, and its width matches the requested value

#### Scenario: Setting both destination width and height derives height from width
- **WHEN** `setSize` is called with both `width` and `height` for an image object, and the two values don't share the crop's aspect ratio
- **THEN** the object's width is set to the requested value and its height is recalculated from the crop's aspect ratio, ignoring the requested height

#### Scenario: User drags a corner resize handle
- **WHEN** the user drags a selected image's corner resize handle
- **THEN** the image's destination width and height both change proportionally from the anchored opposite corner, so the image is never visibly stretched or squished during the drag

### Requirement: Remove an image
Both pi and the user SHALL be able to remove an image object from the current slide by id, using the same removal mechanism as text boxes and shapes.

#### Scenario: Agent removes an image
- **WHEN** pi calls the remove action with an image's target id
- **THEN** that image no longer appears in `presentation_get_state` results or on the canvas

#### Scenario: User removes an image
- **WHEN** the user deletes a selected image from the canvas
- **THEN** that image is removed from shared deck state and disappears from every connected view

### Requirement: Images are draggable, resizable, and selectable like other objects
Image objects SHALL support the same canvas selection and drag-to-move interactions already available for text boxes and shapes. Resizing acts on the image's destination width/height, not its crop rectangle, and is proportionally constrained per "Image edits never change the rendered aspect ratio" above rather than the free independent-axis resize `box`/`ellipse` use.

#### Scenario: User drags an image
- **WHEN** the user presses down on an image and drags it to a new location
- **THEN** that image's destination position in shared deck state matches the drop location
