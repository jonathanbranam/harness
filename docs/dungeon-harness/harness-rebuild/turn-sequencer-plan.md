# The turn sequencer: moving the round into the engine

**Status:** plan, approved to build in phases (2026-08-20). Spans both repos
(`track-web`, `harness`).
**Closes:** finding 5 of [`action-surface-plan.md`](action-surface-plan.md),
deferred there as `dungeon-turn-sequencer`.
**Depends on:** the action surface (landed 2026-08-19).

---

## 1. The short version

The engine has the pieces of a round — `computeNpcTurns`, `resolveNpcAction`,
`endRound` — but nothing that puts them in order. That ordering lives in each
host, and the two hosts order them differently. The game telegraphs enemy
attacks and gives the player a window to react; the bench resolves moves and
attacks in a single commit and has no window at all.

This is the same class of failure the action surface fixed one level down, and
the fix has the same shape: **the engine owns the round, hosts drive the
pacing.**

The distinction this plan turns on, and the reason it is not simply "extract the
sequencer":

> The engine enforces the **rules of a round**, not a **script for a round**.
> *Which* enemy acts next is a decision. *Whether that decision is legal* is a
> rule. The bench may make any legal decision, including ones the AI would never
> make.

---

## 2. What each side owns

| Concern | Owner | Why |
|---|---|---|
| Whether a unit may act at all right now | **Engine** | Rule |
| Whether an action is legal (range, path, blocking, budget) | **Engine** | Rule — already `commitAction` |
| That a unit acts at most once per round | **Engine** | Rule, currently enforced nowhere |
| That a phase cannot be skipped or advanced early | **Engine** | Rule |
| That telegraphs resolve at resolution, not on commit | **Engine** | Rule — the game's core tension |
| *Which* enemy acts next | **Host decides, engine validates** | A designer choice in the bench; the AI's choice in the game |
| *What* a given enemy does | **Host decides, engine validates** | Same |
| *When* the next step happens in wall-clock time | **Host** | Pacing — animation in the game, instant in the bench |

The bench is allowed to do things the game never does: drive enemies in any
order, make every enemy hold, run the AI for one unit and hand-drive the rest.
None of that breaks a rule. What it may never do is act twice with one unit,
act out of phase, resolve a telegraph early, or commit an illegal action.

**This mirrors §9.2 of the action-surface plan** (bench *setup* is direct state
editing, outside the action surface). Write the boundary into the spec so a
later reader does not "fix" it.

---

## 3. The round ledger

The enforcement gap today is structural, not a missing check:
`computeNpcTurns` returns `{ moves, attackPlans }` and **the host keeps
`moves` in a local variable.** The engine never sees the queue, so it cannot
enforce an order, a count, or a phase. `resolveNpcAction` validates movement
blocking (`npc.ts:326`) and nothing about sequencing — no phase check, no
turn-order check, no already-acted check.

So the round's progress moves into `GameState`, exactly as the PC side already
works (`movedThisTurn`, `attackedThisTurn`):

```ts
// Round progress for the NPC side. The engine's record of which enemies have
// already acted this round, so a unit cannot be driven twice whether the
// decision came from the AI or from the designer driving it by hand.
npcActedThisRound: string[]

// Telegraphs already resolved this resolution phase, by unit id. Ids rather
// than an index, so the record survives a unit dying mid-resolution and
// survives the bench rewinding into the middle of a phase.
npcPlansResolved: string[]
```

`npcPlans` (the telegraphs themselves) is already in `GameState` and stays.

Two properties fall out of putting this in state rather than beside it:

1. **The bench's transport strip reverses round progress for free.** Frames are
   full states, so rewinding into the middle of an enemy phase restores exactly
   who had acted, and the designer can then choose differently — which is the
   behaviour asked for, with no extra machinery.
2. **The agent cannot desynchronise it**, because there is no second copy.

---

## 4. Three decision sources, one commit path

Every way an enemy can act funnels through the same validated commit. The
sources differ only in *who chooses*.

| Source | Call | Who chooses |
|---|---|---|
| Designer drives a unit | `commitNpcAction(state, unitId, action)` | Designer |
| AI drives one named unit | `advanceUnit(state, unitId)` | Engine, for that unit |
| AI drives all remaining | `advance(state)` in a loop | Engine, in its own order |

`advance(state)` with no pending units performs the **phase transition**
instead, and refuses to transition while units still owe a decision. "Every
enemy holds" is expressed as N explicit `stay` commits, not as an empty
advance — so a skipped unit is always an error and never an accident.

