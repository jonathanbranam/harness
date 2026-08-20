# The action surface: gameplay that escaped the engine

> # ✅ LANDED 2026-08-19 — this plan was executed
>
> **Changes 1–3 of §7 are implemented and archived.** The engine owns the
> action surface, and both hosts dispatch through it:
>
> | Change | Repo | Archived as |
> |---|---|---|
> | `dungeon-engine-action-surface` | track-web | `2026-08-19-dungeon-engine-action-surface` |
> | `dungeon-game-action-adoption` | track-web | `2026-08-19-dungeon-game-action-adoption` |
> | `dungeon-bench-action-adoption` | harness | `2026-08-19-dungeon-bench-action-adoption` |
>
> Findings 1, 2, 3, 4, 6, 7, 8 and 9 are fixed. The game and the bench both aim
> **by tile**, and the bench's four direction buttons are gone.
>
> **Finding 5 (the turn sequencer and its telegraph window) is now planned**, not
> deferred — see [`turn-sequencer-plan.md`](turn-sequencer-plan.md), which
> supersedes §7's deferred `dungeon-turn-sequencer` row with five phased changes
> across both repos. The round itself does not change — an enemy is planned once,
> its move executing immediately and its attack locking as a telegraph, and the
> telegraphs later resolve in planned order. What changes is that the engine,
> rather than each host, is the thing that knows it. Who does the planning is a
> decision the bench designer may take over from the AI; everything after it is a
> rule. The bench gets exactly one deliberate rule-break, documented there:
> amending a locked telegraph mid-round, retroactively.
>
> **Still open:** finding 10 (win/lose evaluation), recorded but not scheduled.
>
> The sections below are preserved as the audit and rationale — read them as the
> record of *why* the surface looks the way it does, not as work outstanding.

**Status:** ✅ implemented (changes 1–3); sequencer deferred. Spans both repos
(`track-web`, `harness`).
**Date:** 2026-08-19.
**Trigger:** the bench's attack UI asks the designer for a *direction*; the game
asks for a *tile*. Reviewing that divergence turned up a class of problems, not
an instance.

---

## 1. The short version

The bench and the game disagree about how attacking works. That is not a
harness bug — it is the engine failing to own a thing both hosts need, so each
invented its own.

The engine exports geometry (`attackFootprint`, `validMoveDests`) but not the
layer above it: **what may this unit do right now, what may the player pick,
and is the thing they picked legal.** Every consumer builds that layer itself.
There are currently three consumers (the Phaser game, the harness bench, the
Gherkin step definitions) and three different answers.

The fix is to move that layer into `@repo/dungeon-engine` as an explicit action
surface, make it the only supported way for a host to drive a unit, and have it
**verify** committed actions rather than trust them. This is also the API the
turn-machine work will need, so building it now is not a detour.

---

## 2. The invariant this restores

> Anything that answers **"what may this unit do"** belongs to the engine.
> Hosts render and dispatch.

A host is allowed to offer *more* than the game does — the bench deliberately
places units outside spawn zones, drives NPCs by hand, and undoes anything.
That is the bench being a design tool. A host is never allowed to *decide
differently* about legality. The first is the feature; the second is the bug.

Every finding below is an instance of the second.

---

## 3. Findings

Severity is about what a designer would be told wrongly, since that is what
this harness exists to prevent.

| # | Finding | Where | Severity |
|---|---|---|---|
| 1 | Attack targeting semantics differ between hosts | game vs. bench | **High** |
| 2 | Tile→direction derivation is host-side, untested, and wrong at the edge | `DungeonTacticsGame.tsx:296-340` | **High** |
| 3 | The engine does not validate committed actions | `pc.ts` `resolvePcAction`, `applyMove` | **High** |
| 4 | Attack animations re-derive geometry from hardcoded archetype constants | `DungeonTacticsScene.ts:456-500` | **High** |
| 5 | Round/phase sequencing lives in the host; the bench has a different one | `DungeonTacticsGame.tsx:355-405` vs. `bench-store.ts` `runEnemyAi` | **Medium** |
| 6 | Def-change HP reconciliation is a rule implemented in one host only | `DungeonTacticsGame.tsx:98-118` | **Medium** |
| 7 | NPC targeting scanners are unexported, so the bench approximates threat | `npc.ts:10,55` (private) | **Medium** |
| 8 | Action availability is computed ad hoc per host | `UnitInfoPopup.tsx:43`, `BenchControls.tsx:142` | **Medium** |
| 9 | Gherkin steps construct actions the UI could never produce | `features/steps/pc.steps.ts:90-110` | **Low** |
| 10 | Win/lose conditions exist in content data with no evaluator anywhere | `contentTypes.ts:59-60` | **Low** (gap, not drift) |

