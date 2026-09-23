import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5188,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:3001',
      '/auth': 'http://127.0.0.1:3001',
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4188,
    strictPort: true,
  },
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 900,
  },
});
