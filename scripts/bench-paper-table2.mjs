#!/usr/bin/env node
/**
 * scripts/bench-paper-table2.mjs
 *
 * Benchmark runner for the Advanced Materials paper Table 2.
 * Loads each ontology into Ontosphere via Playwright, runs Konclude WASM
 * classification, and measures classification time + peak memory.
 *
 * Usage:
 *   node scripts/bench-paper-table2.mjs [--url http://localhost:8080] [--runs 3]
 *
 * Requires: dev server running, Playwright installed.
 *
 * Ontology sources:
 *   - Pizza:           loaded from public URL (protege.stanford.edu)
 *   - LUBM-1:          vendor file from rdf-reasoner-konclude
 *   - GALEN:           vendor file from rdf-reasoner-konclude
 *   - PMDCO:           test fixture
 *   - reasoning-demo:  public/ directory
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const argv = process.argv.slice(2);
function argVal(flag) {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
}
const baseUrl = argVal('--url') ?? 'http://localhost:8080/';
const REPEAT = argVal('--repeat') ? parseInt(argVal('--repeat'), 10) : 0;
const NUM_RUNS = parseInt(argVal('--runs') ?? '3', 10);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// All benchmark ontologies are served from public/ via the dev server.
// Copy files there before running:
//   cp rdf-reasoner-konclude/vendor/konclude/Tests/galen.owl.xml public/bench-galen.owl.xml
//   cp rdf-reasoner-konclude/vendor/konclude/Tests/lubm-univ-bench.owl.xml public/bench-lubm-tbox.owl.xml
//   cp rdf-reasoner-konclude/vendor/konclude/Tests/lubm-univ-bench-data-1.ttl public/bench-lubm-abox.ttl
//   curl -sL "https://protege.stanford.edu/ontologies/pizza/pizza.owl" -o public/bench-pizza.owl
//   cp src/__tests__/fixtures/pmdco.ttl public/bench-pmdco.ttl
const ONTOLOGIES = [
  {
    id: 'reasoning-demo',
    label: 'reasoning-demo.ttl',
    triples: '~200',
    classes: '16',
    expressivity: 'SROIQ(D)',
    urls: ['reasoning-demo.ttl'],
  },
  {
    id: 'pizza',
    label: 'Pizza',
    triples: '~500',
    classes: '100',
    expressivity: 'SHOIN(D)',
    urls: ['bench-pizza.owl'],
  },
  {
    id: 'pmdco',
    label: 'PMDCO',
    triples: '~12k',
    classes: '~350',
    expressivity: 'SROIQ(D)',
    urls: ['bench-pmdco.ttl'],
  },
  {
    id: 'galen',
    label: 'GALEN',
    triples: '~40k',
    classes: '~2,700',
    expressivity: 'EL+',
    urls: ['bench-galen.owl.xml'],
  },
  {
    id: 'lubm-1',
    label: 'LUBM-1',
    triples: '~100k',
    classes: '43',
    expressivity: 'EL++',
    urls: ['bench-lubm-tbox.owl.xml', 'bench-lubm-abox.ttl'],
  },
];

async function callTool(page, name, params = {}) {
  return page.evaluate(async ([n, p]) => {
    const tool = window.__mcpTools?.[n];
    if (!tool) return { success: false, error: `Tool not registered: ${n}` };
    try { return await tool(p); } catch (e) { return { success: false, error: String(e) }; }
  }, [name, params]);
}

async function freshPage(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => process.stderr.write(`  [page error] ${String(e).slice(0, 200)}\n`));

  await page.goto(`${baseUrl}?ontologies=`, { waitUntil: 'load', timeout: 60000 });
  // Absorb the cross-origin-isolation service-worker reload.
  try { await page.waitForNavigation({ timeout: 3000, waitUntil: 'load' }); } catch { /* no reload */ }
  await page.waitForFunction(
    () => window.crossOriginIsolated && !!window.__mcpTools?.loadRdf,
    { timeout: 30000 },
  );
  return { page, ctx };
}