### Finding 1 — attack targeting semantics differ

The game highlights the union of `attackSquares` over all four directions
(`DungeonTacticsScene.ts:403-421`) and lets the player tap a tile; direction is
inferred. The bench presents four direction buttons and arms one
(`BenchControls.tsx:136-148`).

For melee these look equivalent. For the magic-user they are not: its attack is
a `plus` centred at `maxRange`, so "up" covers five tiles including one to the
left and one to the right of the centre. A designer reasoning about the
magic-user in the bench is reasoning about a control scheme the game does not
have.

### Finding 2 — the derivation is host-side and has a real bug

`DungeonTacticsGame.tsx:308-322` resolves the tapped tile to a direction by
axis alignment first, then falls back to scanning the four footprints for
membership. The axis branch **never checks that the tapped tile is in the
footprint**:

```ts
if (col === baseCol && row < baseRow) dir = 'up'
```

A melee PC has reach 1. Tap four tiles straight up — outside the highlight, and
outside every footprint — and the axis branch assigns `up`, the guard `if
(!dir)` does not fire, and the attack resolves against the adjacent tile. The
player aimed at nothing and struck something else, and attacks are committal:
the undo stack is cleared and the unit is locked for the turn.

It survives because it is unreachable by *intent* (only highlighted tiles look
tappable) and because it sits in a React component where no test reaches it.
This is exactly the code that ought to live in the engine with a test.

### Finding 3 — the engine trusts what it is handed

`resolvePcAction` checks that a move destination is unoccupied and structure-free.
It does not check:

- that the destination is within `validMoveDests` (reachable at all),
- that the unit has the movement budget for the path,
- that the path is contiguous or even non-empty,
- that the unit has not already attacked this turn (`hasAttacked` is never consulted),
- that it is the player phase.

`applyMove` validates nothing at all; it charges `path.length` against the
budget and applies the destination. **All movement and attack legality in the
shipped game is enforced by which tiles the renderer chose to highlight.**

The bench, independently, validates more than the game does — `moveSelectedTo`
consults `validMoveDests`, `attackSelected` consults `hasAttacked`. Two hosts,
two different levels of rigour, neither in the engine.

The user's framing is the right one: the engine should verify the committed
action, not blindly accept it.

### Finding 4 — animations disagree with the definitions

