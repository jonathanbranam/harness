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
| Click a structure | Same: select it. See §5 — this is one rule, not two |
| New Board / Clear Units | Confirmation dialog, then reset. *(Originally "wipe the timeline"; §3 supersedes that — with setup off the timeline there is no setup history to wipe.)* |

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

## 3. Setup does not belong on the timeline

*Reported 2026-08-22, after change 3 landed.*
**Disposition: folds into the setup-usability change. It changes what that
change is about, so it goes first.**

> Setup really shouldn't be stored as part of the scenario. It isn't game play
> that should be re-played. It is just confusing. We need to build proper undo
> later, but recording set up is just noise.

Today every setup operation commits a frame: each placement, each HP change,
each structure move. Authoring a six-piece board buries the round that follows
under a dozen frames of bookkeeping, and scrubbing the timeline walks back
through the act of building the board rather than through anything that
happened *in* it.

**The timeline is a record of play.** Setup is what you did before play started.

### What this supersedes

- **§1's "New Board / Clear Units wipe the timeline behind a confirmation."**
  If setup is never recorded, there is no setup history for them to wipe. The
  confirmation is still wanted — both are destructive — but what they destroy is
  the board, not a timeline.
- **`BenchStore.newBoard`'s "a frame like any other"** comment, already noted in
  §1 as a reversal, goes further: not a different kind of frame, no frame.
- **The `dungeon-bench` spec** says the opposite in two places, so this needs a
  spec change, not just an implementation one: *"Any action can be stepped back"*
  is explicit that this includes **placements**, and *"The session is a timeline
  that can be walked"* is written against every operation committing a frame.

### Undo for setup is a separate thing, later

The designer was explicit: *"we need to build proper undo later."* So this is
not "move setup onto a second timeline" — it is "setup is not on the timeline",
and a setup-scoped undo is its own piece of work. Do not smuggle one in.

### One open question this raises

If setup commits no frames, **what is the timeline's first frame, and how does a
designer get back to setup?** Today they step back past the start. Two shapes:

- **The authored scenario is frame 0.** One frame, holding the board as it stood
  when `startScenario` was called. Stepping back to it re-opens setup, which is
  what happens now — minus the dozen frames in front of it.
- **An explicit "return to setup" operation**, with the timeline starting after
  the scenario begins.

Assumed: **frame 0**, because it keeps the existing gesture and needs no new
control. Confirm before the change is written.

---

## 4. A selected structure is invisible on the board

*Reported 2026-08-22.*
**Disposition: folds into the setup-usability change.**

Selecting a structure shows a *"Remove structure at (4, 2)"* button in the
panel and nothing at all on the board. `selectedStructure` is client-only state
in `DungeonPage` and is passed to `BenchControls` but **never to `BoardView`**,
which therefore cannot draw it. A selected unit gets a dark stroke on its token;
a structure gets nothing.

The move-a-structure gesture depends on knowing which one is selected, so this
is not only cosmetic — it is the gesture's only feedback before the click that
commits it.

---

## 5. With a palette armed, clicking a structure should select it

*Reported 2026-08-22.*
**Disposition: folds into the setup-usability change. Answers open question 1.**

> When you select a unit from the UI, then click on a unit, it selects the unit
> on the map. This is good, but if you click on a structure it says "there is a
> structure there". Instead, select the structure.

Same root cause as §1: `handleTileClick`'s setup branch checks the armed palette
**first**, so a click on an occupied tile becomes a placement attempt and comes
back as the engine's refusal. With no palette armed the code already does the
right thing — it selects the structure and clears any unit selection.

So the rule is one rule, and it covers both kinds of piece:

**Clicking a piece always means that piece.** Unit or structure, palette armed or
not: select it, and suspend the armed palette so cancelling restores it.

This settles **open question 1** below in the affirmative, and extends it to
structures — which is the half the question did not think to ask.

---

## 6. Exactly one power center; towers are optional

*Reported 2026-08-22.*
**Disposition: folds into the setup-usability change — but the check belongs in
the engine, not here.**

> There should only be one power center allowed during setup. Don't allow adding
> two. Do allow 0 towers.

- **A second power center is refused.** One per scenario.
- **Zero towers is a valid scenario.** No minimum, no maximum stated.

**This is a game rule, so it goes in `scenario.placeStructure` in the engine**
(`packages/dungeon-engine/src/scenario.ts`), refusing with a reason the way every
other authoring refusal does. It must not be a check in `BenchStore`, in the
intent layer, or in the client — that is the harness deriving a rule of its own,
which is the mistake the whole rebuild exists to undo. The client's job is to
show the engine's refusal, and ideally to disable the palette entry once a power
center is placed.

**Also check `generateBoard`**: `board-gen.ts:122` clamps `powerCenters` to
`Math.floor(cols / 2)`, so a generated board can hold several. Whatever the
engine decides is the rule, board generation has to obey it — otherwise New Board
produces a scenario the designer could not have authored by hand.

---

## 7. Deferred

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

1. ~~**A palette is armed and the designer clicks a tile that holds a unit.**~~
   **Answered 2026-08-22 — select it**, and the same for a structure. See §5.
  a. Yes, select it - unit or structure
2. **Does the confirmation dialog need a "don't ask again"?** Assumed: no. It
   guards a destructive action taken rarely.
  a. Agree NO
3. **Should Clear Units also clear structures?** Assumed: **no** — it clears
   units, the board and its structures stand. (New Board replaces both.) With §6
   in play, note this means Clear Units leaves the single power center standing,
   which is what makes the board still authorable afterwards.
  a. Hrm. Reconsidering these. New Board does several things: removes all units,
  power center back in standard location, randomize terrain. So, sure, Clear
  Units should only clear units not structures.
4. **Does a drag that ends on an illegal tile snap back silently, or report the
   engine's refusal?** Assumed: report it, the same way a refused click does —
   the engine already has the sentence.
5. **With setup off the timeline (§3), what is frame 0 and how does a designer
   reopen setup?** Assumed: frame 0 is the authored scenario, and stepping back
   to it reopens setup — the gesture that exists today, minus the noise.
  a. yes. report illegal placement reason and snap back
