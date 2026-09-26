/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  return { plugins: [react()], server: { port: 5173, strictPort: true,
    fs: { allow: [fileURLToPath(new URL('.', import.meta.url))], deny: ['.env', '.env.*', '**/.git/**', '**/.private-storage/**', '**/backend/**'] },
    proxy: { '/api': { target: env.API_PROXY_TARGET || 'http://127.0.0.1:8000' } } },
    // userEvent-heavy jsdom tests run near 5 s when files execute in parallel.
    test: { testTimeout: 15000 } }
})