`DungeonTacticsScene.ts:458` animates the ranger's projectile with `for (let d
= 2; ; d++)` — minimum range 2 hardcoded, maximum range ignored entirely.
`:486` animates the magic-user's blast at `col + dc * 2` with a hardcoded
five-tile cross — range 2 and the `plus` shape both hardcoded.

`attackFootprint` derives both from the definition. So the moment a designer
edits the ranger's range in the unit editor, the projectile animates to the old
range while damage lands at the new one. **The game lies to the designer about
the exact edit the harness exists to support.** This is the sharpest argument
that the problem is not confined to the bench.

### Finding 5 — the turn sequencer is host code

The engine has `computeNpcTurns`, `resolveNpcAction`, and `endRound`, but
nothing that sequences them. `runNpcMovePhase` and `runNpcAttackPhase`
(`DungeonTacticsGame.tsx:355-405`) hold the round structure, interleaved with
animation callbacks — and `endRound` sets `phase: 'player'` only for the host to
immediately overwrite it with `'npc-move'`, so the field is transiently a lie.

The game's structure is: NPCs move at round start → attacks are **telegraphed**
→ the player acts knowing what is coming → the player confirms → telegraphs
resolve. The telegraph window is the game's core tension.

The bench's `runEnemyAi` resolves moves *and* attacks in a single step. It
collapses the telegraph window entirely. For a tool whose purpose is judging
threat, that is a significant divergence — though it is a bigger change than
the rest and belongs in its own effort (§7).

### Finding 6 — a balance rule in one host only

`applyDefChange` (`DungeonTacticsGame.tsx:98-118`) reconciles every live unit's
current HP against its archetype's max-HP delta, floored at 1 so that lowering
a maximum can never kill a unit outright. That floor is a design rule, and it
lives in a React callback.

The bench's `tweakDef` writes the definition and leaves current HP untouched.
Same gesture, two outcomes: lower the melee archetype's max HP in the game and
wounded units shift with it; do it in the bench and they do not.

### Finding 7 — the bench has to approximate threat

`findShortRangeTarget` and `findLongRangeTarget` (`npc.ts:10,55`) are private.
They walk `minRange`→`maxRange` along each cardinal and stop at the first
blocker — that is the real answer to "what can this enemy hit."

`attackFootprint` cannot answer it, because a `single`-shape attack resolves
only at `minRange`. So `bench-store.ts` reconstructs the band from the same
definition fields and documents the result as an upper bound that ignores
blocking. It is honest and it errs in the safe direction, but it is a
reimplementation of engine logic outside the engine — the exact pattern this
document is about. Exporting a targeting query removes it.

### Finding 8 — availability is recomputed per host

`UnitInfoPopup.tsx:43` decides the Attack button shows when the unit is a PC
that has not attacked. `BenchControls.tsx:142` disables a direction when the
unit has attacked or that direction's footprint is empty. Neither asks whether
*any* legal target exists; neither treats Move as an action with an
availability of its own (in the game, movement is only ever implied by
highlighted tiles).

This is precisely the gap the requested "list of valid next actions" closes.

### Finding 9 — a third consumer with a fourth set of assumptions

`features/steps/pc.steps.ts:90-110` builds a `move-attack` action with `path:
[]`. Because nothing validates, that is a free teleport with zero movement
cost — a state the UI cannot produce. The scenarios pass while describing a
game that does not exist.

Worth noting: `move-attack` is vestigial in play. The shipped game commits
moves and attacks as separate immediate actions; only the step definitions and
the animation code still use the combined kind.

### Finding 10 — win/lose is declared but never evaluated

`contentTypes.ts:59-60` and `bundledMap.ts:72-73` declare `win:
[{type:'clear-all-waves'}]` and `lose: [{type:'all-pcs-defeated'}]`. Nothing in
either repo reads them. This is a missing feature rather than drift, recorded
here so it is not mistaken for something the engine already owns.

---

## 4. The proposed action surface

New engine module, `actions.ts`, exported from the package index. Three
functions and a data type.

```ts
export type ActionId = 'move' | 'attack'

/** How the UI must collect the player's choice for this action. */
export type SelectionKind = 'tile'   // future: 'none' | 'unit' | 'area'

export interface ActionOption {
  id: ActionId
  label: string                      // 'Move', 'Attack'
  available: boolean
  /** Why not, when `available` is false — for tooltips and agent messages. */
  reason?: string
  /** What the UI must collect before it can commit. */
  selection: SelectionKind
  /** The only tiles the UI may offer. Empty when unavailable. */
  targets: Tile[]
  /** How to paint `targets`. Presentation-neutral; hosts map it to their palette. */
  overlay: 'reachable' | 'targetable'
}

/** Every action the unit could take from the current state, available or not. */
export function availableActions(state: GameState, unitId: string): ActionOption[]

/** What committing `action` against `tile` would do — for hover and preview. */
export function previewAction(
  state: GameState, unitId: string, action: ActionId, tile: Tile,
): ActionPreview | null

