import { serve } from '@hono/node-server'
import { createApp } from './app'
import { flushPendingSave, startAutoSave } from './deck-persistence'
import { editorStore } from './editor-state'
import { env } from './env'

const { app, injectWebSocket } = createApp()

startAutoSave(editorStore, env.DECK_STATE_FILE)

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`deck-harness-server listening on http://localhost:${info.port}`)
})

injectWebSocket(server)

// Flush any pending debounced save before a graceful restart/shutdown
// discards it — see deck-persistence.ts's design notes on why a hard
// kill (SIGKILL) isn't covered by this.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    flushPendingSave()
    process.exit(0)
  })
}
