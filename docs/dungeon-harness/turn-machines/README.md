# Turn Machines — a declarative rules language for Dungeon Tactics units

> # 🔎 Candidate design — under evaluation, NOT approved
>
> **Status: research + proposal. Nothing here is built, and the design has
> not been fully vetted.** It is considered a good *direction*, not a
> decision — expect parts of it to change or be rejected. Do not start
> implementation from this folder without an explicit go-ahead.
>
> This folder is the outcome of revisiting the dungeon-harness approach
> after [`../board-rules-engine-exploration.md`](../board-rules-engine-exploration.md)
> showed the harness could draw anything but be *right* about nothing. It
> proposes one mechanism — a small, declarative, guarded **state machine per
> unit**, with a tiny **expression language** for the numbers — that runs
> identically in the harness and in the real game, and that an LLM can write
> from a designer's spoken description in seconds.
>
> **Context:** the previous dungeon-harness effort is stopped and being
> backed out — see [`../STATUS.md`](../STATUS.md) and
> [`../backout-plan.md`](../backout-plan.md). This is the candidate
> replacement for *the rules layer* only; the harness itself is being
> rebuilt separately (see "The harness this assumes" below).

## Documents in this folder

| Doc | What it covers |
|---|---|
| **This README** | The problem, the core insight, the design principles, what a session feels like, decisions and open questions |
| [`machine-definition.md`](machine-definition.md) | The language itself: unit files, resources, states/transitions, guards, effects, inputs → UI, events, the expression grammar and board queries, how it plugs into `attack.md`, run-loop semantics, undo/serialization, validation |
| [`archetypes/brute.md`](archetypes/brute.md) | The enemy baseline — one move, one attack, AI-driven — and how a *policy* supplies inputs to a machine |
| [`archetypes/berserker.md`](archetypes/berserker.md) | The kinetic fighter: free move split around one action, charge with distance-scaled damage, embedded movement |
| [`archetypes/anchor.md`](archetypes/anchor.md) | The rooted fighter: Fury, stances (all three switching-cost options), surrounded scaling, gated finishers, taunt |
| [`archetypes/rogue.md`](archetypes/rogue.md) | Movement pool + action count, refills, conditional Backstab, both the playtest build and the `unit-definition.md` build |
| [`archetypes/ranger.md`](archetypes/ranger.md) | Forced move between actions, persistent ammo rotation, zoning |
| [`archetypes/mage.md`](archetypes/mage.md) | Mana with carryover + cap, once-per-turn blink, cast-until-empty, both mana models |
| [`expansion.md`](expansion.md) | Room to grow: status definitions with hooks, reactions/interrupts, templates ("archetypes as library machines"), AI policies, facing, linked units, terrain hooks — and the honest list of what would need a new primitive |
| [`harness-integration.md`](harness-integration.md) | The tool surface, the board engine layer, the machine-graph view, what a design session looks like, relationship to Gherkin and to the existing proposal |
| [`migration.md`](migration.md) | Getting from today's partial implementation (both repos) to this, in phases, and which open changes it supersedes |

Read the README and `machine-definition.md` first; the archetype files are
each self-contained after that.

## The problem, restated

The harness has swung between two failure modes:

1. **Too little control** — the first board tools re-implemented an
   *approximation* of the game rules locally, couldn't express most
   scenarios, and drifted from the real engine.
2. **Too much freedom** — the replacement freehand drawing tools let the agent
   draw anything, so the *LLM* became the rules engine, and it is a bad one:
   it drew a movement range, added enemies, and never re-evaluated.

Both are the same mistake from opposite sides: **the agent was asked to
referee rules** — either by porting them or by remembering them. The
exploration doc's conclusion stands: the agent should drive a deterministic
engine and render *its* output, the way an LLM should call a calculator.

But that conclusion alone doesn't get us what we actually want. The
archetypes in
[`archetype-concepts.md`](../../../../track-web/docs/games/dungeon-tactics/units/archetype-concepts.md)
were invented *with hands on a battle grid*, trying things — the tabletop
[playtest kit](../../../../track-web/docs/games/dungeon-tactics/playtesting/playtesting.md)
is literally the record of that. The tool the designer needs is one where a
sentence like *"the Rogue's backstab does 5 if she's moved three or more
tiles this turn, otherwise 2"* becomes real, running behavior on the board
in the same breath — not a JSON edit, not a ticket, not a port. And whatever
that thing is has to be **the same thing that ships in the game**, or we've
just moved the drift problem one layer over.

