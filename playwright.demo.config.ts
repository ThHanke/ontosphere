import { defineConfig } from '@playwright/test';

export default defineConfig({
  testMatch: '**/e2e/demo-*.spec.ts',
  outputDir: 'test-results/demo',
  timeout: 120_000,
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
