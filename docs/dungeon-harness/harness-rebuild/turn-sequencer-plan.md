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

The structure this plan turns on:

> An enemy turn is **planned**, then **executed**. Planning is a decision and
> the bench designer may take it over from the AI. Execution is a rule and the
> engine always drives it.

The plan is one artifact in one shape, and it does not care who authored it.
That is what lets the designer stand in for the AI without the bench acquiring
a round structure of its own.

---

## 2. Plan, then execute

The round, as the shipped game already plays it:

```
ROUND START
  npc-plan    the enemy turn is planned          ← AI, or the designer
  npc-move    planned moves EXECUTE              ← engine, immutable after
              attack intents become telegraphs
  player      PCs act, seeing what is coming
  npc-attack  telegraphs RESOLVE                 ← engine
  endRound    → next round
```

The bench mirrors this exactly. The only thing that differs is **who fills the
plan** during `npc-plan`, and how long that phase lasts: in the game the AI
fills it in one tick, and in the bench the designer sits in it for as long as
they like.

Movement being immutable once executed is load-bearing and already relied on:
`applyDefChange` (`DungeonTacticsGame.tsx:94`) re-plans telegraphs mid-player-
phase but explicitly not movement, "because movement for the round has already
executed and is immutable."

### Who owns what

| Concern | Owner | Why |
|---|---|---|
| What each enemy intends this round | **Host decides, engine validates** | A designer choice in the bench; the AI's in the game |
| Enemy turn order | **Host decides, engine validates** | Part of the plan, chosen when the plan is authored |
| Whether an intent is legal for that unit | **Engine** | Rule |
| That every living enemy has exactly one entry | **Engine** | Rule |
| That the plan executes in the order planned | **Engine** | Rule |
| Phase transitions, and that none is skipped | **Engine** | Rule |
| That telegraphs resolve at resolution, not on commit | **Engine** | Rule — the game's core tension |
| *When* the next step happens in wall-clock time | **Host** | Pacing — animation in the game, instant in the bench |

The designer may plan anything legal, including things the AI would never
choose — every enemy holding is a valid plan of all-`stay` entries. What they
cannot do is skip a unit, give one two entries, plan an illegal intent, execute
out of plan order, or resolve a telegraph early.

**This mirrors §9.2 of the action-surface plan** (bench *setup* is direct state
editing, outside the action surface). Write the boundary into the spec so a
later reader does not "fix" it.

---

## 3. The plan lives in `GameState`

The enforcement gap today is structural, not a missing check. `computeNpcTurns`
returns `{ moves, attackPlans }` and **the host keeps `moves` in a local
variable**, executes them, and stores only the attack half as `npcPlans`. The
engine never sees the movement plan at all, so it cannot enforce an order, a
count, or a phase. `resolveNpcAction` validates movement blocking
(`npc.ts:326`) and nothing about sequencing.

For the designer to author a plan, and for the engine to enforce and execute it,
the plan has to be in state:

```ts
// The enemy turn for this round, planned during `npc-plan` — by the AI in the
// game, by the designer or a mix of both in the bench. Ordered: the entry order
// IS the turn order. Exactly one entry per living NPC.
npcTurnPlan: NpcPlanEntry[] | null

interface NpcPlanEntry {
  unitId: string
  move: NpcAction                 // 'move' | 'stay' | 'exit'
  telegraph?: NpcAttackPlan       // attack intent, resolved in `npc-attack`
  author: 'ai' | 'designer'       // provenance, so the bench can show it
}

// Execution progress, by unit id rather than index so the record survives a
// unit dying mid-phase and survives the bench rewinding into the middle of one.
npcMovesExecuted: string[]
npcPlansResolved: string[]
```

`npcPlans` stays as the telegraph list the player sees; it is derived from the
entries' `telegraph` fields when `npc-move` completes.

`TurnPhase` gains `'npc-plan'`:
`'placement' | 'npc-plan' | 'npc-move' | 'player' | 'npc-attack'`.

Three properties fall out of putting the plan in state rather than beside it:

1. **The bench's transport strip reverses planning and execution alike**, for
   free. Frames are full states, so rewinding into `npc-plan` restores a
   half-authored plan and the designer can choose differently — the behaviour
   asked for, with no extra machinery.
2. **Double-acting becomes structurally impossible** rather than checked. One
   entry per unit is a shape constraint, not a guard that can be forgotten.
   See §7 for the defect this closes.
3. **The agent cannot desynchronise it**, because there is no second copy.

---

## 4. The two APIs

### Planning — `npc-plan` phase

Three authors, one entry shape, all validated identically.

