# Rogue — the skirmisher

> Source rules: playtest kit §4 (HP 8, 6 MP/turn, **2 actions/turn in any
> order**, passthrough enemies; Backstab 5-if-moved-≥3-else-2, Throw Dagger,
> Quick Step +3 MP, Mark, Caltrops); `unit-definition.md` `rogue`
> (movement pool, `grants_move`, `ends_turn`, `max_uses`, Vanish);
> `archetype-concepts.md` "Rogue — the Skirmisher."

**Fantasy.** A blur that owns the whole map. Move · act · move · act, damage
*earned by moving*, gone before the counter lands.

The Rogue is the archetype whose old `params` table (`grants_move`) most
obviously wanted to be a general mechanism. Here it's just effects.

## The playtest build (shown in full in the README)

```
unit rogue "Rogue"
  hp 8
  movement walk passthrough enemy_units

  resources
    mp      = 6  each turn
    actions = 2  each turn

  actions
    backstab "Backstab"
      targeting tile, arc both, range 1, occupied
      damage if moved >= 3 then 5 else 2                 # earned by moving
    throw_dagger "Throw Dagger"
      targeting tile, arc both, range 1..4, los, occupied
      damage 2
    quick_step "Quick Step"
      targeting self
      use mp += 3                                        # the refill lives with the action
    mark "Mark"
      targeting tile, arc both, range 1..4, los, occupied
      status marked                                      # next hit +2 (status: expansion.md)
    caltrops "Caltrops"
      targeting tile, arc both, range 1..2, empty
      terrain caltrops                                   # first enemy in: 1 dmg + stop

  turn
    start -> ready
    ready
      move up to mp                    -> ready ; mp -= tiles
      act any    when actions > 0      -> ready ; actions -= 1
      end
```

Three lines of turn structure. `act any` covers all five actions with one
guard and one cost, which is exactly the playtest rule ("you get 2 actions").
Quick Step's `+3 MP` sits on the action (`use`), so it applies however
Quick Step gets invoked.

## Walkthrough: the sample turn

> *Move 4 through a gap between two brutes (passthrough) → MP 2 left,
> moved-tally = 4 → Backstab for 5 (moved ≥3) → Quick Step (+3 MP, now 5) →
> move 3 away to safety. Two actions used, turn ends.*

| # | State | Enabled | Policy picks | Engine does | After |
|---|---|---|---|---|---|
| 0 | — | | reset | | `mp 6 · actions 2 · moved 0` |
| 1 | `ready` | move(≤6), backstab?, throw?, quick_step, mark, caltrops, end | **move 4** (path threads between two brutes — `passthrough enemy_units`) | `tiles 4` | `mp 2 · moved 4` |
| 2 | `ready` | move(≤2), **backstab** (adjacent now), … | **backstab → brute** | `moved >= 3` → damage 5 | `actions 1` |
| 3 | `ready` | move(≤2), quick_step, throw?, mark, caltrops, end | **quick_step** | `use mp += 3` | `mp 5 · actions 0` |
| 4 | `ready` | move(≤5), end · *all acts greyed: "no actions left"* | **move 3** | | `mp 2 · moved 7` |
| 5 | `ready` | move(≤2), end | **end** | | |
| 6 | `done` | | | | |

Undo: steps 1 → 2 crossed a committal `act`, so undo from step 4 goes back
to step 3's state, not step 0 (`machine-definition.md` §12).

## The `unit-definition.md` build, for comparison

That doc's rogue has a different economy — no action count; instead some
actions *refill* movement (`grants_move`), some *end the turn*
(`ends_turn`), some are once per turn (`max_uses`); the turn ends when
nothing is affordable or by choice. Same machine, different lines:

