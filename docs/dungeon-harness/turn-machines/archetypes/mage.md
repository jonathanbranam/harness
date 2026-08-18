# Mage — the artillery / controller

> Source rules: playtest kit §6 (HP 8; **Blink** free once per turn,
> teleport ≤5 with LOS; **Mana starts 6, +2 at turn start, cap 10**; cast
> until out; Firebolt 2 / Frostbite 3 / Fireball 5 / Conjure Wall 3);
> `unit-definition.md` `mage` (mana resets each turn, teleport freely
> between casts, `params.mana` / `params.mana_cost`); `archetype-concepts.md`
> "Mage"; `mage-concepts.md` (the zero-damage build).

**Fantasy.** A glass cannon that rewrites the map. Blinks, drops walls and
fire, unloads mana in one devastating turn, then stands exposed.

The Mage is the archetype where "resource with carryover and a cap" and
"named cost per action" matter — both are one line each.

## The playtest build

```
unit mage "Mage"
  hp 8
  movement teleport

  resources
    mana  = 6 persistent max 10
    blink = 1 each turn

  on turn_start
    mana += 2                                   # clamps at the cap

  actions
    firebolt "Firebolt" mana 2
      targeting tile, arc both, range 1..6, los, occupied
      damage 3 fire

    frostbite "Frostbite" mana 3
      targeting tile, arc both, range 1..6, los, occupied
      damage 2 cold
      status frozen for 1                        # skips its next move

    fireball "Fireball" mana 5
      targeting tile, arc both, range 1..6, los
      shape radius 1                             # the 3×3
      damage 3 fire
      friendly_fire

    conjure_wall "Conjure Wall" mana 3
      targeting tile_multi 3, arc both, range 1..4, empty, connected
      terrain wall                               # max one wall on the map: expansion.md (terrain rule)

  turn
    start -> ready
    ready
      teleport up to 5  when blink > 0                 -> ready ; blink -= 1
      act any           when mana >= action.mana        -> ready ; mana -= action.mana
      end
```

That's the boom/bust economy: `mana` persists (bank), caps at 10 (no
infinite nuke), refills 2 (the trickle), and every spell's cost is a param
the one `act any` line reads. Blink is a once-per-turn teleport gated by its
own tiny resource — "free" in mana, bounded in count.

## Walkthrough: the sample turn

> *Mana 6 (+2 = 8). Blink 5 onto a ridge with LOS to three clustered brutes.
> Fireball (−5) → 3 to all three. Mana 3 left → Firebolt a survivor (−2) → 3
> more. End with 1 Mana, fully exposed.*

| # | State | Enabled | Policy picks | Engine does | After |
|---|---|---|---|---|---|
| 0 | — | | reset `blink`; `on turn_start` `mana += 2` | | `mana 8 · blink 1` |
| 1 | `ready` | teleport(≤5), firebolt, frostbite, fireball, conjure_wall, end | **teleport → ridge** | | `blink 0` |
| 2 | `ready` | firebolt, frostbite, fireball, conjure_wall, end · *teleport greyed: "blink used"* | **fireball → centre brute** | 3×3, 3 fire to all three (and to any ally in it — `friendly_fire`) | `mana 3` |
| 3 | `ready` | firebolt, frostbite, conjure_wall, end · *fireball greyed: "needs 5 mana (have 3)"* | **firebolt → survivor** | 3 fire | `mana 1` |
| 4 | `ready` | end · *every spell greyed with its cost vs. `mana 1`* | **end** | | |
| 5 | `done` | | | next turn: `mana 1 + 2 = 3` | |

Whether Conjure Wall at exactly 3 mana is affordable at step 3 is the kind
of thing an LLM narrating a board gets wrong one time in ten. The
interpreter evaluates `mana >= action.mana` and is never wrong — which is
the whole reason the agent shouldn't be doing this in its head.

## The `unit-definition.md` build

Mana that **resets** each turn and free teleporting **up to a budget**
between casts:

```
unit wizard "Wizard"
  hp 3
  movement teleport diagonal

  resources
    mana  = 3 each turn
    steps = 4 each turn

  actions
    create_wall "Create Wall" mana 1
      targeting tile, arc both, range 1..4, empty
      terrain wall
    wall_of_fire "Wall of Fire" mana 2
      targeting tile_multi 2, arc both, range 1..4, connected
      damage 2 fire ; status burning for 2 ; terrain burning_ground for 2 ; friendly_fire
    freeze "Freeze Enemy" mana 2
      targeting tile, arc both, range 1..4, los, occupied
      status frozen for 1

  turn
    start -> ready
    ready
      teleport up to steps                     -> ready ; steps -= tiles     # tiles = 1 per blink; or spend distance — design call
      act any  when mana >= action.mana        -> ready ; mana -= action.mana
      end
```

