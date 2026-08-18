# Board rules engine: exploration notes

> **Still worth reading — this is the post-mortem, not a plan.** The
> diagnosis here (the agent free-hands rule reasoning and nothing catches
> it; correctness and staleness are separate problems) is *why* the whole
> dungeon-harness effort was stopped — see [`STATUS.md`](STATUS.md). The
> open questions at the bottom are answered, at least provisionally, by the
> [`turn-machines/`](turn-machines/README.md) candidate design
> (`turn-machines/harness-integration.md` §7), which is **not yet
> approved**. Nothing in this doc should be implemented as written.

Captures an `/openspec-explore` session investigating why the dungeon-harness
agent draws the board incorrectly and answers rules questions wrong — e.g.
it drew a PC's movement options, then added enemies without re-evaluating
those movement options, leaving a stale and incorrect board plus wrong
answers to the designer's questions. Nothing here is decided; this is
grounding for a future change, not a proposal itself.

## The ask

Let the agent keep drawing freely — that part works and should stay
unconstrained, especially for scenario **setup** (placing whatever the
designer describes, no rule obligations). But wherever the board depicts
something game-rule-governed (a unit's movement range, an attack's
footprint, an answer to "can X reach Y?"), the agent should not be
reasoning about the rules from memory. It should be driving a deterministic
game engine and rendering *its* output, the same way an LLM should call a
calculator instead of doing arithmetic in its head.

## How the harness got here: a pendulum swing, not a fresh problem

Four OpenSpec changes tell the whole story, in order:

```
phase-03 / harness-board-interpreter  (archived)
  → local pure re-implementation of movement/attack math:
    dungeon_preview_movement, dungeon_preview_attack, dungeon_place_unit,
    range-limited BFS pathing, single/line/plus attack footprints.
        │
dungeon-board-piece-tools  (archived)
  → adds dungeon_move_unit / dungeon_remove_unit / dungeon_clear_board.
    "Preview a move, then commit it" becomes a real workflow for the
    first time.
        │
dungeon-preview-lifecycle  (still open — proposal.md only, never finished)
  → flags that the preview overlay is unreliable: client-dungeon's
    findLatestPreview scans the chat transcript backwards for the most
    recent dungeon_preview_movement/attack tool result and draws that
    unconditionally, with nothing tying it to current board state.
    Two independent bugs fall out: (a) a mutation (move/remove/clear)
    never invalidates an existing preview, so it keeps rendering after
    it's no longer valid; (b) reconnect wipes the chat transcript for an
    unrelated reason, so the preview vanishes even when it's still valid.
    Scoped as investigate-and-design-a-fix, not fix-it-now.
        │
dungeon-board-tool-enhancements  (archived, same day as the above)
  → instead of fixing the lifecycle bug, deletes board-engine/ entirely
    and replaces every rule-aware tool with generic drawing primitives
    (dungeon_draw_shape/line/overlay/label, dungeon_set_cell_fill,
    dungeon_move_object/remove_object). Explicitly accepted risk, from
    that change's design.md:

      "Removing movement/attack computation means the agent must
       manually keep a drawn 'path' or 'footprint' visually consistent
       with whatever it's describing... nothing checks that a drawn
       line is actually reachable. Accepted... Scenario correctness is
       the agent's/designer's responsibility, not the board's."
```

The rules engine wasn't removed by accident, and it wasn't removed because
rule-awareness was a bad idea — it was removed to dodge a staleness bug in
the preview overlay, by deleting the thing that could go stale. The
accepted risk from that trade is exactly what's being reported now: the
agent free-hands movement/attack reasoning, gets it wrong, and nothing
catches it.

## Two problems, previously conflated

```
┌────────────────────────────┐   ┌────────────────────────────┐
│  1. CORRECTNESS             │   │  2. STALENESS               │
│  Does the harness compute   │   │  Once computed, does the    │
│  movement/attack the same   │   │  displayed/remembered state │
│  way track-web does?        │   │  stay synced with the       │
│                              │   │  board as it changes?       │
│  → solved by *having* a     │   │  → solved by *architecture*:│
│    correct engine           │   │    derived state must be    │
│                              │   │    impossible to leave      │
│                              │   │    stale, not just possible │
│                              │   │    to refresh               │
└──────────────────────────────┘   └──────────────────────────────┘
```

`dungeon-board-tool-enhancements` solved neither — it removed the
component that had (approximately) solved #1, specifically to make #2 moot
by having nothing left to go stale. The abandoned
`dungeon-preview-lifecycle` proposal was aimed squarely at #2 and never
landed. Any real fix needs both, and they're separable design questions.

## Problem 1: correctness — reimplement, import, or freeze?

The deleted `board-engine/movement.ts` was a hand-ported approximation, not
the genuine article — its own header comment said as much: "Matches
track-web's current validMoveDests/pathfinding semantics" (matches, not
is). track-web already has internal precedent for how that kind of
duplication rots: `unitDefs.ts` carries a "SYNC NOTE: the server keeps a
copy of these defaults... keep the two in sync" comment for a second copy
within track-web itself.

