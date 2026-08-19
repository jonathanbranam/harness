## Context

See `proposal.md` — Why, and `docs/dungeon-harness/backout-plan.md` Part 2 for
the file-by-file breakdown this change executes. The only design-level
questions are what survives and what the wiring looks like afterward.

## Goals / Non-Goals

**Goals:**

- Leave the harness at exactly the phase-01 scaffold: auth, one `AgentSession`
  per login, jailed workspace, chat UI, permission gate, canvas capture.
- Remove every path by which the agent could draw or assert a rule outcome.
- Leave no dangling tool name, env var, message type, or spec.

**Non-Goals:**

- Building any part of the replacement bench. That is the next change.
- Touching the deck or introspect harnesses, or `packages/ui`.

## Decisions

### `BoardCanvas.tsx` is deleted, not kept as a starting point

It renders freehand objects — shapes, lines, overlays, labels, cell fills —
from a model the rebuild does not have. The bench renders engine `GameState`:
terrain grid, units with HP and archetype, and derived overlays computed by the
engine. Keeping the component would tempt reuse of the object model that made
the agent the referee.

*Alternative — keep it as scaffolding for the new renderer:* rejected. What
carries over is the SVG-in-React approach, which is a pattern, not code. Git
history has the file if a detail is wanted.

### `dungeon_board_view` stays, alone

`board-visual-inspection.ts` is the only surviving custom tool. It is
substrate-independent — "screenshot whatever the client is rendering" — and it
is shared with deck-harness through `packages/ui`'s `captureNode`. The rebuild
wants it on day one, and it cannot be used to assert a rule.

### The board pane is removed rather than emptied

`DungeonPage.tsx` drops to one pane. `usePaneManager` is driven by a `PANE_IDS`
list, so the layout collapses cleanly to a single entry and the rebuild adds its
pane back by adding an id — no structural change to the pane machinery.

### The retired capabilities are deleted directly

Same constraint hit in track-web: `openspec archive` refuses a spec with zero
requirements, so a `REMOVED` delta cannot retire a capability. The three spec
directories are deleted and the change carries `skip_specs: true`, with the
retirements recorded in `proposal.md`.

## Risks / Trade-offs

- **A deleted tool name survives in the session allowlist** → `session-store.ts`
  holds `CUSTOM_TOOL_NAMES`; after this change it lists exactly one tool.
  `npm run typecheck` will not catch a stale string, so the list is checked by
  eye against the surviving extension.

- **The workspace `AGENTS.md` teaches a workflow that no longer exists** → It is
  rewritten in this change rather than left for the rebuild. An agent reading
  stale instructions would try to call tools that are gone.

- **A running dev server holds deleted modules in memory** → `tsx watch` reloads
  on file change; no restart is needed, and per `CLAUDE.md` the servers must not
  be restarted by an agent. If the session misbehaves after the reload, the user
  restarts it.

## Migration Plan

No data, no deploy, no schema. Verification is `npm run typecheck` and
`npm test` at the repo root, plus a read of the diff for stale references
(`rg -n "board_state|dungeon_draw|scenario-bridge|baseline-bridge|steps-catalog"`).
Rollback is reverting the commit.
