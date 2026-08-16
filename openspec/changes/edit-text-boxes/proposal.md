## Why

Today a deck object is a fixed-position rectangle with a single plain-text
string, one fill color, and one font size — moved, resized, or restyled only
by pi calling `presentation_update`, never by the user directly on the
canvas. To make the deck canvas a real editing surface, the user needs to
move and resize text boxes by hand, edit their text in place, and apply the
same kind of formatting (bold, italics, lists, colors) that pi can already
apply programmatically. Both actors need to reach every capability through
their own interface — pi through tools, the user through the canvas — while
staying on the single shared deck state this project's collaborative-editing
model depends on.

## What Changes

- Add pointer-driven move (drag) and resize (handles) for text boxes directly
  on the canvas, in addition to the existing `setPosition`/`setSize` tool
  actions.
- Add in-place text editing on the canvas (click/double-click into a text
  box to type), in addition to the existing `setText` tool action.
- **BREAKING**: Replace the plain-string `text` field on a deck object with a
  structured rich-text representation (styled runs/spans within a single
  paragraph flow) so bold, italic, and font-size can vary within a text
  box's content, and bullet/numbered lists can be represented. Existing
  plain-text decks are migrated to a single unstyled run on load.
- Add bold and italic character-level formatting, applicable to a selected
  text range (canvas) or to structured spans (tool call).
- Add bullet-list and numbered-list block formatting for text box content.
- Extend per-object styling: font color, line/border color, and fill color —
  each of the latter two independently settable to a specific color or to
  transparent (no border / no fill).
- Add add-text-box and remove-text-box operations, usable both from the
  canvas (toolbar/keyboard) and via a new `presentation_update` action (or
  sibling tool), extending the deck object model beyond edit-only.
- Extend the `presentation_update` tool's action set to cover all of the
  above (rich-text edits, list formatting, border/font color, transparency,
  add/remove object) so pi has full parity with what the user can do on the
  canvas.
- Extend `presentation_get_state` to report the new structured text and
  style fields so pi can read back the full styled state it (or the user)
  produced.

## Capabilities

### New Capabilities
- `text-formatting`: structured rich text within a text box — bold, italic,
  bullet lists, numbered lists — applicable by both pi (tool calls) and the
  user (canvas selection + toolbar), and rendered consistently on the
  canvas.

### Modified Capabilities
- `presentation-editing`: deck objects gain add/remove operations, user-driven
  drag-move and resize-handle interaction on the canvas, in-place text
  editing on the canvas, and new per-object style fields (font color,
  border/line color, transparent fill) settable by both pi and the user; the
  object model's `text` field changes from a plain string to a structured
  rich-text representation shared with `text-formatting`.

## Impact

- **Server**: `deck-harness-server/src/editor-state.ts` (`DeckObject` shape,
  `UpdateAction` union, `EditorStore.applyUpdate`) — object model changes and
  new add/remove/style actions; `deck-harness-server/src/pi-extensions/presentation-bridge.ts`
  (`presentation_get_state`, `presentation_update`, `presentation_select_by_text`
  tool schemas/descriptions) — new actions and richer state shape.
- **Client**: `client-deck/src/hooks/useDeckSocket.ts` (duplicated `DeckObject`/
  `DeckState` types must track the server shape); `client-deck/src/components/DeckCanvas.tsx`
  (currently a pure click-select `<button>` grid with no pointer-drag or resize
  wiring at all — needs drag-move, resize handles, in-place text editing, and a
  formatting toolbar/UI built from scratch).
- **Sync transport**: `deck-harness-server/src/websocket.ts` — broadcasts the
  larger `deck_state` payload; may need new inbound message types for
  user-originated style/text-range edits that aren't naturally expressed as a
  single `presentation_update`-shaped mutation.
- **Existing decks**: any persisted/template deck content with plain-string
  `text` needs a migration path to the new structured representation.
