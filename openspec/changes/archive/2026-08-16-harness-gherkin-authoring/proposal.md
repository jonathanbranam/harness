## Why

`dungeon-harness-server` (scaffolded in `dungeon-harness-scaffold`) has an
`AgentSession` and a chat UI but no way for the designer to actually author
scenario specs — no Gherkin model, no tools to read or write a `.feature`
file. Phase 05 of `docs/dungeon-harness/proposal.md` gives it a real
internal Gherkin model (parse `.feature` text in, render it back out) plus
the write-side tools that operate entirely within the harness's own
workspace, so a designer can build up a Feature's Scenarios in a session,
have them written as real Gherkin, and reload them correctly in a later
session. This phase deliberately excludes any track-web access (read-only
baseline loading, step catalog, changeset diffing) — that's phase 06; here
the harness only needs to round-trip its own workspace files faithfully.

## What Changes

- Add a Gherkin parser dependency to `dungeon-harness-server`
  (`@cucumber/gherkin` + `@cucumber/messages`).
- Add an internal working model: TS types for a parsed Feature/Scenario/Step
  tree, plus a renderer back to Gherkin text. A round-trip (parse → internal
  model → render → re-parse) of harness-produced content must be stable —
  no drift from re-rendering.
- Add stable per-scenario identity: every `Scenario` gets a
  `@scenario-id:<slug>` Gherkin tag, generated once when the scenario is
  first created in the working model and left untouched by later
  title/step edits.
- Register three new pi tools in `pi-extensions/scenario-bridge.ts`,
  jailed to `dungeon-harness-server`'s own workspace (same sandboxing model
  as `write`/`edit`, see `dungeon-tool-permission-gate`):
  - `dungeon_read_feature` — parse a `.feature` file from the workspace
    into the working model.
  - `dungeon_write_feature` — render the working model to Gherkin text,
    written only into the workspace.
  - `dungeon_write_implementation_notes` — write advisory
    step-consolidation/refactor suggestions, workspace-local, never read
    back by `dungeon_read_feature`.
- Add the new tools to `dungeon-harness-server`'s `session-store.ts` tool
  allowlist (see CLAUDE.md: a registered tool not on the allowlist is
  silently unavailable to the agent).
- No track-web filesystem access anywhere in this phase — `dungeon_load_baseline`,
  `dungeon_read_step_catalog`, and changeset diffing are phase 06.

## Capabilities

### New Capabilities
- `dungeon-scenario-authoring`: the internal Gherkin Feature/Scenario/Step
  model, its parser and renderer (round-trip stability, scenario-id tag
  assignment), and the `dungeon_read_feature` / `dungeon_write_feature` /
  `dungeon_write_implementation_notes` tools that operate on it within the
  harness's own workspace.

### Modified Capabilities
- `dungeon-agent-session`: the existing requirement "No dungeon-tactics
  tools registered" no longer holds once this change registers
  `dungeon_read_feature`/`dungeon_write_feature`/
  `dungeon_write_implementation_notes` — replaced with a requirement that
  only Gherkin-authoring tools are registered (still no board/track-web
  tools, which land in later phases).

## Impact

- **Affected code**: `dungeon-harness-server/package.json` (new
  dependency), new `dungeon-harness-server/src/gherkin/` (or similar)
  module for the model/parser/renderer, new
  `dungeon-harness-server/src/pi-extensions/scenario-bridge.ts`,
  `dungeon-harness-server/src/session-store.ts` (tool allowlist).
- **Workspace**: reads/writes land under
  `dungeon-harness-server`'s agent workspace only (see
  `dungeon-tool-permission-gate` for the existing path-jail model these new
  tools must also respect); no track-web paths touched.
- **Dependencies**: `@cucumber/gherkin`, `@cucumber/messages` added to
  `dungeon-harness-server`.
- **Tests**: round-trip parse/render stability test; scenario-id tag
  assignment/stability test.