## The core insight

Look at what the five archetypes in `unit-definition.md` *actually are*:

| Archetype | Turn rule, as written | What it is |
|---|---|---|
| `fighter` | move (splittable) → one action → maybe leftover move | a 3-state graph with one resource guard |
| `rogue` | move / act / move…, pool refills, some actions end the turn | a 1-state loop; guards on `mp` and uses; exits on `ends_turn` |
| `ranger` | same loop, but **must move between actions** | the same loop with one extra guard on the act transition |
| `mage` | cast while `mana ≥ cost`, teleport freely between | the same loop with a different resource on the guard |
| `brute` | one move, one attack, AI-driven | a fixed 3-state path with a policy instead of a player |

Every one is **states, transitions between them, and guards over a small
resource vector** (a movement pool, mana, uses-remaining, a stance flag, an
ammo pointer). None needs a loop, a variable the designer invents ad hoc, or
a function call. Stances are one more resource gating which transitions
exist. "Forced to move between shots" is a guard. Fury is a resource with
event hooks that bump it. Even the open questions in `archetype-concepts.md`
— *does the stance lock for the turn, or once per turn, or after N actions?*
— are each just a different **shape of the same graph** (all three are
written out in [`archetypes/anchor.md`](archetypes/anchor.md)).

The things that *aren't* sequencing — damage, push/pull, splash, status,
terrain — already have a good declarative home in `attack.md`'s
targeting → propagation → effect model. That layer is mostly done. What it
lacks is **numbers that can depend on the board**: `damage = 3 +
adjacent_enemies / 2`, `+1 if path_length >= 3`, `5 if moved >= 3 else 2`.
That is a small, total, side-effect-free expression language over a fixed
set of board queries — and it's the same expression language the machine
uses for its guards. **One expression evaluator unlocks both.**

So the proposal is:

```
┌────────────────────────────────────────────────────────────────────┐
│  UNIT  = attack.md actions  +  resources  +  turn machine  +  hooks │
│                                                                    │
│  ┌──────────────────┐   ┌───────────────┐   ┌────────────────────┐ │
│  │ actions           │   │ resources      │   │ turn machine        │ │
│  │ (attack.md:       │◄──┤ mp, mana,     │──►│ states              │ │
│  │  targeting /      │   │ fury, stance,  │   │ transitions          │ │
│  │  propagation /    │   │ ammo, uses…    │   │   move / act / choose│ │
│  │  effect — with    │   │ per-turn or    │   │   guards  (expr)     │ │
│  │  expressions      │   │ persistent,    │   │   effects (expr)     │ │
│  │  where the        │   │ capped         │   │   → next state       │ │
│  │  numbers go)      │   └───────┬───────┘   └──────────┬──────────┘ │
│  └──────────────────┘           │                       │            │
│                        ┌────────▼───────────────────────▼──────────┐ │
│                        │  expression language + board queries       │ │
│                        │  adjacent_enemies, moved, path_length,     │ │
│                        │  uses(x), has_status(x), hp, …             │ │
│                        └────────────────────────────────────────────┘ │
│  hooks: on turn_start / turn_end / hit / damaged / kill → effects    │
└────────────────────────────────────────────────────────────────────┘
```

Written in a **short, readable text form** (not JSON), parsed and run by
**one small pure-TypeScript interpreter** — no VM, no sandbox story, no
scripting language — that both the harness and `dungeon-tactics-solo`
import. The text file *is* the unit definition that ships.

A complete unit, so you can see the size of it before reading further —
this is the Rogue from the tabletop kit, verbatim rules:

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
      damage if moved >= 3 then 5 else 2
    throw_dagger "Throw Dagger"
      targeting tile, arc both, range 1..4, los, occupied
      damage 2
    quick_step "Quick Step"
      targeting self
      use mp += 3
    mark "Mark"
      targeting tile, arc both, range 1..4, los, occupied
      status marked
    caltrops "Caltrops"
      targeting tile, arc both, range 1..2, empty
      terrain caltrops

  turn
    start -> ready
    ready
      move up to mp                     -> ready ; mp -= tiles
      act any    when actions > 0       -> ready ; actions -= 1
      end
