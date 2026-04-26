import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** Where the Express API listens during `npm run dev` (see server `PORT`). */
const apiDevTarget =
  process.env.API_PROXY_TARGET || process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:5000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: apiDevTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 750,
  },
});
