> # ⛔ STOPPED — superseded work, do not implement
>
> **This work is stopped and has been fully backed out** (2026-08-18). The
> Gherkin-authoring dungeon-harness approach documented here put the LLM in
> the referee's chair for game rules, and the harness was never usable as a
> design tool. See [`STATUS.md`](STATUS.md) for why, exactly what landed,
> and what happens to each piece, and [`backout-plan.md`](backout-plan.md)
> for the removal plan.
>
> **The replacement is the harness rebuild**
> ([`harness-rebuild/phase-plan.md`](harness-rebuild/phase-plan.md), the plan
> of record) — a design bench that plays a board through the real engine.
> Phases 1–4 shipped 2026-08-19. Its rules layer, a declarative unit language
> ([`turn-machines/README.md`](turn-machines/README.md)), is **still under
> evaluation and not approved**; only a scoped slice is planned, as phase 5.
>
> Kept for historical context only.

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
2. **Engineer** (you, using OpenSpec via a new track-web-side skill) turns
   finished `.feature` files into an OpenSpec change, implements it, and
   the same files become the acceptance tests that verify it — via the new
   track-web capability to run Gherkin specs without Phaser.

**Gherkin `.feature` files are the single canonical artifact, full stop.**
Any structured/internal representation dungeon-harness keeps for its own
purposes (driving the board-preview tools) is a **derived working cache,
never authoritative, never handed off as its own format**.

track-web's **canonical** `.feature` tree specifically means *only the
already-implemented, already-passing* scenarios — the OpenSpec parallel is
exact: `openspec/specs/` is only ever updated by archiving a completed
change, never edited freely mid-flight. See "Delta vs. canonical" below for
why that distinction is now load-bearing for this design, not just a nice
analogy.

Whenever the harness opens a scenario it didn't just author itself, it
re-derives its internal state from whatever the current `.feature` text
actually says — Gherkin wins, always, over any stale cache.

## What crosses the boundary

Settled into something narrower than earlier drafts of this doc assumed,
once the delta/canonical split (below) is in place:

| Direction | Artifact | Access | Purpose |
|---|---|---|---|
| track-web → harness | Canonical `.feature` corpus (implemented + passing only) | **read-only** | Reconciliation — pick up specs edited outside the harness, and provide context for revising an existing unit's scenarios. |
| track-web → harness | Step catalog | **read-only** | Draft new scenarios that reuse existing step text instead of inventing near-duplicates; flag which steps in a draft are genuinely new. |
| harness → engineer | Finished `.feature` files | harness's own workspace, **not written into track-web at all** | Picked up by the engineer's track-web-side skill, which is what actually creates the OpenSpec change. |
| harness → engineer | **Changeset** (added/modified/removed scenarios vs. the loaded baseline) | harness's own workspace | The actual review artifact — see "Baseline and changeset" below. Lets both the designer and the engineer review *what changed*, not the whole file. |
| harness → engineer | Implementation notes (advisory) | harness's own workspace | Step-consolidation/refactor suggestions, read by the engineer during implementation. Never fed back into `dungeon_read_feature` — advisory only, not spec. |

The write side dropped out of track-web entirely (see "Repo mapping"): the
handoff is the engineer *pulling* from the harness's workspace via their own
skill, not the harness pushing into track-web's tree. That matches what you
described — the new skill is "used by the engineer within Claude Code to
create an OpenSpec change spec based on any updates to the scenario spec,"
which puts the engineer in the loop on every handoff by construction.

## Repo mapping: no worktree needed — read-only beats write-jailed

Earlier drafts of this doc went back and forth on a `git worktree` for
write access into track-web. That whole question dissolves once writes
don't cross into track-web at all:

- **Write side**: `dungeon-harness-server` gets a fully **self-contained**
  workspace, same shape as deck-harness's (`data/workspace/`, gitignored,
  seeded from a template, permission-gate path jail). `.feature` drafts and
  implementation notes live there. Nothing to jail into track-web because
  nothing is written there.
