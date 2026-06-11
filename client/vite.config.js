import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // @easyphrf/shared is authored in CommonJS (so the Express server can require
  // it). It resolves through a workspace symlink to a source path outside
  // node_modules, so tell rollup's commonjs transform to handle it too — else
  // named imports like { formatDuration } fail at build time.
  build: {
    commonjsOptions: {
      include: [/shared[/\\]index\.js$/, /node_modules/],
    },
  },
  optimizeDeps: {
    include: ['@easyphrf/shared'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
