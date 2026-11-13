import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
export default defineConfig({
  plugins: [svelte()],
  server: {
    allowedHosts: ['kiosk-dev.eos.mxwy.org'],
  },
  build: { target: 'es2020' },
});
