# The turn sequencer: moving the round into the engine

> # 🛠 Phases 1–4 built and archived. Only phase 5 remains.
>
> | # | Repo | Change | Status |
> |---|---|---|---|
> | 1 | harness | `dungeon-bench-telegraph-window` | ✅ archived 2026-08-20 |
> | 2 | track-web | `dungeon-turn-sequencer` | ✅ archived 2026-08-20 |
> | — | track-web | `dungeon-engine-plannable-attacks` | ✅ archived 2026-08-20 |
> | 3a | harness | `dungeon-bench-sequencer-adoption` | ✅ archived 2026-08-20 |
> | 3b | harness | `dungeon-bench-enemy-planning` | ✅ archived 2026-08-20 |
> | 4 | track-web | `dungeon-game-sequencer-adoption` | ✅ archived 2026-08-21 |
> | 5 | track-web | `dungeon-sequencer-guards` | ⬜ not started |
>
> `dungeon-engine-plannable-attacks` was not in the original plan. It came out of
> designing 3b: `commitNpcTurn` validates an authored attack from the enemy's
> post-move position, but no query exposed that set, so a designer would have
> picked a destination and then guessed at targets.
>
> **The engine owns the round and both hosts now drive it.** The shipped game and
> the design bench run the same round from the same code, which was the point.
> What remains is phase 5: turning on the guards and retiring the legacy path.
>
> Two host-owned transitions survive by design — `player → npc-attack` and
> `placement → npc-move`. Both are the player deciding they are finished, which
> is a decision rather than a rule; every transition *inside* the round is the
> engine's.

**Status:** phases 1-4 built and archived; phase 5 remains. Spans both repos
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

The round itself does not change. What changes is that the engine, rather than
each host, is the thing that knows it:

> An enemy's turn is **planned once** — its move executes as it is planned, its
> attack is chosen and **locked**. Later, the locked attacks **play out in the
> order they were planned**. Who does the planning is a decision the bench may
> take over from the AI. Everything after it is a rule the engine enforces.

---

## 2. The round, unchanged

```
npc-move    each enemy is planned, one at a time:
              its move EXECUTES immediately and is immutable thereafter
              its attack is CHOSEN and LOCKED as a telegraph
            ── AI does this in one tick (game)
            ── designer does it at their own pace (bench)
  player    PCs act, seeing the locked telegraphs
npc-attack  telegraphs RESOLVE, in the order they were planned
 endRound   → next round
```

There is **no separate planning phase**. Planning and movement are the same
pass, exactly as `runNpcMovePhase` already does it: each NPC "has its move
applied and animated immediately against the live board; its intended attack is
stored as a telegraph."

That the move executes *during* planning is what makes mixed authorship
compose. Plan enemy 2 into a doorway and enemy 3 is planned against a board
where enemy 2 already stands there — the same reason `computeNpcTurns` threads
a mutating `workingUnits` through its loop (`npc.ts:153-215`).

Movement being immutable once executed is load-bearing and already relied on:
`applyDefChange` (`DungeonTacticsGame.tsx:94`) re-plans telegraphs
mid-player-phase but explicitly not movement, "because movement for the round
has already executed and is immutable."

**`TurnPhase` is unchanged.** No new phase value, so no host breaks on a widened
union.

### Who owns what

| Concern | Owner | Why |
|---|---|---|
| What each enemy does this round | **Host decides, engine validates** | The AI's choice in the game; the designer's in the bench |
| Enemy turn order | **Host decides, engine validates** | It is simply the order they are planned in |
| Whether a move or attack is legal for that unit | **Engine** | Rule |
| That each living enemy is planned exactly once | **Engine** | Rule |
| That a planned move executes immediately and stays put | **Engine** | Rule |
| That telegraphs resolve in planned order, at resolution | **Engine** | Rule — the game's core tension |
| Phase transitions, and that none is skipped | **Engine** | Rule |
| Amending a locked telegraph mid-round | **Bench only** — see §6 | Deliberate rule-break |
| *When* the next step happens in wall-clock time | **Host** | Pacing |

The designer may plan anything legal, including what the AI never would — every
enemy holding is a valid round of all-`stay` plans. What they cannot do is skip
an enemy, plan one twice, plan an illegal move or attack, or resolve a telegraph
early.

