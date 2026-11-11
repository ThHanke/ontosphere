/**
 * Canvas memory budget. Every element and link on the canvas costs DOM nodes, listeners and renderer memory
 * (17,174 elements made LUBM-1 reach several GB), so additions to the element or link templates, to
 * Reactodia decorations or to canvas overlays must stay inside this budget or raise it on purpose.
 *
 * Measured 2026-11-11 (renderer, headless, no layout; scripts/bench-canvas-links.mjs, 2 links per individual): about
 * 30 DOM nodes per individual with full links (this spec has 180 links), about 24.5 with the bare-path links used
 * above 300 links, 390 to 830 fixed nodes for the UI, and about 840 listeners at any size. The authoring decorators (portals with React's whole
 * delegated listener set, about 138 listeners each) are mounted only for the hovered, selected or edited
 * element. To measure a change, use scripts/bench-canvas-links.mjs (see CLAUDE.md).
 */
import { test, expect, type Page } from '@playwright/test';
import { gotoAndWaitForReady } from './e2e-helpers.js';

const BASE_URL = process.env.VG_URL ?? 'http://localhost:8080';
const DATA_URL = 'https://footprint.test/data.ttl';
// Under largeGraphThreshold (100): above it a URL load folds the entities into cluster groups.
const N = 90;
const NODES_PER_INDIVIDUAL_BUDGET = 38; // measured about 30 (1 element + 2 labelled links; 180 links stay under the bare-path threshold) + 25% headroom
const FIXED_NODES_BUDGET = 1_500; // measured about 830 (toolbar, search, navigator, minimap, ...)
const LISTENERS_BUDGET = 1_500; // measured about 840, independent of N

function synthTurtle(n: number): string {
  const lines = ['@prefix ex: <http://footprint.test/> .', '@prefix owl: <http://www.w3.org/2002/07/owl#> .', 'ex:C a owl:Class .', 'ex:p a owl:ObjectProperty .'];
  for (let i = 0; i < n; i++) {
    lines.push(`ex:i${i} a owl:NamedIndividual, ex:C .`);
    lines.push(`ex:i${i} ex:p ex:i${(i * 7 + 3) % n} .`);
    lines.push(`ex:i${i} ex:p ex:i${(i * 7 + 11) % n} .`);
  }
  return lines.join('\n');
}

async function settled(page: Page): Promise<void> {
  // heartbeat: no main-thread gap over 150 ms for 4 s
  await page.waitForFunction(() => performance.now() - (window as any).__lastBusy > 4000 && performance.now() - (window as any).__lastBeat < 200, null, { timeout: 90_000, polling: 500 });
}

test.describe('canvas memory budget', () => {
  test.beforeEach(async ({ page }) => {
    // Loaded through the ?rdfUrl= startup parameter like a real data file: loadRdf (inline or by url) is staged as
    // new entities in the authoring state, and those legitimately show a decorator.
    await page.route(DATA_URL, (route) => route.fulfill({ status: 200, contentType: 'text/turtle', headers: { 'access-control-allow-origin': '*' }, body: synthTurtle(N) }));
    await page.addInitScript(() => {
      (window as any).__lastBusy = performance.now(); (window as any).__lastBeat = performance.now();
      setInterval(() => { const x = performance.now(); if (x - (window as any).__lastBeat > 150) (window as any).__lastBusy = x; (window as any).__lastBeat = x; }, 50);
    });
  });

  test(`${N} individuals with ${2 * N} links stay inside the DOM and listener budget`, async ({ page, context }) => {
    test.setTimeout(150_000);
    await gotoAndWaitForReady(page, `${BASE_URL}/?ontologies=&rdfUrl=${encodeURIComponent(DATA_URL)}`);
    await page.waitForFunction((n) => document.querySelectorAll('.reactodia-overlaid-element').length >= n, N, { timeout: 60_000 });
    await settled(page);

    const cdp = await context.newCDPSession(page);
    const { nodes, jsEventListeners } = await cdp.send('Memory.getDOMCounters');
    const elements = await page.locator('.reactodia-overlaid-element').count();
    expect(elements).toBeGreaterThanOrEqual(N);
    console.log(`FOOTPRINT nodes=${nodes} listeners=${jsEventListeners} elements=${elements} nodesPerIndividual=${((nodes - 400) / elements).toFixed(1)}`);

    expect(nodes, `DOM nodes for ${elements} elements`).toBeLessThanOrEqual(FIXED_NODES_BUDGET + NODES_PER_INDIVIDUAL_BUDGET * elements);
    expect(jsEventListeners, 'JS event listeners (must not grow with the element count)').toBeLessThanOrEqual(LISTENERS_BUDGET);
  });

  test('nothing is decorated until an element is hovered or selected', async ({ page }) => {
    test.setTimeout(150_000);
    await gotoAndWaitForReady(page, `${BASE_URL}/?ontologies=&rdfUrl=${encodeURIComponent(DATA_URL)}`);
    await page.waitForFunction((n) => document.querySelectorAll('.reactodia-overlaid-element').length >= n, N, { timeout: 60_000 });
    await settled(page);
    expect(await page.locator('.reactodia-authoring-state__decorator').count(), 'authoring decorators with no hover or selection').toBe(0);
    expect(await page.locator('.reactodia-overlaid-element button').count(), 'buttons inside element cards').toBe(0);
  });
});