/** Validate and apply. Never throws; never silently no-ops. */
export function commitAction(
  state: GameState, unitId: string, action: ActionId, tile: Tile,
): { ok: true; state: GameState } | { ok: false; reason: string }
```

```ts
export interface ActionPreview {
  /** Tiles the action resolves against — the attack footprint, or the move path. */
  affected: Tile[]
  /** Movement tiles this would consume; 0 for attacks. */
  cost: number
  /**
   * What resolving on each affected tile would do. A covered tile with no entry
   * is a miss. Damage is one effect kind among future ones (status, terrain,
   * ignition), so "no damage" must never be read as "no effect".
   */
  effects: Array<
    | { kind: 'damage'; tile: Tile; target: string; amount: number; lethal: boolean }
    | { kind: 'damage-structure'; tile: Tile; amount: number; destroys: boolean }
  >
  /** True when the action covers tiles but produces no effect at all. Advisory
   *  only — never grounds for marking the action unavailable (decision 6). */
  hitsNothing: boolean
}
```

### The load-bearing design decisions

**1. Actions are committed against a tile, never a direction.** `Direction`
becomes an engine-internal detail. This is what permanently kills finding 1: a
host cannot present a direction picker for a `plus` attack if it never learns
about directions. The tile→direction derivation moves inside `commitAction`,
where it is tested, membership-checked, and shared.

**2. `targets` is a whitelist, not a hint.** `commitAction` re-derives it and
rejects anything outside — it does not trust that the UI showed the right
tiles. This is the "verify, don't accept" requirement. A host that renders
nothing at all still cannot make an illegal move.

**3. Unavailable actions are returned, not omitted.** The UI needs to render
Move and Attack greyed out with a reason, which is exactly what was asked for:
*"present the list of available actions attack and move and then disable them
if one of them is not."* `reason` carries the text — "has already attacked this
turn", "no movement left", "nothing in range".

**4. `previewAction` exists so hover is engine-derived too.** Without it the
game would keep computing "which tiles will this attack hit" itself, and the
magic-user preview would drift again. It also gives the bench its damage
preview for free, and it gives the animation layer a footprint to animate
instead of the hardcoded constants in finding 4.

**5. The surface is deliberately closed over today's two actions.** `ActionId`
is a union of `'move' | 'attack'`, not an open string, so adding an action is a
typed change that fails the build everywhere it must be handled. When the turn
machine arrives, `availableActions` becomes its natural output: a machine's
guarded transitions *are* a list of legal next actions with conditions. That is
the same shape, so the UI written against this surface does not get rewritten.

**6. An attack that hits nothing is still legal.** `targets` includes tiles with
nothing on them, and `previewAction` reports `hitsNothing: true` so the UI can
warn — *"this won't hit anything"* — without blocking the commit. Two reasons:
the player may be aiming deliberately, and once attacks carry side effects
(fire, status, terrain change) attacking an empty tile becomes a normal thing to
want. `effects` is a discriminated union from the start for the same reason, so
adding an effect kind does not reshape the type.

### What `commitAction` validates

Everything findings 2 and 3 list as missing:

| Check | Rejection reason |
|---|---|
| Unit exists and is on the board | `no such unit` |
| The action is in `availableActions` and available | the option's own `reason` |
| The tile is in that option's `targets` | `not a legal target` |
| Move: path exists and fits remaining budget | `out of range` |
| Attack: unit has not already attacked | `already attacked this turn` |
| Phase permits the action | `not the player's turn` |

The bench's extra affordances (relocate anywhere, drive an NPC by hand) stay
where they are — they are explicitly *setup*, not actions, and they do not go
through `commitAction`. That boundary is worth stating in the spec so a future
reader does not "fix" it.

---

## 5. Worked examples

**Melee, unmoved, adjacent enemy.**
`availableActions` returns Move (available, `targets` = the 32 reachable tiles,
overlay `reachable`) and Attack (available, `targets` = the four adjacent tiles,
overlay `targetable`). The UI shows two enabled buttons.

**Magic-user, range 2, plus shape.** Attack's `targets` is the union of the four
plus-footprints — twenty tiles, not four directions. Hovering one returns a
preview whose `affected` is the five-tile cross that tile belongs to, so the
designer sees the blast before committing. Committing derives `up` internally.
The bench's direction buttons disappear entirely.

**Melee that has attacked.** Both options return `available: false` — Move with
`already attacked this turn` (attacks are committal), Attack with the same. The
UI greys both and shows the reason. Today the bench shows four disabled
direction buttons and the game hides the Attack control with no explanation.

**The finding-2 misfire.** Tapping four tiles up from a melee PC: the tile is
not in `targets`, so the UI never offers it; if a host commits it anyway,
`commitAction` returns `{ ok: false, reason: 'not a legal target' }` and the
state is unchanged.

---