**This sits alongside §9.2 of the action-surface plan** (bench *setup* is direct
state editing, outside the action surface). Both are deliberate boundaries;
write them into the spec so a later reader does not "fix" them.

---

## 3. What moves into `GameState`

The enforcement gap today is structural, not a missing check. `computeNpcTurns`
returns `{ moves, attackPlans }` and **the host keeps the movement half in a
local variable**. The engine never sees it, so it cannot enforce a count or an
order. `resolveNpcAction` validates movement blocking (`npc.ts:326`) and nothing
about sequencing — no phase check, no already-planned check.

Because moves execute as they are planned, there is no pending move plan to
store. The additions are small:

```ts
// Enemies already planned this round: move executed, attack locked. The engine's
// record that a unit's turn is spent, whoever authored it.
npcPlannedThisRound: string[]

// Telegraphs already resolved this `npc-attack` phase, by unit id rather than
// index so the record survives a unit dying mid-resolution and survives the
// bench rewinding into the middle of the phase.
npcPlansResolved: string[]
```

`npcPlans` already exists, already holds the locked telegraphs, and is already
in planning order — `computeNpcTurns` pushes to it in unit-iteration order and
`runNpcAttackPhase` walks it by index. **It is already the plan.** It just has
no engine-side notion of progress through it, and no companion record for the
movement half.

Three properties follow from tracking this in state rather than beside it:

1. **The bench's transport strip reverses round progress for free.** Frames are
   full states, so rewinding into a half-planned enemy phase restores exactly
   who had been planned, and the designer can choose differently.
2. **Planning a unit twice becomes unrepresentable**, not merely checked — see
   §7.
3. **The agent cannot desynchronise it**, because there is no second copy.

---

## 4. The API

### Planning — during `npc-move`

| Operation | Call | Who chooses |
|---|---|---|
| Designer plans one enemy | `commitNpcTurn(state, unitId, move, telegraph?)` | Designer |
| AI plans one named enemy | `advanceNpc(state, unitId)` | Engine, for that unit |
| AI plans the next unplanned enemy | `advance(state)` | Engine |
| AI plans all remaining | `advance` until the phase transitions | Engine |

All of them execute the move and lock the telegraph in one step, because that is
what planning an enemy *is*. All validate identically: the move must be legal
from the unit's current position, the telegraph legal from its **post-move**
position, and the unit must not already be in `npcPlannedThisRound`.

`stay` is always a legal move, so "every enemy holds" needs no special case.

There is no reorder operation. **Turn order is the order enemies are planned
in** — choosing who to plan next *is* choosing the order.

`advance` with every enemy planned performs the **phase transition** to
`player`, and refuses to transition while any living enemy is unplanned. A
skipped enemy is always an error, never an accident.

#### The per-unit planner

`planNpcUnit(state, unitId)` — what the AI would choose for one unit, against
current state, as a pure query. `computeNpcTurns` refolds onto it. This is a
decomposition, not a rewrite: the loop body is already `continue`-terminated per
unit, and the shared setup (`towerImmune`, `towerPos`, `npcFilter`) lifts into a
context argument. `replanIds` (`npc.ts:137-151`) is existing precedent for
planning a subset.

### Execution — during `npc-attack`

```ts
advance(state): { ok: true; state; step: ExecutedStep } | { ok: false; reason }
```

**It takes no unit id.** The plan already fixed the order, so a host cannot
resolve out of order — it can only decide *when* the next resolution happens.
`advance` resolves the next unresolved entry of `npcPlans`, then transitions and
chains into the next round when the list is spent.

`resolveNpcAction` stops being host-facing and becomes the raw applier `advance`
calls. That demotion is what makes the enforcement real: today it is the public
entry point and it checks nothing.

### Queries

```ts
nextAction(state): NextStep | null
  //   { kind: 'plan-enemy'; unitId; suggested: NpcAction }   during npc-move
  //   { kind: 'telegraph';  unitId; attack }                 during npc-attack
  //   { kind: 'phase-transition'; from; to }

unplannedNpcs(state): string[]
plannedTelegraph(state, unitId): NpcAttackPlan | null
```

