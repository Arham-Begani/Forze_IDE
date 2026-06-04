import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1',
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    emptyOutDir: true,
  },
  // Workspace packages ship as TS source (main: ./src/index.ts). Excluding them
  // from dep pre-bundling means edits to e.g. the Gemini provider hot-reload
  // instead of being frozen in Vite's .vite dep cache.
  optimizeDeps: {
    exclude: ['@forze/agents', '@forze/shared'],
  },
  envPrefix: ['VITE_', 'TAURI_'],
});
