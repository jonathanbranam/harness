## Why

pi and the user share one live, mutable deck, and either side can make a
wrong or unwanted edit — a bad `presentation_update` call, an accidental
drag, a slide deleted by mistake. Today there's no way to recover: the user
has to manually redo the work, and pi has no way to self-correct or to act
on a request like "undo the changes you made in the last 5 minutes." Adding
undo/redo, with per-edit provenance (who made it, and when), closes that
gap for both surfaces.

## What Changes

- Every content-mutating operation — object add/remove/move/resize/text/
  color/font-size/grid-layout, slide add/remove, deck create/delete —
  pushes an entry onto a single shared undo/redo history, capped at
  roughly 100 entries (oldest entries drop once the cap is reached).
- Each history entry records what changed, the **actor** who made the
  change (`user` or `agent`), and a **timestamp**, so both a human and pi
  can reason about "whose edit is this, and how recent."
- Undo/redo is a strict LIFO stack: undo reverts the single most recent
  entry; redo reapplies the most recently undone entry; making a new
  content-mutating edit after an undo discards the redo tail (standard
  undo-stack semantics — no branching history).
- Pure navigation (selection changes, switching the active deck/slide) is
  **not** itself a history entry; undoing an edit does restore whatever
  selection/active-slide was current immediately before that edit was made.
- User-facing surface: Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z keyboard shortcuts
  plus toolbar undo/redo buttons on the canvas, enabled/disabled based on
  whether the stack currently has anything to undo/redo.
- Agent-facing surface: new tools for pi to inspect the history (entries
  with actor, timestamp, and a human-readable description of the change)
  and to step the stack (undo/redo, optionally by a count) — enabling
  requests like "undo your edits from the last 5 minutes": pi lists
  history, counts how many consecutive entries at the top match its own
  actor within that time window, and undoes that many.
- Deck-state broadcast is extended so every connected client knows whether
  undo/redo are currently available (for enabling/disabling the toolbar
  buttons).

## Capabilities

### New Capabilities
- `deck-undo-redo`: the shared undo/redo history — capture on every
  content-mutating operation, ~100-entry cap with oldest-first eviction,
  strict LIFO undo/redo semantics with redo-tail invalidation, per-entry
  actor+timestamp provenance, the user-facing keyboard/button surface, and
  the agent-facing history-inspection and undo/redo tools.

### Modified Capabilities
- `deck-agent-session`: the deck-state broadcast gains undo/redo
  availability so every connected client can reflect current stack state.

## Impact

- **`deck-harness-server/src/editor-state.ts`**: `EditorStore` is the
  single place all content mutations already flow through (`applyUpdate`,
  `createDeck`, `deleteDeck`, `addSlide`, `removeSlide`) — the history
  stack hooks in here, likely by capturing before/after snapshots or
  inverse operations around each mutating method.
- **New pi tools** (naming TBD in design) alongside the existing
  `presentation_get_state` / `presentation_update` /
  `presentation_select_by_text` tools, registered wherever those are
  (presentation-bridge extension).
- **`client-deck/src/components/DeckCanvas.tsx`**: new keyboard handling
  (alongside the existing Delete/Backspace handler) and toolbar buttons.
- **WebSocket protocol / broadcast shape**: `DeckState` (or the broadcast
  message) gains undo/redo-availability fields.
- **Assumption to confirm in design**: undo history is in-memory only and
  does not survive a server restart (consistent with this harness's
  existing restart-loses-session posture for auth/agent sessions); deck
  *content* itself still persists via `deck-persistence`'s existing
  snapshotting, only the history stack is not persisted.
