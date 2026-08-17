// Registers the dungeon_* tools that let pi read and write Gherkin
// .feature files within the harness's own workspace — per
// openspec/changes/harness-gherkin-authoring/proposal.md. These tools are
// not in permission-gate.ts's GATED_TOOLS (no interactive approval prompt —
// see design.md's "New tools bypass the interactive approval gate"
// decision), so each tool here re-implements the same three-line path-jail
// check permission-gate.ts uses for write/edit, rather than relying on that
// gate. This is a per-session extension *factory*, mirroring
// permission-gate.ts's and board-bridge.ts's factory pattern, since the
// path jail needs the session's own workspace root (cwd).

import type { ExtensionAPI, ExtensionFactory } from '@earendil-works/pi-coding-agent'
import { resolve } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Type } from 'typebox'
import { parseFeature } from '../gherkin/parse'
import { renderFeature } from '../gherkin/render'
import type { WorkingFeature } from '../gherkin/model'

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

export function createScenarioBridgeExtension(opts: { cwd: string }): ExtensionFactory {
  const jail = resolve(opts.cwd)

  function checkJail(path: string): string | undefined {
    const resolved = resolve(jail, path)
    if (resolved !== jail && !resolved.startsWith(jail + '/')) {
      return `Path outside the workspace root is not allowed: ${path}`
    }
    return undefined
  }

  // Mirrors pi's built-in write tool, which creates missing parent
  // directories rather than requiring the agent to mkdir first.
  async function writeFileEnsuringDir(path: string, contents: string): Promise<void> {
    const resolved = resolve(jail, path)
    await mkdir(dirname(resolved), { recursive: true })
    await writeFile(resolved, contents, 'utf-8')
  }

  return function scenarioBridge(pi: ExtensionAPI) {
    pi.registerTool({
      name: 'dungeon_read_feature',
      label: 'Read Feature',
      description: 'Parse a .feature file from a path within the harness workspace into the working Feature/Scenario/Step model.',
      promptSnippet: 'Read and parse a .feature file from the workspace',
      parameters: Type.Object({ path: Type.String() }),
      execute: async (_id, params) => {
        const jailError = checkJail(params.path)
        const details: WorkingFeature | { error: string } = jailError
          ? { error: jailError }
          : parseFeature(await readFile(resolve(jail, params.path), 'utf-8'))
        return { content: [{ type: 'text' as const, text: JSON.stringify(details, null, 2) }], details, isError: !!jailError }
      },
    })

    pi.registerTool({
      name: 'dungeon_write_feature',
      label: 'Write Feature',
      description: 'Render the working Feature/Scenario/Step model to Gherkin text and write it to a path within the harness workspace.',
      promptSnippet: 'Render and write a .feature file to the workspace',
      parameters: Type.Object({ path: Type.String(), feature: WorkingFeatureSchema }),
      execute: async (_id, params) => {
        const jailError = checkJail(params.path)
        let details: WorkingFeature | { error: string }
        if (jailError) {
          details = { error: jailError }
        } else {
          const feature = params.feature as WorkingFeature
          await writeFileEnsuringDir(params.path, renderFeature(feature))
          details = feature
        }
        return { content: [{ type: 'text' as const, text: JSON.stringify(details, null, 2) }], details, isError: !!jailError }
      },
    })

    pi.registerTool({
      name: 'dungeon_write_implementation_notes',
      label: 'Write Implementation Notes',
      description:
        'Write advisory step-consolidation/refactor suggestions to a path within the harness workspace. Notes are advisory only and are never read back by dungeon_read_feature.',
      promptSnippet: 'Write advisory implementation notes to the workspace',
      parameters: Type.Object({ path: Type.String(), notes: Type.String() }),
      execute: async (_id, params) => {
        const jailError = checkJail(params.path)
        let details: { path: string } | { error: string }
        if (jailError) {
          details = { error: jailError }
        } else {
          await writeFileEnsuringDir(params.path, params.notes)
          details = { path: params.path }
        }
        const text = jailError ? jailError : 'Implementation notes written.'
        return { content: [{ type: 'text' as const, text }], details, isError: !!jailError }
      },
    })
  }
}
