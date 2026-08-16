import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['deck-harness-server/src/**/*.test.ts', 'introspect-harness-server/src/**/*.test.ts', 'dungeon-harness-server/src/**/*.test.ts'],
    env: {
      // editor-state.ts's module-level `editorStore` singleton loads this file at import
      // time; point it at a path that never exists so tests always get the hardcoded demo
      // deck instead of the always-running dev server's real, mutating decks.json.
      DECK_STATE_FILE: 'deck-harness-server/data/.test-fixture-never-created.json',
      // session-store.ts's module-level `sessions` map reads these at import time
      // and on every session creation; point them at test-only paths so tests never
      // touch (or reseed/wipe) the always-running dev server's real sandbox or
      // recordings directory.
      INTROSPECT_WORKSPACE_DIR: 'introspect-harness-server/data/.test-workspace-never-created',
      RECORDINGS_DIR: 'introspect-harness-server/data/.test-recordings-never-created',
    },
  },
})
