import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true,
    port: 5173,
  },
  optimizeDeps: {
    include: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage'],
    esbuildOptions: {
      format: 'esm',
    },
  },
  build: {
    target: 'esnext',
  },
});
