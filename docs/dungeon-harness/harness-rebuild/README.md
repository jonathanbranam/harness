# Dungeon-harness rebuild — designer bench

> # 🛠 Phases 1–4 built; phase 5 not started
>
> This folder is the design pass for the **ground-up harness rebuild**
> called for in [`../STATUS.md`](../STATUS.md) ("What replaces it", item 2).
> The previous dungeon-harness feature work has been backed out
> ([`../backout-plan.md`](../backout-plan.md)).
>
> **Built (2026-08-18/19, branch `dungeon-harness-rebuild`):** the hand-driven
> bench, bookmarks, reach and threat fields, and the transport strip — phases
> 1 through 4 of [`phase-plan.md`](phase-plan.md), recorded as
> `openspec/changes/dungeon-bench`. **Not built:** phase 5's scoped turn
> machine, and everything deferred past it.
>
> **Not yet verified in a browser** — the automated gates pass (typecheck,
> tests, client build, server boot) but nobody has driven the bench by hand.

## What this is

A design bench for iterating on unit behaviour in the Dungeon Tactics
turn-based tactics game: the designer edits a unit's definition and
immediately sees the consequences on live boards. *Inventing on Principle*
applied to a turn-based game — where the continuous quantity to make
visible is not trajectory but **reach and threat**.

The load-bearing correction from the stopped effort still holds: **the
engine referees, never the agent.** The agent's role narrows to being the
*interface* for expressing unit behaviour; the real game engine does all
simulation.

## Documents

| Doc | What it covers |
|---|---|
| [`phase-plan.md`](phase-plan.md) | The build order: six shippable phases, each ending in something usable, starting from a single hand-driven board. The plan of record. |
| [`designer-ui-session.md`](designer-ui-session.md) | The designer-facing UI, as settled in a voice design session (2026-08-18). Verbatim outcome — layout, two modes, scenario cards, subjects vs. scaffolding, recording/editing workflows, approval, rule-set branching, and the reframing that landed: the primary artifact is the *interactive session*, not the saved test. |

## What it depends on

- **The rules layer** — [`../turn-machines/`](../turn-machines/README.md)
  proposes a declarative per-unit state machine plus a shared pure-TS
  interpreter. **Under evaluation, not approved**, and deliberately *not* a
  prerequisite: phases 1–5 run against today's rules, and phase 6 takes only
  the slice of the language needed for the six existing archetypes.
  `../turn-machines/harness-integration.md` sketches a tool surface and a
  machine panel against the *old* single-board harness — treat it as input,
  not as this folder's design.
- **The real game engine** — lives in the sibling track-web repo at
  `client-games/src/games/dungeon-tactics-solo/`. The rules modules
  (`turn.ts`, `pc.ts`, `npc.ts`, `pathfinding.ts`, `attackFootprint.ts`,
  `unitDefs.ts`, `types.ts`, ~1k lines) are **already Phaser-free**, so
  sharing them is a packaging problem, not a rewrite. `DungeonTacticsScene.ts`
  and `boardRender.ts` are the Phaser rendering on top.
- **The scaffold** — `dungeon-harness-server` + `client-dungeon` (auth, one
  long-lived `AgentSession` per login, jailed workspace, chat UI) is kept.
  Everything else currently in those packages is on the removal list.

## Decisions taken (2026-08-18)

Recorded in full, with rationale, in [`phase-plan.md`](phase-plan.md#decisions-2026-08-18).
In brief:

**1. Bench first, turn machines second.** A scoped-down single-board harness
is built against today's rules; a scoped-down turn machine covering only the
six existing archetypes follows in phase 6. Neither gates the other, and the
setup/play interface survives the rules-layer swap.

**2. No unit-def editing in the harness.** Today's `UnitDef` model is
expected to be discarded, so no UI is built against it. Editing stays in
track-web's existing Unit Designer until turn machines replace the model.

**3. The engine is extracted into `track-web/packages/dungeon-engine`** now,
alongside `packages/{auth,config,ui}`, with the harness depending on it via a
relative `file:` path — both repos sit side by side in `/Volumes/Data/work/pi/`.
No publish step, no copy, one set of rules. The package holds rules and
in-memory stores; `fetch`/`localStorage` loading stays in each host.

**4. Rendering is React + SVG in the harness**, not the game's Phaser scene.

**5. The agent is present from phase 1**, with every tool a 1:1 wrapper over
an engine function, and the authoritative `GameState` therefore lives
server-side. It also carries the only editing affordance before turn
machines: a session-scoped, unpersisted def tweak ("give the ranger 5
movement"), which buys the edit→see loop without building an editor.

**6. Boards are generated in the harness or authored by the agent** — no map
import from track-web, since its map editor is expected to move here too.

## Deferred prerequisite: instance-scoping the engine

The rules modules are Phaser-free, but they are **not instance-scoped**.
`contentStore.ts` (board grid + dimensions) and `defStore.ts` (unit stats)
are module-level singletons that the rules read by import rather than by
argument — `turn.ts` (5 reads), `npc.ts` (21), `pc.ts` (7),
`pathfinding.ts` (4), plus the scene, the studio editors, and their tests.

One process therefore gets **one board size and one unit-def table**. The
survey grid needs N boards at different sizes, with cards *simultaneously*
bound to different rule-set versions (the branch-colour feature). That is
structurally impossible against a singleton, so threading an explicit
engine context (defs + board passed in) is a prerequisite for the survey
grid.

The single-board phases 1–5 **deliberately avoid paying this cost**: one
board, one def table, singletons are fine. The debt comes due when multiple
boards do, and not before.

## Prior art, and where it is going

`track-web/client-games/src/studio/UnitDesignerPage.tsx` +
`games/dungeon-tactics-solo/ScenarioEditor.tsx` already edit unit defs with
live write-through into a running match, and `studio/MapEditorPage.tsx`
edits boards. "Move a slider, see it apply" is built.

These are **not reused, and not permanent**: the intended end state is that
unit and board authoring move *into* the harness and leave
`client-games/src/studio/`. That is why no editing UI is built against
today's `UnitDef`, and why the harness generates its own sample boards
rather than importing track-web's maps. What this rebuild adds beyond the
studio is the part that was never there: paused option-space overlays,
many boards at once, the rule-set version graph, and the agent as the
authoring interface.

## Naming hazard

track-web already uses **scenario** for a saved unit-def variant
(`/scenarios/:id/unit-defs`). The session doc uses **scenario** for a board
setup plus recorded steps. These need distinct words before either doc is
written.

## Still to design

Everything here sits past the phases in [`phase-plan.md`](phase-plan.md);
the phases themselves answer the rest.

1. **The scenario model.** What a saved scenario contains once recording
   exists: setup, subject declarations, recorded scaffolding actions *with
   resolved effects*, pinned properties, watched facts, approval snapshot.
   Phase 2's bookmarks are the cheap precursor — a starting position, not a
   recording.
2. **The rule-set version graph.** Labels, branches, per-card binding,
   colour assignment, persistence across sessions.
3. **The turn-machine block editor** (Scratch-style) — explicitly deferred
   in the session; needs phase 6's language slice settled first.
4. **How much of the survey grid is worth it**, once phase 3 has shown
   whether reach-and-threat overlays carry the value the session doc
   predicts. The grid is the expensive feature (it forces instance-scoping);
   overlays may deliver most of the insight on one board.
