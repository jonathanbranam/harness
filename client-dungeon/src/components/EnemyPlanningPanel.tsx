import type { BenchIntent, BenchState, NpcMoveChoice } from '../bench/types'

/**
 * Where the designer is in planning one enemy's turn by hand, or amending a
 * locked telegraph. Owned by `DungeonPage` (it drives board tile clicks too,
 * not just this panel), passed down alongside the intent sender.
 *
 * Mirrors design.md's two-step selection: pick the enemy, pick a destination
 * (or hold), see what that puts in reach, then commit. Amend collapses to one
 * step, since a locked telegraph never moves the enemy — the candidate is
 * always `{ kind: 'stay' }`.
 */
export type NpcPlanStep =
  | { stage: 'choose-destination'; unitId: string }
  | { stage: 'choose-attack'; unitId: string; move: NpcMoveChoice }
  | { stage: 'amend'; unitId: string }

interface EnemyPlanningPanelProps {
  state: BenchState | null
  npcPlan: NpcPlanStep | null
  onNpcPlanChange: (step: NpcPlanStep | null) => void
  onIntent: (intent: BenchIntent) => void
}

const BUTTON = 'px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'
const CHIP = 'flex items-center gap-1.5 px-2 py-1 rounded border border-gray-200 dark:border-gray-800 text-xs'

/**
 * The designer's seat: plan any enemy's turn by hand, hand one named enemy (or
 * every enemy still unplanned) to the AI, see who planned what, and retarget a
 * locked telegraph during the player phase. Has no counterpart in the shipped
 * game — see proposal.md.
 *
 * Deliberately no reorder control: the order enemies are planned in *is* the
 * round's turn order (design.md), so the only ordering surface here is which
 * "Plan by hand" / "Hand to AI" button the designer presses next.
 */
export function EnemyPlanningPanel({ state, npcPlan, onNpcPlanChange, onIntent }: EnemyPlanningPanelProps) {
  if (!state) return null
  const { phase, telegraphs, unplannedNpcs, npcAuthorship } = state
  const npcs = state.units.filter((u) => u.kind === 'npc')
  const showPlanning = phase === 'npc-move' && npcs.length > 0
  const showAmend = phase === 'player' && telegraphs.length > 0
  if (!showPlanning && !showAmend) return null

  function beginHandPlan(unitId: string) {
    onIntent({ kind: 'select', unitId })
    onNpcPlanChange({ stage: 'choose-destination', unitId })
  }

  function stayInPlace(unitId: string) {
    const move: NpcMoveChoice = { kind: 'stay' }
    onIntent({ kind: 'setNpcPlanCandidate', unitId, move })
    onNpcPlanChange({ stage: 'choose-attack', unitId, move })
  }

  function confirmMoveOnly() {
    if (npcPlan?.stage !== 'choose-attack') return
    onIntent({ kind: 'planEnemyByHand', unitId: npcPlan.unitId, move: npcPlan.move })
    onNpcPlanChange(null)
  }

  function beginAmend(unitId: string) {
    onIntent({ kind: 'select', unitId })
    onIntent({ kind: 'setNpcPlanCandidate', unitId, move: { kind: 'stay' } })
    onNpcPlanChange({ stage: 'amend', unitId })
  }

  function cancel() {
    if (npcPlan) {
      onIntent({ kind: 'setNpcPlanCandidate', unitId: npcPlan.unitId, move: null })
      onIntent({ kind: 'select', unitId: null })
    }
    onNpcPlanChange(null)
  }

  return (
    <div className="flex flex-col gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-800 text-gray-800 dark:text-gray-200">
      {showPlanning && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold">Enemy planning</span>
          <div className="flex flex-wrap gap-1.5">
            {npcs.map((npc) => {
              const isUnplanned = unplannedNpcs.includes(npc.id)
              const author = npcAuthorship[npc.id]
              const isActive = npcPlan?.unitId === npc.id && npcPlan.stage !== 'amend'
              return (
                <div key={npc.id} className={`${CHIP} ${isActive ? 'border-indigo-500' : ''}`}>
                  <span className="font-medium">{npc.id}</span>
                  {isUnplanned ? (
                    <>
                      <button type="button" className={BUTTON} onClick={() => beginHandPlan(npc.id)}>
                        Plan by hand
                      </button>
                      <button type="button" className={BUTTON} onClick={() => onIntent({ kind: 'planEnemyByAi', unitId: npc.id })}>
                        Hand to AI
                      </button>
                    </>
                  ) : (
                    <span className="text-gray-500 dark:text-gray-400">planned by {author ?? '?'}</span>
                  )}
                </div>
              )
            })}
          </div>

          {npcPlan?.stage === 'choose-destination' && (
            <div className="text-xs text-gray-600 dark:text-gray-300">
              Click a highlighted tile to move <strong>{npcPlan.unitId}</strong> there, or
              <button type="button" className={`${BUTTON} mx-1.5`} onClick={() => stayInPlace(npcPlan.unitId)}>
                Stay in place
              </button>
              <button type="button" className={BUTTON} onClick={cancel}>
                Cancel
              </button>
            </div>
          )}
          {npcPlan?.stage === 'choose-attack' && (
            <div className="text-xs text-gray-600 dark:text-gray-300">
              Click an amber tile to telegraph <strong>{npcPlan.unitId}</strong>'s attack there, or
              <button type="button" className={`${BUTTON} mx-1.5`} onClick={confirmMoveOnly}>
                Confirm — no attack
              </button>
              <button type="button" className={BUTTON} onClick={cancel}>
                Cancel
              </button>
            </div>
          )}
          {unplannedNpcs.length === 0 && !npcPlan && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Every enemy is planned — press Step or "Plan enemy turn" to move on to the player phase.
            </span>
          )}
        </div>
      )}

      {showAmend && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold">Pending enemy telegraphs</span>
          <div className="flex flex-wrap gap-1.5">
            {telegraphs.map((t) => (
              <div key={t.unitId} className={CHIP}>
                <span className="font-medium">{t.unitId}</span>
                <span className="text-gray-500 dark:text-gray-400">
                  → ({t.targetCol}, {t.targetRow})
                </span>
                <button type="button" className={BUTTON} onClick={() => beginAmend(t.unitId)}>
                  Amend
                </button>
              </div>
            ))}
          </div>
          {npcPlan?.stage === 'amend' && (
            <div className="text-xs text-gray-600 dark:text-gray-300">
              Click an amber tile to retarget <strong>{npcPlan.unitId}</strong>'s telegraph — this is
              retroactive, and the one thing here the game itself never allows.
              <button type="button" className={`${BUTTON} ml-1.5`} onClick={cancel}>
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
