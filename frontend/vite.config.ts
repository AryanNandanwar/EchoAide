import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const e2eBackendPort = process.env.E2E_BACKEND_PORT ?? '3099'
const apiProxyTarget =
  process.env.VITE_E2E_USE_API === 'true'
    ? `http://127.0.0.1:${e2eBackendPort}`
    : 'http://localhost:3000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
  ],

  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.spec.{ts,tsx}'],
    css: true,
  },

  server: {
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
      '/socket.io': {
        target: apiProxyTarget,
        changeOrigin: true,
        ws: true,
      },
    },
  },
})