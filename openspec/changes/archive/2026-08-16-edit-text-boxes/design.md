## Context

See `proposal.md` for motivation. Relevant current state:

- `DeckObject` (`deck-harness-server/src/editor-state.ts`) is a flat record:
  `{ id, x, y, width, height, text: string, fillColor, fontSize }`. `text` is
  a single plain string.
- All mutation goes through one place: `EditorStore.applyUpdate`, a switch
  over a discriminated `UpdateAction` union, called both by the
  `presentation_update` tool (`pi-extensions/presentation-bridge.ts`) and by
  nothing else today — the client has no mutation path of its own.
- `client-deck/src/components/DeckCanvas.tsx` renders each object as an
  absolutely-positioned `<button>`. There is no pointer-drag, no resize
  handles, and no text-editing affordance — click/shift-click selection is
  the only interaction.
- `client-deck/src/hooks/useDeckSocket.ts` maintains its own copy of the
  `DeckObject`/`DeckState` types (not imported from the server) and applies
  `deck_state` broadcasts from `websocket.ts` wholesale.
- Deck objects are scoped to a slide, slides to a deck (see the already-
  merged multi-deck/slide work in `openspec/specs/presentation-editing`);
  this change does not touch that scoping, only what lives on an object.

## Goals / Non-Goals

**Goals:**
- One mutation code path for both pi tool calls and user canvas actions, so
  behavior never diverges between the two actors.
- A structured text model expressive enough for bold/italic runs and
  bulleted/numbered lists, without pulling in a full rich-text editor
  framework for a three-mark, two-list-type feature set.
- Canvas interactions (drag, resize, text edit) that feel direct to the user
  but only touch shared state at the end of a gesture, not on every pointer
  move or keystroke.

**Non-Goals:**
- Real-time collaborative text-range cursors (seeing another viewer's live
  selection while they type). Only committed text content syncs; in-progress
  edits are local to the editing browser tab until commit.
- Multi-object group drag. Dragging always moves the one object under the
  pointer; repositioning several objects together still goes through the
  existing `applyGridLayout` action, unchanged by this proposal.
- Inline styles beyond bold/italic/list-type (no links, headings, custom
  fonts, underline, etc.) — out of scope until a concrete need arises.
- Undo/redo for canvas edits — not addressed here.

## Decisions

### Structured text shape
`text` becomes:
```
type TextBlock =
  | { kind: "paragraph"; runs: TextRun[] }
  | { kind: "listItem"; listType: "bulleted" | "numbered"; runs: TextRun[] }
type TextRun = { text: string; bold?: boolean; italic?: boolean }
type DeckObject = {
  ..., text: TextBlock[], fillColor: string /* or "transparent" */,
  borderColor: string /* or "transparent" */, fontColor: string, fontSize: number
}
```
Numbered-list numbering is computed at render time from consecutive
`listItem`/`numbered` blocks (per the `text-formatting` spec's "renumbers
automatically" scenario) rather than stored, so reordering or inserting
blocks never requires a renumbering pass.

Alternative considered: adopt an existing rich-text document model (e.g.
ProseMirror's) as the wire format. Rejected — those models carry generality
(arbitrary nesting, marks/attrs schema, node specs) this feature doesn't
need, and would leak an external library's shape into `presentation_update`
tool arguments that pi has to construct by hand.

### One mutation path, reused by both actors
`EditorStore.applyUpdate`'s `UpdateAction` union is extended (not replaced)
with `addObject`, `removeObject`, `setFontColor`, `setBorderColor`, and
`applyTextStyle` (below), and `setFillColor`/`setBorderColor` accept the
literal `"transparent"`. The client sends these same `UpdateAction` values
over a new inbound WS message (`{ type: "object_update", actions:
UpdateAction[] }`) alongside the existing `selection`/`select_deck`-style
messages in `websocket.ts`, and the server applies them through the exact
same `applyUpdate` call the tool uses. No parallel mutation logic is written
client-side or server-side for user-originated edits.

Alternative considered: give the canvas its own REST/WS message types
(`add_text_box`, `resize_object`, ...) separate from `UpdateAction`.
Rejected — CLAUDE.md already flags "no self-HTTP" and single-process
directness as this project's core simplification; a second mutation
vocabulary would need to be kept in lockstep with the tool's by hand.

### Text formatting addressed by plain-text offsets
`applyTextStyle` takes `{ targetId, start, end, mark: "bold" | "italic",
value: boolean }` or `{ targetId, start, end, listType: "bulleted" |
"numbered" | null }`, where `start`/`end` are character offsets into the
object's concatenated plain-text content (the same string
`presentation_select_by_text` matches against). The server converts offsets
into run splits internally.

Alternative considered: address formatting by block/run index. Rejected for
the tool surface — pi already has the plain-text content from
`presentation_get_state`/`presentation_select_by_text` and would otherwise
need to separately track block/run indices that shift as it edits. The
canvas's DOM selection (a `Range` over rendered text) also naturally reduces
to plain-text offsets, so one addressing scheme serves both actors.

### Canvas text editing: custom contenteditable, not a library
The in-place text editor is a small custom component driving a
`contenteditable` element, translating between DOM selection/mutation
events and the `TextBlock[]`/`TextRun[]` model at its boundary, rather than
embedding a general rich-text editor framework (Tiptap, Slate, ProseMirror).

Alternative considered: adopt one of those frameworks. Rejected for now —
the formatting surface here (bold, italic, two list types, single paragraph
flow, no nesting) is narrow enough that a framework's abstraction cost
(learning its schema, fitting its React bindings, wiring its own
selection/transaction model to our WS sync) likely exceeds a purpose-built
component's. Revisit if the formatting surface grows (links, tables, nested
lists).

