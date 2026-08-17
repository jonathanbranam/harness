// Internal working model for Gherkin authoring — a translation target for
// @cucumber/gherkin's GherkinDocument, not that shape itself. See
// openspec/changes/harness-gherkin-authoring/design.md's "Internal model is
// a translation target" decision for why: GherkinDocument carries source
// spans and pickle-compilation concerns this harness never touches, which
// would make "round-trip stable" a much harder (and less meaningful) bar.

export interface WorkingStep {
  keyword: 'Given' | 'When' | 'Then' | 'And' | 'But'
  text: string
}

export interface WorkingScenario {
  scenarioId: string
  title: string
  steps: WorkingStep[]
}

export interface WorkingFeature {
  name: string
  scenarios: WorkingScenario[]
}
