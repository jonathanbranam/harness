// sessionId -> AgentSession map, per pi-harness.md's "in-process agent
// runtime" section. This harness is single-user, so sessionId is simply the
// caller's auth session token: one browser login gets one long-lived
// AgentSession, reused across WebSocket reconnects (page reloads, dropped
// connections) until logout disposes it.
//
// Each session also gets its own BoardStore (design.md's "instantiated per
// session, not a module-level singleton" decision) — a board belongs to one
// design session's scenario work, the same way the AgentSession itself is
// already per-session rather than shared.

import { join } from 'node:path'
import { createAgentSession, DefaultResourceLoader, getAgentDir, ModelRuntime, SessionManager, type AgentSession } from '@earendil-works/pi-coding-agent'
import { env } from './env'
import { ensureAgentWorkspace } from './agent-workspace'
import { BoardStore } from './board-state'
import { createBaselineBridgeExtension } from './pi-extensions/baseline-bridge'
import { createBoardBridgeExtension } from './pi-extensions/board-bridge'
import { createPermissionGateExtension, type RequestApproval } from './pi-extensions/permission-gate'
import { createScenarioBridgeExtension } from './pi-extensions/scenario-bridge'

const TEMPLATES_DIR = join(import.meta.dirname, '..', 'templates', 'agent-workspace')

// One ModelRuntime for the whole process: it owns credential/catalog state
// that has no reason to be duplicated per chat session.
const modelRuntimePromise = ModelRuntime.create()

interface SessionRecord {
  session: AgentSession
  board: BoardStore
  callbacks: SessionCallbacks
}

const sessions = new Map<string, SessionRecord>()

const BUILTIN_TOOLS = ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls'] as const
const CUSTOM_TOOL_NAMES = [
  'dungeon_get_board_state',
  'dungeon_set_cell_fill',
  'dungeon_draw_shape',
  'dungeon_draw_line',
  'dungeon_draw_overlay',
  'dungeon_draw_label',
  'dungeon_move_object',
  'dungeon_remove_object',
  'dungeon_clear_board',
  'dungeon_read_feature',
  'dungeon_write_feature',
  'dungeon_write_implementation_notes',
  'dungeon_load_baseline',
  'dungeon_read_step_catalog',
  'dungeon_get_changeset',
  'dungeon_write_changeset',
] as const

export interface SessionCallbacks {
  requestApproval: RequestApproval
}

/**
 * @param rebind Re-point the session's requestApproval at `callbacks` even
 *   if the session already existed. Pass `true` only when `callbacks`
 *   belongs to the connection that's about to originate a new agent turn
 *   (the `prompt` handler) — not from `onOpen`, where a second tab merely
 *   loading history would otherwise steal routing away from whichever
 *   connection has a turn in flight. See session-store.ts's counterpart in
 *   deck-harness-server for the same pattern: the session outlives any one
 *   connection, but a tool call mid-turn (an approval) must reach whichever
 *   connection is live *for that turn*, not whichever connection happened to
 *   create the session originally.
 */
export async function getOrCreateSession(sessionId: string, callbacks: SessionCallbacks, opts: { rebind?: boolean } = {}): Promise<AgentSession> {
  const record = await getOrCreateSessionRecord(sessionId, callbacks, opts)
  return record.session
}

/** The session's BoardStore, creating the session (and its board) first if it doesn't exist yet — used by websocket.ts to subscribe/broadcast board state alongside the agent-event stream. */
export async function getOrCreateBoardStore(sessionId: string, callbacks: SessionCallbacks, opts: { rebind?: boolean } = {}): Promise<BoardStore> {
  const record = await getOrCreateSessionRecord(sessionId, callbacks, opts)
  return record.board
}

async function getOrCreateSessionRecord(sessionId: string, callbacks: SessionCallbacks, opts: { rebind?: boolean } = {}): Promise<SessionRecord> {
  const existing = sessions.get(sessionId)
  if (existing) {
    if (opts.rebind) existing.callbacks = callbacks
    return existing
  }

  const cwd = ensureAgentWorkspace(env.DUNGEON_WORKSPACE_DIR, TEMPLATES_DIR)
  const modelRuntime = await modelRuntimePromise
  const board = new BoardStore()

  // record.callbacks can be mutated by a later rebind (see above), so route
  // through it indirectly instead of closing over this call's callbacks by
  // value.
  const record: SessionRecord = { session: undefined as unknown as AgentSession, board, callbacks }
  const requestApproval: RequestApproval = (request) => record.callbacks.requestApproval(request)

  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    extensionFactories: [
      createPermissionGateExtension({ cwd, requestApproval }),
      createBoardBridgeExtension({ board }),
      createScenarioBridgeExtension({ cwd }),
      createBaselineBridgeExtension({ cwd, trackWebFeaturesDir: env.DUNGEON_TRACKWEB_FEATURES_DIR }),
    ],
  })
  await resourceLoader.reload()

  const { session } = await createAgentSession({
    modelRuntime,
    sessionManager: SessionManager.inMemory(cwd),
    cwd,
    resourceLoader,
    tools: [...BUILTIN_TOOLS, ...CUSTOM_TOOL_NAMES],
  })

  // A reconnect racing this same async setup would otherwise create two
  // sessions for one sessionId; last write wins, but check again just before
  // committing so a concurrent caller's session (if any) is reused instead.
  const raced = sessions.get(sessionId)
  if (raced) {
    session.dispose()
    if (opts.rebind) raced.callbacks = callbacks
    return raced
  }
  record.session = session
  sessions.set(sessionId, record)
  return record
}

export function disposeSession(sessionId: string) {
  const record = sessions.get(sessionId)
  if (!record) return
  record.session.dispose()
  sessions.delete(sessionId)
}
