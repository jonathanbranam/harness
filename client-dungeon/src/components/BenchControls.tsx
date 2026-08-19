import { DIRECTIONS, NPC_TYPES, PC_TYPES, type BenchIntent, type BenchState, type Direction, type UnitType } from '../bench/types'

interface BenchControlsProps {
  state: BenchState | null
  mode: 'setup' | 'play'
  onModeChange: (mode: 'setup' | 'play') => void
  palette: UnitType | null
  onPaletteChange: (unitType: UnitType | null) => void
  armedDirection: Direction | null
  onArmDirection: (direction: Direction | null) => void
  onIntent: (intent: BenchIntent) => void
  lastError: string | null
}

const BUTTON = 'px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:hover:bg-transparent'
const ACTIVE = 'px-2 py-1 text-xs rounded border border-indigo-500 bg-indigo-500 text-white'

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
  armedDirection,
  onArmDirection,
  onIntent,
  lastError,
}: BenchControlsProps) {
  const selection = state?.selection ?? null

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

        <button type="button" className={BUTTON} onClick={() => onIntent({ kind: 'runEnemyAi' })}>
          Run enemy AI
        </button>
        <button type="button" className={BUTTON} onClick={() => onIntent({ kind: 'endRound' })}>
          End round
        </button>
        <button type="button" className={BUTTON} disabled={!state?.canUndo} onClick={() => onIntent({ kind: 'undo' })}>
          Step back
        </button>
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
              <span className="text-xs text-gray-500 dark:text-gray-400">Attack:</span>
              {DIRECTIONS.map((direction) => (
                <button
                  key={direction}
                  type="button"
                  className={armedDirection === direction ? ACTIVE : BUTTON}
                  disabled={selection.hasAttacked || selection.attackByDir[direction].length === 0}
                  onClick={() => onArmDirection(armedDirection === direction ? null : direction)}
                >
                  {direction}
                </button>
              ))}
              {armedDirection && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {selection.kind === 'npc' ? 'click a highlighted tile to attack it' : 'click any highlighted tile to attack'}
                </span>
              )}
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
