import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  use: {
    viewport: { width: 1280, height: 800 },
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'npm run dev -- --port 5173 --strictPort',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run build && npm run preview -- --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
