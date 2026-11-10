/**
 * Shared e2e helpers — reliable page readiness + MCP tool calls.
 *
 * The COI service worker (`coi-serviceworker.js`) may reload the page shortly
 * after `page.goto()`. A naive `waitForFunction(__mcpTools)` can pass on the
 * first (pre-reload) page, then seeded data is lost when the reload wipes the
 * worker store. These helpers absorb the reload before returning.
 */

import type { Page } from '@playwright/test';

/**
 * Navigate to `url` and wait until the page is fully stable:
 *  1. COI service-worker reload has been absorbed (or timed out)
 *  2. `window.crossOriginIsolated === true`
 *  3. `window.__mcpTools` is registered and the requested tool exists
 *
 * 4. startup loading is complete (MCP calls are rejected until then), unless
 *    `waitForStartup` is false — for tests that exercise the rejection itself.
 *
 * Call this instead of bare `page.goto()` + `waitForReady()`.
 */
export async function gotoAndWaitForReady(
  page: Page,
  url: string,
  requiredTool = 'addNode',
  waitForStartup = true,
): Promise<void> {
  // The COI service worker may reload the page during the initial
  // navigation, causing "interrupted by another navigation". Retry once
  // when that happens — the second goto lands on the post-reload page.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'load' });
      break;
    } catch (err: any) {
      if (attempt === 0 && /interrupted by another navigation/i.test(err.message)) {
        // COI reload fired mid-goto. Wait for the reload to settle, then
        // retry so we get a clean load event.
        await page.waitForLoadState('load').catch(() => {});
        continue;
      }
      throw err;
    }
  }

  // Absorb a potential second COI reload: wait briefly for a navigation
  // event. If none happens within 3s, the page is stable.
  try {
    await page.waitForNavigation({ timeout: 3_000, waitUntil: 'load' });
  } catch {
    // No reload — that's fine.
  }

  // Now wait for the app to be fully ready on the (possibly reloaded) page.
  await page.waitForFunction(
    ({ tool, startup }: { tool: string; startup: boolean }) =>
      window.crossOriginIsolated === true &&
      !!(window as any).__mcpTools &&
      typeof (window as any).__mcpTools[tool] === 'function' &&
      (!startup || (window as any).__startupComplete?.() === true),
    { tool: requiredTool, startup: waitForStartup },
    { timeout: 30_000 },
  );
}

/**
 * Call an MCP tool via `window.__mcpTools`, retrying once if a COI reload
 * destroys the execution context mid-call.
 *
 * On retry, calls `gotoAndWaitForReady` to re-stabilise the page. The caller
 * must handle the fact that earlier seeded data may be lost on reload — wrap
 * the entire seed sequence in a retry if needed.
 */
export async function callTool(
  page: Page,
  tool: string,
  params: object,
  baseUrl?: string,
): Promise<any> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await page.evaluate(
        ([t, p]) => (window as any).__mcpTools[t](p),
        [tool, params] as const,
      );
    } catch (err: any) {
      if (attempt === 0 && /context was destroyed|navigat/i.test(err.message)) {
        if (baseUrl) {
          await gotoAndWaitForReady(page, baseUrl, tool);
        } else {
          // Fallback: just wait for the new page to be ready
          await page.waitForFunction(
            (t: string) =>
              window.crossOriginIsolated === true &&
              !!(window as any).__mcpTools &&
              typeof (window as any).__mcpTools[t] === 'function',
            tool,
            { timeout: 30_000 },
          );
        }
        continue;
      }
      throw err;
    }
  }
}

/**
 * Run the full seed sequence inside a retry loop. If a COI reload wipes the
 * store mid-seed, the entire sequence re-runs on the fresh page.
 */
export async function seedWithRetry(
  page: Page,
  baseUrl: string,
  seedFn: (call: (tool: string, params: object) => Promise<any>) => Promise<void>,
  maxAttempts = 2,
): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let reloaded = false;
    const wrappedCall = async (tool: string, params: object): Promise<any> => {
      try {
        return await page.evaluate(
          ([t, p]) => (window as any).__mcpTools[t](p),
          [tool, params] as const,
        );
      } catch (err: any) {
        if (/context was destroyed|navigat/i.test(err.message)) {
          reloaded = true;
          throw err;
        }
        throw err;
      }
    };

    try {
      await seedFn(wrappedCall);
      return; // All calls succeeded — no reload detected.
    } catch (err: any) {
      if (reloaded && attempt < maxAttempts - 1) {
        // Store was wiped by reload. Re-navigate and re-seed.
        await gotoAndWaitForReady(page, baseUrl);
        continue;
      }
      throw err;
    }
  }
}
