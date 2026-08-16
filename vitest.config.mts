import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['deck-harness-server/src/**/*.test.ts', 'introspect-harness-server/src/**/*.test.ts'],
    env: {
      // editor-state.ts's module-level `editorStore` singleton loads this file at import
      // time; point it at a path that never exists so tests always get the hardcoded demo
      // deck instead of the always-running dev server's real, mutating decks.json.
      DECK_STATE_FILE: 'deck-harness-server/data/.test-fixture-never-created.json',
    },
  },
})
