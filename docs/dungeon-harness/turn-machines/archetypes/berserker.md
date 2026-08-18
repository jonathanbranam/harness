# Berserker — the kinetic fighter

> Source rules: playtest kit §3 (HP 14, base move 2, one action; Cleave /
> Charge / Shove / Hook / Whirlwind, exact numbers below);
> `unit-definition.md` `fighter` (move splittable around one action,
> `move_after`); `archetype-concepts.md` "Berserker — the Kinetic Fighter"
> for the open questions.

**Fantasy.** Always in motion, but only through violence. His own movement
is welded to his attacks; his attacks fling enemies into walls, hazards, and
each other. The board does damage he never had to roll.

## The playtest build, as a machine

```
unit berserker "Berserker"
  hp 14
  movement walk

  resources
    steps = 2 each turn                       # the free move

  actions
    cleave "Cleave"
      targeting facing 3                      # the three tiles along one side (N/S/E/W)
      damage 3

    charge "Charge"
      targeting tile, arc cardinal, range 2..5, occupied, clear_path
      move before, toward target, up to 4     # straight line, stop adjacent
      damage 4 + (if path_length >= 3 then 1 else 0)
      push 1

    shove "Shove"
      targeting tile, arc both, range 1, occupied
      push 2                                  # no damage — the collision is the damage

    hook "Hook"
      targeting tile, arc cardinal, range 2..3, occupied, clear_path
      pull min(2, distance_to_target - 1)     # "pull 2, or until adjacent"

    whirlwind "Whirlwind"
      targeting self, all 8 adjacent
      damage 2
      move after, free, up to 1

  turn
    start -> ready
    ready
      move up to steps      -> ready ; steps -= tiles
      act charge            -> after ; steps = 0        # the charge *is* his move this turn (playtest sample)
      act any               -> after
      end
    after
      move up to steps      -> after ; steps -= tiles   # leftover free move after the action
      end
```

Reading it back the way a designer would: *free move of 2, split any way
around one action; Charge eats whatever free move is left; every attack's
numbers are on the card.* The four `unit-definition.md` fighter concepts
land as follows:

| `unit-definition.md` fighter | Here |
|---|---|
| "may spend movement, then one action, then leftover movement" | `ready` (move loop) → `act … -> after` → `after` (move loop) |
| `params.move_after: false` | delete the `move` line from `after` — no param needed |
| action-embedded `movement` (charge) with unpinned timing/aim | `move before, toward target, up to 4` on the action — pinned |
| pushback via `effect.forced_movement` | `push 1` / `push 2` / `pull …` — unchanged `attack.md` |

## Walkthrough: the sample turn from the playtest kit

> *Charge 4 tiles into a brute standing in front of a pit → 5 damage (moved
> ≥3) and push it 1 → it goes into the pit → removed. Then your free move is
> already spent by the charge, so you're done.*

| # | State | Enabled | Policy picks | Engine does | Resources after |
|---|---|---|---|---|---|
| 0 | — | — | (turn start: `steps` reset) | | `steps 2` |
| 1 | `ready` | move(≤2), charge, cleave?, shove?, hook, whirlwind?, end | **charge → brute at distance 5, cardinal, path clear** | before-move 4 tiles toward target (`path_length 4`); damage `4 + 1 = 5`; push 1 → tile is a pit → brute removed (`caused_collision`/removal per playtest §2) | |
| 2 | → `after` | | | transition effects: `steps = 0` | `steps 0` |
| 3 | `after` | end *(move disabled: `steps 0`)* | **end** | | |
| 4 | `done` | | | `on turn_end` (none) | |

Cleave/shove/whirlwind were greyed at step 1 with reason *no legal target*
(nothing adjacent yet). The harness shows exactly that.

## Variations the concepts doc asks about — each is a line or two

**"Does charge distance build Fury (momentum → meter)?"**
```
  resources
    fury = 0 persistent max 6
  …
    ready
      act charge  -> after ; steps = 0 ; fury += path_length / 2
```
(or `on caused_collision: fury += 1` for "the board did the work, bank it").

**"Can charge attacks chain?"** — a second charge is just another
transition, gated on the meter you decided builds it:
```
    after
      act charge when fury >= 2   -> after ; fury -= 2
      move up to steps            -> after ; steps -= tiles
      end
```
The termination check is happy: the `after → after` cycle via `charge`
strictly decreases `fury`, and nothing on that cycle increases it
(`fury += path_length / 2` lives on the `ready → after` edge, not in the
cycle). If you *did* want a charge to refund fury inside the loop, lint
would flag the cycle and ask for a bound — `when uses(charge) < 3`, say.

**"Is displacement easier against prone/stunned targets?"** — an
expression on the push distance:
```
    shove "Shove"
      targeting tile, arc both, range 1, occupied
      push if target.has_status(prone) or target.has_status(stunned) then 3 else 2
```

**"Collision damage — flat, or scaled by what was hit?"** — today it's
`attack.md`'s `collision_damage.amount`, an expression, with the playtest
defaults (2 wall/unit/edge, 3 mountain) as engine constants. Scaling by
distance shoved is `collision_damage tiles_pushed` once `tiles_pushed` is
bound in the forced-movement context — a one-name addition to
`machine-definition.md` §9. Listed in `expansion.md`.

**"Do stances fit him?"** — mechanically yes, trivially: see
[`anchor.md`](anchor.md) for stances as a resource + guards; the Berserker
would use the identical shape with an *offense/displacement* pair. Whether
he *should* is the design question, unchanged.

**"Bloodlust / zombie free-move on kill" (parked as OP)** — expressible,
which is exactly why the machine is useful for testing a parked idea in
five minutes rather than arguing about it:
```
  on kill
    steps += 2                       # or: apply bloodlust to self for 1
```
with `steps` capped by `max` so it can't run away. Try it, watch it, park it
again with evidence.

## What the machine gives the Berserker specifically

- **Movement-through-violence is literal:** his voluntary `move` budget is
  tiny (2), and every big reposition is an embedded `move before/after` on
  an action. `moved` (voluntary) and `path_length` (embedded) are separate
  built-ins, so "the Rogue's earned-by-moving" and "the Berserker's
  charge-distance" never get confused.
- **The board is the damage:** `push`/`pull` are `attack.md` forced
  movement; collisions, pits, water, fire are terrain rules the engine
  applies. The machine never has to say "and if there's a wall behind
  him…" — the designer just pushes, and watches.

## Coverage check

| Concept (`archetype-concepts.md`, playtest) | Expressed by |
|---|---|
| free move 2 + one action, split around it | `steps` resource, `ready`/`after` states |
| charge: line, ≤4, +1 dmg if ≥3, push 1, clear path | embedded `move before, toward target`, `path_length` expression, `clear_path` targeting |
| charge consumes free move | `steps = 0` on the transition |
| whirlwind: 8 adjacent then move 1 | `targeting self, all 8 adjacent` + `move after, free, up to 1` |
| hook: pull 2 or until adjacent | `pull min(2, distance_to_target - 1)` |
| shove: no damage, push 2 | `push 2`, no `damage` line |
| cleave: three tiles on one facing | `targeting facing 3` — **new propagation shape** (`expansion.md`) |
| fury from momentum / collisions | resource + `on caused_collision` or transition effect |
| chained charges | second `act charge` transition with a resource guard |
| prone/stunned shoved further | `push` expression on `target.has_status` |
| collision damage scaled by distance / obstacle kind | needs `tiles_pushed` / `hit_kind` bound in forced-movement context — `expansion.md` |
| stances | see `anchor.md`; same shape |
