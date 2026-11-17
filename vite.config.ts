import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
export default defineConfig({
  plugins: [svelte()],
  server: {
    allowedHosts: ['kiosk-dev.eos.mxwy.org'],
    proxy: {
      '/api': { target: 'http://127.0.0.1:5176', changeOrigin: false },
    },
  },
  build: { target: 'es2020' },
});