During `npc-attack`, `nextAction` is a **pure read of the next unresolved
telegraph** — not a re-derivation that might disagree with `advance`. Protect
that: if it ever has to *compute* the answer, the plan has drifted out of state
and the design has been lost. The discipline is the one `preview` already
follows, and `actions.ts:259-266` records why hand-written previews are
dangerous — they are how the game's attack animations drifted from
`attackFootprint` and began lying about an edited definition.

---

## 5. Refusals a host must surface

Every one returns `{ ok: false, reason }` in plain English, per §9.4 of the
action-surface plan. Hosts display the sentence; they do not pre-filter.

| Attempt | Refused because |
|---|---|
| Plan an enemy already planned this round | Its turn is spent |
| Plan a move outside its range, or through a blocked path | Illegal move |
| Lock a telegraph not reachable from its post-move position | Illegal attack |
| Leave `npc-move` with an enemy unplanned | The round is incomplete |
| Resolve a telegraph out of planned order | Not the engine's next step |
| Act with a PC outside the `player` phase | Not the player's turn (phase 5) |
| Call a bench-only operation while in `game` mode | Not available in the game — see §6.1 |

---

## 6. The one rule the bench breaks: amending a locked telegraph

In the game a telegraph is locked once planned — that is the round's core
tension, and the player has no way to change it. **The bench designer does.**

The need is real: noticing a bad enemy attack plan halfway through the PC turn
should not cost a rewind back through the entire turn. The transport strip
exists to remove exactly that friction.

And the amendment is **retroactive**. Per the requirement: the change alters the
plan *and* the outcome, so that on replay it reads as though the designer had
planned it correctly from the start. There is no "designer changed their mind"
event in the history.

### Why this is safe

**Nothing reads `npcPlans` between lock and resolution.** Verified: no reads in
`actions.ts`, `pc.ts`, or `pathfinding.ts`; the only engine read is
`npc.ts:139`, the `replanIds` path, which *preserves* prior telegraphs rather
than consuming them. A telegraph is display-only until `npc-attack` walks it.

So rewriting one across the intervening frames leaves every other piece of state
consistent — there is no downstream value derived from it to invalidate. There
is precedent, too: `applyDefChange` already mutates `npcPlans` mid-player-phase
when a definition changes, attack-only, movement untouched.

What it does *not* stay consistent with is the designer's own PC decisions,
which were made while looking at the old telegraph. That is a semantic wrinkle,
not a correctness one, and it is the price of the feature being retroactive
rather than an event.

### 6.1 Engine mode: the guard that keeps this bench-only

A deliberate rule-break needs a fence, or it becomes a rule. The engine gains an
explicit notion of **which host is running it**:

```ts
export type EngineMode = 'game' | 'bench'

// Defaults to 'game' — the conservative setting. A host that wants bench-only
// affordances must say so; forgetting to opt in fails closed, and no amount of
// forgetting can open the game up.
setEngineMode(mode: EngineMode): void
getEngineMode(): EngineMode
```

`amendTelegraph` refuses unless the mode is `'bench'`. The refusal uses the same
`{ ok: false, reason }` shape as every other refusal in §5 rather than throwing,
so it is uniform, testable, and surfaces through the host's existing refusal
path. (A throw would be louder for what is arguably a programming error; the
uniformity is worth more, and the game never renders a control for this in the
first place.)

**Defaulting to `'game'` means unit tests must opt in.** Any test exercising a
bench-only operation sets `setEngineMode('bench')` in its setup and restores it
afterwards — the same discipline the existing `defStore`/`contentStore` tests
already follow for module-level state. `dungeon-harness-server` sets it once at
startup; `client-games` never sets it and gets the default.

This is process-global rather than per-`GameState` on purpose: one process is
either the game or the bench, and it never changes at runtime. It is *not* the
same category as the board and unit-def singletons the README flags for
instance-scoping — those need per-instance values for the survey grid, and this
never will.

### The two halves

