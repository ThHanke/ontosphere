/**
 * Seed: docs/mcp-demo/seeds/pizza-tutorial.md
 *
 * Run:  npm run demo:video
 * Output: docs/demo-videos/pizza-tutorial.webm / .mp4
 */

import { test } from '@playwright/test';
import { DemoRunner } from './demo-runner.js';

const BASE_URL = process.env.DEMO_BASE_URL || 'http://localhost:8080';
const SEED = 'docs/mcp-demo/seeds/pizza-tutorial.md';

test('pizza-tutorial: Manchester Pizza Ontology — class hierarchy, disjointness, OWL-RL reasoning', async ({ page }) => {
  const runner = new DemoRunner(page, BASE_URL);
  const turns = DemoRunner.parseSeed(SEED);

  await runner.openApp();
  await runner.captionPause('Ontosphere — rebuilding the Manchester Pizza Tutorial in OWL', 2_500);

  for (const turn of turns) {
    const isReasoningTurn = turn.toolCalls.some(c => c.name === 'runReasoning');
    await runner.runSeedTurn(turn, 250, { captionAfter: isReasoningTurn });
    await runner.pauseMs(600);
  }

  await runner.captionPause('Pizza types, topping superclasses, and inverse edges — all inferred by OWL-RL', 3_500);
  await runner.clearCaption();
  await runner.pauseMs(1_500);
});
