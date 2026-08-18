# Anchor — the rooted fighter

> Source rules: `archetype-concepts.md` — "Anchor — the Rooted Fighter,"
> plus the two shared modules "Stances" and "Fury," plus "Surrounded" and
> "Statuses." There is **no playtest build** for the Anchor yet, so every
> number below is illustrative; the point of this file is that every open
> question in the concepts doc is a *shape* the machine can take, and most
> of them are shown side by side so they can be tried in a session.

**Fantasy.** The immovable object. He wants to move as little as possible
and makes the battlefield come to him. Not moving is an active, rewarded
choice; being surrounded is his ideal board state; every other tool (root,
hook, taunt, enrage) exists to manufacture and maintain the ring.

This is the archetype that stress-tests the proposal, because it leans on
all three things `unit-definition.md`'s data model couldn't say: a resource
that builds off *events* (Fury), a *mode* that reshapes the action set
(stances), and numbers that read the *board* (surrounded).

## A first Anchor, as a machine

```
unit anchor "Anchor"
  hp 16
  movement walk

  resources
    steps  = 2  each turn
    fury   = 0  persistent max 6
    stance = guard one of [rage, guard]

  # ── Fury: how it builds (concepts doc: "on standing still", "on taking hits") ──
  on turn_end when moved == 0
    fury += 1
  on damaged
    fury += 1
  # ── the counterplay: a shove knocks him loose ──
  on displaced
    fury = 0

  actions
    smash "Smash"
      targeting tile, arc both, range 1, occupied
      damage 3 + adjacent_enemies / 2                 # surrounded scales even single-target hits

    hook "Hook"
      targeting tile, arc cardinal, range 2..4, occupied, clear_path
      pull distance_to_target - 1                     # yank it adjacent (feed the ring)

    taunt "Taunt"                                     # soft area taunt: pull everyone within 2 one step in
      when stance == guard
      targeting self, all within 2
      pull 1

    ring_cleave "Ring Cleave"                          # surrounded-gated finisher
      when adjacent_enemies >= 3
      targeting self, all 8 adjacent
      damage if adjacent_enemies >= 5 then 5 else 4   # breakpoints, not linear

    quake "Quake"                                      # RAGE finisher: radius push + collisions
      when stance == rage
      targeting self, all 8 adjacent
      damage 2
      push 2

  turn
    start -> stance_pick
    stance_pick                                       # "locked for a full turn": choose once, at the top
      choose "Rage"          -> ready ; stance = rage
      choose "Guard"         -> ready ; stance = guard
      choose "Keep stance"   -> ready
    ready
      move up to steps                    -> ready ; steps -= tiles
      act smash                           -> done
      act hook                            -> done
      act taunt                           -> done
      act ring_cleave  when fury >= 3     -> done ; fury -= 3
      act quake        when fury >= 4     -> done ; fury -= 4
      end
```

## Walkthrough: manufacturing the ring

Board: Anchor in Guard, fury 2, two brutes adjacent, a third at distance 3
in a cardinal line.

| # | State | Enabled | Policy picks | Engine does | After |
|---|---|---|---|---|---|
| 0 | — | | (turn start: `steps` reset to 2) | | `steps 2 · fury 2 · guard` |
| 1 | `stance_pick` | Rage, Guard, Keep | **Keep stance** | | |
| 2 | `ready` | move, smash, hook, taunt, end · *ring_cleave greyed: "needs 3 adjacent (have 2), fury ≥ 3 (have 2)"* · *quake greyed: "Rage only"* | **hook → far brute** | pull 2 → brute now adjacent (`adjacent_enemies` = 3) | |
| 3 | `done` | | | `on turn_end`: `moved == 0` → `fury += 1` | `fury 3` |
| — | *enemy phase* | | brute hits him | `on damaged` → `fury += 1` | `fury 4` |
| 4 | `stance_pick` | | **Keep stance** | | `steps 2 · fury 4 · 3 adjacent` |
| 5 | `ready` | …, **ring_cleave enabled** (3 adjacent, fury 4) | **ring_cleave** | 4 to each of the three | |
| 6 | `done` | | | transition: `fury -= 3`; `on turn_end` (moved 0) `+1` | `fury 2` |