1. **Engine — phase 2.** `amendTelegraph(state, unitId, tile)`, validated legal
   from the unit's post-move position, sharing validation with `commitNpcTurn`.
   Refuses on a dead unit, an unplanned unit, a telegraph that has already
   resolved, or a call made in `'game'` mode (§6.1).

   **Gated on "not yet resolved", not on the `player` phase.** An earlier draft
   of this plan said "outside `player`"; that is narrower than the window this
   feature is defined by. The window is *after locked, before resolves*, and a
   telegraph still pending partway through `npc-attack` is squarely inside it —
   which matters in the bench, where the designer can scrub into the middle of
   resolution. Resolution state is the correctly general form of the constraint
   and subsumes the player-phase case. (Corrected 2026-08-20, during
   implementation.)
2. **Bench timeline — phase 3b.** The retroactive rewrite: replace that unit's
   entry in `npcPlans` across every frame from the planning point to the
   cursor, so a replay shows the amended telegraph from the moment it locked.
   A slice-map over frames, bench-only, no engine involvement.

### Semantics to write into the spec

- Rewind to **before** this round's planning and re-plan → the amendment is
  gone. It belonged to a plan that no longer exists.
- Rewind to any frame **at or after** the lock → the amended telegraph shows.
  This is what "looks like it was planned correctly initially" means.
- **The unit died since planning** → refuse. There is no telegraph to amend.
- **Amending never un-executes the move.** Movement stays immutable; this
  changes the attack only, exactly as `applyDefChange` does.

### Build it now, not deferred

The engine half is small and shares validation with work already in phase 2. The
timeline half is a slice-map. Deferring it ships a planning model whose only
escape hatch is rewinding through the whole PC turn — the friction the transport
strip was built to remove — and retrofitting retroactive semantics onto a
timeline is much more expensive than specifying them once, now.

---

## 7. The double-act defect

`computeNpcTurns` does not read `movedThisTurn` or `attackedThisTurn` — the only
occurrences in `npc.ts` (304-305, 361-362) are resets, not reads. So today:
hand-drive an enemy through the validated path, which records its movement, then
run the AI, and the AI plans a fresh full move for that same unit. It acts twice
in one round.

**Reproduced 2026-08-20**, as planned, before anything was asserted about it:
hand-driving an NPC one tile via `commitAction` (which records `movedThisTurn`)
and then calling `computeNpcTurns` on the result returns a fresh action for that
same unit, which a host would apply as its second of the round. Kept as a
regression test.

Worth being precise about what fixes it, because an earlier draft of this
section overstated it. `npcPlannedThisRound` is **separate bookkeeping** from
`movedThisTurn`/`attackedThisTurn`, and the sequencer never reads the latter.
`commitAction` and `computeNpcTurns` are deliberately untouched — the tripwire
in phase 2 forbids changing them.

So the legacy combination still double-acts in isolation: hand-drive an enemy
through the action surface, then plan it through `computeNpcTurns`, and it acts
twice. What phase 2 establishes is narrower and sufficient: **once a host drives
its enemy turn through the sequencer**, both the hand-drive and the AI plan pass
the same `npcPlannedThisRound` gate, and a unit whose turn is spent cannot be
planned again by anyone. That is what phases 3a, 3b and 4 have the hosts adopt.

No host mixes the two mechanisms in one round today, so this is not a live bug —
but it is not closed by phase 2 either, and phase 5's guards are what finally
retire the legacy path. The regression test asserts the sequencer's gate, not a
fix to `computeNpcTurns`.

---

## 8. The phases

Six changes across five phases — phase 3 splits into 3a and 3b, leaving the
other numbers unchanged. Every one leaves both hosts working — no phase requires the other
repo to land first to stay green.

| # | Repo | Change | Depends on |
|---|---|---|---|
| 1 | harness | `dungeon-bench-telegraph-window` | — |
| 2 | track-web | `dungeon-turn-sequencer` | — |
| 3a | harness | `dungeon-bench-sequencer-adoption` | 2 |
| 3b | harness | `dungeon-bench-enemy-planning` | 3a |
| 4 | track-web | `dungeon-game-sequencer-adoption` | 2 |
| 5 | track-web | `dungeon-sequencer-guards` | 3b, 4 |