track-web is a sibling checkout on this machine
(`/Volumes/Data/work/pi/track-web`), and its engine modules for today's
existing units —
`client-games/src/games/dungeon-tactics-solo/{pc,npc,pathfinding,
attackFootprint,unitDefs,turn}.ts` — are pure, dependency-free TypeScript:
no server, no DB, no React. That's confirmed by grepping their imports,
which only reference each other and `./types`/`./contentStore`. This
changes what's available compared to when `docs/dungeon-harness/
proposal.md` first ruled out importing track-web's engine — that ruling
was about the *write* boundary (harness never gets write/edit access into
track-web) and about the not-yet-built archetype system having no
production-accurate code to import. Neither objection blocks a **read-only**
import of the existing, already-implemented engine for round one's scope.

| Approach | Correctness | Drift risk | Effort |
|---|---|---|---|
| **A. Resurrect `board-engine/` as-is** (it's in git history, commit `47edcdb`) | Approximate — hand-ported | Same as before: silently diverges as track-web's rules evolve, with nothing to notice | Low |
| **B. Import track-web's real engine** as a read-only dependency (`file:`/workspace reference to the pure modules) | Exact, by construction, for round one | None for round one — it *is* the source, not a copy | Medium — needs confirming the modules stay dependency-free, and a plan for what happens when track-web moves to the not-yet-built archetype system |
| **C. Freeze a local copy on purpose** | Exact at freeze time | Explicit and bounded, matching `proposal.md`'s own framing of round one as "partially throwaway" once the archetype system lands | Low |

No recommendation recorded yet — this is the first open question for
whoever picks this back up.

## Problem 2: staleness — make derived state impossible to leave stale

Whatever answers problem 1, the lifecycle bug `dungeon-preview-lifecycle`
found needs a structural fix, not a reminder-to-recompute. The shape
explored in conversation: split the board into two kinds of object instead
of one undifferentiated `objects[]` array.

```
┌───────────────────────────────────────────────────────────────────┐
│                          BOARD STATE                                │
│                                                                     │
│  ┌───────────────────────────┐   ┌───────────────────────────────┐ │
│  │  FREEHAND LAYER             │   │  ENGINE LAYER (new)            │ │
│  │  (today's generic tools,    │   │                                 │ │
│  │  kept as-is)                │   │  units: [{id, unitDef, cell}]   │ │
│  │                              │   │                                 │ │
│  │  shapes/lines/overlays/     │   │  Derived views (reachable       │ │
│  │  labels/cell-fill — no      │   │  cells, attack footprint,       │ │
│  │  rule meaning, agent draws  │   │  "can X reach Y?") are          │ │
│  │  whatever it wants          │   │  computed fresh on every read,  │ │
│  │                              │   │  never hand-drawn by the agent  │ │
│  │  Unconstrained by design —  │   │  and never cached across a      │ │
│  │  matches "setup can draw    │   │  board mutation.                │ │
│  │  anything" from the ask     │   │                                 │ │
│  └───────────────────────────┘   └───────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────┘
```

The key move: a movement/attack preview tool would not hand the agent
numbers to copy into `dungeon_draw_shape` calls — that's the current
failure mode, and it's a failure mode even when the underlying computation
is correct, since a correct answer can still be drawn wrong or drawn once
and left on screen after the board moves on. Instead the tool would draw
the overlay itself, tagged as derived-from-unit-state, and the client would
recompute-or-clear it whenever that unit's board state changes — closing
the exact gap `dungeon-preview-lifecycle` found, by construction instead of
by the agent remembering to call something again.

## Open questions for whoever continues this

1. **Correctness approach (A/B/C above)** — read-only import of track-web's
   real engine, a resurrected local approximation, or an intentionally
   frozen copy with the drift risk documented?
2. **What counts as a "unit"** — only things placed from a real `UnitDef`
   (the old archetype catalog), or does the designer also need to freehand
   ad hoc stat blocks for scenario exploration ("what if there were a
   monster with range 3")? This decides whether the freehand layer ever
   needs to interact with the engine layer, or stays fully separate.
3. **Query surface** — beyond preview-and-draw, should the agent be able to
   ask yes/no rule questions directly (e.g. "is cell (3,2) in this unit's
   threat range?") so it never reasons from a remembered preview, only from
   a fresh tool call?
4. **Relationship to `dungeon-preview-lifecycle`** — that change is still
   open (proposal.md only, no design/tasks) and now refers to tools
   (`dungeon_preview_movement`, `dungeon_place_unit`, `dungeon_move_unit`)
   that no longer exist post-`dungeon-board-tool-enhancements`. Whatever
   change picks this back up should either supersede it explicitly or fold
   its lifecycle findings in directly, rather than leaving it orphaned.
