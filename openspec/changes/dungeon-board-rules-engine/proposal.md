## Why

The dungeon-harness agent can currently draw anything on the board, but has
no way to be *correct* about game rules while doing it — `dungeon_draw_shape`/
`dungeon_draw_line`/`dungeon_draw_overlay` carry no rule meaning by design
(see `dungeon-board-tool-enhancements`), so the agent reasons about
movement/attack rules from memory and gets it wrong: e.g. it drew a PC's
movement options, then added enemies without re-evaluating those options,
leaving a stale and incorrect board and wrong answers to the designer's
questions. This was explored in an `/openspec-explore` session; see
`docs/dungeon-harness/board-rules-engine-exploration.md` for the full
investigation — it traces the history (a prior rules engine existed, then
was deliberately removed to dodge a different bug, accepting exactly this
correctness risk), separates the problem into two independent pieces
(engine correctness vs. staleness of derived state), and lays out
unresolved options for each, plus its relationship to the still-open
`dungeon-preview-lifecycle` change.

This proposal exists to make sure that exploration gets picked back up
rather than lost — it is **not** ready for `specs`/`design`/`tasks` yet.
None of the open questions in the exploration doc are decided.

## What Changes

Nothing yet. When this change is resumed:

1. Read `docs/dungeon-harness/board-rules-engine-exploration.md` in full.
2. Decide the open questions it lists: the correctness approach (resurrect
   the old local engine, import track-web's real engine read-only, or
   freeze a documented copy), what counts as an engine-tracked "unit" vs.
   freehand drawing, whether a direct rules-query tool surface is needed,
   and how this change relates to `dungeon-preview-lifecycle`.
3. Continue planning from there — likely via `/openspec-explore` again to
   settle the decisions, then filling in this change's `design.md` (the
   decisions and trade-offs), `specs/` (the capability/requirement deltas
   the decisions imply), and `tasks.md`.

## Capabilities

### New Capabilities

(none yet — undecided, see "What Changes")

### Modified Capabilities

(none yet — likely `dungeon-board-bridge`, but not decided)

## Impact

None yet — no implementation approach has been chosen. Likely touches
`dungeon-harness-server/src/board-state.ts`,
`dungeon-harness-server/src/pi-extensions/board-bridge.ts`, and
`client-dungeon/src/components/BoardCanvas.tsx`, per the exploration doc's
sketch, but that's not committed.
