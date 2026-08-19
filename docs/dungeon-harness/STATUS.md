# Dungeon-harness: work stopped, 2026-08-18

**The dungeon-harness implementation documented in
[`proposal.md`](proposal.md) and [`phases/`](phases/README.md) is stopped
and is being backed out.** This file is the single source of truth for
that decision, what actually landed before the stop, and what happens to
each piece. Every other doc in this folder now carries a banner pointing
here.

## Why it stopped

Two problems, and the second is the fatal one.

**1. The harness was not useful to design with.** The first board tools
gave the agent almost no control over board state — not enough to walk
through a scenario. Replacing them with generic drawing primitives
(`dungeon_draw_shape`/`_line`/`_overlay`/`_label`, `dungeon_set_cell_fill`)
fixed *that*, but only by making the agent responsible for rules
correctness.

**2. The LLM became the rules engine, and it is a bad one.** With freehand
drawing and no engine, the agent reasoned about movement and attack rules
from memory: it drew a PC's movement range, then added enemies without
re-evaluating, leaving a stale and wrong board plus wrong answers to the
designer's questions. This is traced in full in
[`board-rules-engine-exploration.md`](board-rules-engine-exploration.md) —
including that a rules engine *had* existed (phase 03) and was deliberately
deleted to dodge a preview-staleness bug, accepting exactly this risk.

Underneath both: **Gherkin-as-the-sole-canonical-artifact was the wrong
center of gravity.** `.feature` files describe *what a unit should do* in
prose an agent has to re-interpret. What the designer actually needs is to
change what a unit *is* and watch the real engine run it. Scenarios are
valuable as regression tests; they are not a design surface, and they can
never be the thing that makes the harness correct.

## What landed before the stop

| # | Repo | Phase | Status | Disposition |
|---|---|---|---|---|
| 01 | harness | Harness scaffold | ✅ Complete (`2026-08-16-dungeon-harness-scaffold`) | **Keep** — auth, session store, jailed workspace, chat UI are substrate-independent |
| 02 | track-web | Gherkin test runner | ✅ Complete (`dungeon-tactics-gherkin-runner`, + `-separate-test-runner`, `-gherkin-shared-steps`) | **Keep, disabled/frozen** — quickpickle runner stays; not removed yet, per explicit direction |
| 03 | harness | Board & local rules interpreter | ✅ Complete, then ❌ **already reverted** (`2026-08-16-harness-board-interpreter`, deleted by `dungeon-board-tool-enhancements`) | Already gone; superseded conceptually by the shared-engine direction |
| 04 | track-web | Step catalog generator | ✅ Complete (`dungeon-tactics-step-catalog`) | **Delete** — catalog exists only to feed harness scenario drafting |
| 05 | harness | Gherkin authoring core | ✅ Complete (`2026-08-16-harness-gherkin-authoring`) | **Delete** — parse/render/diff of `.feature` in the harness |
| 06 | harness | Baseline, changeset & read-only track-web access | ✅ Complete (`2026-08-16-dungeon-baseline-changeset`) | **Delete** — baseline/changeset machinery is Gherkin-handoff-specific |
| 07 | track-web | Engineer skill: scenario → OpenSpec change | ✅ Complete (`dungeon-tactics-engineer-skill`, skill `scenario-to-change`) | **Delete** — consumes a handoff bundle that will no longer exist |
| 08a | track-web | Existing-unit Gherkin extraction | ⚠️ **Partial** — `melee` + `rogue` done (`dungeon-tactics-melee-archetype`, `dungeon-tactics-rogue-archetype`, `melee-move-attack-scenarios`); `ranger` + `magic-user` never started | **Keep `.feature` files, unwind the capability split** — see backout plan |
| 08b | track-web | Pipeline proof (real harness session) | ❌ Never started | Moot |

Also landed in harness, outside the phase numbering:
`dungeon-board-piece-tools` (✅, then subsumed), `dungeon-board-tool-enhancements`
(✅ — the freehand drawing tools currently in the harness).

Open, never implemented: `dungeon-preview-lifecycle` (proposal only, refers
to tools that no longer exist), `dungeon-board-rules-engine` (proposal only,
placeholder to resume the exploration).

## What replaces it

Two separate efforts, neither of which is committed to yet.

**1. A shared rules engine and a declarative unit language.** The candidate
design is [`turn-machines/`](turn-machines/README.md): a small guarded
state machine per unit plus a tiny expression language, in one pure-TS
interpreter imported by *both* the game and the harness, so there is no
port step and no drift. **This design is under evaluation and not
approved** — it is a good direction, not a decision. Its own README carries
that caveat.

**2. A ground-up harness rebuild.** Not a modification of the current
harness — a different tool, built on the "Inventing on Principle"
principle: the designer changes a rule or a value and *immediately sees*
the effect, with **multiple scenarios previewing and playing out
simultaneously** beside the edit. The agent's role narrows to being the
*interface* for expressing unit behavior (authoring the turn machine); the
**real game engine** does all simulation. That design pass is under way in
[`harness-rebuild/`](harness-rebuild/README.md): the designer-facing UI is
settled ([`designer-ui-session.md`](harness-rebuild/designer-ui-session.md)),
and the build order is agreed
([`phase-plan.md`](harness-rebuild/phase-plan.md), 2026-08-18) — six
shippable phases starting from a single hand-driven board, with a
scoped-down turn machine arriving in phase 6 rather than gating the work.
Nothing is built yet.

What survives from the old harness is the scaffold (phase 01) and the
lesson: **the engine referees, never the agent.**

## Backout plan

See [`backout-plan.md`](backout-plan.md) for the concrete
remove/disable/keep breakdown across both repos.
