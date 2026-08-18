# Harness integration

How the dungeon harness uses turn machines: the tool surface the agent
gets, what the board becomes, the machine-graph panel, what a session looks
like end to end, and how this changes the existing `proposal.md`.

Contents:

1. [What the harness is for, restated](#1-what-the-harness-is-for-restated)
2. [The board: two layers](#2-the-board-two-layers)
3. [Tool surface](#3-tool-surface)
4. [The machine panel](#4-the-machine-panel)
5. [A session, end to end](#5-a-session-end-to-end)
6. [Relationship to Gherkin and the existing proposal](#6-relationship-to-gherkin-and-the-existing-proposal)
7. [Relationship to the open OpenSpec changes](#7-relationship-to-the-open-openspec-changes)
8. [Client and server shape](#8-client-and-server-shape)

---

## 1. What the harness is for, restated

Before: *a chat tool for writing Gherkin scenarios about unit behaviour,
with a board to think on.* The board was decoration for the writing.

After: **a live design bench where the designer describes a unit and
watches it behave.** The agent's job is threefold, in this order:

1. **Author** — turn what the designer says into edits to a unit file
   (`machine-definition.md`), reload it, and report what lint says.
2. **Drive** — set up a board, place units, step them through turns by
   choosing transitions and inputs — always via the interpreter, so the
   board is always the interpreter's output.
3. **Ask** — answer any rule question ("can she reach him?", "what does
   backstab do from here?", "why is ring cleave greyed?") by *querying* the
   engine, never from memory. `dungeon_query` and `dungeon_options` exist
   so there is always a tool to call instead of guessing.

Gherkin scenarios still come out the far end (§6), but they're now
*recorded* from what actually happened on the board, not hand-written about
what should.

## 2. The board: two layers

The exploration doc's split, adopted:

```
┌────────────────────────────────────────────────────────────────────────┐
│ BOARD                                                                  │
│                                                                        │
│  ┌──────────────────────────────┐  ┌────────────────────────────────┐  │
│  │ FREEHAND LAYER                │  │ ENGINE LAYER                    │  │
│  │ today's tools, unchanged:     │  │ the game state proper:          │  │
│  │ shapes / lines / overlays /   │  │ cells+terrain, units with       │  │
│  │ labels / cell fill            │  │ machine state + resources,      │  │
│  │                               │  │ statuses, telegraphs            │  │
│  │ no rule meaning; setup and    │  │                                 │  │
│  │ annotation ("this is where    │  │ DERIVED VIEWS, recomputed on    │  │
│  │ the pit will be", arrows,     │  │ every render, never stored:     │  │
│  │ notes to self)                │  │  · reachable tiles for the      │  │
│  │                               │  │    selected unit's enabled move │  │
│  │                               │  │  · legal targets + footprint    │  │
│  │                               │  │    for the action being aimed   │  │
│  │                               │  │  · greyed-out actions + reasons │  │
│  │                               │  │  · resource gauges, statuses    │  │
│  └──────────────────────────────┘  └────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

- **The agent cannot draw a movement range.** There's no tool for it. It
  can only *select a unit*, and the client renders that unit's reachable
  set from `enabled_transitions`. The exploration doc's failure ("drew a
  range, added enemies, never re-evaluated") is impossible: adding an enemy
  changes the board, the next render recomputes, done. This is the
  `dungeon-preview-lifecycle` bug fixed by construction rather than by
  invalidation logic.
- **Freehand stays for what it's good at** — sketching a map before it
  exists, annotating. Placing *terrain* and *units* is engine-layer (they
  have rules), and gets its own tools.
- Anything the designer says that has rule meaning goes to the engine
  layer; the agent should reach for freehand only when asked to annotate.

## 3. Tool surface

Existing tools that stay: `dungeon_get_board_state`, the freehand set
(`dungeon_draw_*`, `dungeon_set_cell_fill`, `dungeon_move_object`,
`dungeon_remove_object`, `dungeon_clear_board`), `dungeon_board_view`
(screenshot), the scenario/baseline set (`dungeon_read_feature`,
`dungeon_write_feature`, `dungeon_load_baseline`, `dungeon_read_step_
catalog`, `dungeon_get_changeset`, `dungeon_write_changeset`,
`dungeon_write_implementation_notes`).

New, in three groups. All return structured JSON the client also consumes.

**Authoring**

| Tool | Does |
|---|---|
| `dungeon_read_unit(id)` | the unit file text (and its flattened form if it `extends`) |
| `dungeon_write_unit(id, text)` | parse + lint + load. Returns `{ok, errors[], warnings[]}` with line numbers. On error the previous definition stays loaded — a bad edit never reaches the board |
| `dungeon_list_units()` | ids, names, which are templates, lint status |
| `dungeon_read_status / write_status`, `dungeon_read_terrain / write_terrain` | same, for `expansion.md` §1–2 when they exist |

**Driving**

| Tool | Does |
|---|---|
| `dungeon_set_terrain(cells)` | engine-layer terrain (kinds from the terrain table) |
| `dungeon_place_unit(unit_id, cell, {hp?, resources?, statuses?})` | place a unit instance; overrides let a scenario start "with fury 4" without stepping there |
| `dungeon_remove_unit(instance)`, `dungeon_move_unit(instance, cell)` | setup-time relocation (not a rule move — doesn't touch `moved`) |
| `dungeon_begin_turn(instance)` | run `begin_turn`: resets, `on turn_start`, enter start state |
| `dungeon_options(instance)` | **the key query.** `enabled_transitions` for the unit's current state: `[{index, kind, label, input_kind, legal_targets[], disabled: {reason}}]`, plus current state name, resources, statuses. Disabled transitions are included *with reasons* so the agent can explain "why not" |
| `dungeon_step(instance, transition_index, input?)` | fire it. Returns the delta (damage dealt, units moved/removed, statuses, hooks that fired) and the new options. Refuses — structurally, not by exception — anything not in the enabled list |
| `dungeon_end_turn(instance)` | shortcut for the `end` transition |
| `dungeon_enemy_phase()` | run every NPC's turn via its policy; returns the log |
| `dungeon_undo()` / `dungeon_snapshot(name)` / `dungeon_restore(name)` | exact, because the state is small and pure (`machine-definition.md` §12) |

**Asking**

| Tool | Does |
|---|---|
| `dungeon_query(instance, expr)` | evaluate any expression from the language against the live board, in that unit's context: `adjacent_enemies`, `can_target(ring_cleave)`, `if moved >= 3 then 5 else 2`. The calculator. |
| `dungeon_preview(instance, transition_index, input)` | run the step against a *copy* and return the delta without committing — "what would happen if" |
| `dungeon_explain(instance, action_id)` | the action's card: resolved numbers *right now* (`damage: 3 + adjacent_enemies/2 = 4 (2 adjacent)`), legal targets, why disabled |

The old `dungeon_preview_movement` / `dungeon_preview_attack` do not come
back: preview is what the client renders from `dungeon_options`, and
`dungeon_preview` is the "what if" that returns a delta, not a drawing.

## 4. The machine panel

Beside the board, for the selected unit: its **state graph**, drawn from the
parsed file — states as nodes, transitions as edges labelled by kind and
guard, the **current state lit**, enabled edges bright, disabled edges dim
with the failing guard on hover; a **resource strip** (gauges for integers
with `max`, chips for enums/cycles); the **unit text** with lint markers.
Click a state to see its transitions listed the way `dungeon_options`
returns them; click a resource to see every line that reads or writes it.

This is the Bret-Victor bit made concrete and cheap: the thing you edit
(text) and the thing that runs (graph + board) are the same artifact, and
the *change* is visible where it acts. It's a `React` panel over the same
parsed AST the interpreter uses; no separate model.

Nice-to-have, second pass: **playback** — the trace tables in the archetype
files are literally `dungeon_step` logs; a scrubber over the snapshot list
replays a turn on the board and the graph together.

## 5. A session, end to end

1. **Open.** Designer picks a unit (or "new unit"). Agent `dungeon_read_unit`,
   summarises the machine in a sentence, shows the panel.
2. **Set up.** "Eight by eight, a pit here, three brutes there, Anchor at
   the bottom." Agent: `dungeon_set_terrain`, `dungeon_place_unit` ×4.
   Freehand annotations if asked. Nothing rule-bearing is drawn by hand.
3. **Change a rule.** "Give him fury that builds when he holds still." Agent
   edits the text, `dungeon_write_unit`; reports lint (`ok`, or "the ring
   cleave loop has no bound — did you mean once per turn?").
4. **Try it.** "Walk him through a turn where he hooks the far one and
   holds." Agent: `dungeon_begin_turn`, `dungeon_options` (reads the enabled
   list — *including* that ring cleave is greyed and why), `dungeon_step`
   hook with the target, `dungeon_end_turn`, `dungeon_enemy_phase`. Reports
   what happened *from the deltas* — "fury is 3: +1 for holding, +1 from the
   brute's hit; ring cleave now needs one more adjacent."
5. **Ask.** "If I put a fourth brute here, is cleave on?" Agent:
   `dungeon_place_unit`, `dungeon_query(anchor, "adjacent_enemies >= 3 and
   fury >= 3")` → `true`. Or `dungeon_options` again and read it off.
6. **Iterate** 3–5 until it feels right.
7. **Record.** "Keep that." Agent writes the unit file to the workspace and
   turns the step log of the last walkthrough into a Gherkin scenario
   (§6) — the *steps* are already the Gherkin steps, the *deltas* are the
   `Then`s. `dungeon_write_feature`, `dungeon_get_changeset` as today.
8. **Sign off** as today; the handoff bundle now carries the unit file(s)
   alongside the `.feature` and changeset.

The agent never narrates a board it didn't compute, and never edits a rule
without lint's answer coming back first.

## 6. Relationship to Gherkin and the existing proposal

`proposal.md` says: *"Gherkin `.feature` files are the single canonical
artifact, full stop. Any structured/internal representation dungeon-harness
keeps for its own purposes is a derived working cache, never authoritative,
never handed off as its own format."*

That was right when the harness's internal representation was a board
sketch. It's wrong once the internal representation *is the unit
definition that ships*. Revised position:

- **Two canonical artifacts, different jobs.** The **unit file** is *what
  the unit is* — the definition the game loads. The **`.feature` file** is
  *what we've verified it does* — acceptance/regression scenarios run by
  the track-web Gherkin runner (phase 02) against the same interpreter.
  Neither is derived from the other; they're the two halves of
  "definition + tests" every other part of the codebase already has.
- **The handoff bundle** = unit file(s) + `.feature` delta + changeset +
  notes. Phase 07's engineer skill (`scenario-to-change`) grows one input.
  Since the unit file *is* the implementation for a data-only unit, the
  engineer's job for most handoffs shrinks to: review, run the features,
  land the file in the unit store. Genuinely new primitives (`expansion.md`
  §6–7) still need an engineer and an OpenSpec change — the notes say
  which, because lint told the agent.
- **Gherkin gets easier to write, and truer.** Steps map 1:1 onto
  `dungeon_step` calls (`When the rogue moves to (3,4)` ↔ `step(move,
  tile)`, `When the rogue backstabs the brute at (4,4)` ↔ `step(act
  backstab, tile)`), and `Then` lines are the interpreter's deltas. The
  step catalog (phase 04) becomes largely *generated* from the transition
  kinds and action ids. Round-trip fidelity worries mostly dissolve.
- **The baseline/changeset machinery** (phase 06) is unchanged in shape and
  gains a second diff: unit-file diff alongside scenario diff.

The rest of `proposal.md` — read-only track-web access, self-contained
workspace, delta vs. canonical, session lifecycle and sign-off — stands.

## 7. Relationship to the open OpenSpec changes

- **`dungeon-board-rules-engine`** (proposal only, "resume after deciding
  the exploration doc's open questions") — this folder *is* the resumption.
  Its four questions, answered: (1) correctness → **import the real
  interpreter** as a shared package (option B, and better than B because
  there's no longer an "engine for today's units" vs. "archetype system"
  gap — the interpreter runs both); (2) what's a "unit" → anything placed
  from a unit file, and a designer *can* freehand a stat block because a
  unit file is five lines; (3) query surface → yes, `dungeon_query` /
  `dungeon_options` / `dungeon_explain`; (4) `dungeon-preview-lifecycle` →
  superseded, see next. That change should be re-pointed at
  `migration.md`'s harness phase and get its design/specs/tasks from there.
- **`dungeon-preview-lifecycle`** — superseded. Its bug (previews drawn from
  the transcript, never invalidated) can't exist when previews are derived
  views. Archive with a note pointing here.
- **`add-ui-layout-recording`, `restore-live-state-on-replay-exit`** —
  unrelated (introspect/deck).

## 8. Client and server shape

Server (`dungeon-harness-server`):

- depends on the shared rules package (`migration.md` §2) — parser, lint,
  interpreter, policies;
- `board-state.ts` grows the engine layer (`GameState` + per-unit runtime
  from the package) next to the freehand `objects[]`; snapshots/undo over
  it;
- `pi-extensions/rules-bridge.ts` (new) hosts the authoring/driving/asking
  tools; `board-bridge.ts` keeps freehand;
- the agent's `AGENTS.md`/skills in the workspace template teach it the
  language (a compressed `machine-definition.md` §15 reference card plus the
  "never narrate, always query" rule).

Client (`client-dungeon`):

- `BoardCanvas` renders the engine layer from state + `enabled_transitions`
  (reachable tiles, targets, footprints, gauges) — the same code path a
  future `dungeon-tactics-solo` HUD would use, ideally the same component
  if it's kept Phaser-free;
- new `MachinePanel` (graph + resources + text with lint);
- WebSocket carries the same board/turn events it does today plus unit-file
  and lint updates.

Everything rule-bearing on either side calls the package. Nothing
re-implements a rule.
