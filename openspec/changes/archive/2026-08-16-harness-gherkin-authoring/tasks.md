## 1. Dependencies and internal model

- [x] 1.1 Add `@cucumber/gherkin` and `@cucumber/messages` as dependencies of `dungeon-harness-server`.
- [x] 1.2 Add `dungeon-harness-server/src/gherkin/model.ts` defining `WorkingStep { keyword: 'Given'|'When'|'Then'|'And'|'But', text: string }`, `WorkingScenario { scenarioId: string, title: string, steps: WorkingStep[] }`, `WorkingFeature { name: string, scenarios: WorkingScenario[] }` (per design.md's "Internal model is a translation target" decision).
- [x] 1.3 Add `dungeon-harness-server/src/gherkin/slug.ts` with a `slugify(title: string): string` helper (lowercase, non-alphanumeric runs → `-`, trimmed of leading/trailing `-`).

## 2. Parser

- [x] 2.1 Add `dungeon-harness-server/src/gherkin/parse.ts`: `parseFeature(text: string): WorkingFeature` using `@cucumber/gherkin`'s `Parser` (with an `IdGenerator`) to produce a `GherkinDocument`, then translate its `feature.children[].scenario` entries into `WorkingScenario`s, reading each scenario's `@scenario-id:<slug>` tag (if present) into `scenarioId` and its `steps[]` into `WorkingStep[]`.
- [x] 2.2 On invalid Gherkin input, surface the parser's error (message + location if available) as a thrown error identifying the problem, per the `dungeon-scenario-authoring` spec's "Parsing malformed Gherkin" scenario — do not return a partial model.
- [x] 2.3 Assign a `scenarioId` (via `slugify(title)`, with `-2`/`-3`/... suffix on collision within the same `Feature`) to any parsed `Scenario` that has no `@scenario-id:` tag, per the "Stable per-scenario identity" requirement and design.md's "Scenario-id slug" decision.

## 3. Renderer

- [x] 3.1 Add `dungeon-harness-server/src/gherkin/render.ts`: `renderFeature(feature: WorkingFeature): string`, emitting valid Gherkin text — `Feature:` header, then per scenario a `@scenario-id:<scenarioId>` tag line, `Scenario:` header, and each step as `<Keyword> <text>`.
- [x] 3.2 Ensure the renderer's step-keyword formatting and blank-line conventions produce text `@cucumber/gherkin`'s parser accepts unchanged (needed for the round-trip test in 4.1).

## 4. Round-trip and tag-stability tests

- [x] 4.1 Add a Vitest round-trip test: for representative fixtures (multiple scenarios, all four step keywords, a scenario with a pre-existing `@scenario-id:` tag), `parseFeature(renderFeature(parseFeature(text)))` deep-equals `parseFeature(text)`.
- [x] 4.2 Add a test asserting a new `Scenario` created with no `@scenario-id:` tag gets one assigned by `parseFeature`/model construction, and that editing an existing scenario's title/steps (via the model, not by re-parsing) leaves its `scenarioId` unchanged.
- [x] 4.3 Add a test for `parseFeature` on malformed Gherkin text raising an error rather than returning a partial model.

## 5. Tool registration (`pi-extensions/scenario-bridge.ts`)

- [x] 5.1 Add `dungeon-harness-server/src/pi-extensions/scenario-bridge.ts` exporting `createScenarioBridgeExtension(opts: { cwd: string }): ExtensionFactory` (factory shape mirrors `createPermissionGateExtension`, since each tool's path-jail check needs the session's workspace root — see design.md's "New tools bypass the interactive approval gate" decision).
- [x] 5.2 Inside the factory, implement the shared path-jail check (`resolve(jail, path)`; reject unless equal to `jail` or prefixed with `jail + '/'`) used by all three tools below — same three-line check as `permission-gate.ts`'s, intentionally duplicated per design.md (no shared helper yet).
- [x] 5.3 Register `dungeon_read_feature` (`path: string` param): jail-check the path, read the file, call `parseFeature`, return the `WorkingFeature` as JSON in the tool result; on a jail violation return an error result (no approval-gate `block`, since this tool isn't in `permission-gate.ts`'s `GATED_TOOLS`) without reading the file.
- [x] 5.4 Register `dungeon_write_feature` (`path: string`, `feature: WorkingFeature` params): jail-check the path, call `renderFeature`, write the result to the path, return the written `WorkingFeature` as confirmation; on a jail violation return an error result without writing.
- [x] 5.5 Register `dungeon_write_implementation_notes` (`path: string`, `notes: string` params): jail-check the path, write `notes` verbatim to the path; on a jail violation return an error result without writing. Do not wire this tool's output into `dungeon_read_feature` in any way.

## 6. Wire into session-store.ts

- [x] 6.1 Add `createScenarioBridgeExtension({ cwd })` to the `extensionFactories` array passed to `DefaultResourceLoader` in `session-store.ts`, alongside the existing `createPermissionGateExtension(...)`.
- [x] 6.2 Add `'dungeon_read_feature'`, `'dungeon_write_feature'`, `'dungeon_write_implementation_notes'` to the tool list passed as `tools` to `createAgentSession` (currently `tools: [...BUILTIN_TOOLS]`) — per the tasks rule: a tool registered via `pi.registerTool` but left off this array is silently unavailable to the agent.
- [x] 6.3 Update the stale comment at the top of `session-store.ts` ("this phase registers no dungeon-tactics tools and has no board state to broadcast yet") to reflect that Gherkin-authoring tools are now registered. (No longer present — an earlier change already replaced it with the current BoardStore-focused header comment, which makes no "no tools registered" claim.)

## 7. Manual verification

- [x] 7.1 Start `dungeon-harness-server`/`client-dungeon` (or use already-running dev instances per CLAUDE.md — do not restart them) and, in one chat session, have the agent build up a Feature's Scenarios via `dungeon_write_feature`, close/reopen the session, and confirm `dungeon_read_feature` reloads exactly what was written — per proposal.md's "Deliverable". Verified via playwright-cli against the already-running dev instance: wrote a two-scenario "Ranger Tactics" feature (one scenario with an agent-chosen `scenarioId`, one left to auto-slug), signed out (disposing the `AgentSession`) and back in (fresh session), then read the file back — output matched exactly, including both `@scenario-id:` tags. This also surfaced and fixed a real bug: `dungeon_write_feature`/`dungeon_write_implementation_notes` didn't create missing parent directories, unlike pi's built-in `write` tool.
- [x] 7.2 Run `npm run typecheck` and `npm test` and confirm both pass.