> **Archive each change as soon as its work is verified** — validate, archive,
> and let it sync into `openspec/specs/`. Do not run two phases with an
> unarchived one behind you.
>
> This plan is unusually exposed to that. Phases 1, 3a and 3b all modify the
> *same* capability (`dungeon-bench`), and a delta is written against the main
> spec as it stands — so leaving one unarchived means the next is written
> against a spec missing the first's requirements, and `openspec archive` refuses
> it. That happened here: archiving 3a failed twice, once because its `MODIFIED`
> block had to carry forward scenarios phase 1 had added, and once because a
> requirement 3a *removes* could not be expressed as a `MODIFIED` at all. Both
> were fixable, and both were avoidable by archiving in step.

### Phase 1 — `dungeon-bench-telegraph-window` (harness)

**Stops the bench lying, immediately, with no engine change.**

`runEnemyAi` (`bench-store.ts:551-566`) resolves moves at line 558, resolves
attacks at 559, then stores those same plans as `npcPlans` at 562 — and
`BoardView.tsx:156` draws a red X on each target tile. The designer sees
"incoming attack" markers for attacks that already landed.

- Split `runEnemyAi` into **plan the enemy turn (moves execute, attacks lock)**
  and **resolve telegraphs**, with the designer acting in between.
- Two controls where there was one; two frames on the transport strip where
  there was one, so the telegraph window is a scrubbable interval.

Independently useful, and a strict subset of phase 3a. Ships first because the
misleading overlay is live today and 3a is gated on phase 2.

### Phase 2 — `dungeon-turn-sequencer` (track-web)

**The engine gains the round. Purely additive — no host touched, no behaviour
change, no `TurnPhase` change.**

- `npcPlannedThisRound` and `npcPlansResolved` in `GameState` (§3).
- `planNpcUnit` extracted; `computeNpcTurns` refolded onto it (§4).
- Planning: `commitNpcTurn`, `advanceNpc`, and `advance`'s `npc-move` behaviour,
  with the completeness rule on the transition to `player`.
- Execution: `advance`'s `npc-attack` behaviour, in `npcPlans` order.
- Queries: `nextAction`, `unplannedNpcs`, `plannedTelegraph`.
- `EngineMode` (`setEngineMode`/`getEngineMode`), defaulting to `'game'` (§6.1).
- `amendTelegraph` (§6), validated and bench-gated.
- `endRound` stops setting `phase: 'player'` for a host to immediately overwrite
  with `'npc-move'` — the transient lie finding 5 flagged.
- Every refusal in §5, each with a test; plus the double-act regression (§7).

Lands and sits stable while two hosts migrate against it, exactly as
`dungeon-engine-action-surface` did.

### Phase 3a — `dungeon-bench-sequencer-adoption` (harness)

**The bench runs on the engine's round.** No new authoring UI.

The bench currently pins `phase: 'player'` at construction
(`bench-store.ts:202`) and never leaves it. Real phases arrive here.

- **Phase awareness**: the bench tracks `TurnPhase` and moves through it via the
  engine rather than sitting in one phase forever.
- **Resolution driven by `advance`**, with phase 1's plan/resolve split
  re-expressed on the engine's phases instead of the bench's own sequencing.
- **The existing AI-driven enemy turn is preserved** — the designer can still
  hand the whole enemy side to the AI, now through the engine's round.
- **Upcoming-action display** from `nextAction`, shown while scrubbing.
- **Telegraph legibility.** The marker is nearly invisible at normal zoom (see
  the TODO under "Recorded, not scheduled" in [`phase-plan.md`](phase-plan.md)).
  Fixed here rather than in 3b, because 3b paints more overlay content into the
  same tiles and would compound the problem rather than reveal it.
- Agent tools follow the same operations, 1:1 over engine calls.

Mostly mechanical, and it de-risks the engine API cheaply — which is the stated
reason the bench adopts before the game. A working bench at the end of it.

### Phase 3b — `dungeon-bench-enemy-planning` (harness)

**The designer takes over planning from the AI.** The genuinely new interaction
design, and the part most likely to want iteration once 3a has been used.

- **Planning UI** for `npc-move`: per-enemy move and attack intent, planned one
  enemy at a time with the board updating as each move executes, showing which
  enemies are still unplanned and who authored each plan.