`resolveNpcAction` stops being host-facing and becomes the raw applier these
call. That is the demotion that makes the enforcement real: today it is the
public entry point and it checks nothing.

### The per-unit planner

`computeNpcTurns` currently plans the whole enemy side in one pass, threading a
mutating `workingUnits` so each NPC's plan accounts for where earlier ones
moved (`npc.ts:153-215`). "Run AI for this enemy" needs one unit planned
against **current** state, so the per-unit body is extracted:

```ts
planNpcAction(state, unitId): { move: NpcAction; telegraph?: NpcAttackPlan }
```

and `computeNpcTurns` becomes a fold over it. This is a decomposition, not a
rewrite — the body is already `continue`-terminated per unit, and the shared
setup (`towerImmune`, `towerPos`, `npcFilter`) is cheap to lift into a context
argument. `replanIds` (`npc.ts:137-151`) is existing precedent for planning a
subset.

Planning against current state is what makes hand-driving compose correctly: if
the designer moves enemy 2 by hand and then asks the AI to drive enemy 1,
enemy 1 plans around where enemy 2 actually stands.

---

## 5. The query layer

Both hosts need to know what is coming **before** it happens — the bench to show
the upcoming action while scrubbing, the game to plan animation. So the
sequencer ships with a pure query half:

```ts
pendingNpcs(state): string[]
  // Enemies that still owe a decision this phase, in the AI's preferred order.
  // The bench may act on them in any order; this is a suggestion, not a queue.

plannedAction(state, unitId): { move: NpcAction; telegraph?: NpcAttackPlan }
  // What the AI would choose for this unit right now. No commit, no state change.

nextAction(state): NextStep | null
  // What advance() would do next:
  //   { kind: 'unit-action'; unitId; action; telegraph? }
  //   { kind: 'phase-transition'; from: TurnPhase; to: TurnPhase }
  // null when the round cannot advance (e.g. no NPCs on the board).
```

**Discipline, carried over from `preview`:** a query must derive its answer from
the same code path the commit uses, never from a parallel re-derivation.
`preview` earns this by resolving against a copy and diffing, and
`actions.ts:259-266` records why — hand-written previews are exactly how the
game's attack animations drifted from `attackFootprint` and began lying about
an edited definition. `nextAction` must have the same property: it is
`advance` without the commit, not a second opinion about what `advance` will do.

---

## 6. The phases

Five changes. Every one leaves both hosts working — no phase requires the other
repo to land first to stay green.

| # | Repo | Change | Depends on |
|---|---|---|---|
| 1 | harness | `dungeon-bench-telegraph-window` | — |
| 2 | track-web | `dungeon-turn-sequencer` | — |
| 3 | harness | `dungeon-bench-sequencer-adoption` | 2 |
| 4 | track-web | `dungeon-game-sequencer-adoption` | 2 |
| 5 | track-web | `dungeon-sequencer-guards` | 3, 4 |

### Phase 1 — `dungeon-bench-telegraph-window` (harness)

**Stops the bench lying, immediately, with no engine change.**

`runEnemyAi` (`bench-store.ts:551-566`) resolves moves at line 558, resolves
attacks at 559, then stores those same plans as `npcPlans` at 562 — and
`BoardView.tsx:156` draws a red X on each target tile. The designer sees
"incoming attack" markers for attacks that already landed.

- Split `runEnemyAi` into **run enemy moves (telegraph attacks)** and **resolve
  telegraphs**, with the designer acting in between.
- Two controls in the bench where there was one; two frames on the transport
  strip where there was one, so the telegraph window is a scrubbable interval.

Independently useful, and a strict subset of phase 3. Ships first because the
misleading overlay is live today and phase 3 is gated on phase 2.

### Phase 2 — `dungeon-turn-sequencer` (track-web)

**The engine gains the round. Purely additive — no host touched, no behaviour
change.**

- `npcActedThisRound` and `npcPlansResolved` in `GameState` (§3).
- `planNpcAction` extracted; `computeNpcTurns` refolded onto it (§4).
- `commitNpcAction`, `advance`, `advanceUnit` — validated, returning the same
  `{ ok: false, reason }` shape as `commitAction`, with reasons in plain English
  per §9.4 of the action-surface plan.
- The query layer: `pendingNpcs`, `plannedAction`, `nextAction` (§5).
- `endRound` stops setting `phase: 'player'` for a host to immediately
  overwrite with `'npc-move'` — the transient lie finding 5 flagged.
- **Tests, including the double-act regression** — see §7.

Lands and sits stable while two hosts migrate against it, exactly as
`dungeon-engine-action-surface` did.

