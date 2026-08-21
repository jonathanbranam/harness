# Phase 5 correction: the bench does not play out of sequence

> **Status: decided; step 1 of 4 built.** Written 2026-08-21, after the designer
> rejected the premise phase 5 shipped on. **This is the plan of record for the
> dungeon work — start here.**
>
> **Decisions taken (2026-08-21):** Option B. **The bench and the game play by
> the same rules, with exactly one exception** — amending a locked telegraph.
> Further bench exceptions will be added back one at a time, deliberately, and
> only after the two hosts are provably identical. §8 works out what that means
> for scenario setup; §9 is the four changes that implement it.
>
> **§0 is the cold-start orientation** — repos, branches, commits, OpenSpec
> state, and what to do next. Read it before anything else.

## 0. Orientation for a fresh session

*Read this first if you have no prior context. Everything below §1 is the
reasoning; this section is the state of the world.*

### The one rule

**The bench and the game play by the same rules.** Exactly one exception:
amending a locked telegraph (§8.4). Further bench exceptions get argued back one
at a time, deliberately — never assumed, and never inferred from an older
document. If something you read grants the bench a licence to break a rule,
check it against this section before believing it.

### The two repos

| | Path | Branch |
|---|---|---|
| harness (this repo) | `/Volumes/Data/work/pi/harness` | `dungeon-harness-rebuild` |
| track-web (the engine lives here) | `/Volumes/Data/work/pi/track-web` | `dev` |

The engine is `track-web/packages/dungeon-engine`, consumed by the harness over a
relative `file:` path. Each repo has its **own** OpenSpec root. Neither repo's
work is complete without the other's.

### Where things stand (2026-08-21)

Both trees are clean and committed.

| Change | Repo | State |
|---|---|---|
| `dungeon-round-transitions` | track-web | **Step 1 — built, validated `--strict`, NOT archived** (awaiting review) |
| `dungeon-sequencer-guards` | track-web | **Built on the wrong premise. NOT archived.** Amended by step 3 — do not archive it as-is |
| `add-ui-layout-recording`, `restore-live-state-on-replay-exit` | harness | Paused introspect proposals, unrelated |
| `dungeon-tactics-sprite-rendering`, `food`, `add-from-tmdb-search`, `watch-ratings-filter-search-prototype` | track-web | Unrelated, unstarted |

Relevant commits: track-web `982b61b` (phase 5 as built), `85e2423` (dev
instance), `c6e3999` (step 1); harness `12e8313` (this plan), `2c7d161` (step 1).

**Archiving rule:** an OpenSpec change is archived only after the human says the
work is done — present it and wait. See either repo's `CLAUDE.md`.

### Progress against §9

1. ✅ **Phase ownership** — done 2026-08-21.
2. ⬅️ **The bench setup surface** — next, not started.
3. ⬜ Guards + spec correction (amends `dungeon-sequencer-guards`).
4. ⬜ Waves and flight.

### Verifying in a browser

Dev servers may already be running; **do not kill or restart any you did not
start.** For track-web you need a login, so stand up a disposable second instance
rather than touching the dev database — three commands in
`track-web/docs/dev-second-instance.md`. The bench is at `localhost:5177`,
password `TEMP`.

*(As of 2026-08-21 the instances found running on 3000/6035/4300/5177 were
leftovers from earlier sessions, not the developer's — ownership unconfirmed, so
still leave them alone.)*

### Two open questions, neither blocking

- Does an enemy at 1 HP flee during the player's turn, or wait for its own
  `npc-move`? Decides whether flight is ever a *reaction* (§8.5).
- Do bookmarks already cover "start this scenario on the player's turn", removing
  the need for a phase-setter? (§8.6)

---

## 1. The sentence that is wrong

`dungeon-sequencer-guards` (rebuild phase 5) landed a phase guard in
`availableActions` and then immediately punched a hole in it:

```ts
const outOfPhase = state.phase !== 'player' && getEngineMode() !== 'bench'
```

The justification, repeated in the change's proposal, its spec delta, the engine
source comment, and two harness test files, is:

> The harness bench drives both sides by hand, out of sequence, on purpose.

That is wrong. **The bench and the game play the same round in the same order.**
The bench's only departure from the game's rules is `amendTelegraph` — and that
one is not really a rule break either: it is a way for the designer to change an
enemy's committed action without rewinding and replaying the player's turn.

## 2. Where it came from

It was never a decision. It was a **deferral that hardened into a design
position** over three days:

| When | Where | What it said |
|---|---|---|
| 2026-08-19 | `archive/2026-08-19-dungeon-bench-action-adoption/design.md:16` | Non-Goals: *"Phase enforcement. The bench drives both sides out of sequence on purpose."* |
| — | `openspec/specs/dungeon-bench/spec.md:72` | Requirement: **Both sides are played by hand** |
| 2026-08-19→21 | phases 1–4 | Built the *correct* model: the engine owns the round, and the designer's enemy seat is **planning** (`planEnemyByHand`), exactly where the AI sits |
| 2026-08-21 | `dungeon-sequencer-guards` | Hit the contradiction between the new model and the old requirement — **and let the old requirement win** |

At the time it was written, "the bench drives both sides out of sequence" was
true and unavoidable: there was no sequencer to be in sequence *with*. Phases
1–4 removed the reason, but nobody went back and retired the sentence.

### The plan of record was already right

`turn-sequencer-plan.md` never asked for this. §8, phase 5:

> **Phase guard in `availableActions`** — `available: false`, reason "It is not
> the player's turn", when `phase !== 'player'`.

No exception. And §5's refusal table lists exactly one bench carve-out, and it
is the amendment:

> | Call a bench-only operation while in `game` mode | Not available in the game — see §6.1 |

So the implementation diverged from its own plan of record, in favour of a
stale spec. That is the failure mode worth naming: **when a plan and an older
spec disagree, the disagreement is a finding, not a tiebreak to resolve
silently.**

## 3. It is worse than an ordering violation

Driving an enemy through the PC action surface is not "the same rules in a
different phase". `commitAction`'s attack **resolves damage immediately**. In
the game an enemy attack is *always* a telegraph — locked in `npc-move`,
resolved in `npc-attack`, with the player's turn in between. That window is the
round's core tension.

So the hand-driven-enemy path was a *different rule*, not a differently-timed
one. It let the designer see an enemy attack that the game can never produce.

`planEnemyByHand` (phase 3b) is the strictly better replacement: same designer
intent, real telegraph, real window, engine-refereed.

## 4. Should we `git revert`? — decided: no

**No — and revert would not fix the actual problem.**

State of the tree right now:

- **track-web**: the phase-5 *implementation* is entirely uncommitted (8 files).
  Its *planning artifacts* are committed as `c2a0f71 Plan dungeon-sequencer-guards`,
  and those carry the wrong text.
- **harness**: two modified test files, uncommitted.
- Nothing is archived. No spec has absorbed the wrong requirement yet.

A revert would:

- throw away the two parts of phase 5 that are **not** in dispute — the ledger
  cross-check that ends the double-act, and demoting `resolveNpcAction` to
  package-internal (~340 lines, tested);
- leave the wrong idea completely intact, because it lives in an *archived*
  design and a *synced* spec, neither of which a revert touches;
- still require rewriting `c2a0f71`.

The correction is smaller than the revert. Recommend targeted correction.

## 5. The residual question — decided: Option B

Removing the escape hatch leaves a residual question: during the `player` phase,
should the action surface still offer actions for an **enemy** unit?

- **Option A — phase guard only.** `outOfPhase = state.phase !== 'player'`, full
  stop. An enemy placed mid-round, never planned, could still be driven by hand
  during the player phase. Smallest change; leaves the category alive.
