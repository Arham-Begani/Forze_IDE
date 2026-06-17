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
    // Split the big, eager, rarely-changing vendors out of the app chunk so the
    // webview parses them as separate units and the app's own code (which churns
    // on every edit) stays lean. Deliberately NOT a catch-all: only modules named
    // here are grouped, so dynamic-only deps (e.g. Prettier in lib/format) keep
    // their lazy async chunks instead of being pulled eager into a vendor blob.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('highlight.js')) return 'vendor-highlight';
          if (id.includes('@xterm')) return 'vendor-xterm';
          if (id.includes('@supabase')) return 'vendor-supabase';
          if (id.includes('lucide-react')) return 'vendor-icons';
          if (
            id.includes('/react-dom/') ||
            id.includes('/react/') ||
            id.includes('/scheduler/')
          ) {
            return 'vendor-react';
          }
        },
      },
    },
  },
  // Workspace packages ship as TS source (main: ./src/index.ts). Excluding them
  // from dep pre-bundling means edits to e.g. the Gemini provider hot-reload
  // instead of being frozen in Vite's .vite dep cache.
  optimizeDeps: {
    exclude: ['@forze/agents', '@forze/shared'],
  },
  envPrefix: ['VITE_', 'TAURI_'],
});
