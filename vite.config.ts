import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // FFmpeg.wasm constructs its module worker with new URL('./worker.js', import.meta.url).
    // Keeping it out of esbuild prebundling preserves the worker URL for Vite.
    exclude: ['@ffmpeg/ffmpeg'],
  },
  server: {
    port: 3000,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: false,
      },
    },
  },
  preview: {
    port: 3000,
    strictPort: true,
    host: '127.0.0.1',
  },
});
