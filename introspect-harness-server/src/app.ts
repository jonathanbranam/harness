import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import { createNodeWebSocket } from '@hono/node-ws'
import { requireAuth } from './auth'
import { authRoutes } from './routes/auth'
import type { AppEnv } from './types'
import { createIntrospectSocketHandlers } from './websocket'

const CLIENT_DIST = '../client-introspect/dist'

export function createApp() {
  const app = new Hono<AppEnv>()
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

  app.get('/api/health', (c) => c.json({ ok: true }))
  app.route('/api/auth', authRoutes)

  app.get('/ws', requireAuth, upgradeWebSocket((c) => createIntrospectSocketHandlers(c)))

  app.use('/*', serveStatic({ root: CLIENT_DIST }))
  app.get('*', serveStatic({ root: CLIENT_DIST, path: 'index.html' }))

  return { app, injectWebSocket }
}
