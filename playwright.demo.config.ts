import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'demo-*.spec.ts',
  outputDir: 'test-results/demo',
  timeout: 600_000,
  fullyParallel: false,
  projects: [
    {
      name: 'demo',
      use: {
        browserName: 'chromium',
        headless: false,
        viewport: { width: 1920, height: 1080 },
        video: 'on',
        baseURL: 'http://localhost:8080',
      },
    },
  ],
});