### Phase 3 — `dungeon-bench-sequencer-adoption` (harness)

**The bench adopts, and becomes phase-aware.**

The bench currently pins `phase: 'player'` at construction
(`bench-store.ts:202`) and never leaves it. Real phases arrive here.

- `runEnemyAi` → an `advance` loop; phase 1's split is re-expressed on the
  engine's phases rather than the bench's own sequencing.
- **Run AI for all remaining enemies** — `advance` until phase transition.
- **Run AI for this enemy** — `advanceUnit`.
- **Hand-drive this enemy** — `commitNpcAction`, replacing the current path
  through `commitSelected`.
- **Upcoming-action display** from `nextAction`, shown while scrubbing.
- Agent tools for each, 1:1 over the engine calls, per the standing rule that
  no tool computes or describes a rule outcome itself.

The bench adopts before the game because it has no animation pipeline, so the
API gets exercised cheaply and any shape problems surface before the riskier
migration.

### Phase 4 — `dungeon-game-sequencer-adoption` (track-web)

**The game adopts; `runNpcMovePhase`/`runNpcAttackPhase` become pacing
drivers.**

Those two functions (`DungeonTacticsGame.tsx:338-385`) are continuation-passing
recursions driven by `animateNpcAction` callbacks. The recursion stays — it is
pacing, which is the host's job. What changes is that each step asks the engine
what to do instead of walking a host-held array.

- `step(idx)` over a local `moves` array → `advance` driven from the animation
  completion callback.
- `nextAction` feeds animation planning, so the scene knows what is coming
  without re-deriving it.
- Round chaining (`endRound` → `runNpcMovePhase`) becomes an engine phase
  transition.

The riskiest phase, deliberately last among the adoptions, with the shape
already proven by phase 3.

### Phase 5 — `dungeon-sequencer-guards` (track-web)

**Turn on enforcement, once both hosts are correct.**

Held back to here because a guard that lands before its hosts are phase-aware
breaks them.

- **Phase guard in `availableActions`** — `available: false`, reason "It is not
  the player's turn", when `phase !== 'player'`. Closes the PC-side hole:
  `availableActions` currently never reads `state.phase`.
- **`resolveNpcAction` demoted** to package-internal, or exported only as the
  raw applier with the sequencer named as its sole intended caller.
- Confirm every refusal path has a plain-English reason and a test.

**This phase is what makes the work enforcement rather than convention.** Phase
1 will feel like it fixed the visible problem; phases 2-5 are what stop it
recurring in a third host.

---

## 7. The double-act defect

`computeNpcTurns` does not read `movedThisTurn` or `attackedThisTurn` — the
only occurrences in `npc.ts` (304-305, 361-362) are resets, not reads. So:
hand-drive an enemy through the validated path, which records its movement,
then run the AI, and the AI plans a fresh full move for that same unit. It acts
twice in one round.

This follows from reading the code; it has **not been reproduced by running
it**. Reproduce it first, then fix it in phase 2, and keep the reproduction as
a regression test — it is the sharpest available demonstration that two
individually-correct halves still make a wrong round.

---

## 8. Explicitly out of scope

- **Reactions and interrupts.** `turn-machines/expansion.md:260-270` calls
  reactions "the one part of this folder that touches the round loop" and
  recommends not building them until a playtest asks. Nothing here anticipates
  them.
- **Win/lose evaluation** — finding 10, still recorded and unscheduled.
- **Bench setup** — placement, HP setting, board generation stay direct state
  editing per §9.2.
- **Instance-scoping the engine** — still deferred until multiple boards.

---

## 9. Relationship to phase 5 of the rebuild

This was originally deferred partly on the grounds that it was "the finding most
likely to be reshaped by the turn-machine design." That reasoning does not
survive reading the design:

- `machine-definition.md:269` has machines hooking `round_start` / `round_end`.
  Machines **consume** the round structure; they do not define it.
- `expansion.md:263-267` assumes the round is already telegraph-shaped — "if the
  round is Into-the-Breach-shaped (enemies telegraph → player phase → resolve),
  most 'interrupt' designs become ordinary player-phase actions."

So the turn machines depend on this being well-defined rather than reshaping it.
If `round_start` and `round_end` stay host-defined and the two hosts disagree,
phase 5's machines inherit the divergence instead of resolving it.

**This work should therefore land before the turn-machine review, not after.**
The deferral rationale in [`phase-plan.md`](phase-plan.md) and
[`action-surface-plan.md`](action-surface-plan.md) has been corrected
accordingly.
