# Into the Breach Harness — Designer UI Design Session

## Purpose

A harness for iterating on unit behavior in a turn-based tactics game. The
designer edits a unit's definition (its "turn machine") and immediately sees the
consequences play out on live boards. Inspired by Brett Victor's *Inventing on
Principle*, but adapted for a turn-based game rather than a continuous one.

## Existing Foundation

- Game engine and harness are separate TypeScript web apps.
- Game renders with Phaser.js.
- Harness skeleton works: single game board, agent running via agent harness SDK,
  with tools exposed to manipulate board state.
- Rendering technology for the harness boards is open — Phaser or something
  simpler. Not a design concern at this stage.
- This session covers the designer-facing UI only.

---

## Overall Layout

Three regions plus a collapsible history rail:

- **Scenario library rail** — narrow, collapsible tree, organized in folders.
  Toggle/checkbox per scenario to add or remove it from the view.
- **Canvas (left)** — grid layout of active scenario cards. Auto-flows (2x2, 3x3)
  based on count and available space. Drag-to-rearrange is a secondary, deprioritized
  feature. Not a freeform Figma-style workspace.
- **Editors (right)** — two editors: a **scenario editor** and a **unit turn machine
  editor** (Scratch-style block editor for the state machine).
- **History rail** — collapsed almost all the time. Used to browse past rule set
  versions; clicking a version reflects it immediately in the open scenarios.

All panels support minimize/maximize and dock left, right, or bottom.

---

## Two Modes

The layout serves two distinct activities, and should switch between them rather
than trying to serve both at once:

- **Survey mode** — grid of paused boards. Shows option spaces reacting live to
  edits. This is where multiple simultaneous scenarios earn their keep.
- **Focus mode** — one scenario goes large and the designer drives it forward by
  hand. This is the common case while actively editing.

A card zooms into focus and back out.

---

## Scenarios

### Structure

- Scenarios belong to a unit. Each unit has its own set.
- Scenarios can be copied/imported from another unit (avoids starting from scratch;
  useful for stock movement and basic-ability scenarios).
- Unit-agnostic global scenarios were considered and deferred — not needed yet.
- Structurally similar to Gherkin-style BDD: setup, ordered steps, optional
  verification. But the primary purpose is visualization and human review, not testing.
- Cloning a scenario is sufficient for variation — no special "freeze scenario"
  concept needed.

### Scenario Card Anatomy

- A small board running the scenario, using the real game simulation (or parts of it).
- Header: scenario name, status badge, and binding info (which rule set version).
- Pinned property widgets docked along one edge.
- Transport strip: play, pause, step forward, step back, and a **scrub bar** across
  the scenario's steps.
- **Overlays are core**: when a step is "unit chooses to move," the board highlights
  valid movement squares exactly as the game would. Changing the rule set produces an
  instantly visible change before anything animates.

The scrub bar is a primary interaction, not a nicety. It turns each card into an
inspectable trajectory rather than an animation.

### Pinned Properties

Two kinds:

- **Read-only reporting properties** — PC/NPC health, number of adjacent enemies,
  total damage inflicted over time, mana remaining.
- **Editable controls** — sliders/widgets for properties the designer wants to play
  with, so they can see effects immediately.

The whole character definition is too much to show at once. The designer pins only
the section they're currently working on, while retaining the ability to view the
full character sheet.

---

## Recording Model

### Subjects vs Scaffolding

- A scenario declares its **subjects** — usually one, the unit under test. Multiple
  subjects are supported and are an explicit opt-in for scenarios demonstrating
  interactions between two units.
- Everything else on the board is **scaffolding**.
- **Subjects are live**: re-simulated against the current rule set on every replay.
- **Scaffolding is frozen**: its actions *and their resolved effects* are recorded
  mechanically and replayed as-is. If the brawler dealt 3 damage when recorded, it
  keeps dealing 3 even after the brawler is nerfed.

This prevents scenarios from rotting as unrelated units change across the game.

### Scaffolding Drift

If a scaffolding action becomes illegal under new rules, the scenario does not break
or go amber. Instead it raises a quiet "scaffolding no longer valid" flag in a review
list. The designer can then re-record it, or promote that unit to a subject if its
behavior genuinely matters to the scenario.

### Visual Treatment

Subjects get a clear accent (glow or ring). Scaffolding units render muted. At a
glance the designer knows what is live and what is fixed.

---

## Authoring Workflow (new scenario)

1. Open the unit; library rail shows existing scenarios.
2. **New scenario** → name it → land in setup mode on a fresh board.
3. Lay out terrain (stock layout or paint it).
4. Place units. The unit whose harness is open is automatically the subject.
   Add enemies/allies as scaffolding.
5. Set starting state (full mana, reduced health, etc.).
6. Switch to **record mode**. Choose who acts first.
7. Drive each actor exactly as the game would — the designer selects from the same
   legal options and menus the player would see. Enemy actions are chosen by the
   designer, not the game AI, so the scenario is predictable.