- **Read side**: the canonical `.feature` corpus and the step catalog only
  change when an OpenSpec change archives (infrequent, and always a
  deliberate, reviewed event) — so there's no collision/corruption risk to
  guard against the way there is for a live write path. A **read-only**
  path straight into your actual track-web working checkout is enough; no
  worktree, no branch, no second checkout. (If a genuinely read-only path
  ever turns out to need isolation too — e.g. you want the harness reading
  a specific tag/commit rather than your live working tree — a read-only
  worktree is a one-line upgrade later. Not needed to start.)

This is a real simplification from the previous draft's narrowly-jailed
write worktree, not just a smaller version of it — the trust boundary for
read-only access is categorically lower-stakes than any write access, so it
doesn't need the same isolation machinery.

## Delta vs. canonical: borrowing OpenSpec's change/spec split

This is what actually resolves the round-trip-fidelity worry, and it's the
direct answer to your OpenSpec-delta question:

OpenSpec already separates **delta** (`openspec/changes/<id>/specs/<cap>/
spec.md`, ADDED/MODIFIED/REMOVED Requirements — what a change *proposes*)
from **canonical** (`openspec/specs/<cap>/spec.md` — what's actually
implemented), and only `archive-change`/`sync-specs` moves delta into
canonical. Apply the same split to Gherkin:

- **Canonical**: `.feature` files under wherever track-web's Gherkin runner
  scans from (see "Track-web side" below) — implemented, passing, stable.
  This is what the harness reads.
- **Delta**: when the engineer's skill turns a batch of the designer's
  finished `.feature` files into an OpenSpec change, they land as that
  change's own artifact — e.g. `openspec/changes/<change-id>/features/
  *.feature` — sitting alongside the change's normal `specs/<capability>/
  spec.md` prose-requirement delta (ADDED Requirements, `#### Scenario:`
  blocks in prose). One change now carries both the human-readable
  requirement delta *and* the literal, executable scenario delta together,
  reviewed and implemented as one unit — same pattern the deck-harness
  scaffold change already used (`specs/harness-auth/spec.md` etc., see
  `openspec/changes/archive/2026-08-15-deck-harness-scaffold/specs/`).
- **Merge point**: archiving the change moves `features/*.feature` from
  the change directory into the canonical tree (mirroring `sync-specs`) and
  triggers a step-catalog regeneration. This is the only point the
  canonical tree changes, and it's already a deliberate, reviewed action in
  your existing workflow.

Why this resolves round-trip fidelity: the harness never reads-modifies-
writes the canonical tree at all (read-only, above) — its writes only ever
land in files it fully owns, in its own workspace. Nobody hand-edits those
before the engineer's skill picks them up, so there's no "don't clobber a
human's manual formatting" hazard on the harness's write path.

This is now settled by the session lifecycle, not just "not needed for
v1": a design session ends with an explicit **sign-off** (the designer is
done, the handoff artifacts are written), and the *next* session for that
unit only starts after the change has landed and archived — so there is no
window where a live design session and an in-review OpenSpec change both
exist for the same unit at once. The harness's read-only path never needs
to reach into an in-progress change's delta at all; the next session simply
loads whatever is canonical by then. See "Baseline and changeset" below for
the lifecycle in full, and note the corollary: since the designer's
sign-off is meant to be the finished artifact, **track-web-side edits to a
landed scenario should be rare** — occasional wording/technical fixes
during implementation, not routine revision. If track-web starts editing
scenarios often, that's a signal the designer/engineer split isn't working
as intended and the loop needs a look.

## Baseline and changeset: the harness computes the diff, not track-web

You raised a real gap: a session shouldn't start from a blank page for a
unit that already has canonical scenarios, and its output shouldn't be "here
is the whole rewritten file, good luck spotting what changed." Two changes
follow:

**Sessions start from the canonical baseline.** Opening a design session for
an existing unit loads that unit's current canonical `.feature` file(s) (via
the read-only track-web path) as a fixed baseline, held separately from the
harness's working copy that the designer actually edits. A brand-new unit
starts from an empty baseline — everything in the session is additions.

**The harness owns the diff, not track-web.** You floated the alternative —
track-web computing a diff between old and new spec files after the fact —
and I agree the harness owning it is the better call, for the reason you
gave (the designer reviews *changes*, not the whole scenario, to check their
intent landed) plus one more: the harness already holds both the baseline
and the live working state as structured, parsed objects in memory during
the session. Diffing there is cheap and precise. Reconstructing the same
diff on the track-web side afterward means re-parsing two flat `.feature`
files and guessing at scenario identity from scratch — strictly harder, for
no benefit.

