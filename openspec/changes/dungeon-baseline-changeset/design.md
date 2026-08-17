## Context

See proposal.md for motivation. Relevant existing shape (`dungeon-harness-server/src`):

- `gherkin/model.ts`/`parse.ts`/`render.ts`/`slug.ts`: a `WorkingFeature` tree
  (name + scenarios, each scenario a `scenarioId`/title/steps list).
  `parseFeature` already assigns every scenario a `scenarioId` — from its
  `@scenario-id:` tag if present, otherwise a slugified-title fallback
  (deduped) — so **every parsed scenario already has a stable key, tagged or
  not**. This means proposal.md's "title-matching is a fallback" case
  doesn't need separate handling in the diff engine: matching is always
  "compare by `scenarioId`," full stop. The known accepted gap (a pre-tag
  scenario whose title changes gets a new derived id, diffing as
  removed+added instead of modified) is explicitly out of scope per
  proposal.md — round one's scenarios are all authored fresh, so nothing
  hits this path.
- `pi-extensions/scenario-bridge.ts`: workspace-local `dungeon_read_feature`/
  `dungeon_write_feature`/`dungeon_write_implementation_notes`. These tools
  are **stateless** — the agent passes the full `WorkingFeature` object as a
  tool parameter on every write; the server never holds a scenario's
  in-progress state between calls.
- `pi-extensions/board-bridge.ts`: the one precedent for genuine per-session
  server-held state (`BoardStore`, instantiated in `session-store.ts`,
  closed over by the extension factory).
- `session-store.ts`: `CUSTOM_TOOL_NAMES` is an explicit allowlist passed to
  `createAgentSession({ tools })` — registering a tool via `pi.registerTool`
  without adding its name here means the agent never sees it.
- No track-web filesystem access exists anywhere in the harness yet — this
  change adds the first read-only cross-repo path.

## Goals / Non-Goals

**Goals:**
- Load a unit's canonical baseline once per session and diff the designer's
  working state against it, at any point, on request.
