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

# Phase 04 — track-web step catalog generator

**Repo:** `track-web`
**Depends on:** 02
**Parallel with:** 03, 05

**Status:** ✅ **Complete** — archived OpenSpec change `2026-08-16-dungeon-tactics-step-catalog`.
**Disposition:** **DELETE.** The catalog exists only to feed harness-side scenario drafting
(phase 06), which is being removed.

## Goal

Generate the catalog of implemented Gherkin steps that the harness reads
(phase 06) to draft scenarios that reuse existing step vocabulary instead
of inventing near-duplicates, and to flag which steps in a draft are
genuinely new.

## Decision carried over from `proposal.md`

Derive it **mechanically from the canonical `.feature` files themselves** —
walk `features/*.feature`, extract every unique Given/When/Then line, emit
a flat list. This sidesteps needing framework-level step-registry
introspection (`@amiceli/vitest-cucumber` doesn't have a strong global-step-
pattern story the way classic `@cucumber/cucumber` does) and stays
trivially correct: "implemented steps" is exactly "step text that appears
in the canonical tree," which is definitionally true once phase 06/07's
delta-vs-canonical split is in place. Format: **JSON** (mechanical to diff
and parse); a rendered Markdown view is a cheap optional add-on for human
skimming, never a separate source of truth.

## Concrete steps

- Small script, e.g. `client-games/scripts/generate-step-catalog.ts`, that
  walks `client-games/src/games/dungeon-tactics-solo/features/*.feature`,
  parses each (a lightweight Gherkin parser is enough — `@cucumber/gherkin`
  or whatever `@amiceli/vitest-cucumber` already uses internally), and
  extracts unique Given/When/Then step texts.
- Emit `client-games/src/games/dungeon-tactics-solo/features/
  steps-catalog.json` — flat list, optionally grouped by Given/When/Then.
- Wire as an npm script (`generate:step-catalog` or similar). Decide
  whether it runs manually, as a pre-test hook, or gets a staleness check
  in CI — default to manual/on-demand for v1, the cheapest option, per
  `proposal.md`'s cost-consciousness; upgrade later if the catalog drifts
  from reality in practice.
- Regenerate against phase 02's proof-of-wiring example scenario to confirm
  it produces a real, non-empty catalog end-to-end.

## Deliverable

A `steps-catalog.json` that accurately reflects whatever currently exists
in `features/`, regeneratable on demand.

## Suggested OpenSpec capability

Small enough to fold into phase 02's `dungeon-tactics-gherkin-runner`
change as an added requirement — or its own `dungeon-tactics-step-catalog`
capability if phase 02 is already sizable by the time this is scoped.
Decide at scoping time.