Every "greyed with reason" line is the interpreter reporting the failing
guard, not the agent guessing.

## The open questions, each as a shape

### Stances — the switching cost (concepts doc lists three; "never per-action")

**Locked for a full turn** — shown above: a `stance_pick` state at the top
of the turn, then `ready` has no stance transitions at all.

**Once per turn, at any moment** — a bounded `choose` inside the loop:
```
  resources
    switches = 1 each turn
  …
    ready
      choose "To Rage"  when switches > 0 and stance == guard -> ready ; stance = rage  ; switches -= 1
      choose "To Guard" when switches > 0 and stance == rage  -> ready ; stance = guard ; switches -= 1
      … (move / act / end as before)
```

**Locked for N actions** — count actions since the last switch:
```
  resources
    in_stance = 0 persistent               # actions taken in the current stance
  …
    ready
      act any                              -> done ; in_stance += 1
      choose "Switch stance" when in_stance >= 2 -> ready ; stance = (if stance == rage then guard else rage) ; in_stance = 0
```

**"Never per-action switching"** — the design rule the doc calls
non-negotiable. Notice you *cannot* write the bad version by accident: a
free `choose "Rage" -> ready` / `choose "Guard" -> ready` pair inside the
`ready` loop is a cycle that spends nothing, and the termination check
rejects the file (`machine-definition.md` §13). The lint error *is* the
design rule.

**Can a stance be forced?** — a hook, or a status (`expansion.md`):
```
  on damaged when amount >= 4              # a heavy stagger knocks him out of Guard
    stance = rage
```

**Do stances gate finishers, or retune them?** — both, side by side:
```
    quake "Quake"
      when stance == rage                  # gate: exists only in Rage
      …
    smash "Smash"
      damage 3 + adjacent_enemies / 2      # retune: same action, different numbers per stance
      variants by stance
        rage: damage 4 + adjacent_enemies / 2
```

### Fury — build, spend, carry over

