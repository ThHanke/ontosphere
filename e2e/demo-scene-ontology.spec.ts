/**
 * Generated from: docs/demo-scripts/scene-ontology.md
 * Seed:           docs/mcp-demo/seeds/scene-ontology.md
 *
 * Run:  npm run demo:video
 * Output: docs/demo-videos/scene-ontology.webm / .mp4
 */

import { test } from '@playwright/test';
import { DemoRunner } from './demo-runner.js';

const BASE_URL = process.env.DEMO_BASE_URL || 'http://localhost:8080';
const SEED = 'docs/mcp-demo/seeds/scene-ontology.md';

test('scene-ontology: AI builds a film scene ontology on BFO/RO upper ontology', async ({ page }) => {
  const runner = new DemoRunner(page, BASE_URL);
  const turns = DemoRunner.parseSeed(SEED);

  await runner.openApp();
  await runner.captionPause('Ontosphere — AI builds a film scene ontology on BFO + RO', 2_500);

  for (const turn of turns) {
    const isReasoningTurn = turn.toolCalls.some(c => c.name === 'runReasoning');
    await runner.runSeedTurn(turn, 250, { captionAfter: isReasoningTurn });
    await runner.pauseMs(600);
  }

  await runner.captionPause('Domain ontology for film scene classification — built entirely by AI tool calls', 3_500);
  await runner.clearCaption();
  await runner.pauseMs(1_500);
});
