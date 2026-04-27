/**
 * Generated from: docs/demo-scripts/advert-intro.md
 *
 * Run:  npm run demo:video
 * Output: docs/demo-videos/advert-intro.webm  (committed, regenerated on each run)
 *
 * Requires: dev server running at http://localhost:8080
 */

import { test, expect } from '@playwright/test';
import { DemoRunner } from './demo-runner.js';

const BASE_URL = process.env.DEMO_BASE_URL || 'http://localhost:8080';

test('advert-intro: relay demo — mock chat + Ontosphere side by side', async ({ page }) => {
  const runner = new DemoRunner(page, BASE_URL);

  // Open the stage — mock chat left, Ontosphere right
  await runner.openStage();

  // Let viewer take in both panels
  await runner.pauseMs(2_000);

  // Mode explanation beat: FhGenie / OpenWebUI / ChatGPT
  const chatFrame = page.frameLocator('iframe >> nth=0');
  await chatFrame.locator('#mode-fhgenie').hover();
  await runner.pauseMs(1_000);
  await chatFrame.locator('#mode-openwebui').hover();
  await runner.pauseMs(1_000);
  await chatFrame.locator('#mode-chatgpt').hover();
  await runner.pauseMs(1_000);
  // Return to FhGenie (default)
  await runner.switchMode('fhgenie');
  await runner.pauseMs(1_000);

  // Inject bookmarklet — relay popup appears
  await runner.injectBookmarklet();
  await runner.pauseMs(1_000);

  // Single addNode scenario
  await runner.clickScenario('single');
  const singleResult = await runner.waitForResult(20_000);
  expect(singleResult).toContain('[Ontosphere — 1 tool ✓]');
  await runner.pauseMs(2_000);

  // Clear and run full scenario
  await runner.clearChat();
  await runner.clickScenario('full');
  const fullResult = await runner.waitForResult(30_000);
  expect(fullResult).toMatch(/\[Ontosphere/);
  await runner.pauseMs(3_000);
});
