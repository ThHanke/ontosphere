/**
 * Feature Demo: Zero-Install + RDF Loading
 * Seed: docs/mcp-demo/seeds/feat-loading.md
 *
 * Shows loading external RDF via ?url= parameter, explaining unresolved labels,
 * loading PMDCO ontology via autocomplete, and ontology widget management.
 *
 * Run:  npx playwright test --config=playwright.demo.config.ts e2e/demo-feat-loading.spec.ts
 * Keyframes: DEMO_KEYFRAMES=1 npx playwright test --config=playwright.demo.config.ts e2e/demo-feat-loading.spec.ts
 */

import { test } from '@playwright/test';
import { DemoRunner } from './demo-runner.js';

const BASE_URL = process.env.DEMO_BASE_URL || 'http://localhost:8080';
const DATA_URL = 'https://raw.githubusercontent.com/materialdigital/core-ontology/refs/heads/main/patterns/chemical composition/shape-data.ttl';
const SEED = 'docs/mcp-demo/seeds/feat-loading.md';

test('feat-loading: URL param, unresolved labels, ontology autocomplete, widget', async ({ page }) => {
  test.setTimeout(180_000);

  const runner = new DemoRunner(page, BASE_URL);
  runner.setDemoName('feat-loading');
  const turns = DemoRunner.parseSeed(SEED);

  // Scene 1 — Open empty canvas
  await runner.openApp();
  await runner.captionPause('Ontosphere — Zero-Install RDF Loading', 3_500);

  // Scene 2 — Show the URL on empty canvas, then navigate
  await runner.caption(`Loading via ?url= parameter:\n${DATA_URL}`);
  await runner.pauseMs(4_000);
  await runner.clearCaption();

  await page.goto(`${BASE_URL}?url=${encodeURIComponent(DATA_URL)}`);
  await page.waitForFunction(
    () => !!(window as any).__mcpTools && typeof (window as any).__mcpTools['addNode'] === 'function' && ((window as any).__startupComplete?.() ?? true),
    { timeout: 20_000 },
  );

  // Wait for data to appear on canvas
  await runner.verifyState(
    () => page.locator('.reactodia-overlaid-element').first().isVisible(),
    'Nodes should appear after URL param load',
    15_000,
  );

  // Run the data-loaded turn (layout + fit)
  const dataLoadedTurn = turns.find(t => t.slug === 'data-loaded');
  if (dataLoadedTurn) {
    await runner.runSeedTurn(dataLoadedTurn, 600);
    await runner.pauseMs(2_500);
  }

  // Scene 3 — Hover on Load File button
  const loadFileHoverTurn = turns.find(t => t.slug === 'load-file-hover');
  if (loadFileHoverTurn) {
    await runner.runSeedTurn(loadFileHoverTurn, 600);
    await runner.pauseMs(2_000);
  }

  // Scene 4 — Explain unresolved labels
  const unresolvedTurn = turns.find(t => t.slug === 'unresolved-labels');
  if (unresolvedTurn) {
    await runner.runSeedTurn(unresolvedTurn, 600);
    await runner.pauseMs(2_500);
  }

  // Scene 5 — Explain owl:imports auto-discovery
  const owlImportsTurn = turns.find(t => t.slug === 'owl-imports-explain');
  if (owlImportsTurn) {
    await runner.runSeedTurn(owlImportsTurn, 600);
    await runner.pauseMs(4_000);
  }

  // Scene 6 — Open Load Ontology dialog
  const dialogTurn = turns.find(t => t.slug === 'load-ontology-dialog');
  if (dialogTurn) {
    await runner.runSeedTurn(dialogTurn, 600);
    await runner.pauseMs(2_000);
  }

  // Scene 6 — Type pmdco in autocomplete
  const autocompleteTurn = turns.find(t => t.slug === 'pmdco-autocomplete');
  if (autocompleteTurn) {
    await runner.runSeedTurn(autocompleteTurn, 600);
    await runner.pauseMs(2_000);
  }

  // Scene 7 — Select and load PMDCO
  const pmdcoLoadedTurn = turns.find(t => t.slug === 'pmdco-loaded');
  if (pmdcoLoadedTurn) {
    await runner.runSeedTurn(pmdcoLoadedTurn, 600);

    // Re-layout after ontology labels resolve
    await page.evaluate(async () => {
      const tools = (window as any).__mcpTools;
      if (tools?.['runLayout']) await tools['runLayout']({ algorithm: 'dagre-tb', spacing: 200 });
      if (tools?.['fitCanvas']) await tools['fitCanvas']({});
    });
    await runner.pauseMs(3_000);
  }

  // Scene 8 — Open ontology widget
  const widgetTurn = turns.find(t => t.slug === 'ontology-widget');
  if (widgetTurn) {
    await runner.runSeedTurn(widgetTurn, 600);
    await runner.pauseMs(3_000);
  }

  // Scene 9 — Hover management buttons (first visible of each type)
  await runner.caption('Remove from autoload — skip next session. Unload — remove right now.');
  await page.locator('.glass-btn:has-text("Remove from autoload")').first().hover();
  await runner.pauseMs(2_500);
  await page.locator('.glass-btn--status-error:has-text("Unload")').first().hover();
  await runner.pauseMs(2_500);
  await runner.captureKeyframe('ontology-management');

  await runner.captionPause('RDF Loading — URL parameter, local file, ontology resolution', 4_000);
  await runner.clearCaption();
  await runner.pauseMs(2_000);

  runner.writeKeyframeSummary();
});
