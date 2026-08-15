import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Fixed dev port, mirroring track-web's per-app dev-ports.json convention
// (see docs/arch/track-web-architecture.md). This harness only has one
// client so far; introduce a shared packages/config dev-ports registry (see
// pi-harness.md's "Suggested structure") once a second harness client needs
// one too.
const DEV_PORT = 5175
const BACKEND_PORT = 4100

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: DEV_PORT,
    proxy: {
      '/api': `http://localhost:${BACKEND_PORT}`,
      '/ws': { target: `ws://localhost:${BACKEND_PORT}`, ws: true },
    },
  },
})