| Operation | Call | Who chooses |
|---|---|---|
| AI plans the whole side | `planNpcTurn(state)` | Engine |
| AI plans one named unit | `planNpcUnit(state, unitId)` | Engine, for that unit |
| Designer authors an entry | `setNpcPlanEntry(state, entry)` | Designer |
| Designer sets turn order | `reorderNpcPlan(state, unitIds)` | Designer |
| Freeze and begin executing | `commitNpcPlan(state)` | — |

`commitNpcPlan` is where completeness is enforced: every living NPC has exactly
one entry, every entry is legal from that unit's current position, and every
telegraph is legal from that unit's *post-move* position. It refuses with a
plain-English reason per §9.4 of the action-surface plan, and it is the only way
to leave `npc-plan`.

`planNpcUnit` plans against **current** state, which is what makes mixed
authorship compose: if the designer has planned enemy 2 into a doorway, asking
the AI to plan enemy 1 gets a plan that accounts for it.

`stay` is always a legal entry, so "every enemy holds" needs no special case.

#### The per-unit planner

`computeNpcTurns` plans the whole side in one pass, threading a mutating
`workingUnits` so each NPC accounts for where earlier ones moved
(`npc.ts:153-215`). `planNpcUnit` needs one unit planned in isolation, so the
per-unit body is extracted and `computeNpcTurns` becomes a fold over it. This is
a decomposition, not a rewrite: the loop body is already `continue`-terminated
per unit, and the shared setup (`towerImmune`, `towerPos`, `npcFilter`) lifts
into a context argument. `replanIds` (`npc.ts:137-151`) is existing precedent
for planning a subset.

### Execution — `npc-move` and `npc-attack` phases

```ts
advance(state): { ok: true; state; step: ExecutedStep } | { ok: false; reason }
```

One entry point, and **it takes no unit id**. The plan already fixed the order,
so a host cannot execute out of order — it can only decide *when* the next step
happens. During `npc-move` it executes the next unexecuted entry's move; during
`npc-attack` it resolves the next unresolved telegraph; when the current phase's
work is done it performs the phase transition.

`resolveNpcAction` stops being host-facing and becomes the raw applier `advance`
calls. That demotion is what makes the enforcement real: today it is the public
entry point and it checks nothing.

---

## 5. The query layer

Both hosts need to see what is coming before it happens — the bench to show the
upcoming action while scrubbing, the game to plan animation.

```ts
nextAction(state): NextStep | null
  // What advance() will do next:
  //   { kind: 'unit-move'; unitId; move }
  //   { kind: 'telegraph'; unitId; attack }
  //   { kind: 'phase-transition'; from: TurnPhase; to: TurnPhase }

unplannedNpcs(state): string[]      // living NPCs with no entry yet
plannedEntry(state, unitId): NpcPlanEntry | null
```

Because the plan is stored, `nextAction` is a **pure read of the next
unexecuted entry** — not a re-derivation that might disagree with `advance`.
That is a real simplification over predicting an AI decision, and it is worth
protecting: if `nextAction` ever has to *compute* an answer rather than read
one, the plan has drifted out of state and the design has been lost.

The discipline here is the one `preview` already follows —
`actions.ts:259-266` records why hand-written previews are dangerous: they are
exactly how the game's attack animations drifted from `attackFootprint` and
began lying about an edited definition.

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
- Two controls where there was one; two frames on the transport strip where
  there was one, so the telegraph window is a scrubbable interval.

Independently useful, and a strict subset of phase 3. Ships first because the
misleading overlay is live today and phase 3 is gated on phase 2.

### Phase 2 — `dungeon-turn-sequencer` (track-web)

**The engine gains the plan and the round. Purely additive — no host touched,
no behaviour change.**

- `npcTurnPlan`, `npcMovesExecuted`, `npcPlansResolved` in `GameState`; the
  `'npc-plan'` phase added to `TurnPhase` (§3).
- `planNpcUnit` extracted; `computeNpcTurns` refolded onto it (§4).
- Planning API: `planNpcTurn`, `planNpcUnit`, `setNpcPlanEntry`,
  `reorderNpcPlan`, `commitNpcPlan` with completeness validation.
- Execution API: `advance`.
- Query API: `nextAction`, `unplannedNpcs`, `plannedEntry`.
- `endRound` stops setting `phase: 'player'` for a host to immediately overwrite
  with `'npc-move'` — the transient lie finding 5 flagged.
- **Tests, including the double-act regression** — see §7.

Lands and sits stable while two hosts migrate against it, exactly as
`dungeon-engine-action-surface` did. The new phase is unreachable until a host
drives the sequencer, so neither host breaks in the interval.

