// Parses .feature text into the internal working model. Uses
// @cucumber/gherkin's Parser to produce a GherkinDocument, then translates
// it — see model.ts's header comment for why we don't just keep that shape.

import { AstBuilder, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin'
import { IdGenerator, type Scenario as GherkinScenario, type Step as GherkinStep } from '@cucumber/messages'
import { slugify } from './slug'
import type { WorkingFeature, WorkingScenario, WorkingStep } from './model'

const SCENARIO_ID_TAG = /^@scenario-id:(.+)$/

const STEP_KEYWORDS = new Set(['Given', 'When', 'Then', 'And', 'But'])

function toWorkingStep(step: GherkinStep): WorkingStep {
  const keyword = step.keyword.trim()
  if (!STEP_KEYWORDS.has(keyword)) {
    throw new Error(`Unsupported step keyword "${keyword}" at line ${step.location.line}`)
  }
  return { keyword: keyword as WorkingStep['keyword'], text: step.text }
}

function toWorkingScenario(scenario: GherkinScenario, usedIds: Set<string>): WorkingScenario {
  const tagMatch = scenario.tags.map((tag) => tag.name.match(SCENARIO_ID_TAG)).find((match): match is RegExpMatchArray => match !== null)

  let scenarioId = tagMatch?.[1]
  if (!scenarioId) {
    const base = slugify(scenario.name)
    scenarioId = base
    let suffix = 2
    while (usedIds.has(scenarioId)) {
      scenarioId = `${base}-${suffix}`
      suffix += 1
    }
  }
  usedIds.add(scenarioId)

  return {
    scenarioId,
    title: scenario.name,
    steps: scenario.steps.map(toWorkingStep),
  }
}

/**
 * Parses .feature text into the working model. Throws on malformed Gherkin
 * rather than returning a partial model, per the dungeon-scenario-authoring
 * spec's "Parsing malformed Gherkin" scenario.
 */
export function parseFeature(text: string): WorkingFeature {
  const builder = new AstBuilder(IdGenerator.uuid())
  const matcher = new GherkinClassicTokenMatcher()
  const parser = new Parser(builder, matcher)

  let document
  try {
    document = parser.parse(text)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to parse Gherkin: ${message}`)
  }

  if (!document.feature) {
    throw new Error('Failed to parse Gherkin: no Feature found')
  }

  const usedIds = new Set<string>()
  const scenarios = document.feature.children
    .filter((child) => child.scenario)
    .map((child) => toWorkingScenario(child.scenario!, usedIds))

  return { name: document.feature.name, scenarios }
}
