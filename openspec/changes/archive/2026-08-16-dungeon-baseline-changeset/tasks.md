## 1. Config

- [x] 1.1 Add optional `DUNGEON_TRACKWEB_FEATURES_DIR` to `dungeon-harness-server/src/env.ts` (unset by default, no `requireEnv` — mirrors `DUNGEON_WORKSPACE_DIR`'s optional style).
- [x] 1.2 Document `DUNGEON_TRACKWEB_FEATURES_DIR` in `dungeon-harness-server/.env.example`, noting it points at track-web's `client-games/src/games/dungeon-tactics-solo/features/` directory, that `steps-catalog.json` is read from inside it, and that it's fine to leave unset or point at a directory that doesn't exist yet (empty baseline/catalog is the expected round-one state).

## 2. Diff engine

- [x] 2.1 Add `dungeon-harness-server/src/gherkin/diff.ts`: a pure function taking a baseline `WorkingFeature` and a working `WorkingFeature`, matching scenarios by `scenarioId`, and returning a changeset classifying each scenario as added/removed/modified/unchanged.
- [x] 2.2 Within a modified scenario, diff its steps via sequence alignment (LCS over `(keyword, text)` pairs) and report which steps were added/removed, per design.md's "Step diff within a modified scenario" decision.
- [x] 2.3 Add `dungeon-harness-server/src/gherkin/diff.test.ts` covering: added scenario, removed scenario, modified scenario (title-only change, step-only change, both), unchanged scenario, and an empty-baseline case where every working scenario comes back added.

## 3. Read-only track-web access + baseline/changeset tools

- [x] 3.1 Add `dungeon-harness-server/src/pi-extensions/baseline-bridge.ts` as a per-session extension factory (`createBaselineBridgeExtension`), taking the configured `trackWebFeaturesDir` (possibly undefined) and closing over `{ unit, baseline }` session state, per design.md's "Baseline state lives in the extension closure" decision.
- [x] 3.2 Register `dungeon_load_baseline`: parameter is a unit enum (`melee`, `rogue`, `ranger`, `magic-user`); reads `<trackWebFeaturesDir>/<unit>.feature` via `parseFeature` if it exists, else sets an empty baseline; tool result states explicitly whether a file was found or the baseline is empty (design.md's staleness-visibility mitigation). Handles `trackWebFeaturesDir` being undefined the same as the file not existing.
- [x] 3.3 Register `dungeon_read_step_catalog`: no parameters; reads `<trackWebFeaturesDir>/steps-catalog.json` if it exists, else returns an empty catalog. Handles `trackWebFeaturesDir` being undefined the same as the file not existing.
- [x] 3.4 Register `dungeon_get_changeset`: parameter is the working `Feature` (same `WorkingFeatureSchema` shape `dungeon_write_feature` already uses); runs the diff engine (2.1) against the session's currently loaded baseline and returns the changeset.
- [x] 3.5 Register `dungeon_write_changeset`: parameters are the working `Feature` and a workspace-relative target path; reuses `scenario-bridge.ts`'s existing jail-check/`writeFileEnsuringDir` pattern for the output path, computes the changeset the same way as 3.4, and writes it (JSON) to that path.
- [x] 3.6 Add unit/integration coverage for `baseline-bridge.ts`'s tool handlers: existing-unit baseline load, missing-file baseline load, missing-configured-dir baseline load, step catalog present/absent, changeset tools against a loaded baseline and against the default empty baseline, and `dungeon_write_changeset`'s path-jail rejection — mirroring `board-bridge.test.ts`/`permission-gate.test.ts`'s existing test style.

## 4. Wiring

- [x] 4.1 In `dungeon-harness-server/src/session-store.ts`: instantiate `createBaselineBridgeExtension` alongside the other per-session extension factories, passing `env.DUNGEON_TRACKWEB_FEATURES_DIR`.
- [x] 4.2 In the same file, add `dungeon_load_baseline`, `dungeon_read_step_catalog`, `dungeon_get_changeset`, `dungeon_write_changeset` to `CUSTOM_TOOL_NAMES` — per the tasks rule, a tool registered via `pi.registerTool` but missing from this allowlist is silently unavailable to the agent.

## 5. Verification

- [x] 5.1 Run `npm run typecheck` and `npm test` (dungeon-harness-server workspace) and confirm they pass.
- [x] 5.2 Manually exercise the new tools against the running dev instance (per CLAUDE.md's playwright-cli guidance): with `DUNGEON_TRACKWEB_FEATURES_DIR` unset, confirm `dungeon_load_baseline`/`dungeon_read_step_catalog` return empty results rather than erroring; then point it at a scratch directory containing a hand-written `melee.feature` and confirm the baseline loads and `dungeon_get_changeset` reflects edits made in chat.
