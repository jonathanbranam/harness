import { NPC_TYPES, PC_TYPES, type ActionId, type BenchIntent, type BenchState, type FieldToggles, type SequencerStep, type UnitType } from '../bench/types'

interface BenchControlsProps {
  state: BenchState | null
  mode: 'setup' | 'play'
  onModeChange: (mode: 'setup' | 'play') => void
  palette: UnitType | null
  onPaletteChange: (unitType: UnitType | null) => void
  armedAction: ActionId
  onArmAction: (action: ActionId) => void
  onIntent: (intent: BenchIntent) => void
  fields: FieldToggles
  onFieldsChange: (fields: FieldToggles) => void
  lastError: string | null
}

const FIELD_LABELS: { id: keyof FieldToggles; label: string; hint: string }[] = [
  { id: 'pcReach', label: 'PC reach', hint: 'Where player units can move this turn' },
  { id: 'pcThreat', label: 'PC threat', hint: 'What player units can hit, counting a move first' },
  { id: 'npcReach', label: 'Enemy reach', hint: 'Where enemy units can move this turn' },
  { id: 'npcThreat', label: 'Enemy threat', hint: 'What enemy units can hit, counting a move first' },
]

const BUTTON = 'px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:hover:bg-transparent'
const ACTIVE = 'px-2 py-1 text-xs rounded border border-indigo-500 bg-indigo-500 text-white'

const PHASE_LABELS: Record<BenchState['phase'], string> = {
  placement: 'placement',
  player: 'player',
  'npc-move': 'enemy planning',
  'npc-attack': 'enemy resolution',
}

/** What the engine's round will do next, in plain words — straight from
 *  `nextStep`, never re-derived from board state. `null` outside an enemy
 *  phase, where there is no round step to report. */
function describeNextStep(step: SequencerStep | null): string {
  if (!step) return 'nothing — the round is not in an enemy phase'
  switch (step.kind) {
    case 'plan-enemy':
      return `${step.unitId} will move${step.attackPlan ? ' and telegraph an attack' : ''}`
    case 'resolve-telegraph':
      return `${step.unitId}'s telegraph will resolve at (${step.attack.targetCol}, ${step.attack.targetRow})`
    case 'skip-telegraph':
      return `${step.unitId}'s telegraph will be skipped — it didn't survive`
    case 'phase-transition':
      return `phase will move from ${step.from} to ${step.to}`
  }
}

/**
 * Direct manipulation for the bench: board setup, unit placement, and both sides'
 * turns. Everything here sends an intent to the server, which is the only thing
 * that touches game state — the same path the agent's tools take.
 *
 * There is deliberately **no unit-definition editor**: the current `UnitDef`
 * model is expected to be replaced, so tweaking numbers is left to the agent
 * ("give the ranger 5 movement") where it costs no UI to throw away.
 */
