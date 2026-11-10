/**
 * ISWC 2026 Comprehensive Demo
 * Seed: docs/mcp-demo/seeds/iswc2026-comprehensive.md
 *
 * Full walkthrough: load PMDCO shape-data via URL param, resolve labels,
 * load community SHACL auto-shapes, run reasoning, inspect violations,
 * fix via authoring (TBox class + ABox individual + edge), re-validate, and export.
 *
 * Run:  npx playwright test --config=playwright.demo.config.ts e2e/demo-iswc2026-comprehensive.spec.ts
 * Keyframes: DEMO_KEYFRAMES=1 npx playwright test --config=playwright.demo.config.ts e2e/demo-iswc2026-comprehensive.spec.ts
 */

import { test } from '@playwright/test';
import { DemoRunner } from './demo-runner.js';

const BASE_URL = process.env.DEMO_BASE_URL || 'http://localhost:8080';
const DATA_URL = 'https://raw.githubusercontent.com/materialdigital/core-ontology/refs/heads/main/patterns/chemical%20composition/shape-data.ttl';
const SEED = 'docs/mcp-demo/seeds/iswc2026-comprehensive.md';

test('iswc2026-comprehensive', async ({ page }) => {
  test.setTimeout(480_000);

  const runner = new DemoRunner(page, BASE_URL);
  runner.setDemoName('iswc2026-comprehensive');
  const turns = DemoRunner.parseSeed(SEED);

  const turnBySlug = (slug: string) => turns.find(t => t.slug === slug);

  // ── Scene 1 — Open app + load data via URL param ────────────────────────
  await runner.openApp();
  await runner.captionPause('Ontosphere — Zero-Install Semantic Web Workbench', 3_000);

  await runner.caption('Loading PMDCO materials data via ?url= parameter');
  await runner.pauseMs(2_000);
  await runner.clearCaption();

  await page.goto(`${BASE_URL}?url=${encodeURIComponent(DATA_URL)}`);
  await page.waitForFunction(
    () => !!(window as any).__mcpTools && typeof (window as any).__mcpTools['addNode'] === 'function' && ((window as any).__startupComplete?.() ?? true),
    { timeout: 30_000 },
  );
  await runner.verifyState(
    () => page.locator('.reactodia-overlaid-element').first().isVisible(),
    'Nodes should appear after URL param load',
    15_000,
  );

  // ── Seed turns by slug ──────────────────────────────────────────────────
  const slugs = [
    'data-loaded',
    'pmdco-autocomplete',
    'ontology-loaded',
    'shacl-settings',
    'shapes-loaded',
    'after-reasoning',
    'reasoning-report',
    'navigate-error',
    'hover-halo-error',
    'switch-tbox',
    'bandgap-class-created',
    'bandgap-individual-created',
    'edge-drawn',
    'after-save',
    'after-revalidation',
    'export-hover',
  ];

  for (const slug of slugs) {
    const turn = turnBySlug(slug);
    if (!turn) {
      console.warn(`[ISWC] Slug not found in seed: ${slug}`);
      continue;
    }
    console.log(`[ISWC] Running: ${slug}`);

    // Special handling for reasoning steps
    const isReasoningClick = turn.steps.some(
      s => s.kind === 'action' && s.type === 'click' && s.selector?.includes('Run reasoning'),
    );
    if (isReasoningClick) {
      await runner.caption('Running OWL 2 DL reasoning + SHACL validation — PMDCO is large, this takes a moment…');
    }

    await runner.runSeedTurn(turn, 600);

    // Post-turn hooks
    if (slug === 'ontology-loaded') {
      await page.evaluate(async () => {
        const tools = (window as any).__mcpTools;
        if (tools?.['runLayout']) await tools['runLayout']({ algorithm: 'dagre-tb', spacing: 200 });
        if (tools?.['fitCanvas']) await tools['fitCanvas']({});
      });
      await runner.pauseMs(3_000);
    } else if (isReasoningClick) {
      await runner.verifyState(
        async () => {
          const indicator = page.locator('button.glass-btn--status-ok, button.glass-btn--status-error');
          return indicator.first().isVisible();
        },
        'Reasoning indicator should show result status',
        60_000,
      );
      await runner.pauseMs(2_000);
    } else {
      await runner.pauseMs(1_500);
    }
  }

  // ── Closing ──────────────────────────────────────────────────────────────
  await runner.captionPause('Ontosphere — zero-install, in-browser, open-source', 3_000);
  await runner.clearCaption();
  await runner.pauseMs(1_500);

  runner.writeKeyframeSummary();
});
