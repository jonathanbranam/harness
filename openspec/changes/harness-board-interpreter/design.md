## Context

See proposal.md for motivation. This design covers the shape of
`dungeon-harness-server/src/board-engine/`, `board-state.ts`,
`pi-extensions/board-bridge.ts`, and `client-dungeon`'s board canvas.

Fidelity constraint: the interpreter must reflect track-web's *current*
non-archetype unit model closely enough that a preview is trustworthy while
a designer writes a scenario. The exact current shape was confirmed by
reading track-web directly (read-only, for reference — nothing here is
imported):

```ts
// track-web/client-games/src/games/dungeon-tactics-solo/types.ts (~line 12)
interface UnitDef {
  maxHp: number
  movement: { range: number }
  attack: {
    damage: number
    targeting: { mode: 'direction'; arc: 'cardinal'; minRange: number; maxRange: number }
    propagation: { shape: 'single' | 'line' | 'plus'; penetration: 'none' | 'stop_at_first' }
  }
}
```

Confirmed today's six archetypes' concrete values
(`track-web/client-games/src/games/dungeon-tactics-solo/unitDefs.ts`), 4-way
cardinal-only direction targeting (`types.ts`'s `Direction`), BFS
range-limited movement blocked only by structures/other units with terrain
purely cosmetic (`pc.ts`'s `validMoveDests`), and the three propagation
shapes' exact geometry plus the two penetration modes (`attackFootprint.ts`).
These are captured as scenarios in `specs/dungeon-board-bridge/spec.md`.

## Goals / Non-Goals

**Goals:**
- A pure, dependency-free `board-engine` module a scenario-preview tool
  layer can call synchronously, unit-testable without spinning up a session.
- Movement and attack preview results that match what track-web's real
  engine would compute for the same board/unit/direction, for today's six
  archetypes only.
- A board canvas that reads the same store the tools mutate, live, the same
  way `DeckCanvas` reads `editorStore`.

**Non-Goals:**
- No turn structure, no HP mutation, no win condition, no NPC AI targeting
  logic — `dungeon_preview_attack` reports what *would* be hit given current
  occupancy, it does not apply damage or end a turn. Simulating a full
  battle is track-web's job (phase 08's Gherkin coverage runs against
  track-web's real engine); this harness only needs enough fidelity to help
  a designer reason about positions/ranges while drafting a scenario.
- No structures (`power-center`/`tower`), no board resizing, no terrain that
  blocks movement/attacks — none of these are in this phase's tool sketch
  (`dungeon_place_unit`/`dungeon_set_terrain` only), and terrain-blocking in
  particular doesn't exist in track-web's current engine either (see
  Decision below).
- No Gherkin I/O (`dungeon_load_baseline`, `dungeon_read_feature`, etc.) —
  phase 05.

## Decisions

### Decision: Hand-copied, hardcoded archetype catalog, not a runtime read of track-web
`board-engine/unit-catalog.ts` defines a `Record<Archetype, UnitDef>`
constant with today's six archetypes' values, hand-transcribed from
`track-web/client-games/src/games/dungeon-tactics-solo/unitDefs.ts` (see
Context above), with a comment pointing at that exact file so a future
resync is a mechanical diff.
**Alternative considered:** Read `unitDefs.ts` at runtime via the read-only
track-web path proposal.md already establishes for the Gherkin corpus and
step catalog. Rejected: that read-only path is scoped to the canonical
`.feature` tree and step catalog specifically — reusing it for arbitrary
track-web source files would blur a boundary proposal.md drew narrowly on
purpose, for a payoff (avoiding a manual resync) that's small given
proposal.md already calls round-one's unit shape "partially throwaway."

### Decision: Movement is BFS shortest-path, blocked only by other units
`board-engine/movement.ts` exposes `findPath(board, unitId, dest): Cell[] |
undefined` — 4-directionally-connected BFS over the grid, cells occupied by
another unit excluded, capped at the moving unit's `movement.range` steps.
Matches track-web's current `validMoveDests`/pathfinding semantics: terrain
is stored but never consulted as a movement modifier, and only unit
occupancy (structures, out of scope here) blocks a cell.
**Alternative considered:** A* with a Manhattan heuristic, matching
track-web's actual `pathfinding.ts` implementation choice. Rejected as
unnecessary: on an unweighted 4-connected grid, BFS and A* return
equal-length shortest paths — the only difference is which of several
equal-length paths is returned when ties exist, which no scenario this
phase previews depends on. BFS is simpler to implement and test.

### Decision: Attack preview returns footprint and hit cells separately
`board-engine/attack.ts` exposes `computeFootprint(unit, dir): Cell[]` (pure
geometry: single/line/plus per `targeting`/`propagation`, clipped to board
bounds) and `resolveHits(footprint, board, penetration): Cell[]` (occupancy
+ penetration rule). `dungeon_preview_attack` returns both, so the board
canvas can show the full candidate area *and* which cells are actually hit
right now — this distinction matters concretely for `ranger` (line +
stop-at-first): the whole line is worth drawing so a designer can judge
range, but only the first occupied cell is actually hit.
**Alternative considered:** Return only the hit cells. Rejected — a
designer placing units to test a ranger's range needs to see the full line
to judge "would this reach," not just today's occupancy-dependent result.

### Decision: Terrain is stored but never consulted by movement/attack
`dungeon_set_terrain` writes a per-cell terrain value
(`plains`/`forest`/`water`/`stone`, track-web's current vocabulary) purely
so a Gherkin Given step like "the cell at (3,2) is forest" has somewhere to
live and something to render — `board-engine`'s movement/attack functions
never read it.
**Alternative considered:** Give terrain real mechanical weight (e.g.
`water` blocks movement, `forest` blocks line-of-sight for `line` attacks) —
would make for richer scenarios, but track-web's current engine doesn't
implement any such rule, so previewing one here would actively mislead a
designer about what the real engine (which phase 08's tests run against)
actually does. Revisit only if/when track-web's engine grows terrain
mechanics.

### Decision: One capability, `dungeon-board-bridge`
See proposal.md's Capabilities section for the full rationale (unlike
`deck-canvas-display`, this board's rendering has no display concern
separate from the domain model it's rendering).

### Decision: `board-state.ts` mirrors `editor-state.ts`'s store/broadcast shape, but instantiated per session, not a module-level singleton
A `BoardStore` class: private grid/terrain/units state, a `subscribe`/
`emit` pair the WebSocket layer subscribes to, and plain methods
(`placeUnit`, `setTerrain`, `getState`) called both by `board-bridge.ts`'s
tool `execute` functions and (later, if `client-dungeon` ever needs a
direct user-driven board edit — not in this phase's scope) a route. Unlike
`deck-harness-server`'s single module-level `editorStore` (one shared deck
for the whole process), each `BoardStore` instance is created inside
`session-store.ts`'s `getOrCreateSession` and held on the session's
`SessionRecord` — a board belongs to one design session's scenario work,
the same way `AgentSession`s themselves are already per-session rather than
shared. No undo/redo, no persistence-to-disk — round one's board state is
scoped to a single design session and isn't meant to survive a restart
(unlike deck's persisted `DeckState`, which is a real editing artifact).
**Alternative considered:** A module-level singleton like `editorStore`.
Rejected — this harness's `AgentSession`s are already keyed per login/
session (`sessionId -> AgentSession`, per `session-store.ts`'s header
comment), and a shared global board would let two logins' agents corrupt
each other's in-progress scenario board, which a per-session store rules
out by construction.
**Alternative considered:** Persist board state like `deck-persistence.ts`
does. Rejected for this phase — the board is scratch space for previewing a
scenario, not an artifact of its own; the actual handoff artifact is still
only ever the `.feature` file (phase 05/06), so persisting board state here
would be building storage for something nothing downstream reads.

### Decision: New `board_state` WebSocket broadcast message
`websocket.ts` gains a `board_state` server→client message, pushed on every
`BoardStore.emit`, mirroring `deck_state`'s existing pattern exactly (full
state snapshot on every change, no diffing). `useDungeonSocket` gains a
`boardState` field alongside its existing transcript state.

## Risks / Trade-offs

- **[Risk]** The hardcoded catalog can silently drift from track-web's real
  `unitDefs.ts` if that file changes later (track-web is actively developed
  independently of this repo). → **Mitigation:** the catalog module's
  header comment names the exact source file, and proposal.md already
  frames round-one units as partially throwaway once the archetype system
  lands — a stale preview for one of today's four simple units is a low-cost
  failure mode (a human final-checks the rendered preview, and phase 08's
  actual acceptance tests run against track-web's real engine, not this
  interpreter).
- **[Risk]** Terrain being purely cosmetic could read as an oversight rather
  than a deliberate choice to a future contributor. → **Mitigation:**
  documented explicitly above and in the spec's "Terrain is settable per
  cell, for context only" requirement, with an explicit scenario asserting
  terrain doesn't block movement.
- **[Trade-off]** No board persistence means a server restart mid-session
  loses all placed units/terrain. → Accepted per the "scratch space, not an
  artifact" decision above; revisit only if phase 05/06 sessions turn out to
  span server restarts in practice.

## Migration Plan

Not applicable — new capability, no existing board-state or tools to
migrate from.
