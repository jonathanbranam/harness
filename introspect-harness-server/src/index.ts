import { serve } from '@hono/node-server'
import { createApp } from './app'
import { env } from './env'

const { app, injectWebSocket } = createApp()

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`introspect-harness-server listening on http://localhost:${info.port}`)
})

injectWebSocket(server)
