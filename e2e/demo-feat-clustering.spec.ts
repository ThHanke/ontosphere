/**
 * Feature Demo: Hierarchical Clustering
 * Seed: docs/mcp-demo/seeds/feat-clustering.md
 *
 * Pure UI interaction — cluster pagination across ABox/TBox views,
 * algorithm selection, and level restore. No MCP tool calls.
 *
 * Run:  npx playwright test --config=playwright.demo.config.ts e2e/demo-feat-clustering.spec.ts
 * Keyframes: DEMO_KEYFRAMES=1 npx playwright test --config=playwright.demo.config.ts e2e/demo-feat-clustering.spec.ts
 */

import { test } from '@playwright/test';
import { DemoRunner } from './demo-runner.js';

const BASE_URL = process.env.DEMO_BASE_URL || 'http://localhost:8080';
const SEED = 'docs/mcp-demo/seeds/feat-clustering.md';

test('feat-clustering: pagination, algorithm selection, view-specific levels', async ({ page }) => {
  test.setTimeout(180_000);

  const runner = new DemoRunner(page, BASE_URL);
  runner.setDemoName('feat-clustering');
  const turns = DemoRunner.parseSeed(SEED);

  // Load via URL parameter — triggers full app init with auto L0→L1
  await page.goto(`${BASE_URL}/?rdfUrl=${encodeURIComponent(`${BASE_URL}/reasoning-demo.ttl`)}`);
  await page.waitForFunction(
    () => !!(window as any).__mcpTools && typeof (window as any).__mcpTools['addNode'] === 'function' && ((window as any).__startupComplete?.() ?? true),
    { timeout: 20_000 },
  );

  // Wait for auto L0→L1 (level-down button becomes enabled)
  const levelDown = page.locator('button:has-text("◄")');
  await runner.verifyState(
    async () => (await levelDown.getAttribute('disabled')) === null,
    'Level-down should be enabled after auto L0→L1',
    30_000,
  );

  await runner.captionPause('Hierarchical Clustering — view-specific pagination and algorithms', 3_500);

  for (const turn of turns) {
    await runner.runSeedTurn(turn, 600);
    await runner.pauseMs(2_500);
  }

  await runner.captionPause('Cluster pagination — per-view fold levels with configurable algorithms', 4_000);
  await runner.clearCaption();
  await runner.pauseMs(2_000);

  runner.writeKeyframeSummary();
});
