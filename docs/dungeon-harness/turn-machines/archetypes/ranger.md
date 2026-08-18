# Ranger — the kiter

> Source rules: playtest kit §5 (HP 10, move 4, **up to 2 shots, must move
> ≥2 tiles between the first and second**, ammo cycle Normal → Poison →
> Explosive persists across turns; Net and Trap replace a shot and don't
> advance ammo); `unit-definition.md` `ranger` (must move ≥1 between
> consecutive actions, `params.rotation`); `archetype-concepts.md`
> "Ranger — the Kiter."

**Fantasy.** A metronome of shoot-step-shoot. Can't stand still, weapon's
job rotates every shot, shapes the floor the enemy is allowed to walk on.

The Ranger is defined by a **constraint** rather than a resource, and the
constraint is one guard.

## The playtest build

```
unit ranger "Ranger"
  hp 10
  movement walk

  resources
    steps = 4 each turn
    shots = 2 each turn
    ammo  = normal cycles [normal, poison, explosive]     # persists across turns

  actions
    shoot "Shoot"
      targeting tile, arc both, range 1..6, los, occupied
      damage 3
      variants by ammo
        poison:    damage 2 ; status poisoned for 1        # 1 dmg at start of its next turn
        explosive: damage 2 ; splash 1 damage 1
      use ammo.next                                        # rotate *after* every shot

    net "Net"
      targeting tile, arc both, range 1..4, los, occupied
      status rooted for 1                                  # can't move on its next turn

    trap "Trap"
      targeting tile, arc both, range 1..3, empty
      terrain trap                                         # first enemy in: 3 dmg + stop

  turn
    start -> ready
    ready
      move up to steps                                                   -> ready ; steps -= tiles
      act any  when shots > 0 and (acted == 0 or moved_since_act >= 2)   -> ready ; shots -= 1
      end
```

The whole "kiter" identity is `acted == 0 or moved_since_act >= 2`: *your
first action is free; every later one needs two tiles of movement since the
last.* `moved_since_act` is a built-in the engine maintains, so there's no
bookkeeping resource. Net and Trap "replace a shot" — they consume `shots`
but, having no `use ammo.next`, don't rotate the pointer. Exactly the card.

## Walkthrough: the sample turn

> *Pointer on Explosive → Shoot a clustered brute: 2 to it + 1 to its two
> neighbours (pointer → Normal). Move 2 (the mandatory scoot). Shoot Normal
> at a straggler for 3 (pointer → Poison). Move 2 back behind a wall.*

| # | State | Enabled | Policy picks | Engine does | After |
|---|---|---|---|---|---|
| 0 | — | | reset (`ammo` is persistent: stays `explosive`) | | `steps 4 · shots 2 · ammo explosive` |
| 1 | `ready` | move(≤4), shoot, net, trap, end | **shoot → clustered brute** | `explosive` variant: 2 + splash 1 to neighbours; `use ammo.next` | `shots 1 · ammo normal · acted 1 · moved_since_act 0` |
| 2 | `ready` | move(≤4), end · *shoot/net/trap greyed: "move ≥2 first (0 so far)"* | **move 2** | | `steps 2 · moved_since_act 2` |
| 3 | `ready` | move(≤2), **shoot**, net, trap, end | **shoot → straggler** | `normal`: 3; `ammo.next` | `shots 0 · ammo poison` |
| 4 | `ready` | move(≤2), end | **move 2** | | `steps 0` |
| 5 | `ready` | end | **end** | | |
| 6 | `done` | | | | next turn starts on `poison` |

Note step 2's greyed reason: the engine knows the guard's failing clause and
its current value. That's the "why can't I?" affordance the HUD gets for
free.

## The `unit-definition.md` build

Same shape, different constants: **at least one tile** between actions,
no shot cap (bounded instead by movement running out), rotation on the
longbow only:

```
  turn
    start -> ready
    ready
      move up to steps                                             -> ready ; steps -= tiles
      act any  when acted == 0 or moved_since_act >= 1             -> ready
      end
```

Termination: the `ready → ready` cycle via `act any` doesn't decrease a
resource directly — but every second traversal requires `moved_since_act ≥
1`, which requires a `move` that decreases `steps`. Lint's simple rule
("some transition on the cycle strictly decreases a per-turn resource that
nothing on the cycle increases") sees `move … steps -= tiles` on the cycle
and passes; and the `act`-only sub-cycle is broken by its own guard after
one traversal. To keep the check *simple* rather than clever, lint should
treat a guard of the form `moved_since_act >= k` (k ≥ 1) as "this edge
consumes movement" — a documented special case, listed in
`machine-definition.md` §13 for the implementer. (Alternatively write the
`shots` cap as the playtest does and sidestep it — which is what a
designer will do the moment lint says "unbounded.")

| `unit-definition.md` ranger field | Here |
|---|---|
| "requires a move between consecutive actions" | `acted == 0 or moved_since_act >= 1` |
| `params.rotation: [ … variants … ]` | `ammo` cycle resource + `variants by ammo` + `use ammo.next` |
| rotation state persists across turns | `cycles` resources are persistent by default |
| where rotation state lives / how it resets | the unit's serialized resources; resets only on unit creation (or an explicit `ammo = normal` hook if wanted) |

## Concepts-doc ideas

**Hard rule or soft incentive?** The guard is the hard rule. The soft
version is an expression on the *payoff* instead of the *legality*:
```
    act any  when shots > 0   -> ready ; shots -= 1
    …
    shoot "Shoot"
      damage if moved_since_act >= 2 then 3 else 2      # "a planted shot is weaker"
```
Two lines apart. Try both.

**"Hold position" exception — overwatch / ready-shot:**
```
    ready
      choose "Overwatch" when shots > 0 and acted == 0  -> done ; shots -= 1 ; apply overwatch to self for 1
```
where `overwatch` is a status whose definition (`expansion.md`) reacts to
an enemy entering range during the enemy phase — that reaction is the one
piece not expressible yet; the *decision to overwatch* is.

**Zoning kit** — caltrops, nets, tripwires, a lane-blocking spear: `terrain
…` and `status …` effects on the Ranger's side, all expressible; the
behaviours are terrain/status definitions.

**Anti-mobility** — root/slow/difficult terrain: statuses (`rooted`,
`slowed`) and `terrain difficult_terrain`; the Ranger applies them, the
victim's `move` pathing consults them.

**Ammo: can he "skip" to line up a shot?** A self-targeted action, so
`uses(...)` bounds it:
```
    cycle "Nock Next Arrow"
      targeting self
      use ammo.next
    …
      act cycle when uses(cycle) < 1 and shots > 0   -> ready ; shots -= 1   # costs a shot
```
Design call whether it costs a shot; both are one line.

## Coverage check

| Concept | Status |
|---|---|
| forced move between actions (≥1 or ≥2) | ✅ one guard on `moved_since_act` |
| shot cap per turn | ✅ `shots` resource |
| ammo rotation, persistent, advances per shot | ✅ `cycles` resource + `variants by` + `use ammo.next` |
| non-shot actions don't rotate | ✅ omit `use ammo.next` |
| soft vs hard kiting rule | ✅ guard vs damage expression |
| overwatch decision | ✅ ; overwatch *reaction* ⚠️ `expansion.md` |
| zoning / anti-mobility | ✅ Ranger side; status/terrain definitions ⚠️ `expansion.md` |
| skip ammo | ✅ self action |
