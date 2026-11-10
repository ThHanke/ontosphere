/**
 * FhGenie relay E2E tests.
 *
 * Verifies the relay bookmarklet dispatches JSON-RPC tool calls found in the
 * body text of a FhGenie-style page (CSS-module class hierarchy, textarea input).
 *
 * Key scenarios:
 *   single          — one addNode call dispatched correctly
 *   batch           — 3 addNode calls dispatched as a batch
 *   prefixed        — prefixed IRIs (ex:, owl:) expanded before dispatch
 *   progress-indicator — call dispatched immediately even with a changing % counter
 *                        (regression: old stability-window never fired on FhGenie
 *                        because the progress indicator kept resetting it)
 *   partial-json    — truncated JSON is NOT dispatched; complete JSON IS dispatched
 *
 * Run:
 *   DEV_URL=http://docker-dev.iwm.fraunhofer.de:8080 npx playwright test e2e/relay-bookmarklet.fhgenie.spec.ts
 */

import { test, expect, BrowserContext, Page } from '@playwright/test';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEV_URL = process.env.DEV_URL || 'http://docker-dev.iwm.fraunhofer.de:8080';

const bookmarkletSrc = fs.readFileSync(
  path.resolve(__dirname, '../public/relay-bookmarklet.js'), 'utf8',
)
  .replace(
    /var RELAY_ORIGIN\s+=\s+'__RELAY_ORIGIN__';/,
    `var RELAY_ORIGIN = '${DEV_URL}';`,
  )
  .replace(
    /var RELAY_URL\s+=\s+'__RELAY_URL__';/,
    `var RELAY_URL = '${DEV_URL}/relay.html';`,
  );

// ── Helpers ────────────────────────────────────────────────────────────────

async function openOntosphereApp(context: BrowserContext): Promise<Page> {
  const appPage = await context.newPage();
  await appPage.goto(DEV_URL);
  await appPage.waitForFunction(
    () => !!(window as any).__mcpTools && typeof (window as any).__mcpTools['addNode'] === 'function' && ((window as any).__startupComplete?.() ?? true),
    { timeout: 20_000 },
  );
  return appPage;
}

async function injectBookmarklet(chatPage: Page): Promise<Page> {
  const popupPromise = chatPage.waitForEvent('popup', { timeout: 10_000 });
  await chatPage.evaluate((src) => {
    (window as any).__vgRelayActive = false;
    new Function(src)();
  }, bookmarkletSrc);
  const relayPopup = await popupPromise;
  await relayPopup.waitForLoadState('domcontentloaded');
  return relayPopup;
}

/** Wait for the bookmarklet result to be submitted and appear in #result-stream. */
async function getSubmittedResult(chatPage: Page, timeout = 15_000): Promise<string> {
  const locator = chatPage.locator('#result-stream .msg-user').last();
  await expect(locator).toContainText('[Ontosphere', { timeout });
  return locator.innerText();
}

// ── Tests ──────────────────────────────────────────────────────────────────

test.describe('relay — FhGenie scenarios', () => {
  test.setTimeout(60_000);

  let appPage: Page;

  test.beforeEach(async ({ context }) => {
    appPage = await openOntosphereApp(context);
  });

  test.afterEach(async () => {
    await appPage.close();
  });

  // ── single addNode ─────────────────────────────────────────────────────

  test('single: addNode call dispatched from FhGenie DOM structure', async ({ context, page }) => {
    await page.goto(`${DEV_URL}/relay-fhgenie-mock.html`);
    await injectBookmarklet(page);
    await page.click('button[data-scenario="single"]');

    const result = await getSubmittedResult(page);
    expect(result).toContain('[Ontosphere — 1 tool ✓]');
    expect(result).toContain('http://example.org/Alice');
  });

  // ── batch ─────────────────────────────────────────────────────────────

  test('batch: 3 addNode calls dispatched and combined in result', async ({ context, page }) => {
    await page.goto(`${DEV_URL}/relay-fhgenie-mock.html`);
    await injectBookmarklet(page);
    await page.click('button[data-scenario="batch"]');

    const result = await getSubmittedResult(page, 20_000);
    expect(result).toContain('[Ontosphere — 3 tools ✓]');
    expect(result).toContain('http://example.org/Alice');
    expect(result).toContain('http://example.org/Bob');
    expect(result).toContain('http://example.org/Carol');
  });

  // ── prefixed IRIs ─────────────────────────────────────────────────────

  test('prefixed: ex:PrefixedNode + owl:Class expanded and node created', async ({ context, page }) => {
    await page.goto(`${DEV_URL}/relay-fhgenie-mock.html`);
    await injectBookmarklet(page);
    await page.click('button[data-scenario="prefixed"]');

    const result = await getSubmittedResult(page);
    expect(result).toContain('[Ontosphere — 1 tool ✓]');

    const nodes = await appPage.evaluate(async () => {
      const tools = (window as any).__mcpTools as Record<string, (p: any) => Promise<any>>;
      const r = await tools['getNodes']({});
      return (r.data as any)?.entities ?? [];
    });
    const iris = (nodes as any[]).map((n: any) => n.iri);
    expect(iris).toContain('http://example.org/PrefixedNode');
  });

  // ── progress indicator regression ────────────────────────────────────
  // The old bookmarklet used a content-length stability window: dispatch only
  // after N consecutive ticks with identical page text length. FhGenie's
  // progress indicator (% counter) kept resetting the window — dispatch never
  // fired. New bookmarklet dispatches immediately on any new valid JSON-RPC call.

  test('progress-indicator: dispatches immediately despite changing % counter', async ({ context, page }) => {
    await page.goto(`${DEV_URL}/relay-fhgenie-mock.html`);
    await injectBookmarklet(page);
    await page.click('button[data-scenario="progress-indicator"]');

    // Dispatch must fire within 2s (≤4 poll ticks), despite the counter updating every 100ms.
    const result = await getSubmittedResult(page, 5_000);
    expect(result).toContain('[Ontosphere — 1 tool ✓]');
    expect(result).toContain('http://example.org/Progress');
  });

  // ── partial JSON ignored ──────────────────────────────────────────────
  // Truncated JSON (fails JSON.parse) must not dispatch. Complete JSON must
  // dispatch within 1s of appearing.

  test('partial-json: truncated JSON ignored; complete JSON dispatched on completion', async ({ context, page }) => {
    await page.goto(`${DEV_URL}/relay-fhgenie-mock.html`);
    await injectBookmarklet(page);
    await page.click('button[data-scenario="partial-json"]');

    // Phase 1 (0–1.5s): only truncated JSON visible — nothing should dispatch.
    // Wait 1s, verify no result yet.
    await page.waitForTimeout(1000);
    const resultStream = page.locator('#result-stream .msg-user');
    await expect(resultStream).toHaveCount(0);

    // Phase 2 (after 1.5s): complete JSON appears — dispatch expected within 1.5s.
    const result = await getSubmittedResult(page, 5_000);
    expect(result).toContain('[Ontosphere — 1 tool ✓]');
    expect(result).toContain('http://example.org/PartialTest');
  });
});
