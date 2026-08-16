## 1. Server: object model & core mutation

- [x] 1.1 Define `TextBlock`/`TextRun` types in `editor-state.ts` and change
      `DeckObject.text` from `string` to `TextBlock[]`; add `borderColor` and
      `fontColor` fields
- [x] 1.2 Add a `plainTextOf(object): string` helper that concatenates a
      structured text's run characters
- [x] 1.3 Add a load-time normalizer that wraps any legacy string `text`
      into a single unstyled paragraph block
- [x] 1.4 Extend the `UpdateAction` union with `addObject`, `removeObject`,
      `setFontColor`, `setBorderColor`, `applyTextStyle`
      (`{targetId, start, end, mark|listType}` offset-addressed, per
      design.md), and allow `setFillColor`/`setBorderColor` to accept the
      literal `"transparent"`
- [x] 1.5 Implement each new action in `EditorStore.applyUpdate`, including
      offset-to-run splitting for `applyTextStyle`, paragraph/list-item
      conversion, and unknown-id error handling consistent with existing
      actions

## 2. Server: tool surface

- [x] 2.1 Extend `presentation_update`'s schema and description in
      `presentation-bridge.ts` with the new actions from 1.4
- [x] 2.2 Extend `presentation_get_state` to return `borderColor`,
      `fontColor`, and the structured `text`
- [x] 2.3 Update `presentation_select_by_text` to match against
      `plainTextOf()` instead of a raw string field
- [x] 2.4 Update the `before_agent_start` context injection to describe the
      structured text and new style fields

## 3. Server: transport for user-originated edits

- [x] 3.1 Add an inbound `object_update` WS message in `websocket.ts` that
      applies its `UpdateAction[]` through the same `EditorStore.applyUpdate`
      call the tool uses
- [x] 3.2 Reuse the existing active-slide id-scoping/validation for
      user-originated updates so behavior matches tool-originated ones

## 4. Client: shared types & transport helper

- [x] 4.1 Update `useDeckSocket.ts`'s `DeckObject`/`DeckState` types to match
      the new server shape (`TextBlock[]`, `borderColor`, `fontColor`)
- [x] 4.2 Add a `sendObjectUpdate(actions)` helper that sends the
      `object_update` WS message

## 5. Canvas: move & resize

- [x] 5.1 Add pointer-down/move/up drag handling in `DeckCanvas.tsx`:
      update local position live, commit a single `setPosition` on
      pointer-up
- [x] 5.2 Add resize handles on the selected object's bounding box: update
      local size live, commit a single `setSize` on pointer-up
- [x] 5.3 Make sure drag/resize gestures don't interfere with existing
      click/shift-click selection handling

## 6. Canvas: add/remove text box

- [x] 6.1 Add an add-text-box affordance (toolbar button and/or keyboard
      shortcut) that creates a box at a default position/size and selects it
- [x] 6.2 Add a delete affordance for the current selection that commits
      `removeObject`

## 7. Canvas: in-place text editing

- [x] 7.1 Build a `contenteditable`-based text-editing component that
      renders `TextBlock[]`/`TextRun[]` and enters edit mode on
      double-click
- [x] 7.2 Translate DOM selection ranges to plain-text offsets for
      formatting operations
- [x] 7.3 Commit `setText`/`applyTextStyle` actions on blur or debounced
      end-of-edit, not on every keystroke
- [x] 7.4 Render bullet markers and auto-computed numbering for list blocks
      in both editing and static (non-editing) rendering

## 8. Canvas: formatting & style toolbar

- [x] 8.1 Add bold/italic toggle buttons and bulleted/numbered-list buttons
      that operate on the current text selection via `applyTextStyle`
- [x] 8.2 Add a font-size control for the selected text box(es) using the
      existing `setFontSize` action
- [x] 8.3 Add a font-color picker using `setFontColor`
- [x] 8.4 Add a fill-color picker, including a transparent option, using
      `setFillColor`
- [x] 8.5 Add a border/line-color picker, including a transparent option,
      using `setBorderColor`

## 9. Seed data

- [x] 9.1 Update `templates/agent-workspace/` seed deck JSON to the new
      structured `text` shape
- [x] 9.2 Confirm the load-time normalizer (1.3) covers any remaining
      plain-string `text` in fixtures or tests

## 10. Tests & verification

- [x] 10.1 Unit tests for `EditorStore.applyUpdate`'s new actions
      (add/remove object, font/border color including transparent,
      `applyTextStyle` run-splitting, list conversion, auto-renumbering)
- [x] 10.2 Unit tests for `plainTextOf()` and `select_by_text` matching
      across formatted runs
- [X] 10.3 Manual verification with two browser tabs open: drag, resize,
      add/remove, in-place text edit, bold/italic, bulleted/numbered lists,
      and all color/transparency controls — each performed once from the UI
      and once via a pi tool call, confirming both stay in sync
