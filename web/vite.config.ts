import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// In development the UI talks to the API through this proxy; in the container nginx does it. Both
// add the API token when one is set, so the browser never holds it.
const apiTarget = process.env.CADENCIA_API_URL ?? 'http://localhost:8000';
const apiToken = process.env.CADENCIA_API_TOKEN;

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        headers: apiToken ? { Authorization: `Bearer ${apiToken}` } : undefined,
      },
    },
  },
  build: { chunkSizeWarningLimit: 2000 },
  // Pure logic only (lib/*.test.ts): components are checked in the browser.
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
