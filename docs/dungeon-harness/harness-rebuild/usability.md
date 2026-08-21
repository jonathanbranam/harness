# Bench usability notes

> **Status: a living document, not a plan of record.** Findings from driving the
> bench by hand. The designer appends; the driver triages each entry into
> *closed by planned work*, *needs its own change*, *deferred*, or *won't
> change*, and says which. An entry graduates into an OpenSpec change and stays
> here as the record of why.
>
> Started 2026-08-21, after the first hands-on session with the setup phase
> (`phase-5-correction.md` §9 change 2).

**Keep the narrative.** What a person tried, in order, and what they expected —
that is the finding. The tidy summary underneath it is a lossy compression, and
the sequence is usually where the design error actually is.

---

## 1. Setup: the click model fights the designer

*Found 2026-08-21, driving the bench right after the setup phase landed.*
**Disposition: its own OpenSpec change, after §9 change 3 (the guards).**

### What happened

1. Added some units. Fine.
2. That one is in the wrong place — **try to drag it.** Nothing; drag isn't a
   gesture the board has.
3. Click it, then — maybe now it can be moved?
4. Clicking a unit shows its **movement range**. Surprising in setup, but fine.
   Click the unit again to cancel: **nothing happens.** Click elsewhere to
   cancel: **that placed another unit.**
5. Maybe clicking inside the range moves it? **No — another unit.** Now there
   are three where one was wanted.
6. There is no way to deselect by clicking the board. Every click places.
7. Clicking the **unit type in the palette again** disarmed placement — *and
   then* the unit could be moved. That was the goal all along.

### Why, in code

- `DungeonPage.tsx`, `handleTileClick`, setup branch: **if a palette type is
  armed, every tile click places.** It is checked before selection, before
  relocation, before anything.
- Relocation is the *last* branch, reachable only when `palette === null` —
  which is why disarming the palette was the accidental fix.
- `handleUnitClick` selects the unit and arms `move`. The bench then shows its
  reach because the action surface still ignores the phase in bench mode
  (`actions.ts:227`) — see finding 2.
- There is no drag handling anywhere in `BoardView`.

Nothing here is a bug in the sense of "does not do what it was built to do".
It does exactly what it was built to do, and what it was built to do is wrong.

### The interaction model wanted

| Gesture | Behavior |
|---|---|
| Palette armed, click an empty tile | Place. Repeatable — clicking again places another of the same type |
| **Drag a unit** | Relocate it. **The primary relocate gesture** |
| **Drag a structure** | Move it |
| Click a unit | Select it, and **suspend** the armed palette |
| Click the selected unit again | Deselect, **restore the suspended palette**, and consume the click — it does not place |
| Click any other tile while a unit is selected | Same: deselect, restore the palette, consume the click |
| New Board / Clear Units | Confirmation dialog, then **wipe the timeline** rather than adding a frame to it |

The point of "suspend and restore" is that selecting a unit must not cost the
designer their palette choice: after cancelling, the next click places the same
type again, with no trip back to the menu.

**A selected unit should eventually be its own small mode** — starting HP, and
whatever else belongs to one piece. Deferred (see §3), but that is the space
the selection is being reserved for, and it is why "select" must stop meaning
"about to take a turn".

### Two consequences worth being deliberate about

- **Drag becomes the only way to relocate.** If drag turns out to be awkward in
  practice, the answer is a *second, non-conflicting* gesture — not restoring
  click-to-relocate, which is what produced this trap.
- **New Board reverses an earlier deliberate choice.** `BenchStore.newBoard`'s
  comment today reads: *"A frame like any other, so the designer can step back
  to the board they were working on if they swapped it out by mistake."* The
  confirmation dialog replaces that safety net. Clear Units gets the same
  treatment: confirm, then clear the units and the history, leaving the board
  and its structures standing.

---

## 2. Out-of-phase play

*Reported 2026-08-21, same session.*
**Disposition: closed.** All three symptoms below are gone: track-web's
amended `dungeon-sequencer-guards` made the phase guard unconditional and
added the `unit.kind === 'npc'` refusal, and the harness's
`dungeon-bench-guard-adoption` adopted both — the bench plays the game's
round, in the game's order, with no engine-mode exemption. Not a regression
from change 2 — this is the hole those two changes exist to close.

| Symptom | Cause |
|---|---|
| During enemy planning, an enemy can be clicked and made to move or attack, landing damage immediately | `actions.ts:227` — `state.phase !== 'player' && getEngineMode() !== 'bench'`. In bench mode the phase guard is off |
| During enemy planning, a PC can move and attack immediately | Same line |
| A unit can still spend movement after telegraphs have resolved | Same line — and for an enemy that was already planned, a second cause: planning applies its move through `resolveNpcAction`, which never writes `movedThisTurn`, so the action surface still sees a full budget. Two ledgers, neither reading the other |

The first of these is the one that matters most, and §3 of the correction plan
says why: an enemy attack driven through the PC action surface **resolves
immediately**, while in the game an enemy attack is *always* a telegraph — locked
in `npc-move`, resolved in `npc-attack`, with the player's turn in between. It is
not the same rule at a different time. It is a different rule, and it shows the
designer something the game can never produce.

§9 change 3 closes all three: the strict phase guard, plus Option B —
`availableActions` refuses `unit.kind === 'npc'` outright, so an enemy's only
route into a round is planning.

**Knock-on:** once the guard lands, a unit selected during `placement` has no
action surface, so clicking it stops showing movement range (finding 1, step 4).
That is also what frees the selection to become a per-unit setup mode.

---

## 3. Deferred

Not scheduled. Recorded so they are not rediscovered as bugs.

- **A per-unit setup mode.** Selecting a piece during placement opens
  affordances for *that piece*: starting HP first, whatever else later.
- **A fallback for relocation** if drag proves awkward — a second gesture, never
  a competing click path.
- **Undo for a destructive reset.** New Board and Clear Units trade the timeline
  for a confirmation dialog. If that turns out to be the wrong trade, the answer
  is probably a single "undo the reset" step, not putting the frame back.

---

## Open questions

Answer inline; the driver will fold answers into the change when it is written.

1. **A palette is armed and the designer clicks a tile that holds a unit.**
   Select that unit (suspending the palette), or refuse the placement with a
   reason? Assumed: **select it** — clicking a piece always means the piece.
2. **Does the confirmation dialog need a "don't ask again"?** Assumed: no. It
   guards a destructive action taken rarely.
3. **Should Clear Units also clear structures?** Assumed: **no** — it clears
   units, the board and its structures stand. (New Board replaces both.)
4. **Does a drag that ends on an illegal tile snap back silently, or report the
   engine's refusal?** Assumed: report it, the same way a refused click does —
   the engine already has the sentence.