| `unit-definition.md` mage field | Here |
|---|---|
| `params.mana` (unit-level pool) | `mana = 3 each turn` |
| `params.mana_cost` (per action) | `mana 2` param on the action, read as `action.mana` |
| "reset each turn" vs. the playtest's carryover + cap | `each turn` vs. `persistent max 10` + `on turn_start mana += 2` — the concepts doc's "banking vs. dumping" open question is literally which of two lines you write |
| teleport freely between casts up to `movement.range` | `teleport up to steps` (budget) or `teleport up to 5 when blink > 0` (count) |
| turn ends when no affordable spell | implicit exhaustion, or `end` |

**Teleport spend model** is a genuine design choice the machine makes
explicit: does a blink cost *one* from a count (playtest) or *distance*
from a budget (unit-definition)? `tiles` is 1 for a teleport by convention
(`machine-definition.md` §4); if the distance model is wanted, `teleport up
to steps ; steps -= distance` with `distance` bound instead. Worth one line
in the interpreter either way — flagged in `expansion.md`.

## `mage-concepts.md`: the zero-damage build

The turn structure is *identical* to the playtest build (Blink free 1×,
mana 6 / +2 / cap 10). Every spell in that doc is an `attack.md` action;
what varies is which effects exist. Sorting the list:

| Spell | Expressible today? | What it needs |
|---|---|---|
| Blink (self teleport ≤5) | ✅ | the `teleport` transition |
| Conjure Wall (3 connected, max one on map) | ✅ / ⚠️ | `terrain wall`; the "max one wall — new replaces old" rule is a **terrain-kind rule**, not a unit rule (`expansion.md`) |
| Rend Earth (empty tile → permanent pit) | ✅ | `terrain pit for -1` |
| Pillar of Fire (place fire, no LOS) | ✅ | `terrain fire`, no `los` |
| Freeze Water / Raise Ground | ✅ | `terrain ice` / `terrain floor` on a `water`/`pit` tile — a **terrain-transition** (`expansion.md`) |
| Collapse Wall (destroy + collision to adjacent) | ⚠️ | `terrain remove wall` + `splash 1 damage 2` — needs "destroy terrain" as an effect (`expansion.md`) |
| Levitate (ignores ground hazards; forced moves doubled) | ⚠️ | a **status with modifiers** (`expansion.md`) |
| Blind / Slow / Confuse | ⚠️ | statuses with AI/movement modifiers; Confuse is the first **random** thing in the game (`expansion.md`) |
| Expose (next displacement counts as mountain) | ⚠️ | status modifying `collision_damage` |
| Magnetize (linked displacement) | ⚠️ | status linking two units — the hardest one (`expansion.md`) |
| Blink Ally | ✅ | `targeting … allies_only` + a **`teleport target`** forced-movement type (`expansion.md`, tiny) |
| Wind Gust (push all in a 3-line by 1) | ✅ | `targeting direction … shape line 3, penetrate_all` + `push 1` |
| Wormhole | ⚠️ | terrain with an on-enter hook (`expansion.md`) |
| Gravity Inversion (parked) | ⚠️ | zone status modifying forced-movement sign; parked in the source too |
| Mana recovery on combo resolution | ✅ | `on caused_collision: mana += 1` — *if* "an ally's kill using my terrain" is the trigger, that's a cross-unit event; `on kill`/`on caused_collision` cover the self-caused version now |
| Schools as tunings (Geomancer / Enchantress / Warp) | ✅ | same file, different action list — or `extends mage` (`expansion.md`) |

The pattern is the same as the Anchor: the *Mage's turn* is done; the
richness is in **status and terrain definitions**, which is exactly the
status system `unit-definition.md` already lists as the blocking TODO. The
machine doesn't make that go away — it makes clear that it's the *only*
thing left, and gives it a natural home (`expansion.md`).

## Concepts-doc open questions

**Teleport-only movement: ignore LOS? capped per turn or per cast?** —
`teleport up to 5` (add `los` if wanted: `teleport up to 5 los`); per-turn
cap = `blink = 1 each turn`; per-cast = a `teleport up to N` *after-move*
embedded on each spell (`move after, free, up to 2 as teleport`). All one
line.

**Keep terrain-authoring from making the map unreadable** — limits on
simultaneous walls/fog are terrain-kind rules (max instances per map,
`expansion.md`), or per-unit `when uses(conjure_wall) < 1`.

## Coverage check

| Concept | Status |
|---|---|
| mana pool, per-action cost | ✅ resource + `action.mana` |
| bank vs reset, cap, per-turn trickle | ✅ `persistent max` + `on turn_start` vs `each turn` |
| blink once per turn / teleport budget | ✅ `blink` count or `steps` budget |
| cast until out / end early | ✅ guard + `end` |
| damage / status / terrain spells | ✅ `attack.md` |
| friendly fire | ✅ |
| max-one-wall, terrain transitions, destroy terrain | ⚠️ terrain rules (`expansion.md`) |
| levitate / expose / blind / slow / magnetize / confuse | ⚠️ status definitions with modifiers (`expansion.md`) |
| wormhole | ⚠️ terrain on-enter hook (`expansion.md`) |
| blink ally | ⚠️ tiny: `teleport target` forced-move type |
| schools as tunings | ✅ |
