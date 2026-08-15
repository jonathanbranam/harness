---
name: presentation
description: Common workflows for editing the live presentation deck via the presentation_* tools (layout, resizing, styling by keyword match).
---

# Presentation Editor Skill

Use this skill when the user is working with the live presentation editor.

## Key concepts

- The editor holds multiple decks, each with an ordered list of slides.
  Exactly one deck and one slide within it are active at a time.
- The editor maintains a list of objects on the active slide (currently text
  boxes; shapes/images are future work). Object ids are unique only within
  their slide, not across the whole deck.
- Each object has an `id`, `x`, `y`, `width`, `height`, `text`, `fillColor`,
  and `fontSize`.
- The user can select objects in the browser; the current selection IDs are
  injected into context on every message (along with the active deck/slide
  identity), and also available on demand via `presentation_get_state`.
  Selection always resets to empty when the active deck or slide changes.
- Changes made by the user or by you are immediately reflected in the shared
  state and pushed to the browser canvas.

## Deck and slide management

- Use `deck_list` / `deck_create` / `deck_select` / `deck_delete` to manage
  decks. Creating a deck makes it active with one blank slide.
- Use `slide_add` / `slide_remove` / `slide_select` to manage slides within
  the active deck. Adding a slide makes it active and starts it blank.
- Confirm which deck/slide is active (via context or `presentation_get_state`)
  before editing objects by id — ids from a different slide won't match.
- Use `slide_view` to render the active slide to an image and visually check
  for layout problems (text overflowing its box, objects overlapping, sizing
  that looks wrong) that aren't obvious from bounds alone. Call it after
  making layout changes you're unsure about, not on every edit.

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