## 6. Migration

### track-web

- Add `actions.ts` + tests; export from `index.ts`.
- Export a targeting query (`threatTiles(state, unitId)`) backed by the real
  scanners so finding 7's approximation can be deleted.
- Move the max-HP reconciliation rule (finding 6) into the engine as
  `reconcileHp(state, prevMax)`; `applyDefChange` calls it.
- `DungeonTacticsGame.tsx`: delete the derivation block (296-340), drive taps
  through `availableActions`/`commitAction`.
- `DungeonTacticsScene.ts`: highlight from `targets` instead of unioning
  `attackSquares` itself; animate from `previewAction().affected` instead of the
  hardcoded ranger loop and magic-user cross (finding 4).
- `UnitInfoPopup` / `ActionButtons`: render the returned option list.
- `pc.steps.ts`: commit through the action surface so scenarios describe
  reachable states (finding 9).

### harness

- `bench-store.ts`: `attackSelected(dir)` → `commitAction`; delete
  `attackByDir`, `DIRECTIONS`, and the `threatTilesFrom` approximation.
- Wire format: `SelectionView` carries `actions: ActionOption[]` instead of
  `attackByDir`; the intent union gains `{ kind: 'commit', action, tile }`.
- `BenchControls.tsx`: an action row — Move and Attack, enabled or greyed with
  the engine's reason — replacing the four direction buttons.
- `BoardView.tsx`: paint `targets` by `overlay`; on hover, paint
  `preview.affected`.
- `bench-bridge.ts`: `dungeon_unit_actions` replaces the direction argument on
  `dungeon_attack`, so the agent picks tiles the same way the designer does.
- `AGENTS.md`: the agent asks the engine what a unit may do; it never names a
  direction.

---

## 7. OpenSpec: how to split this

**Recommendation: three changes, plus one deferred.** Not one, and not ten.

The repos have separate OpenSpec roots, so a single change cannot span them —
that alone forces at least two. The split below also keeps each change
independently shippable and reviewable, which is the cadence already agreed for
this rebuild.

| # | Repo | Change | Contents | Depends on |
|---|---|---|---|---|
| 1 ✅ | track-web | `dungeon-engine-action-surface` | `actions.ts`, validation, `threatTiles`, `reconcileHp`, tests. Purely additive — no host touched, no behaviour change. | — |
| 2 ✅ | track-web | `dungeon-game-action-adoption` | Game host + scene + HUD + steps migrate. Fixes findings 2, 4, 9. | 1 |
| 3 ✅ | harness | `dungeon-bench-action-adoption` | Bench store, wire format, controls, board view, agent tools. Fixes findings 1, 7, 8 on the bench side. | 1 |
| — | track-web + harness | `dungeon-turn-sequencer` | **Superseded by [`turn-sequencer-plan.md`](turn-sequencer-plan.md)** (2026-08-20), which splits finding 5 into five phased changes rather than one. | 1, 2, 3 |

**Why 1 is separate.** It is the only piece with no user-visible behaviour
change, so it can land, be tested hard, and sit stable while two hosts migrate
against it. It is also the piece the turn-machine work inherits, so it deserves
its own spec rather than being buried in a UI change.

**Why 2 and 3 are separate rather than one "adoption" change.** Different
repos, different reviewers' attention, and they are genuinely independent once
1 exists — they can go in either order or in parallel. Bundling them would also
hide finding 4 (a shipped-game bug) inside a harness change.

**Why the sequencer is deferred.** It is the largest of the findings, it
touches the animation pipeline, and it changes the bench's enemy-turn model
rather than merely its controls. It should not gate the targeting fix. It is
also the finding most likely to be reshaped by the turn-machine design, so
building it now risks building it twice.

**Suggested order:** 1 → (2 ‖ 3) → re-evaluate the sequencer.

---

## 8. Explicitly out of scope

- The Phaser-vs-SVG rendering question. Rendering was never what diverged; the
  control layer was. Once the action surface lands, both hosts render the same
  engine-supplied tiles, and the bench keeps React + SVG.
- Win/lose evaluation (finding 10) — recorded, not scheduled.
- The turn machine itself. This surface is designed to be its output, but
  nothing here commits to `docs/dungeon-harness/turn-machines/`, which remains
  unapproved.