### Commit-on-gesture-end, not per-frame
Drag-move, resize, and text edits update local component state on every
pointer/keystroke event for responsiveness, but only send an `object_update`
(one `setPosition`/`setSize`/`setText`/`applyTextStyle` action) at gesture
end — pointer-up for drag/resize, blur or an explicit debounce for text
edits. This matches the specs' "position matches the drop location" /
"reflects edits ... when editing ends" scenarios and avoids flooding the
websocket or causing other viewers' canvases to jitter mid-drag.

### Add-text-box defaults
The user-triggered add action needs no arguments (a toolbar button/keyboard
shortcut creates a box at a fixed default position/size and selects it,
matching the spec's "default or user-chosen position" scenario); the
`addObject` tool action requires pi to pass explicit position and size,
since pi has no notion of "where the user is looking."

## Risks / Trade-offs

- **[Risk]** Hand-rolled `contenteditable` editing is notoriously fragile
  (cursor jumps, IME composition bugs, browser inconsistencies) →
  **Mitigation**: keep the formatting surface intentionally narrow (this
  design's Non-Goals), commit only at gesture end rather than reconciling
  DOM state against shared state on every keystroke, and test manually
  across the target browser before considering this feature done.
- **[Risk]** The `text` field's shape change is a breaking change to
  anything that currently treats `text` as a string — `presentation_select_by_text`'s
  matching, the `before_agent_start` context injection, and any seed/template
  deck JSON → **Mitigation**: introduce one shared `plainTextOf(object):
  string` helper in `editor-state.ts` and route every call site that needs
  plain text through it, rather than each call site re-deriving it; add a
  load-time normalizer that wraps any legacy string `text` into a single
  unstyled paragraph block so old seed data keeps working without a manual
  migration step.
- **[Risk]** Routing user-originated edits through the same `applyUpdate`
  path as pi's tool calls means the canvas can now trigger the exact same
  mutations pi can, with no separate authorization check → **Mitigation**:
  acceptable under this project's existing trust model (single local user,
  no public exposure, per CLAUDE.md's deployment section); both origins are
  already able to mutate the whole deck.

## Migration Plan

No persistent store exists (deck state is in-memory and server-authoritative;
see CLAUDE.md's "In-memory auth, not SQLite" precedent for this project's
general stance on state). Rollout is: ship the new `DeckObject` shape and
the load-time normalizer together, update `templates/agent-workspace/`
seed deck JSON to the new structured `text` shape, and restart the server —
existing running state is simply re-seeded, same as any other restart.
Rollback is reverting the deploy; there is no data to migrate back.
