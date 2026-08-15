import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const DEV_PORT = 5176
const BACKEND_PORT = 4200

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
