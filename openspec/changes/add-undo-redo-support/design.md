## Context

`EditorStore` (`deck-harness-server/src/editor-state.ts`) is the single
mutation path for deck content today: `applyUpdate` (all `UpdateAction`
variants), `createDeck`, `deleteDeck`, `addSlide`, `removeSlide`. Two call
sites drive it — `pi-extensions/presentation-bridge.ts` (pi's tool calls)
and `websocket.ts` (the browser's `object_update`/`create_deck`/etc.
messages) — and neither currently tells `EditorStore` *who* is calling.
`EditorStore.emit()` already notifies two independent subscribers on every
mutation: `websocket.ts` (broadcasts `DeckState` to every connected client)
and `deck-persistence.ts` (debounced auto-save). See proposal.md for why
undo/redo with provenance is needed.

## Goals / Non-Goals

**Goals:**
- One global, strict LIFO undo/redo stack shared by both actors, capped at
  ~100 entries.
- Every entry carries who made the change (`user` | `agent`) and when, so
  pi can decide how far back to step before calling undo.
- Undoing/redoing never leaves the deck in an inconsistent state (dangling
  object ids, a selection pointing at a removed slide, etc.), regardless of
  which action type is being reverted.

**Non-Goals:**
- Persisting the undo/redo history across a server restart — only deck
  *content* survives restarts (existing `deck-persistence` snapshot);
  history starts empty on every process start, same posture as this
  harness's in-memory auth/agent sessions.
- Per-actor or per-tab undo stacks — this harness has one shared deck and
  one history, matching its existing single-shared-state model.
- A visible history/timeline panel in the UI — the user gets keyboard
  shortcuts + toolbar buttons only; the full entry list (actor, timestamp,
  description) is exposed to pi via a tool, not rendered in the browser.

## Decisions

### Whole-state snapshots per entry, not inverse operations

Each history entry stores a deep-cloned `{ decks, activeDeckId, selection }`
snapshot from immediately **before** the mutation and one from immediately
**after**. Undo restores the `before` snapshot; redo restores the `after`
snapshot.

Alternative considered: compute a hand-written inverse for each
`UpdateAction` (e.g. `setPosition` → move back by `-dx/-dy`,
`removeObject` → re-insert the removed object). Rejected because several
actions don't have a cheap, obviously-correct inverse — `applyGridLayout`
repositions N objects from their prior individual positions,
`applyTextStyle` splits/merges text runs, `addObject` generates an id that
a later `removeObject` inverse would need to remember — and getting any one
of those wrong silently corrupts the deck. Whole-state snapshots are
correct by construction (undo always reproduces the exact prior state) and
`EditorStore` already has the deep-clone logic this needs (`getState()`,
`exportSnapshot()`). The cost is O(deck size) memory per entry, capped at
~100 entries; acceptable for a single-user, in-memory presentation deck.

### `actor` becomes an explicit parameter on every mutating method

`applyUpdate`, `createDeck`, `deleteDeck`, `addSlide`, `removeSlide` each
gain a required `actor: 'user' | 'agent'` parameter. `presentation-bridge.ts`
always passes `'agent'`; `websocket.ts`'s message handlers always pass
`'user'`. Rejected alternative: inferring the actor from call-site context
implicitly (e.g. a module-level "current actor" flag) — explicit parameters
keep the two call sites' intent visible at the call, and avoid a
stateful flag that could leak across an interleaved agent-turn/user-edit
sequence.

### History capture centralized in one private wrapper

`EditorStore` gains a private `withHistory(actor, description, mutate)`
helper that snapshots before, runs `mutate()`, snapshots after, pushes the
entry (evicting the oldest if over the ~100 cap and clearing the redo
stack), then calls `emit()` once. Every mutating method's body becomes a
call through this wrapper instead of hand-rolling snapshot/push logic per
method, so the cap/eviction/redo-invalidation rule lives in exactly one
place.

### New tools: `presentation_history`, `presentation_undo`, `presentation_redo`

- `presentation_history` — returns recent entries (most-recent-first),
  each with `actor`, `timestamp`, and a short human-readable
  `description` (derived from the action type and target count at capture
  time, e.g. "Moved 2 objects", "Deleted slide"), plus `canUndo`/`canRedo`.
  No parameters beyond an optional `limit`.
- `presentation_undo` / `presentation_redo` — accept an optional `count`
  (default 1) and step the shared stack that many times, stopping early if
  the stack empties first. Because the stack is strict LIFO, this is how
  pi acts on "undo your edits from the last 5 minutes": call
  `presentation_history`, count consecutive entries from the top matching
  `actor: "agent"` within the time window, then call `presentation_undo`
  with that count. It cannot skip over an intervening user edit to reach
  an older agent edit — the same constraint a human using the toolbar
  button would have.

Both tools return which entries were actually stepped (actor + description
each) and the resulting `canUndo`/`canRedo`, mirroring the existing
`{ changed, errors }` result shape's spirit.

### Browser surface: WS messages + keyboard guard reuse

`undo`/`redo` join the existing `ClientMessage` union (alongside
`create_deck`, `add_slide`, etc.), each calling `editorStore.undo('user')`
/ `redo('user')`. `DeckCanvas.tsx`'s existing global `keydown` listener
(currently handling Delete/Backspace, already guarded against firing while
inline text-editing is active) gets two more cases for Cmd/Ctrl+Z and
Cmd/Ctrl+Shift+Z, under the same editing guard — so browser-native
text-field undo still works while a text box is being edited in place, and
the deck-level shortcut only fires when nothing is being edited.

### Broadcast gains `canUndo`/`canRedo` booleans

`DeckState` gains two booleans reflecting whether the shared stack
currently has anything to undo/redo, recomputed on every `emit()` (which
already fires after every mutation, including undo/redo themselves) so
every connected client's toolbar buttons stay in sync. The full entry list
is not broadcast — only pi's tools expose it, per this design's Non-Goals.

## Risks / Trade-offs

- **[Risk]** Snapshotting the whole `decks` map on every mutation is more
  expensive than a targeted inverse, and could matter if a deck grows very
  large. → **Mitigation**: capped at ~100 entries; this harness's decks are
  small (a handful of slides/objects), and correctness matters more than
  micro-optimizing a single-user in-memory structure.
- **[Risk]** A strict LIFO stack means pi can't selectively undo one of its
  own older edits without also undoing any newer edits (its own or the
  user's) stacked on top. → **Mitigation**: this is deliberate (per
  proposal.md) — `presentation_history`'s provenance lets pi *decide*
  whether stepping through the intervening entries is safe, rather than
  silently reordering history.
- **[Risk]** Two browser tabs both pressing Ctrl+Z in quick succession race
  against the single shared stack. → **Mitigation**: accepted, consistent
  with this harness's existing single-shared-deck-state model (no
  per-connection isolation anywhere else either).
