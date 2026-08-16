# Dungeon-Harness Proposal

Design notes for a *third* harness in this repo: a chat-driven tool for a
game designer to develop **Gherkin scenario specs** for Dungeon Tactics
player-unit behavior — using a live game-board visualization to reason about
positions, ranges, and movement while writing them. Nothing here is built
yet. Scope for the first cut is **player unit behavior only** — no NPC/AI
archetypes, no map/content editing.

## Roles and the canonical artifact

Two-role workflow:

1. **Designer** (this harness, chat-driven, board-assisted) writes and
   edits `.feature` files.
2. **Engineer** (you, using OpenSpec — possibly a purpose-built skill) takes
   `.feature` files and uses them as OpenSpec change input *and* as the
   acceptance tests that verify the implementation, via the new track-web
   capability to run Gherkin specs as tests without Phaser.

**Gherkin `.feature` files are the single canonical artifact, full stop.**
Any structured/internal representation dungeon-harness keeps for its own
purposes (driving the board-preview tools, say) is a **derived working
cache, never authoritative, never the hand-off artifact**. Three things
follow directly from that:

- The harness must be able to **read and re-parse `.feature` files it did
  not write** — the engineer may edit them directly in track-web, and the
  designer may edit them by hand too. Whenever the harness opens a scenario
  session, it re-derives its internal state from whatever the current
  `.feature` file actually says, not from a stale cache. Gherkin wins,
  always.
- The harness's structured form **never gets exported or handed off** —
  dropped the earlier draft's "structured form for authoring, Gherkin for
  export" split. There's exactly one artifact.
- Round-trip fidelity (parse `.feature` → internal model → re-render
  `.feature`) needs to be good enough that re-writing a file the harness
  didn't originally author doesn't produce spurious diffs on content that
  didn't change.

## What crosses the boundary, in both directions

Confirmed with you that the interaction is still limited to files, not
code — but it's now explicitly bidirectional and slightly richer than "just
the `.feature` files":

| Direction | Artifact | Purpose |
|---|---|---|
| track-web → harness | **Step catalog** (implemented/available Gherkin step patterns) | Lets the harness draft new scenarios that reuse existing steps instead of inventing near-duplicates, and clearly flags which steps in a draft are *new* (need a step-definition implementation) vs. already supported. |
| harness → track-web | **`.feature` files** | The canonical spec + acceptance-test artifact. |
| harness → track-web | **Implementation notes** (advisory) | Suggestions for combining or refactoring steps to reduce redundancy across scenarios — informs the engineer during implementation, not part of the spec itself. |
| track-web → harness | **`.feature` files** (read) | Picks up edits made outside the harness — see "canonical artifact" above. |

The step catalog is a new deliverable of the track-web-side Gherkin-runner
work (see "Track-web side" below), not something dungeon-harness invents —
it needs to be an accurate reflection of what's actually implemented.
**Bootstrapping note:** the catalog starts empty. The first round of
scenarios necessarily introduces all-new steps; the catalog only starts
paying for itself once there's an existing step vocabulary to draft against.

## Repo mapping: git worktree, narrowly jailed

