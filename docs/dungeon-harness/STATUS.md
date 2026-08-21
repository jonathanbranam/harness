# Dungeon-harness: work stopped, 2026-08-18

> # 📍 Where things stand now (updated 2026-08-19)
>
> **This file is the decision record for the *stopped* effort. It is not the
> current plan.** The replacement is under way and partly shipped:
> [`harness-rebuild/phase-plan.md`](harness-rebuild/phase-plan.md) is the
> plan of record, and [`harness-rebuild/README.md`](harness-rebuild/README.md)
> is the orientation doc.
>
> - **Backout: complete.** Executed by `f5aff46` (harness) and `8f9fe9c`
>   (track-web); see [`backout-plan.md`](backout-plan.md).
> - **Engine extracted: done.** `@repo/dungeon-engine` lives in track-web's
>   `packages/`, consumed here by relative `file:` path.
> - **Rebuild phases 1–4: built and browser-verified** (bench, bookmarks,
>   reach/threat overlays, transport strip).
> - **Action surface: landed** — the engine now owns what a unit may do and
>   whether a pick is legal, in both hosts.
> - **The turn sequencer is built** (2026-08-20). The engine owns the
>   round; the bench runs on it; the designer can author enemy turns and
>   retarget a locked telegraph. Four changes archived across both repos, plus
>   one unplanned engine query. The shipped game adopted it on 2026-08-21, so
>   both hosts now run the same round from the same code —
>   see [`harness-rebuild/turn-sequencer-plan.md`](harness-rebuild/turn-sequencer-plan.md).
> - **⚠️ Its phase 5 (`dungeon-sequencer-guards`) shipped on a wrong premise**
>   and is committed but **unarchived**. It exempted the bench from the turn-phase
>   guard, on the inherited claim that the bench "drives both sides out of
>   sequence, on purpose". **Rejected 2026-08-21: the bench and the game play by
>   the same rules**, with amending a locked telegraph as the only exception, and
>   further bench exceptions get argued back one at a time.
>   [`harness-rebuild/phase-5-correction.md`](harness-rebuild/phase-5-correction.md)
>   is the plan of record for fixing it — **four changes, of which step 1 (the
>   engine owning every phase transition) landed 2026-08-21.** Step 2, the bench
>   setup surface, is next.
> - **Then: rebuild phase 5**, the scoped turn machine — *not started,
>   and its rules layer is still unapproved.*

**The dungeon-harness implementation documented in
[`proposal.md`](proposal.md) and [`phases/`](phases/README.md) is stopped
and has been backed out.** This file is the single source of truth for
that decision, what actually landed before the stop, and what happened to
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

*The **Disposition** column below was the plan at the time of the stop. It has
since been **fully executed** — see the closing section.*

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

Two separate efforts. **One is now largely built; the other is still
unapproved.**

**1. A shared rules engine and a declarative unit language.** The candidate
design is [`turn-machines/`](turn-machines/README.md): a small guarded
state machine per unit plus a tiny expression language, in one pure-TS
interpreter imported by *both* the game and the harness, so there is no
port step and no drift. **This design is still under evaluation and not
approved** — it is a good direction, not a decision. Its own README carries
that caveat. Only a scoped-down slice of it is scheduled, as rebuild phase 5.

What *has* been settled is the sharing mechanism it depends on. The game's
Phaser-free rules modules were extracted into **`@repo/dungeon-engine`**
(track-web `packages/dungeon-engine`, commit `bd226c6`), which this repo
consumes over a relative `file:` path — one set of rules, no copy, no drift.
On top of that, the **action surface** landed on 2026-08-19: the engine now
owns what a unit may do, what the player may pick, and whether a pick is
legal, so no host re-derives rules for itself. See
[`harness-rebuild/action-surface-plan.md`](harness-rebuild/action-surface-plan.md).

**2. A ground-up harness rebuild.** Not a modification of the old harness —
a different tool, built on the "Inventing on Principle" principle: the
designer changes a rule or a value and *immediately sees* the effect, with
**multiple scenarios previewing and playing out simultaneously** beside the
edit. The agent's role narrows to being the *interface* for expressing unit
behavior; the **real game engine** does all simulation.

That rebuild is under way in
[`harness-rebuild/`](harness-rebuild/README.md). The designer-facing UI is
settled ([`designer-ui-session.md`](harness-rebuild/designer-ui-session.md))
and the build order is agreed
([`phase-plan.md`](harness-rebuild/phase-plan.md)) — five shippable phases
starting from a single hand-driven board, with a scoped-down turn machine
arriving in phase 5 rather than gating the work.

| Phase | What it gives the designer | Status |
|---|---|---|
| 1 | Hand-driven bench: generate a board, place units, play a full round through the real engine | ✅ built 2026-08-18 |
| 2 | Bookmarks — save and reload an interesting position | ✅ built 2026-08-18 |
| 3 | Reach and threat overlays | ✅ built 2026-08-19 |
| 4 | Transport strip — step and scrub through a played sequence | ✅ built 2026-08-19 |
| 5 | Scoped turn machine v1 (today's six archetypes only) | ⬜ not started |

Landing between phases 4 and 5, and not in the original phase plan: the **turn
sequencer**, which moved the round itself into the engine. Phases 1, 2, 3a and 3b
of [`harness-rebuild/turn-sequencer-plan.md`](harness-rebuild/turn-sequencer-plan.md)
are archived, and phase 4 landed 2026-08-21 — both hosts now drive one round
owned by the engine. Only the enforcement guards remain. It went
ahead of the turn machines rather than behind them because machines hook
`round_start`/`round_end` and assume a telegraph-shaped round — they consume the
round structure rather than defining it, so leaving it host-defined would have
handed phase 5 two hosts that disagree about when a round begins.

Phases 1–4 shipped as `openspec/changes/archive/2026-08-19-dungeon-bench`
and were verified end to end in a browser, including driving the bench from
chat. The action-surface adoption followed as
`2026-08-19-dungeon-bench-action-adoption` here, plus
`dungeon-engine-action-surface` and `dungeon-game-action-adoption` in
track-web.

What survives from the old harness is the scaffold (phase 01) and the
lesson: **the engine referees, never the agent.**

## Backout plan — executed

See [`backout-plan.md`](backout-plan.md) for the concrete
remove/disable/keep breakdown across both repos. **It has been carried out
in full:**

- **harness** — `f5aff46` "Back out the dungeon harness's stopped feature
  work", tracked as `openspec/changes/archive/2026-08-18-dungeon-harness-backout`.
- **track-web** — `8f9fe9c` "Remove track-web's dungeon-harness surface;
  refile PC archetypes", tracked as
  `openspec/changes/archive/2026-08-18-dungeon-tactics-harness-backout`.

Nothing on the removal list remains in either repo. The Gherkin runner and
the extracted `.feature` files were kept, as directed.