```
unit thief "Thief"
  hp 3
  movement walk passthrough enemy_units

  resources
    mp = 4 each turn

  actions
    backstab "Backstab"
      targeting tile, arc both, range 1, occupied
      damage 3
      use mp += 2                                # grants_move: 2
    throw_dagger "Throw Dagger"
      targeting tile, arc both, range 1..3, los, occupied
      shape line, stop_at_first
      damage 2
    vanish "Vanish"
      targeting self
      move after, free, up to 3                  # the action's own movement block

  turn
    start -> ready
    ready
      move up to mp                          -> ready ; mp -= tiles
      act backstab  when uses(backstab) < 1  -> ready         # max_uses: 1
      act throw_dagger                       -> ready
      act vanish                             -> done          # ends_turn: true
      end
```

| `unit-definition.md` rogue field | Here |
|---|---|
| movement pool = `movement.range` | `mp = 4 each turn` |
| `params.grants_move: 2` | `use mp += 2` on the action |
| `ends_turn: true` | the transition goes `-> done` |
| `max_uses: 1` | `when uses(backstab) < 1` |
| turn ends when "no affordable action remains" | implicit exhaustion — `move` disabled at `mp 0`, all `act`s spent → `end` is the only thing left (or the state empties → `done`) |
| "player chooses to stop" | `end` |

Notice `throw_dagger` here has **no guard and no cost**: it's a
`ready → ready` cycle that spends nothing. **Lint rejects this file** — a
Thief could throw daggers forever. That's the termination check earning its
keep on a real example: `unit-definition.md`'s prose glossed over it
("unlimited, subject to the archetype's economy") and the economy as
written has no bound. Fix: `when uses(throw_dagger) < 2`, or make it cost
`mp -= 1`, or give the Thief the playtest's `actions` counter. The
designer decides; the tool made the hole visible.

## Concepts-doc ideas

**Conditional burst — from behind/flank.** `moved >= 3` (shown) covers the
"after moving N" version. "From behind" needs **facing** — a unit
orientation the engine tracks — which is the concepts doc's own open
question ("are facings tracked, or chosen fresh per attack?"). If tracked,
it's one more built-in (`target.facing_away_from_me`) and the Backstab is
`damage if target.facing_away_from_me then 5 else 2`. Listed in
`expansion.md`.

**Setup over damage.** Mark, caltrops, blind, steal — Mark and caltrops are
above (`status marked`, `terrain caltrops`); what they *do* is status/
terrain definitions (`expansion.md`), and the Rogue's side is complete.

**Reposition self & others** — swap places, pull an ally out, yank an enemy
off an objective:
```
    switch "Switch Places"
      targeting tile, arc both, range 1..3, occupied, allies_only
      swap with target                         # new forced-movement type: expansion.md
    yank "Yank"
      targeting tile, arc both, range 1..3, occupied
      pull 1
```
`pull` exists; `swap` is a small new `forced_movement.type` worth adding.

**Pass-through everything, maybe diagonal.** `movement.md`, unchanged:
`movement walk diagonal passthrough any`.

**"Does the Rogue have a resource besides Movement, or is mobility the whole
economy?"** — the two builds above *are* the two answers (playtest: MP +
action count; `unit-definition.md`: MP only, refilled by acts). Both are
three lines. Try both in one session.

## Coverage check

| Concept | Status |
|---|---|
| MP pool, spend per tile | ✅ `move up to mp ; mp -= tiles` |
| N actions per turn, any order | ✅ `actions` resource + `act any` |
| refill on an action | ✅ `use mp += 3` |
| conditional damage on movement | ✅ `if moved >= 3 then 5 else 2` |
| conditional damage on flank/behind | ⚠️ needs tracked facing (`expansion.md`) |
| once-per-turn actions | ✅ `uses(x) < 1` |
| turn-ending actions | ✅ `-> done` |
| passthrough enemies / diagonal | ✅ `movement.md` |
| Mark / caltrops (setup) | ✅ trigger side; ⚠️ status/terrain definitions (`expansion.md`) |
| swap places | ⚠️ new `forced_movement.type: swap` |
| the "unlimited action" hole in `unit-definition.md` | ✅ caught by lint |
