import { serve } from '@hono/node-server'
import { createApp } from './app'
import { env } from './env'

const { app, injectWebSocket } = createApp()

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`dungeon-harness-server listening on http://localhost:${info.port}`)
})

injectWebSocket(server)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => process.exit(0))
}
