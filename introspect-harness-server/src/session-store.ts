import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { createAgentSession, DefaultResourceLoader, getAgentDir, ModelRuntime, SessionManager, type AgentSession } from '@earendil-works/pi-coding-agent'
import { env } from './env'
import { ensureAgentWorkspace } from './agent-workspace'
import { introspectionBridge } from './pi-extensions/introspection-bridge'

const TEMPLATES_DIR = join(import.meta.dirname, '..', 'templates', 'agent-workspace')

const modelRuntimePromise = ModelRuntime.create()

const sessions = new Map<string, HarnessSession>()

const ALLOWED_TOOLS = ['read', 'bash', 'write', 'edit', 'grep', 'find', 'ls'] as const

export interface HarnessSession {
  session: AgentSession
  events: EventEmitter
}

export async function getOrCreateSession(sessionId: string): Promise<HarnessSession> {
  const existing = sessions.get(sessionId)
  if (existing) return existing

  const cwd = ensureAgentWorkspace(env.INTROSPECT_WORKSPACE_DIR, TEMPLATES_DIR)
  const modelRuntime = await modelRuntimePromise
  const events = new EventEmitter()

  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    extensionFactories: [introspectionBridge(events)],
  })
  await resourceLoader.reload()

  const { session } = await createAgentSession({
    modelRuntime,
    sessionManager: SessionManager.inMemory(cwd),
    cwd,
    resourceLoader,
    tools: [...ALLOWED_TOOLS],
  })

  const raced = sessions.get(sessionId)
  if (raced) {
    session.dispose()
    return raced
  }

  const harnessSession: HarnessSession = { session, events }
  sessions.set(sessionId, harnessSession)
  console.log(`[session] created ${sessionId}`)
  return harnessSession
}

export function disposeSession(sessionId: string) {
  const harnessSession = sessions.get(sessionId)
  if (!harnessSession) return
  harnessSession.session.dispose()
  sessions.delete(sessionId)
  console.log(`[session] disposed ${sessionId}`)
}
