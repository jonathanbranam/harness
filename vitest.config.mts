import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['deck-harness-server/src/**/*.test.ts'],
  },
})