- **Option B — the action surface is the player's, and only the player's.**
  ✅ **CHOSEN.** `availableActions` also refuses `unit.kind === 'npc'`. The
  enemy's only route into a round is planning, which is what §3 says it must be.
  Deletes the category instead of narrowing it.

Everything below assumes **B**.

## 6. The correction, in order

### Step 1 — track-web: amend `dungeon-sequencer-guards` in place

It is not archived, so it is still editable.

- `packages/dungeon-engine/src/actions.ts` — drop `&& getEngineMode() !== 'bench'`.
  Under B, add the `unit.kind === 'npc'` refusal. The `getEngineMode` import
  becomes unused; remove it.
- `specs/dungeon-tactics-action-surface/spec.md` (delta) — delete the bench
  exception from the requirement text, delete the **"The bench may act out of
  sequence"** scenario, and rename the requirement (it currently *ends* in
  "except in bench mode"). Under B, add a scenario for an enemy having no action
  surface.
- `proposal.md` — the bullet *"That restriction is lifted in bench mode"* goes.
- **Be honest about the cross-check.** Phase 5 claims a live defect: *"an enemy
  can act twice in a round"*, because two records track what an enemy did
  (`movedThisTurn`/`attackedThisTurn` for the action surface,
  `npcPlannedThisRound` for the sequencer) and neither reads the other. Under B,
  hand-driving an enemy no longer exists, so **the defect becomes unreachable
  from either host**. Keep `spentThroughActionSurface` and the `unplannedNpcs`
  filter — the engine should be correct for any host, including one that does not
  exist yet — but re-describe them as defence-in-depth. Do not leave the proposal
  advertising a bug fix for a bug the same change deletes the only route to.
  *(This is a wording change only; no code consequence.)*

### Step 2 — harness: a new OpenSpec change against `dungeon-bench`

No pile-up risk: the only other open changes here (`add-ui-layout-recording`,
`restore-live-state-on-replay-exit`) target deck capabilities.

- **REMOVED: "Both sides are played by hand"** (`spec.md:72`), with the reason —
  superseded by "The designer can plan an enemy's turn" (`spec.md:573`).
- **ADDED: "The bench plays the game's round, in the game's order."** The
  designer's seat for the enemy is the planning seat. The one departure the bench
  allows is amending a locked telegraph, and it is already spec'd at `spec.md:670`.
