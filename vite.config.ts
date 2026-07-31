import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(() => {
  return {
    server: {
      port: 3003,
      strictPort: true,
      host: '0.0.0.0',
      watch: {
        ignored: [
          '**/data/**',
          '**/state/**',
          '**/*.db',
          '**/*.db-shm',
          '**/*.db-wal',
          '**/*.sqlite',
          '**/*.sqlite-shm',
          '**/*.sqlite-wal',
        ],
      },
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3004',
          changeOrigin: true,
          // Backend routes are mounted at /media, /settings, etc. (no /api prefix).
          rewrite: (path) => path.replace(/^\/api/, ''),
        }
      }
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