- Instance-scoping the engine. Still deferred until multiple boards arrive.

---

## 9. Decisions (resolved 2026-08-19)

### 9.1 `move-attack` is retired, and its scenario is rewritten

**Resolved: retire the variant; rewrite the scenario against the real path.**

Traced through git history. Under the original **plan-then-commit** model a PC
planned a move *and* an attack, and confirming resolved both as one bundled
`move-attack` action. Commit `104e695` ("First pass: immediate PC movement with
undo") replaced that model: moves apply the instant you tap a tile, attacks
resolve the instant you tap a target. **Nothing has constructed a PC
`move-attack` since.** `git log -S` confirms `DungeonTacticsGame.tsx` has never
contained the string. The NPC half of the variant was explicitly dropped in
`4ad9d87`; the PC half was left behind.

What still references it:

| Location | What it is |
|---|---|
| `types.ts:90` | the variant itself |
| `pc.ts:297,306,318` | resolution logic |
| `DungeonTacticsScene.ts:447,529` | animation branches that can never fire |
| `nodeHost.test.ts:116` | an engine test |
| `pc.steps.ts:99` + `melee.feature:33` | the `melee-move-attack-same-turn` scenario |

The dead code is untidiness. **The scenario is the actual bug**, and your
instinct was right. `melee-move-attack-same-turn` claims to cover "a melee PC
moves then attacks an adjacent NPC in the same turn" — a real and important
behaviour. It exercises it through a code path the game cannot execute, passing
`path: []`, which makes the move a free teleport costing no movement. So the
scenario is green, and the behaviour it names is **untested**: nothing checks
that moving first and then attacking charges the movement budget, or that it is
permitted at all.

Move-then-attack *is* legal in the shipped game — `applyMove` then a separate
`attack` commit, with `hasAttacked` locking the unit afterwards. It just happens
as two commits, not one.

So change 2 does both halves: delete the variant and its dead branches, and
rewrite the scenario as two commits through the action surface, asserting the
budget is charged and the unit locks afterwards. That turns a false green into
real coverage rather than merely deleting a stale test.

### 9.2 Bench setup stays outside the action surface

**Resolved: setup is direct state editing, not validated actions.**

Confirmed: a bench board is a *scenario* board, not a game board. It may lack
player start tiles, enemy spawners, and anything else `initialState()` assumes
(five spawners, four start tiles). Validating setup against game-setup rules
would reject boards that are exactly what a scenario needs.

The spec will name the boundary explicitly so a later reader does not "fix" it:
`commitAction` governs what a unit may *do*; placement, relocation, HP setting,
and board generation are authoring operations and stay direct.

One thing this leaves standing, recorded as a follow-up rather than scheduled:
board generation defaults to one power center because the NPC AI walks toward
structures and does nothing without them. That default is fine while structures
are integral to play. **Follow-up: make the NPC AI behave sensibly on a board
with no structures**, so a scenario can be built without one. Engine work, not
harness work, and not part of these three changes.

### 9.3 `previewAction` reports misses, and misses are not illegal

**Resolved: report them; keep the action available.**

The UI can warn *"this won't hit anything"* — useful feedback — but it must not
disable the action. Your point about side effects is the deciding one: once an
attack can set terrain on fire or apply a status, attacking a tile with no unit
on it becomes a normal thing to want, and an availability rule built on "does it
damage something" would have to be torn out.

So `hitsNothing` is advisory, `targets` includes empty tiles, and `effects` is a
discriminated union from the start (§4, decision 6) — adding `ignite` or
`status` later extends the union instead of reshaping the type.

### 9.4 `reason` is plain English, in the engine

**Resolved: engine-supplied strings.** No localisation, ever — it is a family
game. The agent relays them verbatim, which also means one wording for the
designer and the tool output.

---

## 10. Follow-ups recorded, not scheduled

These came out of the review and belong somewhere, but not in changes 1–3.

1. **NPC AI on a structureless board** (§9.2) — currently it stays put, so a
   scenario without a power center cannot exercise enemy movement.
2. **The turn sequencer / telegraph window** (finding 5) — deferred change.
3. **Win/lose evaluation** (finding 10) — declared in content data, no evaluator.
