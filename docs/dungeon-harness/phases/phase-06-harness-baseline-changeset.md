# Phase 06 — Harness baseline, changeset & read-only track-web access

**Repo:** `harness`
**Depends on:** 05 (harness); 02 and 04 (track-web, cross-repo)
**Blocks:** 07 (recommended), 08

## Goal

The core mechanism that makes handoff reviewable: read-only track-web
access, session baselines, and the structural changeset diff, per
`proposal.md`'s "Delta vs. canonical" and "Baseline and changeset"
sections. This is the first point the two repos actually have to converge.

## Decisions carried over from `proposal.md`

- **Read-only, no worktree.** The canonical `.feature` corpus and step
  catalog only change when a track-web OpenSpec change archives (phase 07's
  merge point) — infrequent and always deliberate, so there's no
  collision/corruption risk to guard against the way there would be for a
  live write path. A configured read-only path straight into the real
  track-web checkout's `client-games/src/games/dungeon-tactics-solo/
  features/` (and its `steps-catalog.json`) is enough — no worktree, no
  branch, no second checkout.
- **Sessions start from the canonical baseline.** Opening a design session
  for an existing unit loads that unit's current canonical `.feature`
  file(s) as a fixed baseline, held separately from the working copy the
  designer edits. A new unit starts from an empty baseline.
- **Diff at the structured level, keyed by `@scenario-id`.** Compare parsed
  scenario/step objects (phase 05's model), not rendered text. Classify
  each scenario as added/modified/removed relative to baseline; for a
  modified scenario, which steps changed. Match by the `@scenario-id` tag
  from phase 05; title-matching is a fallback not expected to matter for
  round one (phase 08 starts the `.feature` corpus from zero, so nothing
  predates the tagging convention).
- **Session lifecycle is strictly sequential, gated by sign-off.** One unit
  has at most one live thread of work: load baseline → work (changeset
  available throughout for review) → deliberate sign-off produces the
  final handoff set → engineer's skill (phase 07) picks it up → implement →
  archive → **only then** does a new session for that unit open, loading
  the newly-landed canonical. No session ever needs to read an
  in-progress, not-yet-archived change.

## Concrete steps

- Configure a read-only path (env var) from `dungeon-harness-server` to the
  real track-web checkout's `features/` directory and `steps-catalog.json`.
- `dungeon_load_baseline`: load a unit's current canonical `.feature`
  file(s) from that path into a baseline held apart from the working model
  (empty baseline if none exist — the expected case for phase 08's first
  units). Call once per session, before editing starts.
- `dungeon_read_step_catalog`: read `steps-catalog.json` from the read-only
  path.
- Structural diff engine: baseline vs. working model, tag-keyed, producing
  added/modified/removed classification down to the step level for
  modified scenarios.
- `dungeon_get_changeset` (mid-session review) / `dungeon_write_changeset`
  (handoff artifact) tools.
- Sign-off flow: a deliberate action (not an autosave point) that finalizes
  `dungeon_write_feature` + `dungeon_write_changeset` +
  `dungeon_write_implementation_notes` output as the handoff bundle.
  Enforce, at least by convention/prompting, that a new session for the
  same unit doesn't open until that unit's prior handoff has actually
  landed in track-web.

## Deliverable

Reopening a session on a unit that already has canonical scenarios loads
them as baseline. Mid-session, the designer can ask "what have I changed"
and get an accurate added/modified/removed list. Sign-off produces a clean
handoff bundle (`.feature` + changeset + notes) in the harness's own
workspace, ready for phase 07's skill to consume.

## Suggested OpenSpec capability

`dungeon-baseline-changeset`.
