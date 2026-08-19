## Why

The dungeon harness has been backed out to its scaffold. What replaces it is a
**bench**: one board from Dungeon Tactics that a designer sets up and plays
through by hand, with every rule answered by the real game engine rather than by
the agent. This covers phases 1–4 of
`docs/dungeon-harness/harness-rebuild/phase-plan.md` — the hand-driven bench,
saved positions, reach and threat fields, and a transport strip — leaving the
scoped turn machine (phase 5) as its own change.

The previous effort failed because the agent was asked to referee. The structural
answer is that the harness holds no rules of its own: it imports
`@repo/dungeon-engine` — the same modules the shipped game runs — and every
legality decision is an engine call.

## What Changes

- **A per-session bench** holding one board and its units, with the engine's own
  queries deciding what is legal: reachable tiles, attack footprints, damage,
  round transitions.
- **Board generation in the harness** — `open`, `scattered`, and `arena` presets,
  seeded and reproducible, or exact terrain rows for hand-authored layouts. No
  map import from track-web.
- **Free setup**: place any unit type on any empty tile, set starting HP,
  reposition, clear. Spawn zones do not apply — this is a bench, not a match.
- **Both sides played by hand**: select any unit, move it within the engine's
  reach, attack along an engine-derived footprint. Attacking is committal, as in
  the game. Running the game's own enemy AI stays available for comparison.
- **Step back** over every action, including attacks and placements, via
  full-state snapshots.
- **Session-scoped unit-definition tweaks** (HP, movement, damage, attack range),
  never persisted, exposed to the agent only — no editor UI is built against a
  data model that is expected to be replaced.
- **Sixteen agent tools**, each a thin wrapper over one bench method. None draws;
  none asserts a rule.
- **A React + SVG board** in the client showing terrain, structures, units with
  HP, the current selection, its reachable tiles and attack footprints, and enemy
  telegraphs — with setup/play controls.
- **Bookmarks** (phase 2): name and save the board exactly as it stands, mid-turn
  included, and jump back to it later. Files live beside the agent workspace, not
  inside it, so a saved position cannot be rewritten by a `write`/`edit` call.
- **Reach and threat fields** (phase 3): how far each side can move and what each
  side can hit, for every tile, toggled per side and painted as tints whose
  strength steps with how many units cover the tile — plus the same field as rows
  of digits for the agent.
- **A transport strip** (phase 4): every action is a frame, with step back, step
  forward, and a scrub bar across the whole session. Frames carry the board and
  the session's definition tweaks, so scrubbing past a board swap or a number
  change undoes those too.

## Capabilities

### New Capabilities

- `dungeon-bench`: a single-board design bench for Dungeon Tactics, played by
  hand through the real game engine, driven interchangeably by the designer's
  clicks and the agent's tools.

### Modified Capabilities

None. `dungeon-agent-session`, `dungeon-chat-panel-ux`, `dungeon-pane-layout`,
`dungeon-tool-permission-gate`, and `dungeon-board-visual-inspection` are
unchanged.

## Impact

- **Server**: new `src/bench/` (board generation, bench store, intent routing)
  and `src/pi-extensions/bench-bridge.ts`; `session-store.ts` and `websocket.ts`
  gain the bench alongside the agent session.
- **Client**: new `src/bench/types.ts`, `components/BoardView.tsx`,
  `components/BenchControls.tsx`; `DungeonPage` regains a board pane and
  `useDungeonSocket` carries bench state and intents.
- **Dependency**: `dungeon-harness-server` depends on `@repo/dungeon-engine` by
  relative `file:` path into the sibling track-web checkout. Unused
  `@cucumber/*` dependencies are dropped.
- **No deploy impact**: ports, auth, PM2, and Caddy are unchanged.
