// Renders the working model back to .feature text. Must stay in sync with
// parse.ts: text this emits is expected to round-trip through parseFeature
// unchanged (see the round-trip test in gherkin/round-trip.test.ts).

import type { WorkingFeature } from './model'

export function renderFeature(feature: WorkingFeature): string {
  const lines: string[] = [`Feature: ${feature.name}`]

  for (const scenario of feature.scenarios) {
    lines.push('')
    lines.push(`  @scenario-id:${scenario.scenarioId}`)
    lines.push(`  Scenario: ${scenario.title}`)
    for (const step of scenario.steps) {
      lines.push(`    ${step.keyword} ${step.text}`)
    }
  }

  return lines.join('\n') + '\n'
}
