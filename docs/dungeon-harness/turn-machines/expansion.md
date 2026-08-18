# Room to grow

Everything the six archetype files marked ⚠️ lands here, grouped by the
mechanism that would absorb it. The first three sections are the ones that
matter — **status definitions**, **terrain rules**, and **templates** — and
each is a natural extension of the same declarative vocabulary, not a new
kind of thing. The last section is the honest list of what would need a
genuinely new primitive in the interpreter, so the boundary of the model is
visible rather than discovered by surprise.

Nothing in this file is needed to ship the machine, run today's four PCs and
two NPCs, or run the playtest builds. It's where the *next* year of design
ideas go.

Contents:

1. [Status definitions](#1-status-definitions)
2. [Terrain rules](#2-terrain-rules)
3. [Templates: archetypes as library machines](#3-templates-archetypes-as-library-machines)
4. [Reactions and interrupts](#4-reactions-and-interrupts)
5. [AI policies](#5-ai-policies)
6. [Small additions the archetype files asked for](#6-small-additions-the-archetype-files-asked-for)
7. [What would need a new primitive](#7-what-would-need-a-new-primitive)

---

## 1. Status definitions

`unit-definition.md` names the status system as the TODO blocking Fighter
`raging`/`enrage`/`taunt`, the Anchor's surrounded buffs, the Rogue's Mark,
the Mage's Levitate/Expose/Slow/Blind, and every "setup → payoff" combo in
`archetype-concepts.md`. The *applying* side is already `attack.md`
(`status <id> for <n>`). What's missing is what a status **does** — and
that's the same vocabulary as a unit: hooks with guards and effects, plus a
small set of **modifiers** the engine consults.

```
status poisoned
  duration 1                                  # default when applied without `for`
  on turn_start of holder
    damage holder 1                           # ← the one "board" effect statuses need

status marked
  duration until_hit                          # expires when consumed
  modify incoming_damage +2                   # next hit +2
  on damaged of holder
    remove marked from holder

status raging
  duration 2
  modify outgoing_damage +1
  modify move_budget +1                       # `raging` = +movement/+damage, per the brief

status levitate
  duration 1
  modify forced_movement_multiplier 2         # all pushes/pulls doubled
  modify ignores_ground_hazards true

status expose
  duration until_displaced
  modify collision_damage_override 3          # counts as mountain

status frozen
  duration 1
  modify move_budget 0                        # skips its next move

status rooted        # same as frozen for now; separate id so it can diverge

status slowed
  duration 2
  modify move_budget 1

status bulwark
  duration 1
  modify outgoing_damage +1

status enraged
  duration 1
  modify ai_target source                     # brute policy: target the applier
status taunted
  duration 1
  modify ai_target source

status blinded
  duration 1
  modify has_los false                        # ranged can't fire; melee still resolves if adjacent

status prone
  duration 1
  modify incoming_damage +1
  # "easier to shove" is written on the shover's action: push if target.has_status(prone) then 3 else 2
```

Design points:

- **Modifiers are a closed, enumerated set** the engine consults at defined
  points: `incoming_damage`, `outgoing_damage`, `move_budget`,
  `forced_movement_multiplier`, `collision_damage_override`,
  `ignores_ground_hazards`, `has_los`, `ai_target`. Adding one is an
  interpreter change with a doc line here — same discipline as board
  queries. This is deliberately *not* "a status can run arbitrary code."
- **Hooks on statuses** reuse the unit hook list, scoped to `holder` (and
  `source`, the applier). One new effect appears — `damage holder <n>` — the
  only place a status directly touches the board, needed for
  poison/burning DoT.
- **Duration** is `<n>` turns, `until_hit`, `until_displaced`, or
  `until_end_of_round`; a `remove` effect covers the rest.
- **Where a status's payoff is written** is a readable choice, not a rule:
  Prone's "+damage taken" is on the *status* (everyone benefits); "shoved
  further" is on the *shover's action* (only kinetic fighters care). The
  concepts doc's "inflict → exploit" is exactly this split.
- `raging` shows why `modify move_budget` is a modifier and not a hook: it
  has to apply to `move up to steps` reachability, which the engine computes
  — a hook can't reach in there, a modifier can.

**Confuse** ("acts, but at a random adjacent unit") is the first thing in
the whole game that needs randomness. It'd be `modify ai_target
random_adjacent` plus a seeded RNG threaded through the state (§7). Fine,
but flagged: it's the one status that breaks "everything is a pure
function of state + input."

**Magnetize** ("when either is displaced, the other is displaced the same
way") links *two* holders. Expressible as a status with a `link` to another
unit and an `on displaced of holder: displace linked same` hook — a new
effect (`displace`) and a new field (`link`). Hardest of the set; the
source doc already leaves it open.

## 2. Terrain rules

Terrain kinds are today a `TerrainType` enum plus hard-coded behaviour.
The Mage and Ranger want to *author* terrain (walls, fog, fire, pits,
caltrops, traps, wormholes) and the playtest kit gives every kind a small
rule table (§2: movement, on-contact). Same shape as statuses — a kind with
hooks and modifiers:

```
terrain wall
  blocks move, los
  collision 2
  max_on_map 3 by conjure_wall             # "one wall (3 tiles) at a time — new removes old"

terrain mountain
  blocks move, los
  collision 3

terrain fire
  on enter     damage entrant 2
  on turn_start of occupant   damage occupant 2

terrain forest
  on fire_effect   become fire              # ignites

terrain water
  on enter when not entrant.can_fly   remove entrant      # drown
  forced_movement passes                                   # doesn't stop at the edge
terrain ice
  forced_movement passes                                   # Freeze Water: slide across

terrain pit
  blocks move                              # on foot
  on forced_enter   remove entrant

terrain caltrops
  duration -1
  on enter when entrant.is_enemy   damage entrant 1 ; stop entrant ; remove self
terrain trap
  on enter when entrant.is_enemy   damage entrant 3 ; stop entrant ; remove self

terrain obscuring_fog
  move_cost 2                              # movement.md's planned terrain costs

terrain wormhole
  link other_wormhole
  on enter   teleport entrant to linked ; remove self ; remove linked   # or duration 1
```

Same discipline: closed sets of hooks (`enter`, `forced_enter`,
`turn_start of occupant`, `fire_effect`) and modifiers (`blocks`,
`collision`, `move_cost`, `forced_movement passes`, `max_on_map`,
`duration`), plus a couple of board effects (`damage entrant`, `stop
entrant`, `remove entrant`, `become <kind>`, `teleport entrant to`).
`movement.md`'s "terrain movement costs — future enhancement" is `move_cost`.
`mage-concepts.md`'s Freeze Water / Raise Ground are `become` transitions
invoked by an action's `terrain <kind>` on an existing tile; Collapse Wall
is `terrain remove wall` + splash — a `remove` variant of the terrain
effect.

## 3. Templates: archetypes as library machines

`unit-definition.md`'s core principle — "archetypes own the rules, data owns
the values; adding a new class is usually data-only" — survives, with the
archetype moved from code to a **template unit file**:

```
template fighter
  resources
    steps = $steps each turn                # $name = a parameter with no default → must be supplied
  turn
    start -> ready
    ready
      move up to steps   -> ready ; steps -= tiles
      act any            -> after
      end
    after
      move up to steps   -> after ; steps -= tiles
      end
```

```
unit knight "Knight" extends fighter
  hp 12
  movement walk
  steps 3                                   # fills $steps
  actions
    sword "Sword" …
    shield_bash "Shield Bash" …
```

Rules for `extends`:

- The unit inherits the template's resources, hooks, and machine; it
  supplies parameters, `hp`, `movement`, `actions`, and may **add** hooks,
  resources, and transitions (a `ready` block in the unit *appends* to the
  template's `ready`; a transition naming an already-present `act X`
  overrides it).
- A unit may declare its own `turn` block outright, ignoring the
  template's — that's "a genuinely new turn rule," now a text edit.
- Templates can `extends` templates (`kinetic_fighter extends fighter`
  adding `on caused_collision fury += 1`).
- Templates live in the same store as units and are edited in the same
  session; the harness can show a unit *flattened* (template inlined) so
  the designer sees the whole machine, and *diffed* (just the unit's
  additions) so a family of tunings stays reviewable.

This is how "Barbarian and Warden are both the Anchor with different parts
bolted on" and "Geomancer / Enchantress / Warp Mage are the mage frame with
different spell lists" become files that are mostly action lists.

## 4. Reactions and interrupts

Two ideas need a unit to act **outside its own turn**:

- **Overwatch / ready-shot** (Ranger): fire when an enemy enters range
  during the enemy phase.
- **Enrage-bends-the-current-attack** (Anchor): redirect an attack that's
  already aimed at an ally.

The machine as defined runs only during the unit's turn; hooks run
anywhere but take no input and can't run actions. A **reaction** is a hook
that *can* run one action, optionally with input:

```
  on enemy_enters_range(shoot) when has_status(overwatch)
    react act shoot           # policy is asked (target choice), once, then the enemy continues
```

What it needs: (a) new events fired from the enemy phase (`enemy_enters_
range`, `enemy_declares_attack`), (b) an interpreter hop back to the
policy mid-enemy-phase, (c) UI for it. It's the one construct in this
folder that touches the round loop. Two observations keep it small:

1. Reactions are `at most one action, no state change` — no nested turn.
2. If the round is Into-the-Breach-shaped (enemies telegraph → player phase
   → resolve), most "interrupt" designs become ordinary player-phase actions
   with a `redirect_telegraph to self` effect, and reactions shrink to
   overwatch-style triggers only. Today's `npcPlans` telegraph is *already*
   captured before resolution, so the round-order question is a real lever
   here — see `archetypes/anchor.md`.

Recommendation: don't build reactions until a playtest asks for one;
build `redirect_telegraph` first if the Anchor's enrage is wanted, since
it's a one-effect addition.

## 5. AI policies

Everything "smart enemy" in the concepts doc — cluster, space out to deny
the ring, avoid being shoved into pits, choose whether to take the bait —
is a **policy** (`archetypes/brute.md`), never a rule. The machine + policy
split makes it a self-contained workstream with a clean interface: `pick(
enabled_transitions, board) → (transition, input)`. Options, in rising
ambition:

- Today's `npc.ts` heuristic (lowest-hp reachable, else nearest) as
  `brute_ai`. Ship this; it's a restatement.
- Named policies per unit (`policy skirmisher_ai` for the Archer's
  shoot-and-step).
- A one-ply lookahead policy that scores each enabled transition by
  simulating it (the interpreter is pure and cheap, so this is just
  calling it) — this is where "avoid the pit," "space out," and honouring
  `taunted`/`enraged` fall out of a scoring function instead of special
  cases.

Statuses that modify AI (`ai_target source`) are the one place rules and
policy touch; the modifier is the contract.

## 6. Small additions the archetype files asked for

Each is a line in the interpreter and a line in `machine-definition.md`;
listed so they're not lost.

| Addition | Asked by | What |
|---|---|---|
| `targeting facing 3` | Berserker Cleave, Anchor | a new propagation shape: the three tiles abreast along one cardinal side (the concepts doc's "one facing"); trivially also `facing 5`, cones later |
| `tiles_pushed`, `hit_kind` bound in forced-movement context | Berserker | collision damage scaled by distance / obstacle kind |
| `swap` forced-movement type | Rogue Switch Places | swap acting unit and target |
| `teleport target` forced-movement type | Mage Blink Ally | move the target to a chosen empty tile |
| `distance` bound for teleports (spend-by-distance) | Mage | alternative to `tiles = 1` |
| `redirect_telegraph to self` effect | Anchor enrage-now | see §4 |
| `terrain remove <kind>` | Mage Collapse Wall | destroy terrain as an effect |
| tracked **facing** | Rogue backstab-from-behind, concepts doc | a per-unit orientation the engine updates on move; built-ins `facing`, `target.facing_away_from_me`; a `turn <dir>` transition kind if choosing matters |
| cross-unit events (`ally_killed_using_my_terrain`) | Mage mana-on-combo | probably never worth it; `on caused_collision`/`on kill` cover the self-caused version |

## 7. What would need a new primitive

The boundary of the model, stated plainly. Anything here means an
interpreter change *of a new kind*, not a new entry in an existing table.

| Idea | Why it doesn't fit as-is | Smallest honest extension |
|---|---|---|
| **Randomness** (Confuse's random target, any dice) | everything is a pure function of state + input | a seeded RNG in the unit/board state, threaded through; `random_adjacent` modifier only — no `rand()` in expressions |
| **Reactions during another unit's turn** | machine runs on own turn; hooks take no input | §4 — bounded to one action, no state change |
| **Two units sharing runtime state** (Magnetize) | resources are per-unit | a `link` field on a status + a `displace linked` effect; not general shared state |
| **Nested / sub-turns** ("summon a clone that acts now") | one machine per unit per turn | out — model as spawning a unit that acts next round; if truly needed, a `spawn` effect + the new unit taking its own turn in order |
| **Counting things over history** ("if you've hit this target twice this match") | built-ins are current-turn or persistent-resource only | a `persistent` resource bumped by an `on hit when target == X` hook — needs `target` identity comparison; add `remember`-style resources per target only if a design actually wants it |
| **Free-text / open-ended effects** | closed effect vocabulary by design | no — this is the line. If a design needs an effect that isn't push/pull/damage/status/terrain/teleport/swap/redirect, that's a real new mechanic and gets a named effect after a conversation, not an escape hatch |
| **Arbitrary UI** (a custom picker, a slider) | inputs are tile / direction / tile-set / button | no — inputs derive from targeting modes; a new input kind is a new targeting mode |

Everything else in `archetype-concepts.md`, `mage-concepts.md`, and the
playtest kit is either ✅ today or lands in §1–§6.
