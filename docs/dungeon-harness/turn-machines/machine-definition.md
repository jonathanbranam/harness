# Turn Machine definition

This is the language reference for a unit's **turn machine**: the text a
designer reads, an agent writes, and one shared TypeScript interpreter runs
in both the harness and the game. It is deliberately small. Where a thing is
already defined in `attack.md` or `movement.md` this doc says so and does
not restate it.

Contents:

1. [A unit file, top to bottom](#1-a-unit-file-top-to-bottom)
2. [Resources](#2-resources)
3. [The turn machine: states and transitions](#3-the-turn-machine-states-and-transitions)
4. [Transition kinds and the inputs they need](#4-transition-kinds-and-the-inputs-they-need)
5. [How the UI falls out](#5-how-the-ui-falls-out)
6. [Guards and effects](#6-guards-and-effects)
7. [Events (hooks)](#7-events-hooks)
8. [Expressions](#8-expressions)
9. [Board queries (built-in names)](#9-board-queries-built-in-names)
10. [Actions: what changes in `attack.md`](#10-actions-what-changes-in-attackmd)
11. [Run-loop semantics, precisely](#11-run-loop-semantics-precisely)
12. [Determinism, undo, serialization](#12-determinism-undo-serialization)
13. [Validation and lint](#13-validation-and-lint)
14. [Errors at runtime](#14-errors-at-runtime)
15. [Reference card](#15-reference-card)

Notation used in this doc: `<angle>` = a placeholder, `[square]` = optional,
`a | b` = one of. Indentation is significant (two spaces per level, like the
examples). `#` starts a comment to end of line. Identifiers are
`lower_snake_case`. Display strings are `"quoted"`.

---

## 1. A unit file, top to bottom

```
unit <id> "<Display Name>"
  hp <int>
  movement <traversal> [diagonal] [passthrough <cat>[, <cat>]] [blocked_by <cat>[, <cat>]]
  [extends <template-id>]                # see expansion.md; ignore on first read

  resources                              # §2
    <name> = <init> each turn [max <n>]
    <name> = <init> persistent [max <n>]
    <name> = <value> one of [<a>, <b>, …] [each turn | persistent]
    <name> = <value> cycles [<a>, <b>, …]

  actions                                # §10 — attack.md, terse form
    <id> "<Name>" [<param> <int> …]
      [when <guard>]
      <attack.md fields, one per line>
      [move before|after, toward target|away from target|free, up to <expr>]
      [variants by <resource>
        <value>: <field overrides>]
      [use <effects>]

  on <event> [when <guard>]              # §7
    <effects>

  turn                                   # §3
    start -> <state>
    <state>
      <transition>
      …
```

The **`movement`** block is `movement.md`'s block minus `range`: traversal
(`walk | fly | teleport`), optional `diagonal`, and the passthrough /
blocked_by deltas. Per-turn *budget* is not a pathing property — it lives in
`resources` and is spent by `move` transitions (§4). This is the one change
to `movement.md`.

Two things about a unit file worth saying up front:

- **Everything is optional except `unit`, `hp`, `movement`, and `turn`.** A
  unit with no resources, no hooks, and one `act` transition is a valid unit.
- **Order within a state matters** only for `auto` transitions (first
  enabled wins) and for how the UI lists options. Order of sections doesn't.

---

## 2. Resources

A resource is a named, typed value belonging to one unit. There are exactly
four kinds.

| Declaration | Type | Lifetime | Notes |
|---|---|---|---|
| `mp = 6 each turn` | integer | reset to `6` at the start of every one of this unit's turns | the common case: budgets |
| `mana = 6 persistent max 10` | integer | carries across turns within a match | `max` clamps every write; `min` is always 0 |
| `stance = guard one of [rage, guard]` | enum | persistent unless `each turn` is added | compared with `==`/`!=` |
| `ammo = normal cycles [normal, poison, explosive]` | enum + pointer | persistent | supports the effect `ammo.next` (wraps) |

Rules:

- Integers are always clamped to `[0, max]`; without `max` there is no
  upper clamp. There are no negative resources — a guard should prevent the
  spend, but if an effect would go below zero it clamps to zero (and lint
  warns when it can prove that's reachable, §13).
- `each turn` re-initialises at **that unit's** turn start, *before* the
  `on turn_start` hooks run — so a hook like `mana += 2` sees the fresh
  value (§11).
- Resource names share one namespace with the built-ins in §9. Declaring a
  resource named `moved` is an error. Section keywords (`resources`,
  `actions`, `turn`, `on`) are only reserved at section-header position, so
  a resource called `actions` (the Rogue's action count) is fine — inside an
  expression there's nothing to confuse it with.
- Persistent resources are part of the unit's saved state (§12).

Some things that look like resources are **built-ins** the engine maintains
for you and you cannot assign: `moved`, `moved_since_act`, `acted`,
`uses(<action>)`, `turns_stationary`, `hp`. They're listed in §9. Declaring
your own only when the engine can't know it (mana, fury, a stance) keeps
unit files short.

---

## 3. The turn machine: states and transitions

```
turn
  start -> ready                       # exactly one start line

  ready                                # a state
    move up to mp        -> ready ; mp -= tiles
    act any  when actions > 0  -> ready ; actions -= 1
    end

  after                                # another state
    move up to steps     -> after ; steps -= tiles
    end
```

- A **state** is a named place the unit's turn can be in. `done` is
  implicit and terminal; every unit has it; `end` transitions go there.
- A **transition** is one line under a state:
  `<kind> [when <guard>] -> <state> [; <effect> ; <effect> …]`.
  `end` is the one kind that omits `-> <state>` (it always goes to `done`).
- A transition is **enabled** when its guard is true *and* its kind's own
  precondition holds (a `move` needs at least one reachable tile; an `act`
  needs at least one legal target and the action's own `when` to hold).
- The unit's turn is: enter the start state; loop — fire any enabled
  `auto` transition; otherwise present the enabled input-taking transitions
  to the *policy* (the player's UI, or an AI policy) and fire the one it
  picks; stop when the state is `done`. If a non-`done` state has **no**
  enabled transitions at all, the turn ends (this is a lint warning, not an
  error — a Rogue who has spent everything is legitimately done). Precisely
  in §11.

The whole model is that small. Everything below is about what the kinds,
guards, and effects can say.

---

## 4. Transition kinds and the inputs they need

Every transition kind either **needs an input from the policy** (a tile, an
action target, a menu pick) or **fires by itself**. The input a state needs
is exactly the union of what its enabled transitions need — there is no
separate UI specification.

| Kind | Syntax | Input needed | What it does |
|---|---|---|---|
| **move** | `move up to <expr>` | a destination tile, from the reachable set | Paths the unit using its `movement` block (or an override, below), with budget `min(<expr>, whatever pathing allows)`. Requires `tiles >= 1`. Binds `tiles` (path length) for the effects. |
| **teleport** | `teleport up to <expr>` | a destination tile within `<expr>` (Chebyshev), empty | Same as `move` with `traversal teleport` for this transition only. `tiles` = 1 by convention (a blink is one hop). |
| **act** | `act <action-id>` | whatever the action's `targeting` needs (§10): nothing for `self`/`targets_all`, a direction, a tile, `count` tiles | Runs the action per `attack.md`: targeting → propagation → effect, plus its embedded `move` and `use` effects. Binds `action.<param>` and `target` for the effects and guard. |
| **act any** | `act any` | as above, for whichever action is picked | Shorthand for one `act` line per action of the unit **not already named in this state**. Explicit lines win; `act any` fills in the rest with a shared guard/effects. |
| **choose** | `choose "<Label>"` | a button press | A menu item with no board input. Stance switches, "keep stance," "hold position." |
| **auto** | `auto` | none | Fires immediately if enabled. If several `auto` transitions are enabled in a state, the **first listed** fires. Used for AI-driven units and forced sequencing. |
| **end** | `end` | a button press ("End turn") | Goes to `done`. Usually unguarded. |
| **auto end** | `auto end` | none | Ends the turn immediately when enabled. |

Move overrides: `move up to <expr> [as fly | as teleport | diagonal | passthrough <cats>]`
lets one transition path differently from the unit's default (a Berserker
who normally walks but leaps for one action). Rarely needed; embedded
action movement (§10) covers most cases.

Guard availability of `act`: the action's own `when <guard>` (§10) is ANDed
with the transition's `when`. Put "is this action ever available to this
unit right now" on the action (`ring_cleave when adjacent_enemies >= 3`),
and "does the *turn* allow an action right now" on the transition
(`when actions > 0`). Both work; the split keeps files readable.

---

## 5. How the UI falls out

Because a state's needed inputs are the union of its enabled transitions'
inputs, the game (and the harness's board) can render a state with no extra
data:

| Enabled transition | The player sees |
|---|---|
| `move up to N` | reachable tiles highlighted; click one |
| `teleport up to N` | teleport-reachable tiles highlighted |
| `act X` (targeting `tile`/`direction`/`tile_multi`) | an **X** button; pressing it enters targeting for that action, showing legal targets |
| `act X` (targeting `self` or `targets_all`) | an **X** button that resolves on press (with the footprint previewed) |
| `act X` — disabled by guard | an **X** button, greyed, with the failing guard as the tooltip (`needs fury ≥ 3`) — the engine knows *why*, so say so |
| `choose "Rage"` | a **Rage** button |
| `end` | an **End turn** button |
| `auto` | nothing — it already fired |

Two consequences worth calling out:

- **Preview is free and never stale.** "Reachable tiles" and "legal targets
  for X" are computed from the current state each time the state is
  rendered. There is nothing to invalidate. This closes the
  `dungeon-preview-lifecycle` bug by construction — see
  [`harness-integration.md`](harness-integration.md).
- **The harness's action-list tool and the game's HUD are the same query.**
  `enabled_transitions(unit)` returns `[{kind, label, input, legal_targets,
  disabled_reason}]`; the HUD renders buttons from it, the agent reads it as
  a tool result.

---

## 6. Guards and effects

**Guard** = one boolean expression (§8) after `when`. Omitted guard = `true`.

**Effects** = a `;`-separated list after the `-> <state>`. Each effect is one
of:

| Effect | Meaning |
|---|---|
| `<res> += <expr>` / `<res> -= <expr>` | add/subtract, then clamp to `[0, max]` |
| `<res> = <expr>` | assign (integer or enum value), clamped |
| `<res>.next` | advance a `cycles` resource, wrapping |
| `apply <status> to self [for <n>]` | give this unit a status (statuses: `expansion.md`) |
| `remove <status> from self` | drop a status |

Effects run **after** the transition's own action resolves (so `fury +=
adjacent_enemies` after a pull sees the post-pull board), left to right.
Bound names available in effects: everything in §9, plus `tiles` in a
`move`/`teleport`, plus `action.<param>` and `target.*` in an `act`.

There is deliberately **no** general "deal damage" or "move a unit" effect on
a transition. If a transition needs to change the *board*, it does so by
running an action (`act`), and the action's `attack.md` effect block does
the board work. This keeps board mutation in one place with one preview
path. (`apply … to self` is the exception because it's the unit acting on
its own resource-like state — a stance-as-status or a self-buff.)

---

## 7. Events (hooks)

Hooks are effect lists that run when something happens to the unit, outside
the turn loop. Same guard/effect vocabulary as transitions; no inputs.

```
on turn_start
  mana += 2

on turn_end when moved == 0
  fury += 1

on damaged
  fury += 1

on hit
  fury += 1
```

| Event | Fires when | Extra names bound |
|---|---|---|
| `turn_start` | this unit's turn begins, **after** `each turn` resources reset | — |
| `turn_end` | this unit's turn ends (reaches `done`) | — |
| `round_start` / `round_end` | the whole round (all sides) begins/ends | — |
| `hit` | an action of this unit damaged at least one unit | `target` (the first hit unit), `hits` (count) |
| `kill` | an action of this unit reduced a unit to 0 | `target` |
| `damaged` | this unit lost hp | `amount`, `source` |
| `collided` | this unit was forced into something | `amount` |
| `caused_collision` | this unit's action forced-moved a unit into something | `amount`, `target` |
| `moved` | this unit completed a `move`/`teleport` transition (voluntary) | `tiles` |
| `displaced` | this unit was moved by someone else's action | `tiles` |

Hooks may fire during another unit's turn (`damaged`, `displaced`); they
still run against this unit's resources. Hooks never take input and never
change the machine's current state — they only touch resources/statuses.
The list above is enough for every archetype in this folder; adding an event
is an interpreter change and gets listed here.

---

## 8. Expressions

One expression language, used everywhere a number or a truth value appears:
guards, effect right-hand sides, `up to`, action `when`, and any numeric
`attack.md` field (§10).

**Grammar** (precedence low → high):

```
expr    := "if" expr "then" expr "else" expr
         | or
or      := and  ("or" and)*
and     := not  ("and" not)*
not     := "not" not | cmp
cmp     := sum  (("==" | "!=" | "<" | "<=" | ">" | ">=") sum)?
sum     := term (("+" | "-") term)*
term    := unary (("*" | "/" | "%") unary)*
unary   := "-" unary | primary
primary := <int> | "true" | "false"
         | <name> | <name> "." <name>              # resource, builtin, target.hp, action.mana
         | <name> "(" [expr ("," expr)*] ")"        # builtin function
         | "min" "(" … ")" | "max" "(" … ")" | "abs" "(" … ")"
         | "(" expr ")"
```

**Types:** `int`, `bool`, and enum values (bare identifiers that name a
declared enum value, e.g. `rage`, `poison`). Type-checked at parse time:
`stance == rage` is fine, `stance + 1` is an error, `mp > true` is an error.

**Semantics** are total — no expression can fail at runtime:

- Integer arithmetic. `/` is **floor division** (`7 / 2 == 3`); `%` is
  remainder. **Division by zero yields 0.** `adjacent_enemies / 2` is
  therefore always safe.
- Comparisons and `and`/`or`/`not` are ordinary; `and`/`or` short-circuit
  (matters only for readability — nothing has side effects).
- `if … then … else …` requires both branches the same type.
- No loops, no user functions, no assignment inside expressions, no
  strings. This is by design (README, principle 4).

Readable spellings for common designer phrases:

| Designer says | Expression |
|---|---|
| "5 if she's moved three or more, else 2" | `if moved >= 3 then 5 else 2` |
| "plus one per adjacent enemy, rounded down per two" | `3 + adjacent_enemies / 2` |
| "one extra if the charge was three or more tiles" | `4 + (if path_length >= 3 then 1 else 0)` |
| "only while surrounded by three or more" | `adjacent_enemies >= 3` |
| "hasn't acted yet, or has stepped at least two since" | `acted == 0 or moved_since_act >= 2` |
| "the more he's held still, up to three" | `min(turns_stationary, 3)` |
| "in Guard, or with fury to burn" | `stance == guard or fury >= 4` |

---

## 9. Board queries (built-in names)

These are the only ways an expression can see the world. All are pure and
evaluated against the **current** board at the moment of evaluation. They're
grouped by what they're about; the "context" column says where a name is
meaningful (everywhere unless noted).

**About this unit**

| Name | Meaning |
|---|---|
| `hp`, `max_hp` | current / maximum hit points |
| `moved` | tiles moved by `move`/`teleport` transitions this turn |
| `moved_since_act` | tiles moved since this unit's last `act` this turn (= `moved` if none) |
| `acted` | number of `act` transitions taken this turn |
| `uses(<action-id>)` | times that action was taken this turn |
| `turns_stationary` | consecutive completed turns (before this one) with `moved == 0` |
| `has_status(<id>)` | this unit currently has that status |
| `on_terrain(<kind>)` | this unit stands on that terrain kind (`fire`, `water`, `forest`, …) |
| `turn` | the round number, from 1 |

**About the neighbourhood** (8-neighbour "adjacent" per the playtest kit;
distances are Chebyshev/king-move, matching "range" in the rules)

| Name | Meaning |
|---|---|
| `adjacent_enemies`, `adjacent_allies` | count in the 8 surrounding tiles |
| `enemies_within(<n>)`, `allies_within(<n>)` | count within distance `n` |
| `nearest_enemy_distance` | Chebyshev distance to the nearest enemy (large sentinel if none) |
| `can_target(<action-id>)` | at least one legal target exists for that action right now |

**In a `move` / `teleport` transition's effects and hooks**

| Name | Meaning |
|---|---|
| `tiles` | path length of the move just taken (1 for a teleport) |

**In an `act` transition (guard, effects) and inside the action's own fields**

| Name | Meaning |
|---|---|
| `action.<param>` | a named param declared on the action (`mana`, `cost`, anything) |
| `target.hp`, `target.max_hp`, `target.has_status(x)`, `target.on_terrain(k)`, `target.adjacent_enemies`, `target.adjacent_allies` | the (first) targeted unit, if any |
| `path_length` | for actions with embedded movement: tiles the *acting* unit actually moved |
| `distance_to_target` | Chebyshev distance from the acting unit (post-embedded-move) to the target tile |
| `targets_hit` | how many units the action affected (available in `use` effects and `on hit`) |

Note that `target.*` inside an **effect field of the action itself**
(`damage if target.has_status(prone) then 4 else 2`) is evaluated **per
affected unit** as the effect is applied — so splash damage can differ per
victim. Inside a *transition's* effects it refers to the primary target
only.

Adding a query is an interpreter change and gets listed here. The set above
is what the six archetype files need, plus a little headroom.

---

## 10. Actions: what changes in `attack.md`

Actions are `attack.md`'s **targeting → propagation → effect** objects,
unchanged in model. This proposal adds four small things and settles two
TODOs.

### 10.1 Numeric fields may be expressions

Anywhere `attack.md` has an integer — `damage.amount`, `forced_movement.
distance`, `max_range`, `splash_radius`, `propagation.range`,
`status_duration`, `collision_damage.amount` — an expression is allowed. The
same names as §9 are in scope, with `target.*` evaluated per affected unit
for effect-side fields (so "prone targets take double" is
`damage if target.has_status(prone) then 6 else 3`).

Targeting-side expressions (`max_range`) are evaluated once when the action
is offered, so the legal-target set is stable while the player aims.

### 10.2 Action-level `when` (availability)

```
ring_cleave "Ring Cleave"
  when adjacent_enemies >= 3
  …
```

An action whose `when` is false is not offered (its button greys out with
the reason). This is the home for **gated actions** — the concepts doc's
"surrounded-gated," "RAGE-only finisher," "only after moving N."

### 10.3 Named params

```
fireball "Fireball" mana 5
frostbite "Frostbite" mana 3
```

Any `<name> <int>` pairs after the display name become `action.<name>` in
scope for the transition that runs it. This is how `act any when mana >=
action.mana -> ready ; mana -= action.mana` works without an
archetype-specific `mana_cost` field. Params are plain data — the
interpreter attaches no meaning to the names.

### 10.4 `variants by <resource>` and `use`

```
shoot "Shoot"
  targeting tile, arc both, range 2..6, los, occupied
  damage 3
  variants by ammo
    poison:    damage 2 ; status poisoned for 2
    explosive: damage 2 ; splash 1 damage 1
  use ammo.next
```

- **`variants by <enum-or-cycle resource>`** — per value of that resource,
  override any fields; unlisted values use the base. This replaces
  `unit-definition.md`'s Ranger-only `params.rotation` with a general
  mechanism (a Mage's spell could vary by `stance`, a Berserker's charge by
  a "momentum" enum).
- **`use <effects>`** — self-effects that run whenever the action resolves,
  regardless of which transition invoked it. `use ammo.next` keeps the
  rotation with the action; `use mp += 3` keeps Quick Step's refill with
  Quick Step. Effects on the *transition* are for turn-economy costs (`mp -=
  …`, `actions -= 1`); effects on the *action* are for what the action
  intrinsically does to its owner. Either place works; this is the
  readable split.

### 10.5 Embedded self-movement, pinned down

`movement.md` left the timing/aim of an action's own movement to "the
archetype." There is no archetype code now, so it's an attribute of the
action:

```
move before, toward target, up to 4         # charge: close on the target, then strike
move after,  free,          up to 1         # whirlwind: strike, then step 1
move after,  away from target, up to 2      # hit-and-fade
```

- **`before`**: the unit moves first, then targeting is validated from the
  new position and the attack resolves. For `toward target`, the path is a
  straight line (per `attack.md`'s `requires_clear_path` note) ending
  adjacent to (or at `min_range` from) the target; the *player picks the
  target*, the engine picks the endpoint. `path_length` is bound for
  expressions.
- **`after`**: the attack resolves, then the unit gets a bounded move
  (`free` = pick a tile; `away from target` = along the line away). The
  after-move is part of the same transition — it does not return to a state
  first — so it can't be interleaved with anything, and it doesn't count
  against turn resources unless the transition's effects say so.
- Embedded movement uses the unit's `movement` block for pathing unless
  overridden (`… up to 4 as fly`).

Embedded movement **does not** touch `moved`/`moved_since_act` by default —
those count voluntary `move` transitions. Whether a Charge should count as
"having moved" for a Rogue-style condition is a design choice, and `moved`
is a read-only built-in, so the opt-in is a flag on the embedded-move line:
`move before, toward target, up to 4, counts_as_move`. Small knob, worth
naming rather than special-casing.

### 10.6 The terse form used in the archetype files

`attack.md` is JSON. The archetype files write actions in a compact
line-per-field form so they read like a card. The mapping is mechanical:

| Terse | `attack.md` |
|---|---|
| `targeting tile, arc both, range 1..4, los, occupied` | `targeting: {mode: tile, arc: both, min_range: 1, max_range: 4, requires_los: true, requires_occupied: true}` |
| `targeting self, all 8 adjacent` | `targeting: {targets_all: true, arc: both, min_range: 1, max_range: 1}` |
| `targeting direction, arc cardinal, range 1..3` | `targeting: {mode: direction, arc: cardinal, min_range: 1, max_range: 3}` |
| `targeting facing 3` | `targeting: {mode: direction, arc: cardinal, …}` + `propagation: {shape: line-abreast …}` — a **new shape**, see `expansion.md` |
| `shape line, stop_at_first` / `shape radius 1` | `propagation: {shape: line, penetration: stop_at_first}` / `{shape: radius, range: 1}` |
| `damage <expr> [<type>]` | `effect.damage: {amount: <expr>, type: <type or bludgeoning>}` |
| `push <expr>` / `pull <expr>` / `pull to adjacent` | `effect.forced_movement: {type: push/pull, distance: <expr>, blocked_by: [walls, other_units], collision_damage: {amount: 2}}` (playtest defaults) |
| `splash <r> damage <expr>` | `effect.splash_radius: r` with `on_hit_effect.damage` |
| `status <id> [for <n>]` | `effect.status: id, status_duration: n` |
| `terrain <kind> [for <n>]` | `effect.applies_to: terrain, terrain_effect: kind, terrain_duration: n or -1` |
| `friendly_fire` | `effect.friendly_fire: true` |

Whether this becomes the real parser surface or stays documentation
shorthand is README open question 2. Nothing in the *machine* depends on it.

---

## 11. Run-loop semantics, precisely

For one unit's turn. `S` = current state, `R` = resources.

```
begin_turn(unit):
  for each `each turn` resource: R[name] = init
  run hooks: on turn_start (in file order)
  S = start state
  loop:
    if S == done: break
    T = transitions of S, in file order, filtered to enabled(T)
      enabled(t) := guard(t) is true
                    and kind-precondition(t):
                        move/teleport → reachable set non-empty (respecting `up to`, budget ≥ 1)
                        act           → action.when true and legal-target set non-empty
                        choose/end    → true
                        auto          → true
    if any auto in T: fire first auto; continue
    if T is empty: S = done; continue          # implicit end (lint warns if the state has no `end`)
    (kind, input) = policy.pick(T)              # human UI or AI policy; blocks
    fire(kind with input)
  run hooks: on turn_end
  bump turns_stationary (0 if moved > 0 else +1)

fire(t):
  move/teleport: apply the path; bind tiles; hooks: on moved
  act:           embedded before-move → targeting → propagation → effect (attack.md)
                 → embedded after-move → action `use` effects → hooks (hit/kill/…)
  choose/auto/end: nothing
  then: run t's effects left to right (clamping)
  then: S = t's target state
```

Hooks that fire *on other units* as a side effect (a victim's `on damaged`,
`on displaced`) run inline as part of the action's effect application, in
board order (row-major), before control returns to the acting unit's loop.

**Policy** is the one pluggable piece: for a PC it's the game UI (or the
harness agent driving `dungeon_step`, or a Gherkin step); for an NPC it's an
AI policy (`brute.md`). The machine is what's *legal*; the policy is what's
*chosen*. Nothing in the machine knows which it's talking to.

**Round structure** (who goes when) is unchanged and outside this proposal:
players activate PCs one at a time in chosen order, then enemies act, per
the playtest kit and today's `TurnPhase`.

---

## 12. Determinism, undo, serialization

The interpreter is a pure function of `(unit file, board state, unit runtime
state, input) → (new board state, new unit runtime state)`. There is no
randomness anywhere in this proposal (the concepts doc's `confused` status
"random adjacent target" would be the first — see `expansion.md`; it would
take a seeded RNG threaded through the state).

**Unit runtime state** = `{ machine_state: S, resources: R, per_turn:
{moved, moved_since_act, acted, uses{}}, turns_stationary, statuses[] }`.
That plus the board is everything; it serializes as a small JSON object per
unit, which is what a save, an undo entry, a replay frame, and a harness
snapshot all are.

**Undo** = pop the previous `(board, runtime)` snapshot. Today's engine
already treats attacks as committal (undo stack cleared on attack). Keep
that: a transition is **committal** if it is an `act` (or if marked
`commit`); `move`, `choose`, `end` are undoable. Undo pops back to the last
committal point. Because the machine has no hidden state, this is exact.

---

## 13. Validation and lint

Run at parse/load time in both hosts; the harness surfaces these to the
agent immediately so a bad edit never reaches the board.

**Errors (file rejected):**

- Unknown state in `-> <state>` or `start ->`; unknown action in `act`;
  unknown resource, param, or event; type errors in expressions; assigning a
  built-in; a resource name colliding with a built-in.
- `act` on an action whose targeting/propagation/effect fails `attack.md`
  validation.
- **Non-terminating cycle.** For every cycle in the state graph, at least
  one transition on the cycle must *strictly decrease* a `each turn` integer
  resource (or a `uses`-bounded action, or take an `act` whose `max_uses`
  bounds it), and **no** transition on that cycle may *increase* that same
  resource. The Rogue's `ready → ready` via `move` decreases `mp` (never
  increased on that edge); via `act any` decreases `actions` (Quick Step
  increases `mp`, not `actions`, so the cycle is fine). A `choose "Rage" ->
  ready` with no cost, in a state that can loop back, is caught here — add
  `uses`-style bounding or make it a start-of-turn state. This check is
  what makes the "it can't hang" promise cheap: it's a graph walk, not a
  program analysis. One documented special case: a guard containing
  `moved_since_act >= k` (k ≥ 1) counts as "this edge consumes movement,"
  since it can't be re-satisfied without a `move` that spends a budget —
  this is what lets the `unit-definition.md` Ranger (no shot cap, just
  "move between actions") pass without a synthetic counter. See
  `archetypes/ranger.md`.
- Belt-and-braces: the interpreter also hard-caps transitions per turn
  (say 200) and ends the turn if hit — should be unreachable given the
  above; if it fires it's logged as an engine bug.

**Warnings (file loads):**

- A non-`done` state with no `end` and no `auto` — the turn can only end
  by exhaustion. Fine for a Rogue-style loop; worth a nudge.
- A resource that is spent but never guards a transition (`mana -= 2` with
  no `mana >= …` anywhere) — probably a bug.
- An `act` transition whose action can never be legal (range 0, no
  targets) or an action never referenced by any transition.
- A guard the checker can prove always false / always true (e.g. compares a
  capped resource above its cap).
- Two `auto` transitions enabled together in any reachable state (order
  decides — say so).

**Lint is a design aid, not a gate**, beyond the errors: the harness shows
warnings inline and the designer decides.

---

## 14. Errors at runtime

There should be none — expressions are total, guards prevent illegal spends,
clamping catches the rest. The remaining runtime "errors" are policy errors
(the harness agent tried to `dungeon_step` a transition that isn't enabled)
and are returned as a structured refusal with the enabled list, never as an
exception, so the agent self-corrects.

---

## 15. Reference card

```
unit <id> "<Name>"
  hp <n>
  movement walk|fly|teleport [diagonal] [passthrough …] [blocked_by …]

  resources
    <r> = <n> each turn [max <n>]
    <r> = <n> persistent [max <n>]
    <r> = <v> one of [a, b] [each turn|persistent]
    <r> = <v> cycles [a, b, c]

  actions
    <id> "<Name>" [<param> <n> …]
      [when <guard>]
      targeting … | shape … | damage <expr> | push/pull <expr> | status … | terrain … | splash …
      [move before|after, toward target|away from target|free, up to <expr> [, counts_as_move]]
      [variants by <r>   <v>: <field> … ]
      [use <effect> ; …]

  on turn_start|turn_end|round_start|round_end|hit|kill|damaged|collided|caused_collision|moved|displaced [when <guard>]
    <effect> ; …

  turn
    start -> <state>
    <state>
      move up to <expr> [as fly|teleport] [when <g>] -> <state> [; effects]
      teleport up to <expr>               [when <g>] -> <state> [; effects]
      act <id> | act any                  [when <g>] -> <state> [; effects]
      choose "<Label>"                    [when <g>] -> <state> [; effects]
      auto                                [when <g>] -> <state> [; effects]
      end | auto end                      [when <g>]

effects:   r += e | r -= e | r = e | r.next | apply <status> to self [for n] | remove <status> from self
guards:    expressions of int/bool/enum; if…then…else; and/or/not; min/max/abs; / floors; /0 = 0
builtins:  hp max_hp moved moved_since_act acted uses(a) turns_stationary has_status(s) on_terrain(k) turn
           adjacent_enemies adjacent_allies enemies_within(n) allies_within(n) nearest_enemy_distance can_target(a)
           tiles | action.<p> target.<…> path_length distance_to_target targets_hit
```
