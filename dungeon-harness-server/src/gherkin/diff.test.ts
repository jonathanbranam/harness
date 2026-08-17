import { describe, expect, it } from 'vitest'
import { diffFeature } from './diff'
import type { WorkingFeature, WorkingScenario } from './model'

function feature(scenarios: WorkingScenario[]): WorkingFeature {
  return { name: 'Test feature', scenarios }
}

const CHARGE: WorkingScenario = {
  scenarioId: 'melee-charges',
  title: 'Melee charges the nearest enemy',
  steps: [
    { keyword: 'Given', text: 'a melee unit is placed at column 0, row 0' },
    { keyword: 'When', text: "the melee unit's turn begins" },
    { keyword: 'Then', text: 'it moves toward the nearest enemy' },
  ],
}

const RETREAT: WorkingScenario = {
  scenarioId: 'ranger-retreat',
  title: 'Ranger retreats after taking a shot',
  steps: [
    { keyword: 'Given', text: 'a ranger is placed at column 2, row 2' },
    { keyword: 'When', text: 'the ranger attacks to the right' },
    { keyword: 'Then', text: 'the ranger moves back one cell' },
  ],
}

describe('diffFeature', () => {
  it('classifies a scenario only in the working model as added', () => {
    const changeset = diffFeature(feature([]), feature([CHARGE]))
    expect(changeset.scenarios).toEqual([{ scenarioId: 'melee-charges', status: 'added', scenario: CHARGE }])
  })

  it('classifies a scenario only in the baseline as removed', () => {
    const changeset = diffFeature(feature([CHARGE]), feature([]))
    expect(changeset.scenarios).toEqual([{ scenarioId: 'melee-charges', status: 'removed', scenario: CHARGE }])
  })

  it('classifies an identical scenario as unchanged', () => {
    const changeset = diffFeature(feature([CHARGE]), feature([CHARGE]))
    expect(changeset.scenarios).toEqual([{ scenarioId: 'melee-charges', status: 'unchanged' }])
  })

  it('classifies a title-only change as modified, with all steps unchanged', () => {
    const retitled: WorkingScenario = { ...CHARGE, title: 'Melee unit charges' }
    const changeset = diffFeature(feature([CHARGE]), feature([retitled]))
    expect(changeset.scenarios).toEqual([
      {
        scenarioId: 'melee-charges',
        status: 'modified',
        title: 'Melee unit charges',
        steps: CHARGE.steps.map((step) => ({ status: 'unchanged', step })),
      },
    ])
  })

  it('classifies a step-only change as modified, with the same title and per-step add/remove/unchanged detail', () => {
    const edited: WorkingScenario = {
      ...CHARGE,
      steps: [
        CHARGE.steps[0],
        { keyword: 'When', text: 'an enemy comes into range' },
        CHARGE.steps[2],
      ],
    }
    const changeset = diffFeature(feature([CHARGE]), feature([edited]))
    expect(changeset.scenarios).toEqual([
      {
        scenarioId: 'melee-charges',
        status: 'modified',
        title: CHARGE.title,
        steps: [
          { status: 'unchanged', step: CHARGE.steps[0] },
          { status: 'removed', step: CHARGE.steps[1] },
          { status: 'added', step: edited.steps[1] },
          { status: 'unchanged', step: CHARGE.steps[2] },
        ],
      },
    ])
  })

  it('classifies a scenario with both a title and step change as modified', () => {
    const edited: WorkingScenario = {
      ...CHARGE,
      title: 'Melee unit charges',
      steps: [...CHARGE.steps, { keyword: 'And', text: 'it deals damage on contact' }],
    }
    const changeset = diffFeature(feature([CHARGE]), feature([edited]))
    expect(changeset.scenarios).toEqual([
      {
        scenarioId: 'melee-charges',
        status: 'modified',
        title: 'Melee unit charges',
        steps: [
          ...CHARGE.steps.map((step) => ({ status: 'unchanged' as const, step })),
          { status: 'added', step: edited.steps[3] },
        ],
      },
    ])
  })

  it('treats every working scenario as added against an empty baseline', () => {
    const changeset = diffFeature(feature([]), feature([CHARGE, RETREAT]))
    expect(changeset.scenarios).toEqual([
      { scenarioId: 'melee-charges', status: 'added', scenario: CHARGE },
      { scenarioId: 'ranger-retreat', status: 'added', scenario: RETREAT },
    ])
  })

  it('handles a mix of added, removed, modified, and unchanged scenarios together', () => {
    const editedRetreat: WorkingScenario = { ...RETREAT, title: 'Ranger falls back after a hit' }
    const newScenario: WorkingScenario = {
      scenarioId: 'rogue-flank',
      title: 'Rogue flanks an enemy',
      steps: [{ keyword: 'Given', text: 'a rogue is placed at column 1, row 1' }],
    }
    const changeset = diffFeature(feature([CHARGE, RETREAT]), feature([CHARGE, editedRetreat, newScenario]))
    expect(changeset.scenarios).toEqual([
      { scenarioId: 'melee-charges', status: 'unchanged' },
      { scenarioId: 'ranger-retreat', status: 'modified', title: 'Ranger falls back after a hit', steps: RETREAT.steps.map((step) => ({ status: 'unchanged', step })) },
      { scenarioId: 'rogue-flank', status: 'added', scenario: newScenario },
    ])
  })
})