async function getMemoryUsage(page) {
  return page.evaluate(() => {
    // Chrome-only: performance.memory
    if (performance.memory) {
      return {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
      };
    }
    return null;
  });
}

async function benchmarkOntology(browser, onto) {
  const { page, ctx } = await freshPage(browser);
  const result = {
    id: onto.id,
    label: onto.label,
    triples: onto.triples,
    classes: onto.classes,
    expressivity: onto.expressivity,
    classificationMs: null,
    peakMemoryMB: null,
    error: null,
  };

  try {
    // Measure baseline memory
    const memBefore = await getMemoryUsage(page);

    // Load ontology files via URL from the dev server
    for (const relUrl of onto.urls) {
      const fullUrl = new URL(relUrl, baseUrl).href;
      const loadRes = await callTool(page, 'loadRdf', { url: fullUrl });
      if (loadRes?.success === false) {
        result.error = `loadRdf(${relUrl}): ${loadRes.error}`;
        return result;
      }
      await sleep(1000);
    }

    await sleep(2000);

    // Run classification and measure time
    const TIMEOUT_MS = 120_000; // 2 minutes
    const t0 = performance.now();

    const reasonRes = await Promise.race([
      callTool(page, 'runReasoning', { clearBefore: true, shaclValidation: false }),
      sleep(TIMEOUT_MS).then(() => ({ _timeout: true })),
    ]);

    const classificationMs = Math.round(performance.now() - t0);

    if (reasonRes?._timeout) {
      result.error = 'timeout (>120s)';
      result.classificationMs = `>${TIMEOUT_MS / 1000}s`;
    } else if (reasonRes?.success === false) {
      result.error = `runReasoning: ${reasonRes.error}`;
    } else {
      result.classificationMs = classificationMs;
    }

    // Measure memory after reasoning
    await sleep(1000);
    try {
      const memAfter = await getMemoryUsage(page);
      if (memAfter) {
        result.peakMemoryMB = Math.round(memAfter.usedJSHeapSize / (1024 * 1024));
      }
    } catch {
      // Tab may have crashed under memory pressure
      if (!result.error) result.error = 'memory measurement failed (tab may have crashed)';
    }
  } catch (err) {
    result.error = result.error || String(err).slice(0, 200);
  } finally {
    await ctx.close().catch(() => {});
  }

  return result;
}


/**
 * Repeated reasoning on ONE page: load the ontology once, then run reasoning N times with one
 * new individual added before each run (changed content), plus one unchanged-content run at the end.
 * Exercises reasoner reuse across runs (rdf-reasoner-konclude >= 0.8.0).
 */