**Diff at the structured level, not raw text.** Compute the changeset by
comparing parsed scenario/step objects, not by text-diffing rendered
Gherkin — otherwise harmless re-rendering (whitespace, comment placement)
shows up as false "modified" noise. Classify each scenario as
**added** / **modified** / **removed** relative to baseline, and for a
modified scenario, which of its steps actually changed — mirroring
OpenSpec's own ADDED/MODIFIED/REMOVED Requirement delta vocabulary closely
enough that the engineer's skill can lean on it directly when writing the
OpenSpec change's requirement delta, rather than re-deriving intent from the
full file.

**Matching needs a stable key, not scenario titles.** A designer renaming a
scenario's title while also tweaking its steps would otherwise diff as
"removed + added" instead of "modified," losing exactly the review value
this is for. Give each `Scenario` a stable identifier — a Gherkin tag (e.g.
`@scenario-id:ranger-retreat-after-shot`) written once when the scenario is
first created and left untouched by later title/wording edits — and match
baseline-to-working scenarios by that tag, falling back to title-matching
only for scenarios that predate this convention. Tags are inert to
`@amiceli/vitest-cucumber` execution and to the mechanical step-catalog
extraction (which only reads Given/When/Then lines), so this doesn't need
any track-web-side change to adopt.

The changeset becomes both a **mid-session review surface** (the designer
can ask to see it at any point — "show me what's changed so far") and part
of the **handoff artifact** alongside the full `.feature` file and the
implementation notes.

**Session lifecycle is strictly sequential, gated by sign-off.** One unit
has at most one live thread of work at a time:

1. Session opens → `dungeon_load_baseline` loads that unit's current
   canonical scenarios.
2. Designer works with the harness; `dungeon_get_changeset` is available
   throughout for "what have I changed so far" review.
3. Designer **signs off** — a deliberate close, not an autosave point — at
   which point `dungeon_write_feature`/`dungeon_write_changeset`/
   `dungeon_write_implementation_notes` produce the final handoff set.
4. Engineer's skill picks up the signed-off artifacts, scaffolds/updates the
   OpenSpec change, implements, archives — landing the change and updating
   canonical.
5. Only *after* that lands does a **new** session for that same unit open,
   loading the newly-updated canonical as its baseline.

No two sessions for the same unit overlap, and nothing the harness produces
mid-session is meant to be read by anyone else until sign-off. This is what
makes the "read-only, never touches an in-progress change" simplification
above safe rather than merely convenient.

## Archetype scope: start with today's existing units, on purpose

Decided: the first round of scenario work targets the **existing,
already-implemented** units — `melee`/`ranger`/`rogue`/`magic-user` and
their NPC counterparts, in today's simpler `UnitDef` shape (flat `maxHp`/
`movement.range`/`attack` — direction targeting, single/line/plus
propagation) — not the not-yet-built `fighter`/`rogue`/`ranger`/`mage`
archetype/turn-structure system from `unit-definition.md`.

This is knowingly **partially throwaway**: once the archetype system lands,
these units' data shape changes (`archetype`/`params`/`actions[]` instead
of a flat attack block), so their scenarios and step definitions will likely
need rewriting rather than just extending. Worth it anyway, because this
round is what actually proves the pipeline end-to-end while the domain is
as simple as it will ever be: harness board tools → Gherkin output →
engineer skill → OpenSpec change → `@amiceli/vitest-cucumber` step library
→ step catalog → next session reading that catalog back. Finding out the
loop has a rough edge is far cheaper against 4 simple existing units than
against the first archetype. It also seeds the step library with real,
working step definitions before the harder design work starts, rather than
standing up the whole pipeline and the archetype model at the same time.

Practical corollary: today's simpler targeting/propagation model needs a
much smaller board-preview interpreter than the full composable
`movement.md`/`attack.md` model — direction-based targeting, single/line/
plus footprints, plain range-based movement. Build only that much of the
local spec-interpreter for round one (see next section); grow it toward the
fuller model once scenario work moves onto the real archetype system.

## The game board: reimplemented locally, not imported

