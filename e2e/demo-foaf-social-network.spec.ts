/**
 * Generated from: docs/demo-scripts/foaf-social-network.md
 * Seed:           docs/mcp-demo/seeds/foaf-social-network.md
 *
 * Run:  npm run demo:video
 * Output: docs/demo-videos/foaf-social-network.webm / .mp4
 */

import { test } from '@playwright/test';
import { DemoRunner } from './demo-runner.js';

const BASE_URL = process.env.DEMO_BASE_URL || 'http://localhost:8080';
const SEED = 'docs/mcp-demo/seeds/foaf-social-network.md';

test('foaf-social-network: AI builds a FOAF social graph with OWL-RL reasoning', async ({ page }) => {
  const runner = new DemoRunner(page, BASE_URL);
  const turns = DemoRunner.parseSeed(SEED);

  await runner.openApp();
  await runner.captionPause('Ontosphere — AI builds a FOAF social & employment graph', 2_500);

  for (const turn of turns) {
    await runner.runSeedTurn(turn, 250);
    await runner.pauseMs(600);
  }

  await runner.captionPause('Graph built by AI tool calls — OWL-RL reasoning inferred Frank\'s types', 3_500);
  await runner.clearCaption();
  await runner.pauseMs(1_500);
});