async function benchmarkRepeated(browser, onto, n) {
  const { page, ctx } = await freshPage(browser);
  const times = [];
  try {
    for (const relUrl of onto.urls) {
      const res = await callTool(page, 'loadRdf', { url: new URL(relUrl, baseUrl).href });
      if (res?.success === false) throw new Error(`loadRdf(${relUrl}): ${res.error}`);
    }
    await sleep(2000);
    for (let i = 0; i <= n; i++) {
      if (i < n) {
        const turtle = `@prefix ex: <http://example.org/bench#> . ex:item${i} a ex:Thing${i} .`;
        const lr = await callTool(page, 'loadRdf', { turtle });
        if (lr?.success === false) throw new Error(`loadRdf(turtle): ${lr.error}`);
        process.stderr.write(`  load: ${JSON.stringify(lr).slice(0, 120)}\n`);
      }
      const t0 = performance.now();
      const r = await Promise.race([
        callTool(page, 'runReasoning', { clearBefore: true, shaclValidation: false }),
        sleep(300_000).then(() => ({ _timeout: true })),
      ]);
      const ms = Math.round(performance.now() - t0);
      const label = i < n ? `changed #${i + 1}` : 'unchanged';
      if (r?._timeout || r?.success === false) { process.stderr.write(`  ${label}: ERROR ${r?._timeout ? 'timeout' : r.error}\n`); break; }
      times.push({ label, ms });
      process.stderr.write(`  ${label}: ${ms} ms\n`);
    }
  } finally {
    await ctx.close().catch(() => {});
  }
  return times;
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--js-flags=--expose-gc', '--enable-precise-memory-info'],
  });

  if (REPEAT > 0) {
    const onto = ONTOLOGIES.find(o => o.id === 'pmdco');
    process.stderr.write(`\nRepeated reasoning on ${onto.label}, ${REPEAT} changed runs + 1 unchanged…\n`);
    const times = await benchmarkRepeated(browser, onto, REPEAT);
    console.log(`# Repeated reasoning — ${onto.label} (${baseUrl})\n`);
    console.log('| Run | Time |\n|-----|-----:|');
    for (const t of times) console.log(`| ${t.label} | ${(t.ms / 1000).toFixed(1)} s |`);
    await browser.close();
    return;
  }

  console.log('# Paper Table 2 — Reasoning Performance Benchmarks\n');
  console.log(`Date: ${new Date().toISOString().split('T')[0]}`);
  console.log(`Runs per ontology: ${NUM_RUNS}`);
  console.log(`Browser: Chromium (Playwright headless)`);
  console.log(`Base URL: ${baseUrl}\n`);

  const allResults = [];

  for (const onto of ONTOLOGIES) {
    process.stderr.write(`\nBenchmarking ${onto.label} (${NUM_RUNS} runs)…\n`);
    const runs = [];

    for (let i = 0; i < NUM_RUNS; i++) {
      process.stderr.write(`  Run ${i + 1}/${NUM_RUNS}… `);
      const r = await benchmarkOntology(browser, onto);
      runs.push(r);
      if (r.error) {
        process.stderr.write(`ERROR: ${r.error}\n`);
      } else {
        process.stderr.write(`${r.classificationMs} ms, ${r.peakMemoryMB ?? '?'} MB\n`);
      }
    }

    // Compute median classification time
    const validTimes = runs
      .filter(r => typeof r.classificationMs === 'number')
      .map(r => r.classificationMs)
      .sort((a, b) => a - b);

    const validMem = runs
      .filter(r => r.peakMemoryMB != null)
      .map(r => r.peakMemoryMB)
      .sort((a, b) => a - b);

    const median = arr => arr.length ? arr[Math.floor(arr.length / 2)] : null;

    allResults.push({
      ...runs[0],
      classificationMs: validTimes.length ? median(validTimes) : runs[0].classificationMs,
      peakMemoryMB: validMem.length ? median(validMem) : null,
      runCount: validTimes.length,
    });
  }

  // Print markdown table matching paper format
  console.log('\n## Results (median of successful runs)\n');
  console.log('| Ontology | Triples | Classes | Expressivity | Classification time | Peak memory |');
  console.log('|----------|--------:|--------:|:-------------|--------------------:|------------:|');
  for (const r of allResults) {
    const time = typeof r.classificationMs === 'number'
      ? `${(r.classificationMs / 1000).toFixed(1)} s`
      : r.classificationMs ?? 'error';
    const mem = r.peakMemoryMB != null ? `${r.peakMemoryMB} MB` : 'n/a';
    console.log(`| ${r.label} | ${r.triples} | ${r.classes} | ${r.expressivity} | ${time} | ${mem} |`);
  }

  if (allResults.some(r => r.error)) {
    console.log('\n## Notes\n');
    for (const r of allResults) {
      if (r.error) console.log(`- **${r.label}**: ${r.error}`);
    }
  }

  console.log('\n## How to use these results\n');
  console.log('Copy the table above into `paper/advanced-materials/ontosphere-advanced-materials-draft.md`');
  console.log('replacing the `<!-- MEASURE -->` placeholders in Table 2 (Section 5.1).');

  await browser.close();
}

main().catch(err => { console.error(err); process.exit(1); });