This still argues for a worktree — not for the reason the first draft of
this doc gave (engine-code reuse, code write access), which is gone now,
but because real bidirectional file traffic between two apps benefits from
being a reviewable unit: the designer's output lands as commits on its own
branch, you review the diff as a batch (consistent with how you already
work — OpenSpec's propose → review → archive shape), then merge before
starting implementation.

```bash
cd /Volumes/Data/work/pi/track-web
git worktree add ../track-web-dungeon-harness -b dungeon-harness/unit-scenarios dev
```

Jail `write`/`edit` **only** to the specific paths that hold the exchanged
artifacts — not `client-games/`, not `src/games/`, not anything else in
track-web:

- The `.feature` files directory (exact path TBD — see open questions;
  needs to match wherever the new Gherkin test runner expects to find them).
- An implementation-notes file/directory alongside it.
- Read-only access to wherever the step catalog gets generated.

This is a much narrower jail than a code-writing agent would need, and the
content being exchanged is plain text (Gherkin, Markdown/JSON), not
TypeScript — a meaningfully smaller trust boundary than the original
cross-repo-code-write sketch this doc started with.

**Lighter alternative worth naming:** since nothing here touches code
anymore, pointing the jail directly at the features directory inside your
**actual track-web working checkout** (no worktree, no branch) is a
legitimate simplification — you'd see designer edits land in your working
tree in real time instead of reviewing a branch, at the cost of losing the
clean "review the whole batch, then merge" step. Worktree is the
recommendation because it matches your existing propose-then-implement
workflow, but this is a low-stakes call either way given the jail is this
narrow.

## The game board: reimplemented locally, not imported

Unchanged from the previous draft's reasoning: the board the designer
interacts with (place units, preview a movement path, preview an attack's
footprint) needs its own math, implemented directly in dungeon-harness
against the *documented* model (`movement.md`/`attack.md`), not imported
from track-web. This was already true once code access was off the table,
and stays true now that the boundary is "files only" — plus the archetype
system these scenarios describe (`fighter`/`rogue`/`ranger`/`mage`) isn't
implemented in track-web's current engine yet anyway, so there's no
production-accurate engine to import even if the boundary allowed it.

## Sketch: tool surface

- `dungeon_get_board_state` — the scenario-in-progress's board, units, and
  the last previewed step's outcome.
- `dungeon_preview_movement` / `dungeon_preview_attack` — run the local
  spec-interpreter against the current board and return the resulting
  path/footprint, to sanity-check a step before writing it into Gherkin.
  Read-only, operates on the internal working cache only.
- `dungeon_place_unit` / `dungeon_set_terrain` — compose the board state
  that backs a scenario's Background/Given steps visually.
- `dungeon_read_feature` — parse a `.feature` file (from the jailed path)
  into the internal working model. Called whenever a session opens an
  existing scenario, so edits made outside the harness are picked up before
  any new writing happens.
- `dungeon_read_step_catalog` — read track-web's current list of
  implemented/available steps, to inform drafting.
- `dungeon_write_feature` — render the internal model to Gherkin and write
  it to the jailed `.feature` path. This is the only canonical write.
- `dungeon_write_implementation_notes` — write/append advisory suggestions
  (step consolidation, redundancy, refactor ideas) to the notes artifact.
  Explicitly non-canonical — never read back by `dungeon_read_feature`.

## Track-web side (separate work, not dungeon-harness's build)

The "one change for track-web" you described needs to deliver more than
just a test runner, given the exchange above:

1. A way to run `.feature` files as acceptance tests against unit behavior
   in a Vitest test, not through Phaser — a Given/When/Then step-definition
   layer over the pure engine functions (today's `pc.ts`/`npc.ts`/`turn.ts`,
   or their eventual archetype-registry replacements). track-web has no
   Gherkin/Cucumber tooling today (checked `package.json` — nothing there),
   so this is new: a small custom parser+runner, or a library like
   `@amiceli/vitest-cucumber` if its style fits.
2. **The step catalog generator** — introspect the registered step
   definitions and emit the list dungeon-harness reads. Needs to be
   regenerated whenever step definitions change, and land somewhere the
   harness's worktree jail can read.
3. A decision on the `.feature` files' canonical directory, since that
   location is now load-bearing for three things at once: what the test
   runner scans, what the harness's write jail targets, and what a
   scenario→OpenSpec-scaffolding skill would read.

This is track-web's own OpenSpec change, independent of dungeon-harness's
build — but its shape (catalog format, file layout) needs to be settled
before dungeon-harness's jail config and `dungeon_read_step_catalog` can be
finalized, so it's worth sequencing first or in lockstep.

## Open questions

- **`.feature` files' canonical directory** — drives the runner, the jail,
  and the scaffolding skill. Decide as part of the track-web-side change.
- **Step catalog format** — plain Markdown list (human-skimmable, LLM-
  readable) vs. structured JSON (easier for the harness to parse
  mechanically). Leaning JSON with a generated Markdown view, but not
  decided.
- **"New skill for this" (scenario → OpenSpec change scaffolding)** — lives
  in track-web's `.claude/skills/` (it's track-web work consuming a
  `.feature` file) or dungeon-harness's own workspace template (natural
  next step after a scenario session ends)? Leaning track-web, since
  that's where OpenSpec changes and the Gherkin runner both live.
- **Round-trip fidelity bar.** How exact does re-rendered Gherkin need to
  match hand-edited formatting (comment placement, tag ordering, blank
  lines)? Worth deciding before `dungeon_write_feature` risks clobbering an
  engineer's manual edits with harmless-looking reformatting.
- **Archetype scope for early scenarios.** `unit-definition.md`'s
  archetypes aren't implemented yet; confirm whether the first scenarios
  target that not-yet-built model directly, or start narrower against
  today's simpler `UnitDef` shape to prove the designer↔engineer↔
  Gherkin-runner loop end-to-end first, given the step catalog is empty on
  round one either way.

---

## Revision notes

This doc has pivoted twice as the actual boundary got clearer:

1. **First draft** assumed dungeon-harness needed `write`/`edit` access into
   track-web's game *code* (engine + unit-def data), and proposed a
   `git worktree` + `file:` dependency to reuse track-web's pure engine
   functions for a scenario runner.
2. **Second draft** established the designer/engineer split: dungeon-harness
   never touches track-web code at all, only scenario files, with a
   self-contained (deck-harness-style) workspace and a locally-reimplemented
   board interpreter. The worktree and code-reuse plan were dropped as moot.
3. **This draft** confirms Gherkin as the sole canonical artifact (not the
   structured form), and adds the step-catalog and implementation-notes
   exchange — which brings back a narrow, files-only worktree jail (not a
   code jail) for the reasons in "Repo mapping" above.
