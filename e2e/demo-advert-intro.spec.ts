/**
 * Generated from: docs/demo-scripts/advert-intro.md
 *
 * Run:  npm run demo:video
 * Output: docs/demo-videos/advert-intro.webm / .mp4
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
  await runner.captionPause('Ontosphere — AI-powered knowledge graph editor', 2_500);

  // Mode explanation beat
  await runner.caption('The mock chat simulates real AI interfaces…');
  const chatFrame = page.frameLocator('iframe >> nth=0');
  await chatFrame.locator('#mode-fhgenie').hover();
  await runner.pauseMs(800);
  await chatFrame.locator('#mode-openwebui').hover();
  await runner.pauseMs(800);
  await chatFrame.locator('#mode-chatgpt').hover();
  await runner.pauseMs(800);
  await runner.captionPause('FhGenie, OpenWebUI, ChatGPT — swap in any real chat interface', 2_500);
  await runner.switchMode('fhgenie');

  // Inject bookmarklet
  await runner.captionPause('Install the bookmarklet once — it bridges AI chat to Ontosphere', 2_000);
  await runner.injectBookmarklet();
  await runner.captionPause('Relay connected ✓', 1_200);

  // Single addNode
  await runner.caption('Ask the AI to add a node…');
  await runner.clickScenario('single');
  const singleResult = await runner.waitForResult(20_000);
  expect(singleResult).toContain('[Ontosphere — 1 tool ✓]');
  await runner.captionPause('Node added to the graph in real time ✓', 2_000);

  // Full scenario
  await runner.clearChat();
  await runner.caption('Now run a full workflow — nodes, links, layout, export…');
  await runner.clickScenario('full');
  const fullResult = await runner.waitForResult(30_000);
  expect(fullResult).toMatch(/\[Ontosphere/);
  await runner.captionPause('Graph built entirely by AI tool calls through the relay ✓', 3_000);
});
