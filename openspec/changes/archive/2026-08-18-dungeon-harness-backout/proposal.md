## Why

The dungeon-harness feature work is stopped and being backed out
(`docs/dungeon-harness/STATUS.md`): Gherkin-as-the-canonical-artifact put the
LLM in the referee's chair for game rules, and the freehand board tools let it
draw a board it had no way to be right about. The replacement is a different
tool — a bench that plays the **real game engine** (now shipped as
`@repo/dungeon-engine` in track-web) and lets the agent drive it, never
adjudicate it.

Keeping the half-built Gherkin and freehand-board machinery around would only
constrain that rebuild's design, and the freehand drawing surface is precisely
what enabled the failure. This is Part 2 (steps 3–5) of
`docs/dungeon-harness/backout-plan.md`.

## What Changes

**Deleted — Gherkin authoring (phase 05):** `src/gherkin/` (model, parse,
render, diff, slug, and their tests) and `pi-extensions/scenario-bridge.ts`
(`dungeon_read_feature`, `dungeon_write_feature`,
`dungeon_write_implementation_notes`).

**Deleted — baseline/changeset and the read path into track-web (phase 06):**
`pi-extensions/baseline-bridge.ts` + test (`dungeon_load_baseline`,
`dungeon_read_step_catalog`, `dungeon_get_changeset`, `dungeon_write_changeset`)
and the `DUNGEON_TRACKWEB_FEATURES_DIR` env var. The rebuild imports the game
engine as a dependency rather than reading track-web's source tree.

**Deleted — freehand board:** `pi-extensions/board-bridge.ts` + test
(`dungeon_draw_shape/_line/_overlay/_label`, `dungeon_set_cell_fill`,
`dungeon_move_object`, `dungeon_remove_object`, `dungeon_clear_board`,
`dungeon_get_board_state`), `src/board-state.ts` + test, and
`client-dungeon/src/components/BoardCanvas.tsx`. The canvas goes too: the
rebuilt harness renders engine `GameState`, a different data model, and keeping
the freehand component invites accidental reuse of the object model it was
built for. Git history keeps it.

**Rewired:** `session-store.ts` drops the board store and the three deleted
extensions; `websocket.ts` drops the `board_state` message and board
subscription; `client-dungeon` drops the board pane and its socket state,
leaving the chat + auth shell.

**Kept:** the phase-01 scaffold — auth, `AgentSession` per login, jailed
workspace, chat UI, `permission-gate.ts` (the path jail is
substrate-independent), and `board-visual-inspection.ts` (`dungeon_board_view`
is a generic "let pi see the rendered canvas", shared with deck-harness, and the
rebuild will want it).

**Rewritten:** `templates/agent-workspace/AGENTS.md`, which currently teaches
the Gherkin/board workflow.

**Retired capabilities and open changes:** `dungeon-scenario-authoring`,
`dungeon-baseline-changeset`, and `dungeon-board-bridge` are deleted, as are
the proposal-only changes `dungeon-preview-lifecycle` (its bug class dies with
the freehand board) and `dungeon-board-rules-engine` (superseded by
`docs/dungeon-harness/turn-machines/`).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None expressible as a delta. Three capabilities are **retired outright** —
`dungeon-scenario-authoring`, `dungeon-baseline-changeset`,
`dungeon-board-bridge` — by deleting their spec directories. A `REMOVED
Requirements` delta cannot do this: `openspec archive` rejects a spec left with
zero requirements, aborting the run (learned the hard way in track-web's
`dungeon-tactics-harness-backout`). This change therefore sets
`skip_specs: true`, and the retirements are recorded here.

Untouched capabilities: `dungeon-agent-session`, `dungeon-chat-panel-ux`,
`dungeon-pane-layout`, `dungeon-tool-permission-gate`,
`dungeon-board-visual-inspection`, `harness-auth`.

## Impact

- **Server**: ~1,100 lines deleted across `src/gherkin/`, three
  `pi-extensions/`, and `board-state.ts`; `session-store.ts`, `websocket.ts`,
  and `env.ts` trimmed.
- **Client**: `BoardCanvas.tsx` deleted; `DungeonPage.tsx` becomes a single
  chat pane; `useDungeonSocket.ts` loses its board-state half.
- **No deploy impact**: ports, PM2, Caddy, and auth are unchanged. The dev
  servers keep running — nothing here requires a restart beyond `tsx watch`'s
  own reload.
