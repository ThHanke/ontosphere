/**
 * Browser confirmation of the reasoning fixes.
 *
 * Every measurement behind the three reasoning fixes was taken in Node, replaying the
 * production code paths. The code lives in the shared worker runtime so it applies to both,
 * but the tool ships a browser and the submitted evaluation reported browser numbers, so the
 * claims have to be checked where they are made. This spec drives the real app.
 *
 * What it pins:
 *   1. the materialised inferred graph is IDENTICAL across independent browser sessions
 *      (the canonical class hierarchy fix);
 *   2. a repeat run on an unchanged graph does not degrade, and still produces the same
 *      inferred graph rather than an empty one (the reasoning-base filter, and the
 *      materialize cache trap behind it);
 *   3. JS heap does not grow without bound across repeats (the worker recycling fix).
 *
 * Fixture: set VG_FIXTURE_URL to point at a larger ontology for a real measurement (the
 * paper run uses PMDco). The default is the tutorial ontology that ships in public/, so the
 * spec is runnable in CI without a large fixture in the repository.
 *
 * Requires: npm run dev (http://localhost:8080), which emits the COOP/COEP headers the
 * Konclude WASM reasoner needs.
 */

import { test, expect, type Page } from '@playwright/test';
import { gotoAndWaitForReady, callTool } from './e2e-helpers.js';

const BASE_URL = process.env.VG_URL ?? 'http://localhost:8080';
const FIXTURE_URL = process.env.VG_FIXTURE_URL ?? '/reasoning-demo.ttl';
const EXTRA_URL = process.env.VG_EXTRA_URL ?? '';
const SESSIONS = Number(process.env.VG_SESSIONS ?? 3);
const REPEATS = Number(process.env.VG_REPEATS ?? 3);
// Minimum quads the fixture must ADD to the store. The app preloads ~40 vocabulary quads,
// so a "non-empty store" check passes even when the fixture never loaded.
const MIN_LOADED = Number(process.env.VG_MIN_LOADED ?? 100);

/**
 * A canonical fingerprint of the inferred graph, so content is compared and not just size.
 *
 * The SET of triples is what matters. The result rows are neither deduplicated nor fully
 * ordered when a triple appears more than once, so a raw JSON dump of them differs between
 * sessions that hold exactly the same graph.
 */
async function inferredFingerprint(page: Page): Promise<string> {
  const res = await callTool(page, 'queryGraph', {
    sparql: 'SELECT ?s ?p ?o WHERE { GRAPH <urn:vg:inferred> { ?s ?p ?o } } ORDER BY ?s ?p ?o',
    limit: 100000,
  });
  const rows: Array<Record<string, string>> = res?.data?.rows ?? res?.data?.results ?? [];
  const keys = [...new Set(rows.map((r) => `${r.s}|${r.p}|${r.o}`))].sort();
  return [String(keys.length), ...keys].join('\n');
}

async function jsHeapBytes(page: Page): Promise<number> {
  return page.evaluate(() => (performance as any).memory?.usedJSHeapSize ?? 0);
}

/** Total quads in the store, used to confirm a load actually stuck. */
async function totalQuads(page: Page): Promise<number> {
  const res = await callTool(page, 'queryGraph', {
    sparql: 'SELECT (COUNT(*) AS ?n) WHERE { ?s ?p ?o }', limit: 5,
  });
  return Number(res?.data?.rows?.[0]?.n ?? 0);
}

/**
 * Load the fixture and CONFIRM it stuck.
 *
 * The cross-origin-isolation service worker can reload the page after the first
 * navigation, which discards anything already loaded (see e2e-helpers: "earlier seeded data
 * may be lost on reload"). Without this check a wiped store reasons to zero triples and the
 * test measures nothing while looking like it measured something.
 */
async function loadFixture(page: Page): Promise<number> {
  let last = 0;
  for (let attempt = 0; attempt < 4; attempt++) {
    const before = await totalQuads(page);
    await callTool(page, 'loadRdf', { url: FIXTURE_URL }, BASE_URL);
    if (EXTRA_URL) await callTool(page, 'loadRdf', { url: EXTRA_URL }, BASE_URL);
    const after = await totalQuads(page);
    last = after;
    // The store must have GROWN by the fixture, not merely be non-empty: the app preloads
    // vocabulary quads, so "> 0" is satisfied by a load that silently did nothing.
    if (after - before >= MIN_LOADED) return after;
  }
  throw new Error(
    `fixture ${FIXTURE_URL} did not add >= ${MIN_LOADED} quads after 4 attempts (store holds ${last})`,
  );
}

