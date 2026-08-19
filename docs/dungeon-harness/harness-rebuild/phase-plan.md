# Rebuild phase plan

> **Status: agreed sequencing (2026-08-18).** The direction and the phase
> boundaries are settled; the detail inside each phase is not, and no code
> has been written. Companion to [`README.md`](README.md) (orientation +
> decisions) and [`designer-ui-session.md`](designer-ui-session.md) (the
> designer-facing UI this builds toward).

## The rule these phases obey

**Every phase ends with something the designer can open and use.** No
horizontal layers, no "it all works at the end." A phase that only produces
infrastructure is folded into the phase that first needs it.

Two consequences worth stating up front:

- The full bench described in `designer-ui-session.md` — survey grid,
  recording, approval, branch colours — is the *destination*, not the
  first release. Most of it is deferred past phase 5.
- **The harness does not get a unit-def editor.** Today's `UnitDef` data
  model is expected to be thrown away along with much of its
  implementation, so building UI against it is wasted work. Editing stays
  in track-web's existing Unit Designer until turn machines replace the
  model. What *doesn't* change is the interface for setting up a board and
  playing it through — that survives the rules-layer swap, which is why it
  is built first. Longer term the direction runs the other way: track-web's
  unit editor and map editor are expected to **move into the harness**, so
  the harness generates its own boards rather than importing them.

## Phase 1 — The hand-driven bench ✅ built 2026-08-18

> Implemented as `openspec/changes/dungeon-bench` (still open: browser
> verification is the one task outstanding — it needs the dev servers running).
> Two things the plan did not anticipate, both now recorded in that change's
> design: the enemy AI advances on **structures**, not PCs, so a generated board
> needs a power center or "run the AI" does nothing; and `resolveNpcAction` does
> not mark an NPC as having attacked, because the game resolves NPC attacks as
> end-of-round telegraphs, so the bench adds that sequencing itself.

**At the end you can:** open the harness, generate a board (or ask the
agent for one), drop units anywhere on it, and play a full round by hand —
moving and attacking with the game's own legal options, then driving each
enemy yourself instead of watching the AI, and stepping back when you want
to try the other line. You can also ask the agent to change a unit's
numbers mid-session and watch the board's options change immediately.

**This is POC work.** Nothing in this phase persists, and nothing in it is
expected to survive contact with the turn-machine rules layer except the
setup-and-play interface itself.

Tasks:

1. **Extract `track-web/packages/dungeon-engine`.** Specced as
   `track-web:openspec/changes/dungeon-engine-package` (proposal, spec,
   design, tasks written 2026-08-18; not implemented). Move the Phaser-free
   rules modules (`types`, `turn`, `pc`, `npc`, `pathfinding`,
   `attackFootprint`, `unitDefs`, plus the `defStore`/`contentStore`
   *state* and *getters*) into the package, next to the existing
   `packages/{auth,config,ui}`. Update the ~15 importing files in
   `client-games` (game, studio, tests) so the game behaves identically.
   **Boundary rule: the package holds rules and in-memory stores only.
   Loading stays in the hosts** — `defStore.loadFromServer()` and
   `contentStore.loadFromServer()` use browser `fetch` and `localStorage`,
   which the harness's Node server cannot use. The package exposes the
   apply/deserialize half (`applyLoaded`, `deserialize`); each host
   supplies its own loader.
2. **Server owns the board.** `dungeon-harness-server` imports the package
   and holds the authoritative `GameState`; `client-dungeon` renders it and
   sends intents over the existing WebSocket. This follows from the agent
   driving the board in phase 1 (see Decisions) — one authority, no split
   brain between chat-driven and click-driven actions.
3. **SVG board renderer** in `client-dungeon` over `GameState`, replacing
   the freehand `BoardCanvas`. React + SVG, no Phaser.
4. **Boards come from the harness, not track-web.** No map API, no map
   import: a small generator produces sample boards (size, terrain mix, a
   couple of stock layouts), and the agent can author or edit one directly.
   Terrain is engine-layer data (`Cell[][]`), so this is setup, not
   refereeing.
5. **Setup mode:** free placement — any unit, any tile, ignoring spawn
   zones, plus starting HP. This is a bench, not a match.
6. **Play mode, both sides by hand:** PC selection shows the engine's own
   `validMoveDests` / `attackSquares`; commits go through
   `resolvePcAction`. Enemies are driven the same way through
   `resolveNpcAction` — the engine already applies one NPC action in
   isolation, so manual enemy control needs no new rules code. A "run the
   AI" control falls back to `computeNpcTurns` for comparison.
7. **Snapshot stack** for step-back (`GameState` is plain serializable
   data, so this is a list of states, not an undo-command system).
8. **Agent tools, one-to-one with engine calls:** read state, list a unit's
   legal options, generate or edit a board, place/remove/move a unit, apply
   one action, run the enemy AI, end the round, undo. Every tool is a thin
   wrapper over a function in the package. **No tool computes, previews, or
   describes a rule outcome itself** — the constraint the previous effort
   died on.
