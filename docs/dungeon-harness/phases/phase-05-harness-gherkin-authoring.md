# Phase 05 — Harness Gherkin authoring core

**Repo:** `harness`
**Depends on:** 01
**Parallel with:** 02, 03, 04
**Status:** ✅ Implemented — `openspec/changes/harness-gherkin-authoring`

## Goal

Give the harness a real internal Gherkin model — parse `.feature` text in,
render it back out — plus the write-side tools that operate entirely
within the harness's own workspace. No track-web access in this phase;
that's phase 06.

## Decisions carried over from `proposal.md`

- **Gherkin `.feature` files are the sole canonical artifact.** The
  harness's internal structured model is a derived working cache, never
  exported as its own format, never handed off directly.
- **Diff at the structured level, not raw text** (needed by phase 06, but
  the representation choice is made here): the internal model must be a
  real parsed tree, not just stored text, so a later structural diff
  doesn't get noise from harmless re-rendering (whitespace, comment
  placement).
- **Stable per-scenario identity.** Every `Scenario` gets a
  `@scenario-id:<slug>` Gherkin tag, assigned once at creation and never
  regenerated on edit — the key phase 06's diff will match on. Tags are
  inert to `@amiceli/vitest-cucumber` execution and to phase 04's
  mechanical step-catalog extraction (which only reads Given/When/Then
  lines), so this needs no track-web-side accommodation.

## Concrete steps

- [x] Add a Gherkin parser dependency to `dungeon-harness-server` — the
  standard AST-producing libraries (`@cucumber/gherkin` +
  `@cucumber/messages`) are the natural choice.
- [x] Internal working model: a TS type for a parsed Feature/Scenario/Step
  tree, plus a renderer back to Gherkin text. Round-trip test: parse →
  internal model → render → re-parse should be stable (no drift) for
  content the harness itself produced.
- [x] Scenario-id tag assignment: generate a stable slug when a new `Scenario`
  is created in the working model; leave it untouched on later title/step
  edits.
- [x] `pi-extensions/scenario-bridge.ts`: register
  - `dungeon_read_feature` — parse a `.feature` file from the harness's
    own workspace into the working model.
  - `dungeon_write_feature` — render the working model to Gherkin, written
    **only** into the harness's own workspace.
  - `dungeon_write_implementation_notes` — advisory suggestions
    (step-consolidation/refactor ideas), also workspace-local, never read
    back by `dungeon_read_feature`.
- [x] No track-web filesystem access anywhere in this phase.

## Deliverable

- [x] Within a single session, the designer builds up a Feature's Scenarios via
  chat, has them written as real Gherkin in the harness's workspace,
  closes the session, reopens it, and `dungeon_read_feature` correctly
  reloads exactly what was written. (Verified live against the running dev
  instance; board (phase 03) is a separate, not-yet-integrated input into
  scenario authoring — this phase's tools operate standalone via chat.)

## Suggested OpenSpec capability

`dungeon-scenario-authoring`.
