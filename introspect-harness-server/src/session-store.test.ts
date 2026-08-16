import { afterEach, describe, expect, it, vi } from 'vitest'

// session-store.ts creates a real AgentSession via @earendil-works/pi-coding-agent,
// which needs model auth and a live extension runtime — none of which this test
// cares about. Mock the SDK surface so getOrCreateSession can run against a fake,
// disposable "session" object, and assert on workspace-seed's reset call instead.
vi.mock('@earendil-works/pi-coding-agent', () => ({
  ModelRuntime: { create: vi.fn(async () => ({})) },
  DefaultResourceLoader: class {
    async reload() {}
  },
  getAgentDir: () => '/tmp/agent-dir',
  SessionManager: { create: vi.fn(() => ({})) },
  createAgentSession: vi.fn(async () => ({
    session: { dispose: vi.fn(), prompt: vi.fn(), isStreaming: false },
  })),
}))

vi.mock('./workspace-seed', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./workspace-seed')>()
  return { ...actual, resetWorkspaceToSeed: vi.fn(actual.resetWorkspaceToSeed) }
})

describe('getOrCreateSession', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('resets the sandbox to the seed for a new session, but not on reconnect', async () => {
    const { getOrCreateSession, disposeSession } = await import('./session-store')
    const { resetWorkspaceToSeed } = await import('./workspace-seed')

    const first = await getOrCreateSession('session-a')
    expect(resetWorkspaceToSeed).toHaveBeenCalledTimes(1)

    // Reconnect to the same session: no new AgentSession, no reseed.
    const second = await getOrCreateSession('session-a')
    expect(second).toBe(first)
    expect(resetWorkspaceToSeed).toHaveBeenCalledTimes(1)

    // A different session id is a genuinely new session: reseeds again.
    await getOrCreateSession('session-b')
    expect(resetWorkspaceToSeed).toHaveBeenCalledTimes(2)

    disposeSession('session-a')
    disposeSession('session-b')
  })
})
