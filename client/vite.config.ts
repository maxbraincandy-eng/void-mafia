import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      // Two entries, one build. M.A.R.S. is a separate SITE (its own shell,
      // landing page and sign-in) but not a separate project — it shares the
      // components, the socket client and the server, so a record created on
      // one is the same record on the other.
      input: {
        main: path.resolve(__dirname, 'index.html'),
        mars: path.resolve(__dirname, 'mars.html'),
      },
    },
  },
});