- Tolerate track-web's canonical corpus and step catalog not existing yet
  (phase 02/04 haven't landed there) without erroring.
- Keep the read-only path's trust boundary independent of the existing
  workspace write jail (`scenario-bridge.ts`/`permission-gate.ts`) — it's a
  different root, different direction (read vs. write), different risk.

**Non-Goals:**
- No write access into track-web (unchanged from proposal.md — the engineer
  pulls from the harness's workspace, the harness never pushes).
- No session-lock/enforcement machinery for the sign-off sequencing rule —
  convention/prompting only, per proposal.md and the phase doc.
- No handling for a unit's scenarios spanning multiple canonical files (see
  Decisions — one file per unit is round one's convention).
- No step-level semantic diff beyond sequence alignment (e.g. no
  "step reworded but means the same thing" detection) — pure structural
  equality on keyword+text.

## Decisions

**One canonical file per unit, named `<unit>.feature`.** proposal.md says
"file(s)" without pinning this down. Round one's scope (proposal.md's
"Archetype scope") is exactly the 4 existing player units — melee, rogue,
ranger, magic-user — each a self-contained `UnitDef`. A single
`<unit>.feature` per unit is the simplest convention that matches that
shape and how phase 08 is expected to seed the corpus. `dungeon_load_baseline`
therefore takes a `unit` enum parameter restricted to those 4 slugs (the
same player-controlled subset of `board-bridge.ts`'s `ARCHETYPES`), not a
free-form path — this doubles as the path-safety mechanism (see next
decision) and avoids inventing a manifest format for a one-file case. If a
unit's scenarios ever need to span multiple files, extending this to a glob
is a small follow-up, not a redesign.

**Read-only access is an allowlisted enum, not a jail check.** Unlike
`scenario-bridge.ts` (arbitrary workspace-relative paths, needs a real path-
jail), `dungeon_load_baseline`'s only input is the 4-value `unit` enum,
server-side-mapped to `<TRACKWEB_FEATURES_DIR>/<unit>.feature` — there's no
user-suppliable path component, so path traversal isn't reachable and no
jail logic is needed for it. `dungeon_read_step_catalog` takes no
parameters at all (fixed configured path). This is a deliberately narrower
mechanism than a jail, not a missed case: the only free-form path in this
change is the *output* side (`dungeon_write_changeset`'s workspace path),
which reuses `scenario-bridge.ts`'s existing jail pattern unchanged.

**One env var, catalog path derived from it.** `DUNGEON_TRACKWEB_FEATURES_DIR`
(optional, unset by default), mirroring `DUNGEON_WORKSPACE_DIR`'s
optional/defaulted style in `env.ts`. `steps-catalog.json` is read from
`join(DUNGEON_TRACKWEB_FEATURES_DIR, 'steps-catalog.json')` rather than a
second env var — phase 04's doc places the catalog inside the same
`features/` directory it catalogs, so deriving the path keeps one knob
instead of two that could drift apart. When the env var is unset, or the
directory/file it points to doesn't exist, both `dungeon_load_baseline` and
`dungeon_read_step_catalog` return an empty result rather than erroring —
this is the expected steady state until track-web's phase 02/04 land.

**Baseline state lives in the extension closure, not a new store class.**
`BoardStore` exists as a separate class because the board's state is also
consumed elsewhere (WebSocket broadcast to the UI for live rendering).
Baseline text has no comparable second consumer — only the diff tools need
it — so it's simpler to hold `{ unit, baseline: WorkingFeature }` as a
closure variable inside a new `createBaselineBridgeExtension`, the same way
`permission-gate.ts` closes over `approvedThisTurn`. `dungeon_load_baseline`
sets it (once per session, per the phase doc); if a diff tool is called
before any load, the closure's default (`{ unit: null, baseline: empty
Feature }`) makes every scenario in the working model read as "added,"
matching the documented empty-baseline behavior for a brand-new unit rather
than a special-cased error.

**Diff tools take the working `Feature` as an explicit parameter, mirroring
`dungeon_write_feature`.** The server never holds "the current working
state" — the agent supplies it fresh on every call, exactly like
`dungeon_write_feature`'s existing `feature: WorkingFeatureSchema` parameter.
`dungeon_get_changeset` and `dungeon_write_changeset` both take the same
shape. This keeps exactly one new piece of server-held session state
(the baseline) instead of two, and stays consistent with the rest of
`scenario-bridge.ts`'s stateless-per-call style.

**Scenario diff: match by `scenarioId`, classify added/modified/removed.**
For a `scenarioId` present in both baseline and working, compare title and
steps; any difference (including title-only) marks it `modified` and
includes what changed. For a `scenarioId` only in working, `added`; only in
baseline, `removed`. `unchanged` scenarios are still listed by id (needed
for "what have I changed" to be a complete picture, not just a delta list)
but carry no detail payload.

**Step diff within a modified scenario: sequence alignment (LCS), not
positional or identity-based.** Steps have no stable per-step id (only
scenarios do), so matching them needs a real sequence diff — the same
approach a text-line diff uses — comparing `(keyword, text)` pairs and
classifying each step as unchanged/added/removed relative to its aligned
position. Positional (index-by-index) comparison was considered and
rejected: inserting one step near the top would make every later step look
"modified" even though only one line actually changed.

**New extension file, not an addition to `scenario-bridge.ts`.** The read-
only track-web path and the workspace path are different trust boundaries
with different validation (enum-mapped vs. jail-checked) and different
lifecycles (baseline load-once vs. read/write-per-call) — keeping them in
`pi-extensions/baseline-bridge.ts` mirrors how `board-bridge.ts` is already
separate from `scenario-bridge.ts` for the same kind of reason (distinct
concern, own per-session state).

**Diff engine as its own module, `gherkin/diff.ts`.** Pure function,
independently unit-testable (round-trip-test-style, per the existing
`gherkin/round-trip.test.ts` precedent), taking two `WorkingFeature`s and
returning the changeset — no server/tool concerns leak into it.

## Risks / Trade-offs

- **Silent staleness if `DUNGEON_TRACKWEB_FEATURES_DIR` is misconfigured**
  (points at the wrong directory, or a typo) → every session sees an empty
  baseline and no catalog, indistinguishable from "track-web genuinely has
  nothing yet." Mitigated by: `dungeon_load_baseline`'s tool result always
  states explicitly whether it found a file or is returning an empty
  baseline, so the designer/engineer can notice unexpected emptiness rather
  than it failing silently. No stronger check (e.g. requiring the dir to
  exist at startup) since an absent dir is the *expected* case today, not a
  misconfiguration signal by itself.
- **One-file-per-unit convention could be wrong** if track-web's phase
  02 lands with a different `features/` layout (e.g. one file per
  scenario) → `dungeon_load_baseline`'s unit→filename mapping is centralized
  in one place in `baseline-bridge.ts`, so adapting it later is a small,
  contained change, not a redesign.
- **LCS step diff can occasionally misalign** on scenarios with several
  near-duplicate steps (e.g. two consecutive `Given` lines that differ only
  in a number) → acceptable for round one's review-surface use case (the
  designer sees the full modified scenario alongside the diff, not just the
  diff in isolation), and no round-one scenario content exists yet to
  stress this.

## Open Questions

None — proposal.md's one open question (scenario-id tag adoption for
pre-existing scenarios) is out of scope for round one per its own text, and
this design resolves the filename-convention and empty-baseline questions
the phase doc left open.