Unchanged from earlier drafts: the board the designer interacts with
(place units, preview a movement path, preview an attack's footprint) needs
its own math, implemented directly in dungeon-harness — scoped to whatever
subset of the `movement.md`/`attack.md` model the current round of
scenarios actually needs (see "Archetype scope" above) — not imported from
track-web. Once scenario work moves onto the not-yet-implemented archetype
system, there's no production-accurate engine to import from track-web even
if the boundary allowed it, so this stays true either way.

## Sketch: tool surface

- `dungeon_get_board_state` / `dungeon_preview_movement` /
  `dungeon_preview_attack` / `dungeon_place_unit` / `dungeon_set_terrain` —
  unchanged from earlier drafts; compose and sanity-check the board driving
  a scenario's Given steps, against the local spec-interpreter.
- `dungeon_load_baseline` — load a unit's current canonical `.feature`
  file(s) from the read-only track-web path as the session's fixed
  baseline (empty baseline for a new unit). Called once per session, before
  editing starts.
- `dungeon_read_feature` — parse a `.feature` file into the internal
  working model. Reads from the harness's own workspace (resuming a draft
  in progress) — not from track-web directly; that's what
  `dungeon_load_baseline` is for.
- `dungeon_read_step_catalog` — read the current step catalog from the
  read-only track-web path, to inform drafting.
- `dungeon_get_changeset` — diff the working model against the loaded
  baseline (structural, tag-keyed — see "Baseline and changeset" above) and
  return added/modified/removed scenarios, for the designer to review
  mid-session.
- `dungeon_write_feature` — render the working model to Gherkin, written
  **only** into the harness's own workspace.
- `dungeon_write_changeset` — write the current changeset (same content as
  `dungeon_get_changeset`) into the harness's own workspace, as the review
  artifact accompanying the `.feature` file at handoff.
- `dungeon_write_implementation_notes` — advisory suggestions, written
  **only** into the harness's own workspace. Never read back by
  `dungeon_read_feature`.

## Track-web side (separate work, not dungeon-harness's build)

1. **BDD tool: `@amiceli/vitest-cucumber`.** track-web already runs
   everything through Vitest (`vitest.config.mts`, no Jest, no existing
   Cucumber dependency — checked `package.json`, nothing there today), so
   this is the fit that doesn't add a second test runner: `.feature` files
   pair with a `*.spec.ts` that calls `loadFeature()`/`describeFeature()`
   and writes ordinary Vitest assertions for each Given/When/Then, running
   under the existing `npm test`. (Alternative considered: classic
   `@cucumber/cucumber` has a more built-in global step-registry/dry-run
   story, which would make step-catalog generation close to free — but it
   means a second CLI/runner alongside Vitest for comparatively little
   gain, since the catalog approach below sidesteps needing a step
   registry at all.)
2. **Placement, confirmed**: `client-games/src/games/dungeon-tactics-solo/features/`
   — following track-web's existing colocate-tests-with-source convention
   (`unitDefs.test.ts` sits beside `unitDefs.ts`), this is where the pure
   engine under test (`pc.ts`/`npc.ts`/`turn.ts`) actually lives, not the
   server-side schema mirror in `src/games/dungeon-tactics/`. This is the
   path `dungeon_load_baseline`/`dungeon_read_step_catalog` read from and
   what the engineer's skill's OpenSpec-change `features/` delta ultimately
   merges into on archive.
3. **Step catalog generator.** Simplest option, and the one to default to
   per "whatever's easiest to produce": derive it **mechanically from the
   canonical `.feature` files themselves** — walk the corpus, extract every
   unique Given/When/Then line, emit a flat list. This sidesteps needing
   any framework-level step-registry introspection (vitest-cucumber doesn't
   have a strong global-step-pattern story the way cucumber-js does) and
   stays trivially correct: "implemented steps" is exactly "step text that
   appears in the canonical tree," which is definitionally true once the
   delta/canonical split above is in place. Format: JSON (mechanical to
   diff and parse); a rendered Markdown view is a cheap add-on if a human
   wants to skim it, not a separate source of truth.
