---
name: presentation
description: Common workflows for editing the live presentation deck via the presentation_* tools (layout, resizing, styling by keyword match).
---

# Presentation Editor Skill

Use this skill when the user is working with the live presentation editor.

## Key concepts

- The editor maintains a list of objects (currently text boxes; shapes/images
  are future work).
- Each object has an `id`, `x`, `y`, `width`, `height`, `text`, `fillColor`,
  and `fontSize`.
- The user can select objects in the browser; the current selection IDs are
  injected into context on every message, and also available on demand via
  `presentation_get_state`.
- Changes made by the user or by you are immediately reflected in the shared
  state and pushed to the browser canvas.

## Common patterns

### Lay out selected objects horizontally

1. Get current state to confirm selection.
2. Call `presentation_update` with action `applyGridLayout`, direction
   `"horizontal"`, optional `gap`.

### Resize font to fit text inside a box

1. Get the text and bounds of the selected text box via
   `presentation_get_state`.
2. Call `presentation_update` with action `setFontSize`, passing a smaller
   font size until the text fits.
   - You may need to iterate 2-3 times, checking bounds after each change.

### Highlight text blocks containing a keyword

1. Call `presentation_select_by_text` with the keyword to get matching IDs.
2. Call `presentation_update` with action `setFillColor` and a color for
   each match.

## Safety

- Only modify objects the user has selected or explicitly referenced.
- Prefer `applyGridLayout` over manual position calculations.
