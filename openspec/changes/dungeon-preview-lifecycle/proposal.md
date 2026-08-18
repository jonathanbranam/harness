> # ⛔ SUPERSEDED — slated for deletion
>
> The dungeon-harness work this change belongs to was **stopped on
> 2026-08-18** and is being backed out. See
> `docs/dungeon-harness/STATUS.md` for why, and
> `docs/dungeon-harness/backout-plan.md` §2.6 — this change is proposal-only
> with no implementation, and is slated for deletion. Do not resume it.

## Why

The board canvas's movement/attack preview overlay behaves unpredictably:
sometimes a stale preview (drawn from a path/footprint computed before a
unit moved, was removed, or the board was cleared) stays visible after the
board has since changed; other times a preview that should still be valid
disappears with no obvious trigger. This was flagged while manually
verifying `dungeon-board-piece-tools` (which added `dungeon_move_unit`,
`dungeon_remove_unit`, `dungeon_clear_board`) — those tools make
"preview a move, then commit it" a natural workflow for the first time,
which surfaces the problem much more often than before.

Root cause, found during investigation: the preview overlay is **not**
derived from the server's live board state at all. `client-dungeon`'s
`findLatestPreview` (`useDungeonSocket.ts`) scans the client's local chat
transcript backwards for the most recent successful
`dungeon_preview_movement`/`dungeon_preview_attack` tool result and draws
that unconditionally (`BoardCanvas.tsx`). Two consequences fall out of that
design, independently, which is what makes the behavior look inconsistent
rather than simply "always stale" or "always cleared":
- **Never invalidated by mutation**: `dungeon_place_unit`, `dungeon_set_terrain`,
  and the new `dungeon_move_unit`/`dungeon_remove_unit`/`dungeon_clear_board`
  all broadcast an updated `BoardState` over the WebSocket, but nothing
  about that broadcast touches the preview — so a preview computed before a
  mutation keeps rendering after it, even when it now describes a path/
  footprint that no longer makes sense.
- **Wiped on reconnect for an unrelated reason**: the chat transcript is
  intentionally not replayed on WebSocket reconnect (a documented,
  deliberate choice — see `useDungeonSocket.ts`'s comment on why history
  isn't restored). A page reload or dropped connection empties the
  transcript, so `findLatestPreview` finds nothing and the preview vanishes
  — not because it became stale, but as a side effect of a decision made
  for an unrelated reason.

This change is scoped to **investigating what the preview overlay's
intended lifecycle should be and designing a fix**, not to landing a
specific implementation up front - the underlying UX question (when should
a preview appear vs. disappear, and does it need to survive a reconnect)
needs to be settled before writing specs/tasks.

## What Changes

- Document the preview overlay's current actual behavior (this proposal)
  and the two independent causes above.
- In `design.md`, lay out the lifecycle options for when a movement/attack
  preview should be shown vs. cleared, with trade-offs, so the user can
  choose an approach before specs are written.
- Once a direction is chosen, update `dungeon-board-bridge`'s "Board canvas
  renders terrain, units, and previews" requirement to specify the
  preview's lifecycle explicitly (today it only specifies that a preview is
  drawn when a preview call succeeds — it says nothing about when the
  overlay clears).
- Implement whatever lifecycle is chosen in `client-dungeon` (likely
  `useDungeonSocket.ts`/`DungeonPage.tsx`/`BoardCanvas.tsx`), and add
  regression coverage for it.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `dungeon-board-bridge`: the "Board canvas renders terrain, units, and
  previews" requirement's scenarios currently only cover a preview being
  drawn on success; this adds an explicit lifecycle (when it clears).

## Impact

- `client-dungeon/src/hooks/useDungeonSocket.ts`: `findLatestPreview` and/or
  the transcript-reset-on-reconnect behavior it depends on.
- `client-dungeon/src/pages/DungeonPage.tsx`: how `movementPreview`/
  `attackPreview` are derived and passed to `BoardCanvas`.
- `client-dungeon/src/components/BoardCanvas.tsx`: preview rendering, if the
  chosen fix changes what shape of data it receives.
- No server-side (`dungeon-harness-server`) changes are anticipated — the
  server already broadcasts every mutation; this is a client-side
  derivation problem.