| Concepts doc option | Line |
|---|---|
| builds on striking | `on hit: fury += 1` |
| builds on taking hits | `on damaged: fury += 1` |
| builds on standing still, per turn held | `on turn_end when moved == 0: fury += 1` |
| … or per step *not* taken | `on turn_end: fury += 2 - moved` (clamps at 0) |
| builds on kill / collision | `on kill: fury += 2` / `on caused_collision: fury += 1` |
| spend on finishers | `act ring_cleave when fury >= 3 -> done ; fury -= 3` |
| sustained burn (stay enraged for a few actions) | `choose "Burn" when fury >= 2 -> ready ; fury -= 2 ; apply raging to self for 2` (status: `expansion.md`) |
| reset each turn | declare `fury = 0 each turn` |
| bank with a cap (*the doc's lean*) | `fury = 0 persistent max 6` |
| full bank | `fury = 0 persistent` (no `max`) |
| shared meter, opposite fuel (Anchor vs Berserker) | same resource name, different `on …` hooks per unit file — nothing to decide globally |

### The rooted reward — what does the bonus scale with?

- **Steps-not-taken this turn**: `on turn_end: fury += 2 - moved`.
- **Turns held on a tile**: the built-in `turns_stationary` (`smash: damage
  3 + min(turns_stationary, 3)`), or if a shove should reset the streak,
  model the streak yourself so a hook can zero it:
  ```
    resources
      held = 0 persistent
    on turn_end when moved == 0
      held += 1
    on turn_end when moved > 0
      held = 0
    on displaced
      held = 0
  ```
- **Cap to avoid the unkillable turtle**: `max` on the resource, or `min(…,
  3)` in the expression.

### Surrounded — what the trigger grants

| Concepts doc option | Line |
|---|---|
| scale at time of attack | `damage 3 + adjacent_enemies / 2` (linear) or `damage if adjacent_enemies >= 5 then 5 else if adjacent_enemies >= 3 then 4 else 3` (breakpoints) |
| status on **start**-of-turn surrounded | `on turn_start when adjacent_enemies >= 3: apply bulwark to self for 1` |
| status on **end**-of-turn surrounded | `on turn_end when adjacent_enemies >= 3: apply bloodbath to self for 1` |
| surrounded-**gated** actions | `ring_cleave … when adjacent_enemies >= 3` |
| self-centred shapes scale with the ring | the ring shape's damage expression reads `adjacent_enemies` — same thing |

(`bulwark`/`bloodbath` are statuses that add damage or fury for a turn —
their definitions are the status system in `expansion.md`; the *trigger*
side is fully expressible today.)

### Pulling the fight in — hook vs. taunt vs. enrage

- **Hook / whip / chain** — a `pull` with `distance_to_target - 1`; relocate
  one enemy *now*. Fully expressible (shown).
- **Soft taunt** (moves toward him this turn) — `pull 1` on `all within R`
  (shown, area) or on one tile (single-target). Fully expressible, because
  soft taunt is *forced movement*, and forced movement is `attack.md`.
- **Hard taunt** (must also *attack* him next turn) — a status `taunted`
  that the brute policy honours (`target := source of taunted`). Needs the
  status system + a policy hook: `expansion.md`.
- **Enrage, next-turn version** — same as hard taunt: status `enraged`, AI
  policy honours it.
- **Enrage, *bend the already-aimed attack* version** — this depends on the
  **round order**, and it's worth being precise: today's game telegraphs NPC
  attacks during `npc-move` and resolves them on the player's confirm. If
  the round is Into-the-Breach-shaped (enemies telegraph → **player phase**
  → enemy attacks resolve), then "redirect that telegraphed attack onto me"
  is an *ordinary player-phase action* with one new effect
  (`redirect_telegraph to self`) — no interrupt system needed. If the player
  phase comes first, it's a **reaction** during the enemy phase, which is
  the one construct this proposal doesn't yet have. Both are in
  `expansion.md`; the point here is that the *machine* isn't the blocker
  either way.

### Counterplay: spacing

The concepts doc's answer to "a smart opponent refuses to cluster" is
*forced* pull/taunt — expressible above. The other half, enemies that
actually space out, is AI policy (`brute.md`) and stays the separate
workstream.

## Coverage check

| Concept | Status |
|---|---|
| root reward (steps-not-taken / turns-held / cap) | ✅ hooks + `turns_stationary` or a `held` resource |
| shove resets the stack | ✅ `on displaced` |
| hook to adjacent | ✅ `pull distance_to_target - 1` |
| soft taunt, single or area | ✅ forced movement |
| hard taunt / next-turn enrage | ⚠️ needs status system + policy hook (`expansion.md`) |
| enrage bends current attack | ⚠️ round-order dependent: new effect, or reactions (`expansion.md`) |
| surrounded: at-attack scaling, linear or breakpoints | ✅ expressions |
| surrounded: start/end-of-turn status | ✅ trigger; ⚠️ status definitions (`expansion.md`) |
| surrounded-gated actions | ✅ `when` |
| Fury: all four build modes, both spend modes, all three carryover modes | ✅ |
| Stances: locked-turn / once-per-turn / locked-N-actions | ✅ three shapes shown |
| never per-action switching | ✅ *enforced by lint* |
| forced stance | ✅ hook (or status) |
| stance gates vs retunes finishers | ✅ `when` vs `variants by stance` |
| Barbarian / Warden as tunings of the same archetype | ✅ same file, different hooks/actions — or `extends anchor` (`expansion.md`) |
