import { describe, expect, it } from 'vitest'
import { parseFeature } from './parse'
import { renderFeature } from './render'

const FIXTURE = `Feature: Ranger tactics

  @scenario-id:ranger-retreat-after-shot
  Scenario: Ranger retreats after taking a shot
    Given a ranger is placed at column 2, row 2
    When the ranger attacks to the right
    Then the ranger moves back one cell
    And the ranger's attack hits the nearest enemy
    But the ranger does not move into an occupied cell

  Scenario: Melee unit charges the nearest enemy
    Given a melee unit is placed at column 0, row 0
    When the melee unit's turn begins
    Then it moves toward the nearest enemy
`

describe('gherkin round-trip', () => {
  it('parseFeature(renderFeature(parseFeature(text))) deep-equals parseFeature(text)', () => {
    const parsed = parseFeature(FIXTURE)
    const rendered = renderFeature(parsed)
    const reparsed = parseFeature(rendered)
    expect(reparsed).toEqual(parsed)
  })

  it('preserves an existing @scenario-id: tag rather than regenerating it', () => {
    const parsed = parseFeature(FIXTURE)
    expect(parsed.scenarios[0].scenarioId).toBe('ranger-retreat-after-shot')
  })

  it('assigns a scenarioId to a scenario with no @scenario-id: tag', () => {
    const parsed = parseFeature(FIXTURE)
    expect(parsed.scenarios[1].scenarioId).toBe('melee-unit-charges-the-nearest-enemy')
  })

  it('parses all four step keywords', () => {
    const parsed = parseFeature(FIXTURE)
    expect(parsed.scenarios[0].steps.map((s) => s.keyword)).toEqual(['Given', 'When', 'Then', 'And', 'But'])
  })

  it('editing a scenario title/steps via the model leaves scenarioId unchanged', () => {
    const parsed = parseFeature(FIXTURE)
    const scenario = parsed.scenarios[0]
    const originalId = scenario.scenarioId
    scenario.title = 'Ranger falls back after a hit'
    scenario.steps = [{ keyword: 'Given', text: 'a ranger is placed anywhere' }]
    expect(scenario.scenarioId).toBe(originalId)
  })

  it('assigns collision-suffixed scenarioIds for scenarios with the same title', () => {
    const text = `Feature: Duplicate titles

  Scenario: Attack
    Given a unit exists

  Scenario: Attack
    Given another unit exists
`
    const parsed = parseFeature(text)
    expect(parsed.scenarios.map((s) => s.scenarioId)).toEqual(['attack', 'attack-2'])
  })

  it('throws on malformed Gherkin rather than returning a partial model', () => {
    expect(() => parseFeature('This is not Gherkin at all {{{')).toThrow()
  })
})
