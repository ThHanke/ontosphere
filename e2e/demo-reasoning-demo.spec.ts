/**
 * Generated from: docs/demo-scripts/reasoning-demo.md
 * Seed:           docs/mcp-demo/seeds/reasoning-demo.md
 *
 * Run:  npm run demo:video
 * Output: docs/demo-videos/reasoning-demo.webm / .mp4
 */

import { test } from '@playwright/test';
import { DemoRunner } from './demo-runner.js';

const BASE_URL = process.env.DEMO_BASE_URL || 'http://localhost:8080';
const SEED = 'docs/mcp-demo/seeds/reasoning-demo.md';

test('reasoning-demo: AI builds an OWL ontology and runs OWL-RL reasoning', async ({ page }) => {
  const runner = new DemoRunner(page, BASE_URL);
  const turns = DemoRunner.parseSeed(SEED);

  await runner.openApp();
  await runner.captionPause('Ontosphere — AI builds an OWL ontology from scratch', 2_500);

  for (const turn of turns) {
    // For the reasoning turn, show the caption only after reasoning completes
    // so inferred links are already visible when the subtitle appears.
    const isReasoningTurn = turn.toolCalls.some(c => c.name === 'runReasoning');
    await runner.runSeedTurn(turn, 250, { captionAfter: isReasoningTurn });
    await runner.pauseMs(600);
  }

  await runner.captionPause('OWL-RL reasoning inferred types and relationships automatically', 3_500);
  await runner.clearCaption();
  await runner.pauseMs(1_500);
});