8. Add turns until the point is made, then stop recording.
9. Pin the properties that matter; flag the ones to verify.
10. Approve.

Note: the game's turn structure is NPCs move together, then PCs. Usually the player
acts first, but the designer can pick, since some scenarios depend on a pre-placed
player behavior (traps, defensive placements) triggering enemy responses.

---

## Editing Workflow (changing a unit definition)

1. Open the unit; select relevant scenarios onto the grid.
2. Edit the turn machine.
3. Every card replays on change: subject re-simulates, scaffolding stays fixed.
   Pinned widgets update, movement overlays redraw. Feedback across several
   situations at once.
4. Approved scenarios reconcile. Any with a diverging *verified* property flips to
   amber and sorts to the top of the grid.
5. Designer works through the amber cards: re-approve where the new behavior is
   intended, or treat as a bug and return to the editor.
6. To compare rather than move forward: label the current state, branch, and pin
   cards to the old label so both sit side by side in their branch colors.

---

## Approval and Verification

- Approval captures the outcome as expected. Card gets a green badge.
- Approval is **cheap and revocable** — a bookmark saying "this was right last time
  I looked," not a formal sign-off.
- **Snapshot + watched facts**: capture the full snapshot always (cheap safety net),
  but only *watched* facts trigger a needs-review state. Unwatched divergence is
  recorded quietly and shown as a subtle "other changes" note.
- **Pinning is the gesture for watching.** Pin for visibility, then a second toggle
  promotes it to "pin for verification."
- Consequence: the card becomes self-documenting. Whatever is pinned and flagged is
  the scenario's contract, visible at a glance rather than buried in a test file.

---

## Rule Set Versioning and Branching

- Undo is required in the turn machine editor — experimentation goes down dead ends.
- Designers can apply **labels** to rule set states ("test 1," "weak mage," "strong
  mage").
- Editing from a labeled state creates a **branch**. The system is effectively a
  commit graph.
- History should be generous: track changes forward and backward, persist across
  sessions so the designer can return later.
- **Unpinned scenarios** always run the currently selected rule set.
  **Pinned scenarios** are bound to a specific labeled version.
- The **editor panel is multi-instance**: tabbed, with a split option, so two
  branches can be edited side by side simultaneously.
- **Color is the binding cue.** Each branch gets a color; every card bound to that
  branch carries the same accent on its border. App ships with a curated palette of
  contrasting colors auto-assigned; optional user override.
- Approval/breakage signaling may need to be softened or toggled off while browsing
  history, to avoid noise. (Open question.)

---

## Key Reframing: What Is Actually Being Visualized

The session worked through a genuine tension and landed somewhere different from
where it started.

**The limit of recorded playback:** a recorded decision list only shows the
consequences of choices already made. Changing attack range does nothing visible in
a recorded scenario, because the unit will not attack a distant target it was never
recorded attacking. Recording alone is not enough for design exploration.

**AI-driven playtesting was rejected** — likely infeasible, and would produce
balance statistics rather than design insight.

**Where the value actually lives: paused states.** Range, movement, valid targets,
threat squares are all instantly legible at a paused moment. So playback is not the
primary mode; it is how you navigate to interesting moments. The scenario's job is to
get the board into an interesting state, and the value is in stopping there and
seeing the option space bloom.

**Victor's lesson, correctly applied:** the onion skin was not about time. It was
about making the quantity that matters in *that* game continuously visible. For a
platformer that is trajectory. For this game it is likely **reach and threat** — not
"where will the mage be," but "what can the mage touch, and what can touch the mage."
A threat field tinting the board by who can reach each square, breathing outward as
you change movement or range, would be the analogue. Continuous, legible at a glance,
and works in a paused state.

**The inversion:** the primary artifact is the *interactive session*, not the saved
test. The scenario library really holds **interesting starting positions** —
bookmarks into game states worth poking at, cheap to make and cheap to throw away.
The core gesture is: jump to a bookmark, play it forward by hand with the current
rules, watch what happens.

Recording is a byproduct. Scenarios accumulate as drafts, and once unit behavior
locks in, they can be promoted to validation cases. Approval and regression are an
opt-in second act, not the point of the tool.

This makes the whole system considerably lighter to build.

---

## Retained Value of Scenarios as Tests

Even with the reframing, the validation role stays worth keeping:

- Unit capability is hard to hold in your head from the state machine alone.
- When changing the state machine, seeing that you have not broken something you did
  not intend to break is genuinely valuable.
- Highlighting changed scenarios for review is the core of that value.

---

## Open Items

- The Scratch-style block editor for the turn machine — not yet discussed in detail.
- Whether the state machine is explicit states and transitions, a behavior tree, or
  rule-based.
- How approval/breakage signaling behaves while browsing rule set history.
- Whether "loop until" conditions in scenarios ("do this until out of mana") are
  needed.
- Threat field visualization — needs validation as the right quantity to make
  continuously visible.
- NPC scenarios: same overall design, deferred until PC work is established.