```

## Design principles

1. **The engine is the referee, never the agent.** Everything drawn on the
   board that has rule meaning is *derived* by running the machine against
   real state. The agent's job is to author the machine and to ask it
   questions, never to answer rule questions from memory. This is the
   non-negotiable the exploration doc arrived at; everything else here is in
   service of it.

2. **One artifact, one interpreter, two hosts.** The unit text is what the
   harness runs *and* what the game runs. There is no port step, no
   "validated DSL vs. hand-ported TS" gap, so the drift risk that killed the
   first board engine can't come back. This is why the answer is not
   "harness-only sandbox" — see [`harness-integration.md`](harness-integration.md).

3. **Bounded on purpose.** The machine is a graph, not a program. That buys
   three things a script can't: static checks that every turn terminates
   (every cycle spends something that only goes down), a UI that falls out
   for free (the player's options *are* the enabled transitions), and a
   picture the designer can look at (a state graph next to the board, the
   current state lit up). Scripts trade all three away for generality we
   don't need — see the "what would need a new primitive" list in
   [`expansion.md`](expansion.md) for where the boundary actually bites.

4. **Expressions carry the flavor.** Conditional damage, surrounded scaling,
   distance-scaled charges, "if you haven't moved," mana caps — these are the
   texture that made playtesting fun, and each is one expression, not a new
   feature. The expression language is deliberately tiny and total (no
   loops, no user functions, no side effects, integer math, division by zero
   is zero) so it can never hang or diverge.

5. **`attack.md` is not being redesigned.** Actions keep their targeting →
   propagation → effect shape. This proposal only (a) lets numeric fields be
   expressions, (b) adds a few small attributes actions were already
   informally carrying (`when` availability, named params like `mana 2`,
   `variants by <resource>`, `use` self-effects), and (c) pins down the
   embedded-movement semantics `attack.md`/`movement.md` left as TODOs.

6. **Archetypes become library machines, not code branches.** `unit-
   definition.md`'s "code owns the turn rules, data owns the values" was the
   right instinct with the wrong host — the turn rules should be *data too*,
   just structured data. A "fighter" is a machine you `extends`; a new class
   is still usually a values-only change (principle preserved), but a
   *genuinely new turn rule* is now a text edit in a harness session instead
   of a code change (principle's cost removed). See [`expansion.md`](expansion.md#templates-archetypes-as-library-machines).

## What a design session becomes

> **Designer:** Let's try giving the Anchor a fury meter. He builds one fury
> for each turn he doesn't move, and one whenever he takes damage. Cap it at
> six.
>
> **Agent** *(edits the unit file: adds `fury = 0 persistent, max 6`, adds
> `on turn_end when moved == 0: fury += 1` and `on damaged: fury += 1`;
> reloads; the machine panel now shows a `fury` gauge on the Anchor)*:
> Done. He's at fury 0. Want a way to spend it?
>
> **Designer:** A ring cleave — hits all eight around him for 4, but only if
> at least three enemies are adjacent, and it costs 3 fury.
>
> **Agent** *(adds the action with `targeting self, all 8 adjacent`,
> `damage 4`; adds `act ring_cleave when adjacent_enemies >= 3 and fury >= 3
> -> done ; fury -= 3` to the `ready` state)*: Added. Right now he has two
> brutes adjacent and fury 0, so it's greyed out. Shall I step him through
> a turn where he holds still and gets hit so we can see it come online?
>
> **Designer:** Yes, and put a third brute next to him.
>
> **Agent** *(places the brute; runs `turn_end` with `moved == 0` → fury 1;
> runs an enemy hit → fury 2; next turn start… the panel shows fury 2/6 and
> ring cleave still disabled — needs 3)*: Fury's at 2 after one held turn
> and one hit. Ring cleave is still one short. Do you want taking damage to
> give 2 fury instead of 1, or is a two-turn ramp what you're after?

Every board state in that exchange was produced by the interpreter, not
narrated. Every rule change was a one- or two-line edit to a file the
designer can read back. That's the loop.

## The harness this assumes

[`harness-integration.md`](harness-integration.md) describes how these
machines plug into the *current* harness's tool surface. Treat that as the
minimum bar, not the target: the harness is being **rebuilt nearly from
scratch**, and its design is TBD (nothing about it is specified yet). The
intent, sketched:

- **Inventing-on-Principle first.** The designer changes a rule or a
  number and sees the consequence immediately — no compile step, no
  narration, no "let me walk you through it."
- **Many scenarios at once.** Multiple board scenarios previewing and
  playing out *simultaneously* beside the edit, so a change's effect is
  visible across situations rather than one carefully-chosen example. A
  tweak to `damage if moved >= 3 then 5 else 2` should visibly ripple
  through every scenario on screen.
- **The agent is the interface, not the engine.** Its job is turning what
  the designer says into a turn-machine definition (and explaining what
  the machine does). **The real game engine performs every simulation** —
  the agent never computes, previews, or narrates board outcomes itself.
  This is the one non-negotiable carried over from the failure that
  stopped the previous effort.

Only the last point is load-bearing for the design in this folder. The
first two are why the rules layer has to be *fast to re-evaluate and pure*
— which the machine + expression model is, by construction (no I/O, no
randomness, total expressions, small serializable state), and which a
scripting VM would have made harder.

## Decisions this proposal makes

- **Substrate:** a declarative guarded state machine + expression language,
  in a custom text syntax, with a pure-TS interpreter. **Not** Lua/JS
  scripting (heavyweight, opaque to the designer, no static termination
  check, sandbox story to build), **not** raw JSON (unreadable for the
  designer, and the reason the JSON `UnitDef` never felt like a design tool).
- **Where it runs:** both hosts, one shared package. See
  [`migration.md`](migration.md) for the concrete package placement.
- **What's canonical:** the unit text file becomes a canonical shipped
  artifact alongside Gherkin `.feature` files. This **revises** the current
  `proposal.md`'s "Gherkin is the single canonical artifact, full stop" —
  discussed in [`harness-integration.md`](harness-integration.md#relationship-to-gherkin-and-the-existing-proposal).
- **`movement.range` moves out of the movement block** and into resources —
  a per-turn budget is a resource like any other, and it was the one field
  in `movement.md` that was about *the turn* rather than *pathing*.
- **`unit-definition.md`'s per-archetype `params`** (`move_after`,
  `grants_move`, `mana_cost`, `rotation`) all dissolve into ordinary machine
  constructs — shown archetype by archetype. No archetype-scoped
  parameter tables needed.

## Open questions

Deliberately left for the morning read; none of these block starting.

1. **Text-first vs. AST-first storage.** This proposal stores the text and
   derives the AST (so what the designer reads is what's stored). The
   alternative is storing a Zod-validated JSON AST and pretty-printing text
   on demand — friendlier to the existing `UnitDef`-in-SQLite path, at the
   cost of comments and formatting. Recommendation: text is canonical, AST
   is a cache; the pretty-printer exists anyway for the LLM.
2. **How much of `attack.md` gets a terse text form now.** The archetype
   files use a compact `targeting … / damage … / status …` line syntax
   throughout. Whether that becomes the real surface syntax for actions, or
   actions stay JSON-shaped inside an otherwise textual unit file, is a
   parser-design call. Recommendation: terse text — a designer reads
   `damage if moved >= 3 then 5 else 2` and understands it; they don't read
   the equivalent JSON.
3. **Reactions/interrupts** (Anchor's "enrage bends the attack that's
   already aimed at the Mage") need player input *during the enemy phase*.
   The shape is sketched in [`expansion.md`](expansion.md#reactions-and-interrupts)
   but it's the one concept that touches the enemy-phase loop, which is
   otherwise untouched by this proposal.
4. **Where AI policies live.** A brute's machine is trivial; the interesting
   part is the *policy* choosing among enabled transitions. This proposal
   keeps today's `npc.ts` behavior as a fixed built-in policy and treats
   smarter/reactive AI as the separate workstream the concepts doc already
   parks it as — but notes the machine + policy split is the seam for it.
5. **Naming.** "Turn machine" is a working name. Nothing here depends on it.