### Phase 3 — `dungeon-bench-sequencer-adoption` (harness)

**The bench adopts, becomes phase-aware, and gains a planning mode.**

The bench currently pins `phase: 'player'` at construction
(`bench-store.ts:202`) and never leaves it. Real phases arrive here, and with
them the `npc-plan` window the designer authors in — the largest piece of this
change, and the one with no counterpart in the game.

- **Planning mode UI** for `npc-plan`: per-enemy intent, turn order, and the
  provenance of each entry (designer-authored vs AI-filled).
- **Plan this enemy by hand** — `setNpcPlanEntry`.
- **Run AI for this enemy** — `planNpcUnit`.
- **Run AI for all remaining** — `planNpcUnit` across `unplannedNpcs`.
- **Begin the round** — `commitNpcPlan`, with refusals shown verbatim.
- Execution driven by `advance`; phase 1's split re-expressed on the engine's
  phases rather than the bench's own sequencing.
- **Upcoming-action display** from `nextAction`, shown while scrubbing.
- Agent tools for each, 1:1 over the engine calls, per the standing rule that no
  tool computes or describes a rule outcome itself.

The bench adopts before the game because it has no animation pipeline, so the
API gets exercised cheaply and shape problems surface before the riskier
migration.

### Phase 4 — `dungeon-game-sequencer-adoption` (track-web)

**The game adopts; `runNpcMovePhase`/`runNpcAttackPhase` become pacing
drivers.**

Those two functions (`DungeonTacticsGame.tsx:338-385`) are continuation-passing
recursions driven by `animateNpcAction` callbacks. The recursion stays — it is
pacing, which is the host's job. What changes is that each step asks the engine
what to do instead of walking a host-held array.

- Round start becomes `planNpcTurn` → `commitNpcPlan`, passing through
  `npc-plan` in a single tick.
- `step(idx)` over a local `moves` array → `advance`, driven from the animation
  completion callback.
- `nextAction` feeds animation planning, so the scene knows what is coming
  without re-deriving it.
- The `replanIds` path (`applyDefChange`) is re-expressed as amending the
  `telegraph` field of specific plan entries, leaving executed moves alone —
  which is what it already does, now said in the plan's own terms.
- Round chaining (`endRound` → `runNpcMovePhase`) becomes an engine transition.

The riskiest phase, deliberately last among the adoptions, with the shape
already proven by phase 3.

### Phase 5 — `dungeon-sequencer-guards` (track-web)

**Turn on enforcement, once both hosts are correct.**

Held to here because a guard that lands before its hosts are phase-aware breaks
them.

- **Phase guard in `availableActions`** — `available: false`, reason "It is not
  the player's turn", when `phase !== 'player'`. Closes the PC-side hole:
  `availableActions` currently never reads `state.phase`.
- **`resolveNpcAction` demoted** to package-internal, or exported only as the
  raw applier with `advance` named as its sole intended caller.
- Confirm every refusal path has a plain-English reason and a test.

**This phase is what makes the work enforcement rather than convention.** Phase
1 will feel like it fixed the visible problem; phases 2-5 are what stop it
recurring in a third host.

---

## 7. The double-act defect

`computeNpcTurns` does not read `movedThisTurn` or `attackedThisTurn` — the only
occurrences in `npc.ts` (304-305, 361-362) are resets, not reads. So today:
hand-drive an enemy through the validated path, which records its movement, then
run the AI, and the AI plans a fresh full move for that same unit. It acts twice
in one round.

This follows from reading the code; it has **not been reproduced by running
it**. Reproduce it first, then keep the reproduction as a regression test.

Worth noting *why* it disappears: not because phase 2 adds a check, but because
one-entry-per-unit is a shape constraint on `npcTurnPlan`. There is no longer a
representable state in which a unit acts twice. That is the better kind of fix,
and the regression test exists to prove the shape holds rather than to guard a
condition.

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
- **Designer authoring of PC turns.** PCs are played, not planned; the plan
  structure here covers the enemy side only, as the AI's does today.

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

There is a second, stronger connection. A turn machine's output *is* a plan
entry: the machine decides what a unit intends this round, and the engine
executes it. `npcTurnPlan` is therefore the seam the machines plug into —
`planNpcUnit` becomes "ask the machine" instead of "ask the hand-written AI,"
and nothing downstream changes. Building it now is not a detour from phase 5;
it is the interface phase 5 needs.

**This work should therefore land before the turn-machine review, not after.**
The deferral rationale in [`phase-plan.md`](phase-plan.md) and
[`action-surface-plan.md`](action-surface-plan.md) has been corrected
accordingly.
