import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Fixed dev port, mirroring track-web's per-app dev-ports.json convention
// (see docs/arch/track-web-architecture.md). Introduce a shared
// packages/config dev-ports registry (see pi-harness.md's "Suggested
// structure") once a client needs one badly enough to justify the
// extraction — see design.md's port-sequence decision.
const DEV_PORT = 5177
const BACKEND_PORT = 4300

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