export function BenchControls({
  state,
  mode,
  onModeChange,
  palette,
  onPaletteChange,
  armedAction,
  onArmAction,
  onIntent,
  fields,
  onFieldsChange,
  lastError,
}: BenchControlsProps) {
  const selection = state?.selection ?? null
  const pendingTelegraphs = (state?.telegraphs.length ?? 0) > 0

  return (
    <div className="border-b border-gray-200 dark:border-gray-800 text-gray-800 dark:text-gray-200">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <div className="flex gap-1">
          <button type="button" className={mode === 'setup' ? ACTIVE : BUTTON} onClick={() => onModeChange('setup')}>
            Setup
          </button>
          <button type="button" className={mode === 'play' ? ACTIVE : BUTTON} onClick={() => onModeChange('play')}>
            Play
          </button>
        </div>

        <span className="w-px h-5 bg-gray-200 dark:bg-gray-800" />

        <button type="button" className={BUTTON} onClick={() => onIntent({ kind: 'newBoard', preset: 'scattered', seed: Math.floor(Math.random() * 10000) })}>
          New board
        </button>
        <button type="button" className={BUTTON} onClick={() => onIntent({ kind: 'newBoard', preset: 'open', powerCenters: 1 })}>
          Open board
        </button>
        <button type="button" className={BUTTON} onClick={() => onIntent({ kind: 'clearUnits' })}>
          Clear units
        </button>

        <span className="w-px h-5 bg-gray-200 dark:bg-gray-800" />

        {/*
          The round as the engine sequences it, not as the bench used to fake
          it: `phase` and `nextStep` come straight from the engine (never
          derived here), and each control is enabled only when the engine
          would actually accept it — Plan during `npc-move`, End turn during
          `player`, Resolve during `npc-attack`. Step performs exactly
          `nextStep`, one engine call at a time; Plan/Resolve are it, looped
          through a whole phase.
        */}
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Round: <strong>{state ? PHASE_LABELS[state.phase] : '—'}</strong>
        </span>
        <button
          type="button"
          className={BUTTON}
          disabled={!state || state.nextStep === null}
          title={state ? describeNextStep(state.nextStep) : undefined}
          onClick={() => onIntent({ kind: 'step' })}
        >
          Step
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={!state || state.phase !== 'npc-move'}
          title={state?.phase === 'npc-move' ? "Let the game's AI plan the whole enemy turn" : 'Only available while the round awaits enemy movement'}
          onClick={() => onIntent({ kind: 'planEnemyTurn' })}
        >
          Plan enemy turn
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={!state || state.phase !== 'player'}
          title={state?.phase === 'player' ? "End the player's turn and resolve enemy telegraphs" : 'Only available during the player phase'}
          onClick={() => onIntent({ kind: 'endPlayerTurn' })}
        >
          End turn
        </button>
        <button
          type="button"
          className={BUTTON}
          disabled={!state || state.phase !== 'npc-attack'}
          title={state?.phase === 'npc-attack' ? 'Play out the locked telegraphs' : 'Only available while the round awaits telegraph resolution'}
          onClick={() => onIntent({ kind: 'resolveTelegraphs' })}
        >
          Resolve telegraphs{pendingTelegraphs ? ` (${state!.telegraphs.length})` : ''}
        </button>
        {state && (
          <span className="text-xs text-gray-500 dark:text-gray-400" title="What the round will do next, from the engine">
            Next: {describeNextStep(state.nextStep)}
          </span>
        )}
      </div>

      {/* Reach and threat are the quantities this game makes continuously
          visible: not "where will the unit be" but "what can it touch, and what
          can touch it". They read in a paused position, which is where the
          designer actually is. */}
      <div className="flex flex-wrap items-center gap-2 px-3 pb-2">
        <span className="text-xs text-gray-500 dark:text-gray-400">Fields:</span>
        {FIELD_LABELS.map(({ id, label, hint }) => (
          <button
            key={id}
            type="button"
            title={hint}
            className={fields[id] ? ACTIVE : BUTTON}
            onClick={() => onFieldsChange({ ...fields, [id]: !fields[id] })}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'setup' && (
        <div className="flex flex-wrap items-center gap-2 px-3 pb-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">Place:</span>
          {[...PC_TYPES, ...NPC_TYPES].map((unitType) => (
            <button
              key={unitType}
              type="button"
              className={palette === unitType ? ACTIVE : BUTTON}
              onClick={() => onPaletteChange(palette === unitType ? null : unitType)}
            >
              {unitType}
            </button>
          ))}
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {palette ? 'click an empty tile to place' : selection ? 'click an empty tile to reposition the selected unit' : 'pick a type, or click a unit'}
          </span>
          {selection && (
            <button type="button" className={BUTTON} onClick={() => onIntent({ kind: 'remove', unitId: selection.unitId })}>
              Remove {selection.unitId}
            </button>
          )}
        </div>
      )}

      {mode === 'play' && (
        <div className="flex flex-wrap items-center gap-2 px-3 pb-2">
          {selection ? (
            <>
              <span className="text-xs">
                <strong>{selection.unitId}</strong> · {selection.hp}/{selection.maxHp} HP · {selection.remainingMove} move left
                {selection.hasAttacked ? ' · attacked' : ''}
              </span>
              {/* The engine's own list. An unavailable action stays on screen,
                  disabled and carrying its reason — the tiles quietly failing to
                  appear is not an answer to "why can't I move?". */}
              {selection.actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className={armedAction === action.id && action.available ? ACTIVE : BUTTON}
                  disabled={!action.available}
                  title={action.reason}
                  onClick={() => onArmAction(action.id)}
                >
                  {action.label}
                </button>
              ))}
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {selection.actions.find((a) => a.id === armedAction)?.reason
                  ?? (armedAction === 'attack' ? 'click a highlighted tile to attack it' : 'click a highlighted tile to move there')}
              </span>
            </>
          ) : (
            <span className="text-xs text-gray-500 dark:text-gray-400">Click a unit to select it. Its reachable tiles light up; click one to move.</span>
          )}
        </div>
      )}

      {lastError && <div className="px-3 pb-2 text-xs text-red-600 dark:text-red-400">{lastError}</div>}
    </div>
  )
}