- Fix the Purpose paragraph (`spec.md:5`, *"plays it through by hand from both
  sides"*).

### Step 3 — harness code and tests

**Measured, not estimated.** With the escape hatch removed, the bench suites go
**21 failed / 96 passed of 117**. The failures split cleanly:

- **~18 are fixtures, not behaviour.** They build a board, place units, and act
  immediately — a fresh `BenchStore` starts in `npc-move` (see `emptyState`), so
  they were never in the player phase. They never *meant* to test out-of-sequence
  play; nothing stopped them. Fix: a `playerPhase()` fixture helper that advances
  the round, used in setup.
- **3 test the capability being removed** — "drives an NPC attack by hand against
  a PC", "will not let a hand-driven enemy attack twice in a round", and
  "reach and threat > drops a unit out of both fields once it has attacked".
  Re-aim onto `planEnemyByHand`, or delete alongside the requirement.

Also:

- **Delete the file-level `beforeEach(() => setEngineMode('bench'))`** that phase 5
  added to `bench-store.test.ts` and `intents.test.ts`. Keep it scoped to the
  amendment block, where it belongs. Blanket-setting it is what let 21 ordering
  violations pass unnoticed.
- **Revert the `intents.test.ts` second-enemy edit.** It exists only to route
  around the double-act; with the enemy no longer hand-drivable, the original
  single-enemy shape is correct again.

### Step 4 — the designer-facing and agent-facing surface

- `bench-bridge.ts`, `dungeon_move_unit` — *"Works for both sides: driving the
  enemy by hand is the point of this bench"* is now false. Rewrite, and point at
  the planning tools.
- `templates/agent-workspace/AGENTS.md` — the heading **"Playing — both sides, by
  hand"** and its bullets. Note the rest of this file is *already correct*: it
  says the enemy turn is the engine's round, describes the planning seat, and
  calls `amendTelegraph` "the one deliberate departure from the game's own
  rules". Only the older section contradicts it.
- `client-dungeon` — the board's click-to-act path should reflect that an enemy
  has no action surface. `BenchControls` and `EnemyPlanningPanel` are already
  phase-aware and need nothing.
- `harness-rebuild/phase-plan.md:120` — item 6, *"Play mode, both sides by
  hand… Enemies are driven the same way through `resolveNpcAction`"* — is
  superseded twice over (`resolveNpcAction` is going package-internal). Mark it.

### Step 5 — kill the sentence at its source

`2026-08-19-dungeon-bench-action-adoption` is archived and should not be edited.
Instead, record in `docs/dungeon-harness/STATUS.md` that its Non-Goal was a
*deferral*, later misread as a design position — so the next reader does not
repeat the inference.

### Step 6 — re-verify

Four suites (track-web unit + Gherkin, harness unit, both typechecks), then both
hosts in a browser: a full game round, and a full bench round including planning
by hand, planning by AI, and an amendment.

## 7. What does not change about phase 5's other two fixes

- The engine mode itself stays. It is the right fence for `amendTelegraph`; it
  was simply used for a second thing it should not have been.
- The double-act cross-check stays (see Step 1's caveat).
- `resolveNpcAction` still goes package-internal.
- Phases 1–4 are untouched. They already built the correct model — this is
  finishing the job of retiring what they replaced.

---

## 8. Scenario setup, once the bench plays by the game's rules

Making the bench identical to the game closes the door the bench used for setup:
a fresh `BenchStore` starts in `npc-move` (`emptyState`) and the designer edits
freely at any time, because nothing ever refused. Under a strict phase guard
that has to become an explicit phase rather than an accident.

### 8.1 Three categories, kept apart

The single most useful thing this correction can do is stop conflating three
things that got merged into "the bench breaks rules":

| Category | What it is | Rule |
|---|---|---|
| **Setup** | Deciding the starting position | Unconstrained. A bench board is a scenario board and need not be a legal game setup. **Not an exception** — the game has a setup phase too; the bench's is just richer. |
| **Play** | What may happen once the scenario starts | **Identical to the game.** One exception, listed below. |
| **Ahead of the game** | A capability the game is designed to have and has not built yet | Not an exception either. The bench gets there first. |

The old "both sides are played by hand, out of sequence" collapsed all three
into one licence. That is how it grew.

### 8.2 Who owns setup

**In the game, the engine owns the starting position outright, and it is
loaded, not authored.** `initialState()` (`npc.ts:340`) is an engine function
that reads `boardCells()`, `enemySpawners()`, and `playerStartTiles()` from the
engine's own content store and returns the whole opening state — terrain,
structures, the enemy manifest seated on spawner tiles, four PCs seated in the
player spawn zone, `spawners`, and `phase: 'placement'`.

The host does exactly two things, and neither is construction:

1. **Fetches bytes and hands them to the engine.** `loadMapById()` /
   `loadFromServer()` call the engine's `applyLoaded` / `deserialize`. This is
   the boundary rule from `phase-plan.md`: *the package holds rules and
   in-memory stores only; loading stays in the hosts*, because `fetch` and
   `localStorage` do not exist under Node.
2. **Calls `initialState()`.**

There is no manual editing in the game at all. A player never places a unit;
they reposition PCs *within the spawn zone* during `placement`, and that is a
turn affordance, not an edit.

**So the right statement of §8.2 is not "setup is the placement phase". It is:**

> In the game, the starting position is **loaded** — the engine builds it from
> loaded content, and the host only supplies the bytes. The bench's manual setup
> is a **guarded, bench-only surface on the engine**, reached only in
> `placement` and only in bench mode.

### 8.2.1 The bench is currently doing this itself, and should not be

`BenchStore` hand-rolls its own `emptyState()` — a second, independent
construction of a `GameState` sitting alongside `initialState()`. And its setup
operations decide game facts locally:

```ts
// bench-store.ts, placeUnit
if (this.state.units.some((u) => u.col === col && u.row === row)) return fail('... already occupied')
if (this.state.cells[row][col].hasStructure)                      return fail('... holds a structure')
const def = getDef(unitType)
const unit: Unit = { id: `${unitType}-${++this.unitSeq}`, kind: kindOf(unitType), ..., hp: hp ?? def.maxHp }
```

"A structure blocks a tile", "two units cannot share a tile", "a fresh unit
starts at its archetype's max HP", and how a unit id is formed are all engine
facts, implemented in the harness. **This is the same invariant the rest of the
bench holds strictly** — *the engine referees, never the harness* — and the setup
path never adopted it, because setup was waved through as "not gameplay".

That makes this correction bigger than it first looked, and better motivated:
moving setup into the engine is not new scope invented by the phase guard, it is
**an existing violation of the bench's own core rule** that the phase guard
happens to expose.

### 8.2.2 The shape

A new bench-only engine surface, every function refused unless
`getEngineMode() === 'bench'` **and** `state.phase === 'placement'` (except where
noted in §8.5):

| Function | Replaces |
|---|---|
| `newScenario(cells)` | the bench's `emptyState` |
| `placeUnit(state, unitType, tile, hp?)` | `BenchStore.placeUnit`'s rule checks |
| `removeUnit`, `relocateUnit`, `setUnitHp`, `clearUnits` | their `BenchStore` counterparts |
| `placeStructure`, `removeStructure`, `moveStructure` | **new** — see §8.2.3 |
| `startScenario(state)` | `placement → npc-move` (§8.7) |

`BenchStore` keeps what is genuinely its own — the frame/timeline stack,
bookmarks, authorship tags, the action log, id sequencing if the engine does not
want it — and becomes a thin wrapper again for everything else.

### 8.2.3 Structures are new engine surface

The bench cannot place or move a structure today. Structures arrive only by
generating a board (`powerCenters`) or authoring exact rows (`P` / `T`
characters in `boardFromRows`). "Place and move structures" therefore needs
genuinely new engine functions, and they touch `cells` — the terrain grid —
rather than `units`, so they are a different code path from unit placement and
should be specced as such.

### 8.3 What is legal in each phase

| Phase | The designer may |
|---|---|
| `placement` | Everything: board, terrain, structures, any unit of either side on any tile, starting HP, session def tweaks |
| `npc-move` | Plan each enemy — by hand, by name to the AI, or hand the rest to the AI. **Add or remove enemies** (§8.5) |
| `player` | Drive PCs through the action surface. **Amend a locked telegraph** (§8.4) |
| `npc-attack` | Step through resolution |

### 8.4 The one exception: amending a locked telegraph

Unchanged, and now the *only* entry on this list. It is fenced by engine mode
and refused in `game`.

It is worth being precise about why this is barely a rule break at all: **it
changes no game state.** It spends no turn, moves no unit, deals no damage, and
grants no extra action. It rewrites the enemy's *intent*, retroactively, inside
the window between the telegraph locking and resolving — so that replaying the
scenario looks as though the designer had planned it correctly the first time.
It exists so a designer who spots a misplanned enemy does not have to rewind and
replay the whole player turn.

Two properties to preserve, and to assert in tests:

- The amended target is validated from **where the enemy already moved to**, not
  from where it started. The move is immutable; only the attack is rewritten.
- The amendment is refused once the telegraph has resolved
  (`npcPlansResolved`) — after that there is nothing left to rewrite.

### 8.5 `spawnWave` and enemy flight — both are game mechanics, arriving early

Two operations reach into `npc-move`. **Neither is an exception**: both are
designed game mechanics that are not built yet, and the bench gets there first
by doing them by hand.

#### `spawnWave` — enemies arriving mid-encounter

`docs/games/dungeon-tactics/content_model.md` already models this:

> **Wave** — a group of enemies that enters during an encounter, with a **start
> trigger** governing when it appears.

with `enemySpawnZone` tiles and triggers (`immediate`, `after-prev-cleared`), an
ordered wave list per Encounter, and `clear-all-waves` as a win condition. In the
game a wave will fire on a trigger; in the bench the designer fires it by hand.

- Takes a **collection** of enemies, not one — that is what a wave is.
- The arrivals join `unplannedNpcs`, **each gets a move and may commit an
  attack**, and `npc-move` cannot end until they are planned. That falls out of
  the sequencer already and is exactly right.
- Bench signature names tiles explicitly (`{ unitType, col, row }[]`), because
  `enemySpawnZone` does not exist on a bench board. When the game builds waves it
  will resolve a zone to tiles and call the same function.

#### Enemy flight — the reverse

Some enemies will flee: at 1 HP, when surrounded, or when only one or two
teammates remain. **This is undesigned and unplanned** — the rule will live in
the NPC AI (or an NPC state machine that does not exist yet). For now, treat it
as the enemy simply disappearing from the board.

- Same phase, `npc-move`, because fleeing is a decision an enemy makes on its own
  turn.
- Name it for what it is (`flee` / `enemyFlees`), not `removeUnit`. When the AI
  eventually decides this for itself, it should call the function the designer
  has been calling, and the harness's action log should already read "the
  short-range fled" rather than "removed short-range-2".
- **Removing an enemy mid-round has consequences the engine must handle**, and
  mostly already does: a fled enemy must leave `unplannedNpcs`, and if it had
  already locked a telegraph that telegraph must not resolve. The sequencer's
  liveness check (`nextAction`'s `skip-telegraph`) and the harness's
  `withoutDepartedUnits` cover this; both need a test aimed at flight
  specifically rather than at a unit dying.

**Open question:** an enemy reduced to 1 HP *during the player's turn* plausibly
wants to flee immediately, not at the start of its next `npc-move`. Keeping it to
`npc-move` is the conservative choice and matches "decisions happen on your own
turn". Worth confirming, since it decides whether flight is ever a *reaction* —
and reactions are explicitly out of scope (§9 of the sequencer plan).

### 8.6 Deferred: choosing which turn a scenario starts on

The designer wanted to be able to set whose turn it is. Deferred, but with one
observation that may remove the need:

**Bookmarks already store and restore `phase`.** Saving a position during the
player phase and reloading it later *is* "start this scenario on the player's
turn" — and it has the property a raw phase-setter would not: the position was
reached legally, so it is a state the game could actually be in.

If a raw phase-setter is still wanted afterwards, it becomes exception #2 and
should be fenced by engine mode exactly as the amendment is.

### 8.7 The two remaining transitions move into the engine

`advance` owns every phase transition except two, and both are performed today
by each host assigning `state.phase` directly:

| Transition | Game | Bench |
|---|---|---|
| `placement → npc-move` | `DungeonTacticsGame.tsx:422` — `{ ...s, phase: 'npc-move', … }` | *(would be `startScenario`)* |
| `player → npc-attack` | `DungeonTacticsGame.tsx:450` — `{ ...s, phase: 'npc-attack', … }` | `BenchStore.endPlayerTurn:994` |

They agree today by coincidence and code review, not by construction — the same
shape of divergence the whole turn-sequencer effort existed to remove.

**Both move into the engine** as `startScenario(state)` and
`endPlayerTurn(state)`, so each host calls one shared function. This is a plain
refactor: the transitions already happen, and this only changes who performs
them.

### 8.7.1 Deferred: making a host-written `GameState` field impossible

**Decision (2026-08-21): deferred**, to a future pass that looks at
`GameState` mutability as a whole rather than at one field beside a rules fix.

The underlying issue is real and broader than the phase. `GameState` is plain
serializable data by design — the snapshot stack and bookmarks depend on that —
so nothing stops a host writing *any* field: `{ ...state, units: [...] }`
typechecks fine.

A branded phase type was prototyped and **does work** (verified against
`tsc --strict`, 2026-08-21): it rejects `{ ...s, phase: 'x' }`, `s.phase = 'x'`,
and `const p: TurnPhase = 'x'` while leaving reads and comparisons intact, and it
is erased at runtime so JSON is untouched. Its one cost is that a branded value
cannot index a `Record<TurnPhaseName, T>` (`TS7053`), needing an exported
widener at the few real lookup sites.

**Deferring it costs nothing today**, which is why deferring is the right call.
There are eight direct-write sites across both hosts:

| Host | Sites | Field |
|---|---|---|
| Game | 2 | `phase` |
| Bench | 6 | 5 × `units` (setup), 1 × `phase` |

The 5 `units` writes are closed by §8.2.2 moving setup into the engine. The 3
`phase` writes are closed by §8.7 above. **All eight are already addressed by
work that needs no type-level enforcement at all.** The brand would only stop the
*ninth* site — one written later, or by a third host. That is worth having, and
it is worth having as part of a deliberate look at the whole state shape, not as
a rider here.

Nor would it be airtight: `as any` defeats it. It converts an accidental write
into a compile error; it does not make the state genuinely private.

#### The direction to take when it is picked up

**Designer's call (2026-08-21), and it supersedes the brand:** `GameState` should
stay a plain serializable data object — that is not the problem. The problem is
that the engine hands its internal state to hosts *for modification*. The fix is
ordinary information hiding:

- A host that wants to **read** state calls a getter that returns a **copy**
  (read-only for clarity, but a copy regardless).
- Every change to the engine's state goes through an engine function.

That is a better answer than branding one field, because it addresses all
fourteen fields and does not depend on a type trick a host can cast away.

**Two things the future pass has to resolve**, noted here so they are not
discovered late:

1. **The engine is currently value-based, and the bench depends on that.**
   `advance(state) → newState`; the *host* holds the state. `BenchStore` keeps an
   array of frames with a cursor for step-back/forward, rewrites past frames for
   a telegraph amendment, and serializes whole states as bookmarks. An engine
   that owns "the" state internally needs a first-class way to hand a snapshot
   back in, or the bench's timeline has nowhere to live.

2. **It collides with the already-flagged instance-scoping question.** The engine
   holds module-level singletons (`defStore`, `contentStore`, `engine-mode`), and
   `turn-sequencer-plan.md` §6.1 already flags that a multi-board survey grid
   would need them per-instance. Moving `GameState` into the engine makes that
   sharper, not softer — the bench may want many boards live at once.

Worth separating two axes when the time comes: **who stores the state**, and
**whether handed-out values are mutable**. The second can be tightened on its own
(hand back frozen copies, accept state only through engine functions) without
inverting ownership — which may get most of the benefit at a fraction of the
disruption. That is a question for the pass, not a recommendation here.

## 9. Order of work

This is now materially larger than "correct phase 5" — §8.2 turns it into a real
engine setup API. It should be **four changes, not one**:

**1. Phase ownership (engine, both hosts).** ✅ **Done 2026-08-21** —
`dungeon-round-transitions` (track-web `c6e3999`, harness `2c7d161`; validated
`--strict`, **not archived**, awaiting review). `startScenario` and
`endPlayerTurn` moved into the engine (§8.7). No behaviour change — every
transition already happened; this only moved who performs it. **Type-level
enforcement was explicitly not part of it** (§8.7.1).

Two things it turned up that the plan had only predicted:
- The drift was **already real**: the game cleared the selection on both
  transitions and the bench cleared neither, and only the bench could refuse.
- The engine's convention of naming units by archetype alone
  (`unitDisplayName`) cannot express *which* enemies are holding a round up when
  several share an archetype. That one refusal now carries the id too.

**2. The bench setup surface (engine + harness).** ⬅️ **next.** §8.2.2 and §8.2.3. The bench
starts in `placement`, setup operations move into the engine behind the
bench-mode + `placement` guard, `BenchStore` drops its local rule checks and its
`emptyState`.

**3. The guards + the spec correction (both repos).** §6 Steps 1-4 and the
`dungeon-bench` spec change. **Must land after 2**, because the strict phase
guard is what breaks bench setup and change 2 is what gives it a legal home.

**4. Waves and flight (engine + harness).** §8.5. Purely additive, reaches one
phase, and safe to do last.

Then, later and one at a time, any further bench exception (§8.6 first, if it is
still wanted after bookmarks are reconsidered).

## 10. Other considerations

Things worth a decision, or at least an eye, before starting.

### 10.1 `planningPhase` is UI state living in the rules state

`GameState.planningPhase` (`'none' | 'selecting-move' | 'selecting-attack'`) is
"which action button is armed". The game reads it in five places; **the bench
does not use it at all** — it keeps the equivalent in host-local state
(`npcPlanCandidate`, and `NpcPlanStep` in the client).

So the two hosts already model the same idea differently. That is fine, and it
marks a boundary worth stating out loud: **the hosts must be identical in rules
and in the round — not in UI affordances.** Without that line drawn, "identical"
will eventually be read as "the bench must grow an armed-action state too", which
is not what any of this is for.

Separately: `planningPhase`, `plans`, and `planOrder` are residue of the PC
planning model the action surface replaced (`DungeonTacticsScene.ts:286` already
notes `state.plans` stopped being written "since PC actions became immediate").
Worth an audit, but not part of this work.

### 10.2 The bench has no spawners

`BenchStore` sets `spawners: []`; the game seeds enemies onto `enemySpawners()`.
Once waves resolve an `enemySpawnZone` to tiles (§8.5), the bench will want
spawn zones too — or will keep naming tiles explicitly forever. Fine to defer,
but decide it when waves are specced rather than discovering it then.

### 10.3 Unit id ownership

The bench forms ids as `<unitType>-<n>` from a local counter; the engine uses
fixed `pc-0…pc-3` / `npc-0…npc-4`. If placement moves into the engine, id
generation goes with it, and the engine needs a scheme that supports arbitrary
counts. There is an existing regression test about id collisions after loading a
bookmark with gaps — that behaviour must survive the move.

### 10.4 Bookmarks will break again, and that is fine

Starting a new board in `placement`, and any `GameState` shape change, invalidates
saved positions. The established policy holds: **refuse with a reason, do not
migrate.** Worth telling the designer to expect it rather than treating it as a
regression.

### 10.5 "Identical" needs a home in the docs

This decision — *the bench and the game play by the same rules, exceptions added
back one at a time and each argued on its own* — is the thing that was lost last
time. A non-goal in an archived change was where it went to die. It should live
in `docs/dungeon-harness/STATUS.md` and in the `dungeon-bench` spec's Purpose,
both of which are read at the start of the work rather than at the end.

### 10.6 The engine mode now fences two categories

`getEngineMode()` currently fences one thing (`amendTelegraph`). After change 2
it fences a whole setup API as well. Those are different in kind — one is a
rule-break, the other is an authoring surface the game simply has no use for —
and the mode's own doc comment should say so, or the next reader will infer that
everything behind the fence is a rule the bench breaks. **That inference is
exactly how the original mistake was made.**
