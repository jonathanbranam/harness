> # ⛔ STOPPED — superseded work, do not implement
>
> **This plan is stopped and is being backed out** (2026-08-18). The
> Gherkin-authoring dungeon-harness approach it belongs to put the LLM in
> the referee's chair for game rules, and the harness was never usable as a
> design tool. See [`../STATUS.md`](../STATUS.md) for why, what landed, and
> what happens to each piece, and [`../backout-plan.md`](../backout-plan.md)
> for the removal plan.
>
> Replacement direction — **still being evaluated, not approved**: a shared
> rules engine with a declarative unit language
> ([`../turn-machines/README.md`](../turn-machines/README.md)), plus a
> ground-up harness rebuild around live multi-scenario simulation.
>
> Kept for historical context only. The **Status** line below records what
> actually landed before the stop.

# Phase 07 — track-web engineer skill: scenario → OpenSpec change

**Repo:** `track-web`
**Depends on:** 02 (hard); 06 (recommended — see note below)
**Blocks:** 08a

**Status:** ✅ **Complete** — archived OpenSpec change `2026-08-16-dungeon-tactics-engineer-skill`
(skill `scenario-to-change` in `track-web/.claude/skills/`).
**Disposition:** **DELETE.** It consumes a handoff bundle that will no longer be produced.

## Goal

The skill you described: used by the engineer, within Claude Code, in
track-web, to turn a signed-off scenario handoff (`.feature` files +
changeset + implementation notes, from the harness's workspace) into a
proper OpenSpec change.

**On the "recommended" dependency on phase 06:** this skill can be drafted
directly against the artifact shapes already fixed in `proposal.md`
(`.feature` + changeset + implementation notes) without phase 06's code
existing yet. But verifying it end-to-end needs a real handoff bundle,
which only phase 06 produces — sequence this after 06 unless there's a
specific reason to parallelize the drafting.

## Decision carried over from `proposal.md`

Per `proposal.md`'s "Delta vs. canonical" section: the skill reads the
handoff bundle and:

1. Scaffolds an OpenSpec change (`proposal.md`/`design.md`/`tasks.md`, per
   the usual `propose-change` shape).
2. Writes the scenarios into that change's own
   `openspec/changes/<change-id>/features/` delta directory.
3. Derives the change's `specs/<capability>/spec.md` prose-requirement
   delta's `ADDED`/`MODIFIED`/`REMOVED Requirements` **directly from the
   changeset's own added/modified/removed classification** — the two
   vocabularies were deliberately kept close (`proposal.md`'s "Baseline and
   changeset" section) so this is closer to a format conversion than fresh
   authoring.

This gives one OpenSpec change carrying both the human-readable requirement
delta and the literal, executable scenario delta together — the same
pattern `deck-harness-scaffold` already used for its own specs (see
`openspec/changes/archive/2026-08-15-deck-harness-scaffold/specs/
harness-auth/spec.md` for the ADDED-Requirements/Scenario format to match).

## Concrete steps

- New skill under `track-web/.claude/skills/` (e.g.
  `scenario-to-change/SKILL.md`), following this repo's own
  skill-authoring conventions (see the `skill-creator` skill).
- Input: a path to the harness's handoff bundle (copied, or pointed to
  directly, from `dungeon-harness-server/data/workspace/...`).
- Behavior:
  - Parse the changeset.
  - Draft `proposal.md`/`design.md`, using the implementation notes as
    supplementary context (e.g. surfacing suggested step consolidation as
    a design-doc callout, not silently applying it).
  - Copy the `.feature` files into the new change's `features/` delta
    directory.
  - Generate the `specs/<capability>/spec.md` delta's Requirement/Scenario
    blocks from the changeset's added/modified/removed entries.
  - Produce `tasks.md` stubs for implementing the corresponding
    `@amiceli/vitest-cucumber` step definitions.
- After the skill runs, normal `apply-change` → `archive-change` OpenSpec
  workflow takes over. `archive-change` is what actually merges
  `features/*.feature` into the canonical tree (per `proposal.md`'s merge
  point) — wire it (or a follow-up manual step, if not worth automating
  yet) to also trigger phase 04's step-catalog regeneration.

## Deliverable

Given a real handoff bundle from phase 06, running the skill produces a
reviewable, implementable OpenSpec change with both the prose delta and the
executable Gherkin delta already in place.

## Suggested OpenSpec capability

N/A directly — this is a skill, not a spec'd runtime capability. Could
still be scoped as its own small OpenSpec change describing the skill's
expected behavior, consistent with everything else in this plan being
spec-driven, if that consistency is worth it to you.
