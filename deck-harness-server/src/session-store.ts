// sessionId -> AgentSession map, per pi-harness.md's "in-process agent
// runtime" section. This harness is single-user, so sessionId is simply the
// caller's auth session token: one browser login gets one long-lived
// AgentSession, reused across WebSocket reconnects (page reloads, dropped
// connections) until logout disposes it.

import { join } from 'node:path'
import { createAgentSession, DefaultResourceLoader, getAgentDir, ModelRuntime, SessionManager, type AgentSession } from '@earendil-works/pi-coding-agent'
import { env } from './env'
import { ensureAgentWorkspace } from './agent-workspace'
import { createPermissionGateExtension, type RequestApproval } from './pi-extensions/permission-gate'
import { presentationBridge } from './pi-extensions/presentation-bridge'

const TEMPLATES_DIR = join(import.meta.dirname, '..', 'templates', 'agent-workspace')

// One ModelRuntime for the whole process: it owns credential/catalog state
// that has no reason to be duplicated per chat session.
const modelRuntimePromise = ModelRuntime.create()

const sessions = new Map<string, AgentSession>()

const BUILTIN_TOOLS = ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls'] as const
const CUSTOM_TOOL_NAMES = ['presentation_get_state', 'presentation_update', 'presentation_select_by_text'] as const

export async function getOrCreateSession(sessionId: string, requestApproval: RequestApproval): Promise<AgentSession> {
  const existing = sessions.get(sessionId)
  if (existing) return existing

  const cwd = ensureAgentWorkspace(env.DECK_WORKSPACE_DIR, TEMPLATES_DIR)
  const modelRuntime = await modelRuntimePromise

  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    extensionFactories: [createPermissionGateExtension({ cwd, requestApproval }), presentationBridge],
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
    return raced
  }
  sessions.set(sessionId, session)
  return session
}

export function disposeSession(sessionId: string) {
  const session = sessions.get(sessionId)
  if (!session) return
  session.dispose()
  sessions.delete(sessionId)
}
