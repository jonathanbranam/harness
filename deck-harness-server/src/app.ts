import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import { createNodeWebSocket } from '@hono/node-ws'
import { requireAuth } from './auth'
import { authRoutes } from './routes/auth'
import type { AppEnv } from './types'
import { createDeckSocketHandlers } from './websocket'

// Root relative to cwd (serveStatic doesn't support absolute paths) — the
// dev/start scripts always run with deck-harness-server as cwd via `npm run
// ... -w deck-harness-server`, so this resolves to the sibling client-deck
// build.
const CLIENT_DIST = '../client-deck/dist'

export function createApp() {
  const app = new Hono<AppEnv>()
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

  app.get('/api/health', (c) => c.json({ ok: true }))
  app.route('/api/auth', authRoutes)

  app.get('/ws', requireAuth, upgradeWebSocket((c) => createDeckSocketHandlers(c)))

  // SPA static hosting: serve the built client-deck assets, falling back to
  // index.html for client-side routes. In dev, client-deck runs on its own
  // Vite server instead (see dev-local.sh) and this just 404s harmlessly.
  app.use('/*', serveStatic({ root: CLIENT_DIST }))
  app.get('*', serveStatic({ root: CLIENT_DIST, path: 'index.html' }))

  return { app, injectWebSocket }
}
