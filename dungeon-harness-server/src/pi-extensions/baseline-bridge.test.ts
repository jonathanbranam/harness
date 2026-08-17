import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createBaselineBridgeExtension } from './baseline-bridge'
import type { WorkingFeature } from '../gherkin/model'

type Execute = (id: string, params: Record<string, unknown>) => Promise<{ content: unknown; details: unknown; isError?: boolean }>

/** Minimal fake ExtensionAPI: captures registered tools by name so tests can call their execute() directly, without spinning up a real AgentSession. */
function registerTools(opts: { cwd: string; trackWebFeaturesDir: string | undefined }): Map<string, Execute> {
  const tools = new Map<string, Execute>()
  const fakePi = {
    on: () => {},
    registerTool: (tool: { name: string; execute: Execute }) => tools.set(tool.name, tool.execute),
  } as unknown as ExtensionAPI
  createBaselineBridgeExtension(opts)(fakePi)
  return tools
}

const MELEE_FEATURE_TEXT = `Feature: Melee tactics

  @scenario-id:melee-charges
  Scenario: Melee charges the nearest enemy
    Given a melee unit is placed at column 0, row 0
    When the melee unit's turn begins
    Then it moves toward the nearest enemy
`

const NEW_SCENARIO: WorkingFeature = {
  name: 'Melee tactics',
  scenarios: [{ scenarioId: 'melee-retreats', title: 'Melee retreats when low on HP', steps: [{ keyword: 'Given', text: 'a melee unit has 1 HP' }] }],
}

describe('baseline-bridge tools', () => {
  let workspaceDir: string
  let trackWebDir: string

  beforeEach(async () => {
    workspaceDir = await mkdtemp(join(tmpdir(), 'dungeon-workspace-'))
    trackWebDir = await mkdtemp(join(tmpdir(), 'dungeon-trackweb-'))
  })

  afterEach(async () => {
    await rm(workspaceDir, { recursive: true, force: true })
    await rm(trackWebDir, { recursive: true, force: true })
  })

  it('dungeon_load_baseline loads an existing unit\'s canonical feature', async () => {
    await writeFile(join(trackWebDir, 'melee.feature'), MELEE_FEATURE_TEXT, 'utf-8')
    const tools = registerTools({ cwd: workspaceDir, trackWebFeaturesDir: trackWebDir })
    const result = await tools.get('dungeon_load_baseline')!('1', { unit: 'melee' })
    const details = result.details as { unit: string; found: boolean; baseline: WorkingFeature }
    expect(details.found).toBe(true)
    expect(details.baseline.scenarios).toHaveLength(1)
    expect(details.baseline.scenarios[0].scenarioId).toBe('melee-charges')
  })

  it('dungeon_load_baseline returns an empty baseline when the unit\'s file does not exist', async () => {
    const tools = registerTools({ cwd: workspaceDir, trackWebFeaturesDir: trackWebDir })
    const result = await tools.get('dungeon_load_baseline')!('1', { unit: 'rogue' })
    const details = result.details as { found: boolean; baseline: WorkingFeature }
    expect(details.found).toBe(false)
    expect(details.baseline.scenarios).toEqual([])
  })

  it('dungeon_load_baseline returns an empty baseline when the track-web dir is not configured', async () => {
    const tools = registerTools({ cwd: workspaceDir, trackWebFeaturesDir: undefined })
    const result = await tools.get('dungeon_load_baseline')!('1', { unit: 'ranger' })
    const details = result.details as { found: boolean; baseline: WorkingFeature }
    expect(details.found).toBe(false)
    expect(details.baseline.scenarios).toEqual([])
  })

  it('dungeon_read_step_catalog returns the catalog contents when the file exists', async () => {
    await writeFile(join(trackWebDir, 'steps-catalog.json'), JSON.stringify({ Given: ['a unit is placed'] }), 'utf-8')
    const tools = registerTools({ cwd: workspaceDir, trackWebFeaturesDir: trackWebDir })
    const result = await tools.get('dungeon_read_step_catalog')!('1', {})
    const details = result.details as { found: boolean; catalog: unknown }
    expect(details.found).toBe(true)
    expect(details.catalog).toEqual({ Given: ['a unit is placed'] })
  })

  it('dungeon_read_step_catalog returns an empty catalog when the file does not exist', async () => {
    const tools = registerTools({ cwd: workspaceDir, trackWebFeaturesDir: trackWebDir })
    const result = await tools.get('dungeon_read_step_catalog')!('1', {})
    const details = result.details as { found: boolean; catalog: unknown }
    expect(details.found).toBe(false)
    expect(details.catalog).toEqual({})
  })

  it('dungeon_get_changeset diffs against a loaded baseline', async () => {
    await writeFile(join(trackWebDir, 'melee.feature'), MELEE_FEATURE_TEXT, 'utf-8')
    const tools = registerTools({ cwd: workspaceDir, trackWebFeaturesDir: trackWebDir })
    await tools.get('dungeon_load_baseline')!('1', { unit: 'melee' })
    const result = await tools.get('dungeon_get_changeset')!('1', { feature: NEW_SCENARIO })
    const details = result.details as { scenarios: { scenarioId: string; status: string }[] }
    expect(details.scenarios).toEqual([
      { scenarioId: 'melee-retreats', status: 'added', scenario: NEW_SCENARIO.scenarios[0] },
      { scenarioId: 'melee-charges', status: 'removed', scenario: expect.objectContaining({ scenarioId: 'melee-charges' }) },
    ])
  })

  it('dungeon_get_changeset treats every scenario as added against the default empty baseline', async () => {
    const tools = registerTools({ cwd: workspaceDir, trackWebFeaturesDir: trackWebDir })
    const result = await tools.get('dungeon_get_changeset')!('1', { feature: NEW_SCENARIO })
    const details = result.details as { scenarios: { status: string }[] }
    expect(details.scenarios).toEqual([{ scenarioId: 'melee-retreats', status: 'added', scenario: NEW_SCENARIO.scenarios[0] }])
  })

  it('dungeon_write_changeset writes the computed changeset to a workspace path', async () => {
    const tools = registerTools({ cwd: workspaceDir, trackWebFeaturesDir: trackWebDir })
    const result = await tools.get('dungeon_write_changeset')!('1', { path: 'handoff/changeset.json', feature: NEW_SCENARIO })
    expect(result.isError).toBeFalsy()
    const written = JSON.parse(await readFile(join(workspaceDir, 'handoff/changeset.json'), 'utf-8'))
    expect(written).toEqual(result.details)
  })

  it('dungeon_write_changeset rejects a path outside the workspace and writes nothing', async () => {
    const tools = registerTools({ cwd: workspaceDir, trackWebFeaturesDir: trackWebDir })
    const result = await tools.get('dungeon_write_changeset')!('1', { path: '../outside.json', feature: NEW_SCENARIO })
    expect(result.isError).toBe(true)
    expect((result.details as { error: string }).error).toMatch(/outside the workspace/)
    await expect(readFile(join(workspaceDir, '..', 'outside.json'), 'utf-8')).rejects.toThrow()
  })
})
