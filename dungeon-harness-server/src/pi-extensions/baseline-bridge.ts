// Registers the dungeon_* tools that load a unit's canonical baseline from
// track-web's read-only feature corpus and diff it against the designer's
// working model — per
// openspec/changes/dungeon-baseline-changeset/proposal.md. A new extension
// file rather than an addition to scenario-bridge.ts: the read-only
// track-web path and the workspace write path are different trust
// boundaries (enum-mapped vs. jail-checked) with different lifecycles
// (baseline load-once vs. read/write-per-call) — see design.md's "New
// extension file" decision. The baseline itself is per-session state held
// in this factory's closure (design.md's "Baseline state lives in the
// extension closure" decision), the same way permission-gate.ts closes over
// approvedThisTurn.

import type { ExtensionAPI, ExtensionFactory } from '@earendil-works/pi-coding-agent'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { Type } from 'typebox'
import { diffFeature, type FeatureChangeset } from '../gherkin/diff'
import type { WorkingFeature } from '../gherkin/model'
import { parseFeature } from '../gherkin/parse'

// Player-controlled units only — the subset that round one's design sessions
// cover (see design.md's "One canonical file per unit" decision). This enum
// doubles as the path-safety mechanism for dungeon_load_baseline: there's no
// user-suppliable path component, so no jail check is needed for it. Not
// tied to board-bridge.ts's drawing primitives — dungeon_load_baseline takes
// a unit name only as a plain string key into track-web's feature corpus
// (see dungeon-board-tool-enhancements/proposal.md - Impact).
const UNITS = ['melee', 'rogue', 'ranger', 'magic-user'] as const
type Unit = (typeof UNITS)[number]

const WorkingStepSchema = Type.Object({
  keyword: Type.Union([Type.Literal('Given'), Type.Literal('When'), Type.Literal('Then'), Type.Literal('And'), Type.Literal('But')]),
  text: Type.String(),
})

const WorkingScenarioSchema = Type.Object({
  scenarioId: Type.String(),
  title: Type.String(),
  steps: Type.Array(WorkingStepSchema),
})

const WorkingFeatureSchema = Type.Object({
  name: Type.String(),
  scenarios: Type.Array(WorkingScenarioSchema),
})

const EMPTY_BASELINE: WorkingFeature = { name: '', scenarios: [] }

async function readFileIfExists(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf-8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

export function createBaselineBridgeExtension(opts: { cwd: string; trackWebFeaturesDir: string | undefined }): ExtensionFactory {
  const jail = resolve(opts.cwd)
  const { trackWebFeaturesDir } = opts

  function checkJail(path: string): string | undefined {
    const resolved = resolve(jail, path)
    if (resolved !== jail && !resolved.startsWith(jail + '/')) {
      return `Path outside the workspace root is not allowed: ${path}`
    }
    return undefined
  }

  async function writeFileEnsuringDir(path: string, contents: string): Promise<void> {
    const resolved = resolve(jail, path)
    await mkdir(dirname(resolved), { recursive: true })
    await writeFile(resolved, contents, 'utf-8')
  }

  // Per-session baseline state (design.md's "Baseline state lives in the
  // extension closure" decision). The default (no unit loaded, empty
  // baseline) makes every working scenario read as "added" if a diff tool
  // is called before any dungeon_load_baseline call, matching the
  // documented empty-baseline behavior rather than a special-cased error.
  const state: { unit: Unit | null; baseline: WorkingFeature } = { unit: null, baseline: EMPTY_BASELINE }

  return function baselineBridge(pi: ExtensionAPI) {
    pi.registerTool({
      name: 'dungeon_load_baseline',
      label: 'Load Baseline',
      description:
        "Load a player unit's current canonical .feature scenarios from track-web's read-only corpus as this session's baseline, held apart from your working model. Empty baseline (no error) if the file, or the read-only path itself, isn't configured/doesn't exist yet — the expected state until track-web's corpus lands. Call once per session before editing; a later call replaces the baseline.",
      promptSnippet: "Load a unit's canonical baseline from track-web",
      parameters: Type.Object({ unit: Type.Union(UNITS.map((u) => Type.Literal(u))) }),
      execute: async (_id, params) => {
        const unit = params.unit as Unit
        const path = trackWebFeaturesDir ? join(trackWebFeaturesDir, `${unit}.feature`) : undefined
        const text = path ? await readFileIfExists(path) : undefined
        const baseline = text !== undefined ? parseFeature(text) : EMPTY_BASELINE
        state.unit = unit
        state.baseline = baseline
        const details = { unit, found: text !== undefined, baseline }
        const summary = text !== undefined ? `Loaded baseline for "${unit}" (${baseline.scenarios.length} scenario(s)).` : `No canonical .feature file found for "${unit}" — baseline is empty.`
        return { content: [{ type: 'text' as const, text: `${summary}\n${JSON.stringify(details, null, 2)}` }], details }
      },
    })

    pi.registerTool({
      name: 'dungeon_read_step_catalog',
      label: 'Read Step Catalog',
      description:
        "Read the step catalog from track-web's read-only corpus. Empty catalog (no error) if the file, or the read-only path itself, isn't configured/doesn't exist yet.",
      promptSnippet: "Read track-web's step catalog",
      parameters: Type.Object({}),
      execute: async () => {
        const path = trackWebFeaturesDir ? join(trackWebFeaturesDir, 'steps-catalog.json') : undefined
        const text = path ? await readFileIfExists(path) : undefined
        const catalog = text !== undefined ? JSON.parse(text) : {}
        const details = { found: text !== undefined, catalog }
        const summary = text !== undefined ? 'Loaded step catalog.' : 'No step catalog found — returning an empty catalog.'
        return { content: [{ type: 'text' as const, text: `${summary}\n${JSON.stringify(details, null, 2)}` }], details }
      },
    })

    pi.registerTool({
      name: 'dungeon_get_changeset',
      label: 'Get Changeset',
      description:
        "Compute the structural changeset (added/removed/modified/unchanged scenarios, with per-step detail for modified scenarios) between the given working model and this session's currently loaded baseline. Call dungeon_load_baseline first if you haven't — otherwise every scenario reads as added against an empty baseline.",
      promptSnippet: 'Diff the working model against the loaded baseline',
      parameters: Type.Object({ feature: WorkingFeatureSchema }),
      execute: async (_id, params) => {
        const changeset = diffFeature(state.baseline, params.feature as WorkingFeature)
        return { content: [{ type: 'text' as const, text: JSON.stringify(changeset, null, 2) }], details: changeset }
      },
    })

    pi.registerTool({
      name: 'dungeon_write_changeset',
      label: 'Write Changeset',
      description:
        "Compute the changeset (as dungeon_get_changeset does) between the given working model and this session's loaded baseline, and write it as JSON to a path within the harness workspace — a handoff artifact alongside dungeon_write_feature's .feature output.",
      promptSnippet: 'Write the changeset to the workspace as a handoff artifact',
      parameters: Type.Object({ path: Type.String(), feature: WorkingFeatureSchema }),
      execute: async (_id, params) => {
        const jailError = checkJail(params.path)
        let details: FeatureChangeset | { error: string }
        if (jailError) {
          details = { error: jailError }
        } else {
          const changeset = diffFeature(state.baseline, params.feature as WorkingFeature)
          await writeFileEnsuringDir(params.path, JSON.stringify(changeset, null, 2))
          details = changeset
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify(details, null, 2) }], details, isError: !!jailError }
      },
    })
  }
}
