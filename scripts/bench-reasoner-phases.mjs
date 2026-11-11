// Worker-side phase durations of runReasoning on LUBM-1, plus wall time, with the main thread
// idle before the timer starts. Needs vite on :8091 (override with BASE). Usage:
//   node scripts/bench-reasoner-phases.mjs [runs] | tee logs/reasoner-phases-<label>.log
import { createRequire } from 'module';
const require = createRequire(new URL('../package.json', import.meta.url));
const { chromium } = require('playwright');
import fs from 'node:fs';
const base = process.env.BASE ?? 'http://127.0.0.1:8091/';

// Preflight: the dev server pre-bundles rdf-reasoner-konclude into node_modules/.vite/deps and only
// re-checks that on start. If the installed package is newer than the bundle, the page runs old
// package JS next to the new WASM/worker assets in public/ (see docs/solutions on measuring the wrong build).
const pkgDir = new URL('../node_modules/rdf-reasoner-konclude/', import.meta.url);
const pkg = JSON.parse(fs.readFileSync(new URL('package.json', pkgDir), 'utf8'));
const bundle = new URL('../node_modules/.vite/deps/rdf-reasoner-konclude.js', import.meta.url);
if (!fs.existsSync(bundle) || fs.statSync(bundle).mtimeMs < fs.statSync(new URL('package.json', pkgDir)).mtimeMs) {
  console.error(`STALE BUILD: the dev server's pre-bundled rdf-reasoner-konclude is older than the installed ${pkg.version}. Restart vite with --force.`);
  process.exit(2);
}
console.log(`rdf-reasoner-konclude ${pkg.version} (pre-bundle is current)`);
const runs = parseInt(process.argv[2] ?? '4', 10);
// Peak resident memory (VmHWM) of every process of this browser, by Chromium process type, via the
// browser-level CDP SystemInfo.getProcessInfo. Workers run as threads inside the renderer, so the
// renderer figure includes the rdf and reasoner workers.
async function peakRssMb(browser) {
  const cdp = await browser.newBrowserCDPSession();
  const { processInfo } = await cdp.send('SystemInfo.getProcessInfo');
  const out = {};
  for (const { id, type } of processInfo) {
    try {
      const hwm = /VmHWM:\s+(\d+) kB/.exec(fs.readFileSync(`/proc/${id}/status`, 'utf8'));
      if (hwm) out[type] = Math.max(out[type] ?? 0, Math.round(+hwm[1] / 1024));
    } catch {}
  }
  return out;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 1; i <= runs; i++) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await ctx.addInitScript(() => {
    const W = window.Worker;
    window.__stages = [];
    window.__lastLongTask = performance.now(); window.__longMs = 0; window.__longMax = 0; window.__longN = 0;
    window.__lastBusy = performance.now(); window.__lastBeat = performance.now();
    setInterval(() => { const n = performance.now(); if (n - window.__lastBeat > 150) window.__lastBusy = n; window.__lastBeat = n; }, 50);
    try { new PerformanceObserver((l) => { window.__lastLongTask = performance.now(); for (const e of l.getEntries()) { window.__longMs += e.duration; window.__longN++; window.__longMax = Math.max(window.__longMax, e.duration); } }).observe({ type: 'longtask', buffered: true }); } catch {}
    window.Worker = class extends W {
      constructor(...a) {
        super(...a);
        this.addEventListener('message', (e) => {
          const d = e.data;
          if (d && d.type === 'reasoningStage') window.__stages.push({ t: Math.round(performance.now()), stage: d.stage, meta: d.meta });
        });
      }
    };
  });
  await page.goto(`${base}?ontologies=`, { waitUntil: 'load', timeout: 60000 });
  try { await page.waitForNavigation({ timeout: 3000, waitUntil: 'load' }); } catch {}
  await page.waitForFunction(() => window.crossOriginIsolated && !!window.__mcpTools?.loadRdf && (window.__startupComplete?.() ?? true), { timeout: 30000 });
  const files = process.env.FILES ? process.env.FILES.split(',') : [process.env.TBOX ?? 'bench-lubm-tbox.owl.xml', 'bench-lubm-abox.ttl'];
  for (const u of files) {
    await page.evaluate((url) => window.__mcpTools.loadRdf({ url }), new URL(u, base).href);
    await sleep(500);
  }
  // wait until the main thread has been free of long tasks for IDLE_MS (canvas render settled); the load's
  // tail (layout results, React) can arrive after gaps of several seconds, so the default is 20 s
  const idleStart = Date.now();
  const idleMs = parseInt(process.env.IDLE_MS ?? '20000', 10);
  await page.waitForFunction((ms) => performance.now() - window.__lastLongTask > ms, idleMs, { timeout: 600000, polling: 500 });
  const idleWaitMs = Date.now() - idleStart;
  const perfStart = await page.evaluate(() => performance.now());
  await page.evaluate(() => { window.__longMs = 0; window.__longMax = 0; window.__longN = 0; });
  const t1 = Date.now();
  await page.evaluate(() => window.__mcpTools.runReasoning({ clearBefore: true, shaclValidation: false }));
  const wall = Date.now() - t1;
  const tCatch = Date.now();
  await page.waitForFunction(() => performance.now() - window.__lastBusy > 8000 && performance.now() - window.__lastBeat < 200, null, { timeout: 900000, polling: 500 });
  const catchUpMs = Date.now() - tCatch - 8000;
  const totalToSettleMs = Date.now() - t1 - 8000;
  const catchUp = await page.evaluate(() => ({ longTaskMs: Math.round(window.__longMs), longTaskCount: window.__longN, longestTaskMs: Math.round(window.__longMax) }));
  const stages = await page.evaluate(() => window.__stages);
  const timeline = stages.map((x) => `${x.stage}@${Math.round((x.t - perfStart) / 100) / 10}s`).join(' ');
  const peakMb = await peakRssMb(browser);
  const done = stages.find((s) => s.stage === 'reasoner-complete');
  const complete = stages.find((s) => s.stage === 'complete');
  console.log(JSON.stringify({ run: i, idleWaitMs, wallMs: wall, workerTotalMs: complete?.meta?.durationMs, addedCount: complete?.meta?.addedCount, totalToSettleMs, catchUp, timeline, peakRssMb: peakMb, reasonerComplete: done?.meta }));
  await ctx.close(); await browser.close();
}