interface ReasonRun { ms: number; inferred: number; consistent: boolean }

async function reason(page: Page): Promise<ReasonRun> {
  const t0 = Date.now();
  const res = await callTool(page, 'runReasoning', { reasonerBackend: 'konclude', shaclValidation: false });
  const ms = Date.now() - t0;
  if (!res?.success) throw new Error(`runReasoning failed: ${res?.error ?? JSON.stringify(res)}`);
  // runReasoning reports success even when the reasoner itself failed, with the cause in
  // data.errors. Surfacing it here turns a silent zero into a readable failure.
  const errors = res.data?.errors ?? [];
  if (errors.length > 0) throw new Error(`reasoner errors: ${JSON.stringify(errors).slice(0, 400)}`);
  return { ms, inferred: Number(res.data?.inferredTriples ?? 0), consistent: res.data?.isConsistent !== false };
}

test.describe('browser confirmation of the reasoning fixes', () => {
  test.describe.configure({ mode: 'serial', timeout: 600_000 });

  test('the materialised inferred graph is identical across independent sessions', async ({ browser }) => {
    const fingerprints: string[] = [];
    const counts: number[] = [];

    for (let i = 0; i < SESSIONS; i++) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await gotoAndWaitForReady(page, BASE_URL, 'loadRdf');
      const loaded = await loadFixture(page);
      if (i === 0) console.log(`[browser] fixture loaded: ${loaded} quads`);
      const run = await reason(page);
      counts.push(run.inferred);
      fingerprints.push(await inferredFingerprint(page));
      await context.close();
    }

    console.log(`[browser] inferred counts across ${SESSIONS} sessions: ${counts.join(', ')}`);
    expect(counts.every((c) => c > 0), 'reasoning produced nothing; the fixture may be wrong').toBe(true);
    expect(new Set(counts).size, `counts varied across sessions: ${counts.join(', ')}`).toBe(1);
    const distinct = new Set(fingerprints);
    expect(distinct.size, 'inferred graph CONTENT varied across sessions').toBe(1);
    console.log(`[browser] distinct inferred triples per session: ${fingerprints[0].split('\n')[0]}`);
  });

  test('a repeat run neither degrades nor empties the inferred graph', async ({ page }) => {
    await gotoAndWaitForReady(page, BASE_URL, 'loadRdf');
    await loadFixture(page);

    const times: number[] = [];
    const counts: number[] = [];
    for (let i = 0; i < REPEATS; i++) {
      const run = await reason(page);
      times.push(run.ms);
      counts.push(run.inferred);
    }

    console.log(`[browser] repeat timings ms: ${times.join(', ')}`);
    console.log(`[browser] inferred counts:   ${counts.join(', ')}`);

    // The reasoning base must not accumulate the reasoner's own output: before the fix a
    // second run reasoned over base + inferred + explanations and took many times longer.
    const cold = times[0];
    const worstRepeat = Math.max(...times.slice(1));
    expect(worstRepeat, `repeat ${worstRepeat}ms vs cold ${cold}ms`).toBeLessThan(cold * 3);

    // And the cache must not hand back an empty graph on an unchanged base.
    expect(counts.every((c) => c > 0), 'a repeat produced an EMPTY inferred graph').toBe(true);
    expect(new Set(counts).size, `inferred count changed across repeats: ${counts.join(', ')}`).toBe(1);
  });

  test('JS heap does not grow without bound across repeats', async ({ page }) => {
    await gotoAndWaitForReady(page, BASE_URL, 'loadRdf');
    await loadFixture(page);

    const heaps: number[] = [];
    for (let i = 0; i < REPEATS; i++) {
      await reason(page);
      heaps.push(await jsHeapBytes(page));
    }
    const mb = heaps.map((b) => Math.round(b / 1048576));
    console.log(`[browser] JS heap MB after each run: ${mb.join(', ')}`);

    test.skip(heaps.every((h) => h === 0), 'performance.memory unavailable in this browser');

    // Per-run growth must be bounded. This measures the main-thread JS heap only: worker
    // heaps and WASM linear memory are NOT visible here, which is exactly the limitation the
    // submitted Table 2 had. The Node measurement covers whole-process RSS.
    const growth = mb[mb.length - 1] - mb[0];
    console.log(`[browser] main-thread JS heap growth over ${REPEATS} runs: ${growth} MB`);
    expect(growth, `main-thread heap grew ${growth} MB over ${REPEATS} runs`).toBeLessThan(400);
  });
});