9. **Session-scoped def tweaks, via the agent only.** One tool that writes
   a unit's numbers into the in-memory def store for this session — "give
   the ranger 5 movement" — so the board and its overlays re-derive
   immediately. **No UI, no persistence, no editor**: this is the edit→see
   loop bought for one tool wrapper, and it is throwaway by construction, so
   it survives the `UnitDef` model being discarded.

Out of scope: persistence, overlays beyond what selection already shows,
scrubbing, and any editing UI.

**Risk to watch:** with the agent present from day one, chat can quietly
become the only good way to set up a board. Direct manipulation has to stay
first-class in this phase — if placing three brutes is easier by typing than
by clicking, the UI is not done.

## Phase 2 — Bookmarks ✅ built 2026-08-18

**At the end you can:** name and save the board you are looking at, and pull
it back up later from a rail.

Small, because the state is already a serializable blob and mid-play states
save for free. This is the session doc's central reframing made concrete:
the library holds **interesting starting positions**, cheap to make and
cheap to throw away — not test cases.

> Built as part of `openspec/changes/dungeon-bench`. A bookmark stores the
> board, every unit where it stands, and the session's definition tweaks, in
> a file beside the workspace rather than inside it — so a saved position
> cannot be rewritten by the agent's `write`/`edit` tools, only through the
> bench. Loading one is itself a step-back point.

## Phase 3 — Threat and reach overlays

**At the end you can:** tint the board by who can reach or touch each
square, toggle it per side, and watch the option space in a paused state.

This is the *Inventing on Principle* payload, and the phase where we find
out whether **reach and threat** really is the quantity worth making
continuously visible (`designer-ui-session.md`, "Key Reframing"). Built
cheaply on purpose so it can be discarded if the answer is no.

## Phase 4 — Transport strip

**At the end you can:** step forward and back through a played sequence and
scrub across it.

Promotes phase 1's snapshot stack into a timeline, turning a session from a
one-way animation into an inspectable trajectory.

## Phase 5 — Scoped turn machine v1

**At the end you can:** play the bench against machine-driven units and see
it behave identically to the legacy path.

Scope is deliberately narrow: only enough of
[`../turn-machines/`](../turn-machines/README.md) to express **today's six
archetypes** (`melee`, `rogue`, `ranger`, `magic-user`, `short-range`,
`long-range`). Not the full language, not the authoring UI. Ships when a
machine-driven board and a legacy board play the same.

### Dropped: live def reload from track-web

An earlier draft had a phase between the transport strip and turn machines
that re-read unit defs from track-web's Unit Designer so the harness
re-ran on every edit. **Cut (2026-08-18).** It would build a cross-app
reload seam pointed at a data model being discarded, driven by an editor
that is itself moving into the harness later — work that dies twice. The
edit→see loop it existed to provide is covered, cheaply and disposably, by
phase 1's session-scoped def tweaks, and properly by turn machines after
phase 5.

## Deferred past phase 5

In rough order of likely value:

- **Agent authoring of machines** — the role `STATUS.md` scopes the agent
  to; needs phase 5 first.
- **Migrating track-web's unit editor and map editor into the harness.**
  The intended end state: the harness owns unit and board authoring, and
  those pages leave `client-games/src/studio/`. This is why no editing UI
  is built against today's `UnitDef`, and why the harness generates its own
  boards rather than importing track-web's.
- **Survey grid (multiple boards at once).** Requires instance-scoping the
  engine — see README, "Blocking prerequisite". Single-board phases 1–5
  deliberately avoid that cost.
- **Recording, approval, watched facts** — the "opt-in second act" of the
  session doc.
- **Rule-set version graph, labels, branches, per-card colour binding.**
- **Scratch-style block editor** for turn machines.
- **Unit editing in the harness, for real** — a persisted, UI-driven
  editor, only once turn machines have replaced the model being thrown
  away.

## Decisions (2026-08-18)

| Decision | Choice | Why |
|---|---|---|
| Build order | **Harness bench first, scoped turn machine after** — reversing the earlier "gate on turn-machines approval" | Both are large. The bench is usable on its own against today's rules, and the setup/play interface survives the rules swap |
| Engine sharing | **Extract `track-web/packages/dungeon-engine` now** | One set of rules, no copy, no drift — the failure mode `STATUS.md` blames for the last effort. Paid up front rather than after the harness has grown around an alias |
| Rendering | **Fresh React + SVG renderer**, no Phaser | Overlays and threat fields are the whole point from phase 3 on, and they are trivial in SVG; the game's Phaser scene is bound to its HUD and turn flow. Cost accepted: harness boards will not look like the game |
| Board content | **Generated in the harness, or authored by the agent** — no map import from track-web | track-web's map editor is expected to move into the harness later, so building an import path now buys a bridge to a component that is leaving |
| Agent timing | **Phase 1** | Exercises the existing scaffold immediately; every tool maps 1:1 onto an engine function so the agent cannot referee. Risk noted in phase 1 |
| Simulation location | **Server-side** | Follows from the agent driving the board in phase 1 — one authority for click-driven and chat-driven actions alike. Revisit if the survey grid makes per-card client sim necessary |
