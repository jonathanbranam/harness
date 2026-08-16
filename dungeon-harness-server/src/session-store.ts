// sessionId -> AgentSession map, per pi-harness.md's "in-process agent
// runtime" section. This harness is single-user, so sessionId is simply the
// caller's auth session token: one browser login gets one long-lived
// AgentSession, reused across WebSocket reconnects (page reloads, dropped
// connections) until logout disposes it.
//
// Unlike deck-harness-server's session-store.ts, there's no requestRender
// callback and no custom tool names — this phase registers no
// dungeon-tactics tools and has no board state to broadcast yet. See
// design.md's "Session-store has no domain-state broadcast" decision.

import { join } from 'node:path'
import { createAgentSession, DefaultResourceLoader, getAgentDir, ModelRuntime, SessionManager, type AgentSession } from '@earendil-works/pi-coding-agent'
import { env } from './env'
import { ensureAgentWorkspace } from './agent-workspace'
import { createPermissionGateExtension, type RequestApproval } from './pi-extensions/permission-gate'

const TEMPLATES_DIR = join(import.meta.dirname, '..', 'templates', 'agent-workspace')

// One ModelRuntime for the whole process: it owns credential/catalog state
// that has no reason to be duplicated per chat session.
const modelRuntimePromise = ModelRuntime.create()

interface SessionRecord {
  session: AgentSession
  callbacks: SessionCallbacks
}

const sessions = new Map<string, SessionRecord>()

const BUILTIN_TOOLS = ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls'] as const

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
  const existing = sessions.get(sessionId)
  if (existing) {
    if (opts.rebind) existing.callbacks = callbacks
    return existing.session
  }

  const cwd = ensureAgentWorkspace(env.DUNGEON_WORKSPACE_DIR, TEMPLATES_DIR)
  const modelRuntime = await modelRuntimePromise

  // record.callbacks can be mutated by a later rebind (see above), so route
  // through it indirectly instead of closing over this call's callbacks by
  // value.
  const record: SessionRecord = { session: undefined as unknown as AgentSession, callbacks }
  const requestApproval: RequestApproval = (request) => record.callbacks.requestApproval(request)

  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    extensionFactories: [createPermissionGateExtension({ cwd, requestApproval })],
  })
  await resourceLoader.reload()

  const { session } = await createAgentSession({
    modelRuntime,
    sessionManager: SessionManager.inMemory(cwd),
    cwd,
    resourceLoader,
    tools: [...BUILTIN_TOOLS],
  })

  // A reconnect racing this same async setup would otherwise create two
  // sessions for one sessionId; last write wins, but check again just before
  // committing so a concurrent caller's session (if any) is reused instead.
  const raced = sessions.get(sessionId)
  if (raced) {
    session.dispose()
    if (opts.rebind) raced.callbacks = callbacks
    return raced.session
  }
  record.session = session
  sessions.set(sessionId, record)
  return session
}

export function disposeSession(sessionId: string) {
  const record = sessions.get(sessionId)
  if (!record) return
  record.session.dispose()
  sessions.delete(sessionId)
}