- **Plan this enemy by hand** — `commitNpcTurn`.
- **Run AI for this enemy** — `advanceNpc`.
- **Run AI for all remaining** — `advance` until the phase transitions.
- **Amend a locked telegraph** during the player phase, plus the retroactive
  frame rewrite and its semantics (§6). This is the one place the bench
  deliberately breaks a game rule, and it gets its own reviewable change here
  rather than riding along inside a larger one.
- Agent tools for each, 1:1 over the engine calls, per the standing rule that no
  tool computes or describes a rule outcome itself.

### Phase 4 — `dungeon-game-sequencer-adoption` (track-web)

**The game adopts; `runNpcMovePhase`/`runNpcAttackPhase` become pacing
drivers.**

Those two functions (`DungeonTacticsGame.tsx:338-385`) are continuation-passing
recursions driven by `animateNpcAction` callbacks. The recursion stays — it is
pacing, which is the host's job. What changes is that each step asks the engine
what to do instead of walking a host-held array.

- `step(idx)` over a local `moves` array → `advance`, driven from the animation
  completion callback, through both `npc-move` and `npc-attack`.
- `nextAction` feeds animation planning, so the scene knows what is coming
  without re-deriving it.
- The `replanIds` path (`applyDefChange`) **stays as it is.** An earlier draft
  said to re-express it via `amendTelegraph`; that is wrong, and would not even
  run — `amendTelegraph` is bench-gated and the game is in `'game'` mode. The two
  are different operations that happen to touch the same field: `amendTelegraph`
  is *a person retargeting a locked attack*, which the game must never allow,
  while `applyDefChange`'s replan is *a definition change invalidating a
  telegraph the AI derived from it*, which both hosts must do. Corrected
  2026-08-20.
- Round chaining (`endRound` → `runNpcMovePhase`) becomes an engine transition.

The riskiest phase, deliberately last among the adoptions, with the shape
already proven by 3a and 3b.

### Phase 5 — `dungeon-sequencer-guards` (track-web)

**Turn on enforcement, once both hosts are correct.**

Held to here because a guard that lands before its hosts are phase-aware breaks
them.

- **Phase guard in `availableActions`** — `available: false`, reason "It is not
  the player's turn", when `phase !== 'player'`. Closes the PC-side hole:
  `availableActions` currently never reads `state.phase`.
- **`resolveNpcAction` demoted** to package-internal, or exported only as the
  raw applier with `advance` named as its sole intended caller.
- **Retire the legacy double-act path** (§7). With both hosts on the sequencer,
  nothing should still be able to reach `computeNpcTurns` and apply its result
  as a second action for a unit already planned. This is the phase where that
  becomes enforceable, because it is the first point at which changing
  `computeNpcTurns`' callers is safe.
- Confirm every refusal path in §5 has a plain-English reason and a test.

**This phase is what makes the work enforcement rather than convention.** Phase
1 will feel like it fixed the visible problem; phases 2-5 are what stop it
recurring in a third host.

---

## 9. Explicitly out of scope

- **Reactions and interrupts.** `turn-machines/expansion.md:260-270` calls
  reactions "the one part of this folder that touches the round loop" and
  recommends not building them until a playtest asks. Nothing here anticipates
  them.
- **Win/lose evaluation** — finding 10, still recorded and unscheduled.
- **Bench setup** — placement, HP setting, board generation stay direct state
  editing per §9.2.
- **Instance-scoping the engine** — still deferred until multiple boards.
- **Designer authoring of PC turns.** PCs are played, not planned.
- **Amending an executed move.** Movement is immutable once planned; only the
  telegraph is amendable (§6).
- **Runtime mode switching.** `EngineMode` is set once at host startup, not
  toggled per call or per board (§6.1).

---

## 10. Relationship to phase 5 of the rebuild

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

There is a second, stronger connection. A turn machine decides what a unit does
on its turn — which is exactly what `planNpcUnit` answers. Phase 5 replaces the
hand-written planner behind that one function and nothing downstream changes.
Building the sequencer now is not a detour from phase 5; it is the seam phase 5
plugs into.

**This work should therefore land before the turn-machine review, not after.**
The deferral rationale in [`phase-plan.md`](phase-plan.md) and
[`action-surface-plan.md`](action-surface-plan.md) has been corrected
accordingly.
