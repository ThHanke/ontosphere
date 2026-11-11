// Worker-side phase durations of runReasoning on LUBM-1, plus wall time, with the main thread
// idle before the timer starts. Needs vite on :8091 (override with BASE). Usage:
//   node scripts/bench-reasoner-phases.mjs [runs] | tee logs/reasoner-phases-<label>.log
import { createRequire } from 'module';
const require = createRequire(new URL('../package.json', import.meta.url));
const { chromium } = require('playwright');
const base = process.env.BASE ?? 'http://127.0.0.1:8091/';
const runs = parseInt(process.argv[2] ?? '4', 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 1; i <= runs; i++) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await ctx.addInitScript(() => {
    const W = window.Worker;
    window.__stages = [];
    window.__lastLongTask = performance.now();
    try { new PerformanceObserver((l) => { window.__lastLongTask = performance.now(); }).observe({ type: 'longtask', buffered: true }); } catch {}
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
  for (const u of [process.env.TBOX ?? 'bench-lubm-tbox.owl.xml', 'bench-lubm-abox.ttl']) {
    await page.evaluate((url) => window.__mcpTools.loadRdf({ url }), new URL(u, base).href);
    await sleep(500);
  }
  // wait until the main thread has been free of long tasks for 3 s (canvas render settled)
  const idleStart = Date.now();
  await page.waitForFunction(() => performance.now() - window.__lastLongTask > 3000, null, { timeout: 180000, polling: 500 });
  const idleWaitMs = Date.now() - idleStart;
  const t1 = Date.now();
  await page.evaluate(() => window.__mcpTools.runReasoning({ clearBefore: true, shaclValidation: false }));
  const wall = Date.now() - t1;
  const stages = await page.evaluate(() => window.__stages);
  const done = stages.find((s) => s.stage === 'reasoner-complete');
  const complete = stages.find((s) => s.stage === 'complete');
  console.log(JSON.stringify({ run: i, idleWaitMs, wallMs: wall, workerTotalMs: complete?.meta?.durationMs, addedCount: complete?.meta?.addedCount, reasonerComplete: done?.meta }));
  await ctx.close(); await browser.close();
}
