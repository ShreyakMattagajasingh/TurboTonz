import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  server: { host: true, port: 5173 },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        pad: resolve(__dirname, 'pad.html'),
      },
    },
  },
  test: { environment: 'node', include: ['tests/unit/**/*.test.js'] },
});
