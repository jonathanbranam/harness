# Phase 08b — track-web pipeline proof (real harness session against a real baseline)

**Repo:** `track-web` (+ harness, converging)
**Depends on:** harness repo's phases 01–07; this repo's phases 02, 04, 07,
**08a** (hard — needs the non-empty baseline/catalog 08a produces)
**Blocks:** nothing — payoff phase

## Goal

The end-to-end proof the original phase 08 was after: a real harness design
session — board tools, chat-driven authoring, sign-off — flowing through
phase 07's skill into an implemented, archived OpenSpec change, with the
step catalog regenerating and the *next* session correctly reading it back.
Split out from 08a because this needs a genuine designer session (something
to decide, preview, and sign off on), not extraction.

## Why this is a better test than the original phase 08 draft

The original phase 08 planned to diff every one of the 4 units' first-ever
scenarios against an empty baseline — which, per the changeset schema,
could only ever produce `added` classifications. `modified`/`removed`
handling would never be exercised by round one at all. Sequencing 08b after
08a fixes that: 08a leaves a real, non-empty canonical `.feature` corpus
behind, so 08b's session loads real baseline content via
`dungeon_load_baseline`, and a genuine edit (below) produces a `modified`
(or `added`, for a genuinely new scenario) entry diffed against real prior
text — the case that actually matters for round two and beyond.

## Concrete steps

- Pick one (or a small number) of the 4 units 08a already landed.
- Open a real dungeon-harness design session: `dungeon_load_baseline` loads
  that unit's now-real canonical `.feature` (not empty).
- Make an actual design decision via chat + board preview
  (`dungeon_preview_movement`/`dungeon_preview_attack`) — e.g. add an
  edge-case scenario (attack at max range, movement blocked by terrain/
  units) that 08a's extraction pass didn't already cover, or refine an
  existing scenario's wording.
- Mid-session, confirm `dungeon_get_changeset` correctly classifies the
  change against the real baseline (not trivially all-`added`).
- Sign off, producing a real handoff bundle — the first time phase 07's
  skill runs against a harness-produced bundle rather than 08a's hand-built
  one.
- Run phase 07's `scenario-to-change` skill → `apply-change` → implement the
  new/changed step definitions → `npm test` green → `archive-change`.
- Regenerate the step catalog (phase 04).
- Open a **new** session for that unit and confirm `dungeon_read_step_catalog`
  sees the newly-landed steps — the original phase 08's "next session reads
  the catalog back" proof point.

## Deliverable

At least one unit has been round-tripped through the full pipeline for
real — harness board tools → designer session → sign-off → phase 07's skill
→ implementation → archive → step-catalog regeneration → next session
reading it back — against a genuine non-empty baseline, proving the design
holds up in practice for both the first-scenario case (08a) and the
ongoing-revision case (08b).

## Suggested OpenSpec capability

Same as 08a's target unit(s) — `MODIFIED Requirements` against the relevant
`pc-archetypes` Requirement, produced this time via a real harness handoff
rather than direct extraction.