4. **The new engineer skill** (lives in track-web's `.claude/skills/`, not
   here — it's track-web work run by the engineer in Claude Code): reads
   the designer's finished `.feature` files + implementation notes from the
   harness's workspace, scaffolds an OpenSpec change (`proposal.md`/
   `design.md`/`tasks.md` per the usual `propose-change` shape), and writes
   the scenarios into that change's `features/` delta directory alongside
   hand-written or generated `specs/<capability>/spec.md` prose-requirement
   deltas. Implementation and step-definition writing proceed as normal
   OpenSpec `apply-change` work; `archive-change` is where canonical
   updates (both `specs/` and now `features/`) actually happen.

This is track-web's own OpenSpec change, independent of dungeon-harness's
build, but its shape (catalog format, `.feature` directory, the skill)
needs to be settled before `dungeon_read_step_catalog`/`dungeon_read_feature`
can be finalized — worth sequencing first or in lockstep.

## Open questions

Down to one real open question — everything else raised in earlier drafts
(canonical directory, step-catalog format, mid-review round-trip, archetype
scope for round one, scenario-id tagging as the matching strategy) is now
decided; see the relevant sections above.

- **Scenario-id tag adoption for pre-existing scenarios.** The stable-key
  tagging convention only works cleanly once every canonical scenario has
  one. Since round one is scoped to today's 4 existing units (see
  "Archetype scope" above), this is a small, bounded problem — those
  units' first-ever scenarios are being authored fresh anyway, so the tag
  can just be assigned at creation with no backfill needed. Only matters if
  scenario work ever needs to start from *pre-existing* `.feature` files
  that predate this harness — not expected to happen given round one starts
  the corpus from zero.

---

## Revision notes

This doc has pivoted three times as the actual boundary got clearer:

1. **First draft** assumed dungeon-harness needed `write`/`edit` access into
   track-web's game *code*, and proposed a `git worktree` + `file:`
   dependency to reuse track-web's engine functions for a scenario runner.
2. **Second draft** established the designer/engineer split: dungeon-harness
   never touches track-web code, only scenario files, self-contained
   workspace, locally-reimplemented board interpreter.
3. **Third draft** made Gherkin the sole canonical artifact and added the
   step-catalog/implementation-notes exchange, which brought back a
   narrowly-jailed *write* worktree into track-web for the `.feature`
   files themselves.
4. **Fourth draft** replaced that write worktree with the delta/canonical
   split borrowed from OpenSpec's own `changes/` vs. `specs/` model: the
   engineer's skill (not the harness) is what writes into track-web, as a
   reviewable OpenSpec change delta, merged to canonical only on archive.
   dungeon-harness ends up read-only toward track-web and fully
   self-contained on the write side — no worktree needed at all.
5. **Fifth draft** added session baselines and harness-owned changeset
   computation: a session loads the canonical baseline up front, and the
   harness — not track-web — diffs its working state against that baseline
   (structurally, keyed by a stable per-scenario tag rather than title) so
   both the designer and the engineer review *what changed*, not the whole
   file.
6. **This draft** closes out the remaining open questions: the `.feature`
   directory and BDD tool are confirmed, the session lifecycle is now
   explicitly sequential and sign-off-gated (which is what actually makes
   "harness never reads an in-progress change" safe, not just a v1
   shortcut), and round one is scoped to today's existing (non-archetype)
   units on purpose — a bounded, partially-throwaway pass that proves the
   whole pipeline and seeds the step library before the harder archetype
   design work starts.
7. **Post-draft phase split (08 → 08a/08b):** the original single phase 08
   routed all of round one — including the 4 existing units' first-ever
   scenarios — through a harness design session. But those units' behavior
   is already fully pinned down by `pc-archetypes`/`npc-archetypes`'s
   existing prose scenarios and the passing implementation; writing their
   `.feature` files is extraction/format-conversion, not a decision a
   designer session needs to make, and diffing against track-web's empty
   `.feature` baseline can only ever produce `added` classifications
   anyway. Split into 08a (agent-driven extraction, no harness session,
   seeds a real baseline) and 08b (the actual first live harness session,
   now diffing against 08a's real baseline instead of an empty one — which
   is what actually exercises `modified` classification for the first
   time). See `phases/phase-08a-trackweb-existing-unit-extraction.md` and
   `phases/phase-08b-trackweb-pipeline-proof.md`.
