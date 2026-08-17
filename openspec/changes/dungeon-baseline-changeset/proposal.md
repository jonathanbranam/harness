## Why

Per `docs/dungeon-harness/proposal.md`'s "Baseline and changeset" section, a
design session for an existing unit shouldn't start from a blank page, and
its output shouldn't be "here is the whole rewritten file, good luck
spotting what changed." dungeon-harness-server currently has no way to read
track-web's canonical `.feature` corpus at all (phase 05 only built
workspace-local read/write), so every session is effectively a new-unit
session, and there is no way for a designer to review what they changed
against what already exists. This is the mechanism that makes handoff to
the engineer reviewable — the first point the harness and track-web
actually have to converge.

## What Changes

- Add a read-only env-configured path from `dungeon-harness-server` to
  track-web's canonical `client-games/src/games/dungeon-tactics-solo/
  features/` directory and its `steps-catalog.json`, mirroring
  `DUNGEON_WORKSPACE_DIR`'s pattern in `src/env.ts`. Treated as optional:
  track-web has not yet built the phase-02/04 work that produces these
  paths (no `features/` directory or `steps-catalog.json` exist there
  today), so a missing directory/file at the configured path is not an
  error — it means zero canonical scenarios / an empty catalog, which is
  the expected starting state for round one's first units.
- `dungeon_load_baseline`: load a unit's current canonical `.feature` file
  from the read-only path into a baseline held apart from the working
  model. Empty baseline if the file doesn't exist. Called once per session,
  before editing starts.
- `dungeon_read_step_catalog`: read `steps-catalog.json` from the read-only
  path. Empty catalog if the file doesn't exist.
- Structural diff engine: compares the working model against the loaded
  baseline at the parsed scenario/step level (not rendered text), keyed by
  each scenario's `@scenario-id` tag (already assigned by phase 05's
  parser), classifying each scenario as added/modified/removed, and for a
  modified scenario, which steps changed.
- `dungeon_get_changeset`: run the diff on demand for mid-session review
  ("what have I changed so far").
- `dungeon_write_changeset`: write the current changeset to the harness's
  own workspace as a handoff artifact, alongside `dungeon_write_feature`'s
  `.feature` output and `dungeon_write_implementation_notes`'s notes.
- Sign-off is a workflow convention, not new machinery: prompting/docs make
  clear that a new session for a unit should only open after that unit's
  prior handoff has actually landed in track-web (archived there). No
  session-locking mechanism is introduced in this change.

## Capabilities

### New Capabilities

- `dungeon-baseline-changeset`: session baseline loading from track-web's
  read-only canonical `.feature`/step-catalog path, and the structural
  added/modified/removed changeset diff between that baseline and the
  session's working model.

### Modified Capabilities

(none — `dungeon-scenario-authoring` (workspace-local read/write) and
`dungeon-tool-permission-gate` (path jails) are unchanged in their existing
requirements; this change only adds new tools and a new read-only jail
alongside them.)

## Impact

- `dungeon-harness-server/src/env.ts`: new optional env vars for the
  read-only track-web path(s).
- `dungeon-harness-server/src/pi-extensions/`: new extension (or an
  extension to `scenario-bridge.ts`) registering
  `dungeon_load_baseline`/`dungeon_read_step_catalog`/
  `dungeon_get_changeset`/`dungeon_write_changeset`, each needing its own
  read-only-path jail check distinct from the existing workspace write
  jail.
- `dungeon-harness-server/src/gherkin/`: a new diff module comparing two
  `WorkingFeature` models.
- `dungeon-harness-server/src/session-store.ts`: add the four new tool
  names to `CUSTOM_TOOL_NAMES` or the session is created but the agent
  never sees the tools.
- `.env.example`: document the new env var(s).
- No changes to track-web in this change — it's read-only and tolerant of
  track-web's phase-02/04 work not having landed yet.
