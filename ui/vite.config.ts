import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// During dev, proxy API calls to the Express backend on :3000.
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
  },
});
