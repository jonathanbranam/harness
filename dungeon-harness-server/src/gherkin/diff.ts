// Structural diff between two WorkingFeature models — see
// openspec/changes/dungeon-baseline-changeset/design.md's "Diff engine as
// its own module" and "Step diff within a modified scenario" decisions.
// Scenarios are matched by scenarioId (every parsed scenario already has a
// stable one, tagged or slug-derived — see model.ts/parse.ts). Steps within
// a modified scenario have no stable id, so they're matched by LCS sequence
// alignment over (keyword, text) rather than by index, so one inserted step
// doesn't make every later step look modified.

import type { WorkingFeature, WorkingScenario, WorkingStep } from './model'

export type StepChangeStatus = 'added' | 'removed' | 'unchanged'

export interface StepChangeEntry {
  status: StepChangeStatus
  step: WorkingStep
}

export type ScenarioChangeEntry =
  | { scenarioId: string; status: 'added'; scenario: WorkingScenario }
  | { scenarioId: string; status: 'removed'; scenario: WorkingScenario }
  | { scenarioId: string; status: 'modified'; title: string; steps: StepChangeEntry[] }
  | { scenarioId: string; status: 'unchanged' }

export interface FeatureChangeset {
  scenarios: ScenarioChangeEntry[]
}

function stepsEqual(a: WorkingStep, b: WorkingStep): boolean {
  return a.keyword === b.keyword && a.text === b.text
}

function stepListsEqual(a: WorkingStep[], b: WorkingStep[]): boolean {
  return a.length === b.length && a.every((step, i) => stepsEqual(step, b[i]))
}

/** Sequence-aligns two step lists (LCS over keyword+text) and classifies each step as added/removed/unchanged relative to its aligned position. */
function diffSteps(baseline: WorkingStep[], working: WorkingStep[]): StepChangeEntry[] {
  const m = baseline.length
  const n = working.length

  const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      lcs[i][j] = stepsEqual(baseline[i], working[j]) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const result: StepChangeEntry[] = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (stepsEqual(baseline[i], working[j])) {
      result.push({ status: 'unchanged', step: working[j] })
      i += 1
      j += 1
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      result.push({ status: 'removed', step: baseline[i] })
      i += 1
    } else {
      result.push({ status: 'added', step: working[j] })
      j += 1
    }
  }
  while (i < m) {
    result.push({ status: 'removed', step: baseline[i] })
    i += 1
  }
  while (j < n) {
    result.push({ status: 'added', step: working[j] })
    j += 1
  }
  return result
}

/** Diffs a working model against a baseline, matching scenarios by scenarioId. Scenario order follows the working model, with baseline-only (removed) scenarios appended after. */
export function diffFeature(baseline: WorkingFeature, working: WorkingFeature): FeatureChangeset {
  const baselineById = new Map(baseline.scenarios.map((s) => [s.scenarioId, s]))
  const workingIds = new Set(working.scenarios.map((s) => s.scenarioId))

  const scenarios: ScenarioChangeEntry[] = []

  for (const scenario of working.scenarios) {
    const base = baselineById.get(scenario.scenarioId)
    if (!base) {
      scenarios.push({ scenarioId: scenario.scenarioId, status: 'added', scenario })
      continue
    }
    if (base.title === scenario.title && stepListsEqual(base.steps, scenario.steps)) {
      scenarios.push({ scenarioId: scenario.scenarioId, status: 'unchanged' })
    } else {
      scenarios.push({ scenarioId: scenario.scenarioId, status: 'modified', title: scenario.title, steps: diffSteps(base.steps, scenario.steps) })
    }
  }

  for (const scenario of baseline.scenarios) {
    if (!workingIds.has(scenario.scenarioId)) {
      scenarios.push({ scenarioId: scenario.scenarioId, status: 'removed', scenario })
    }
  }

  return { scenarios }
}
