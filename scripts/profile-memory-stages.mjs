// Memory at four points of a LUBM-1 session: after startup, after the load settles, after runReasoning
// returns, after the canvas catch-up settles. Current and peak RSS per Chromium process type, the page's JS
// heap, and the heap of every dedicated worker (via CDP Target + Runtime.getHeapUsage). Needs vite on :8091.
//   node scripts/profile-memory-stages.mjs | tee logs/memory-stages.log
import { createRequire } from 'module';
import fs from 'node:fs';
const require = createRequire(new URL('../package.json', import.meta.url));
const { chromium } = require('playwright');
const base = process.env.BASE ?? 'http://127.0.0.1:8091/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ headless: true, args: ['--enable-precise-memory-info'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await ctx.addInitScript(() => {
  window.__lastLongTask = performance.now();
  try { new PerformanceObserver(() => { window.__lastLongTask = performance.now(); }).observe({ type: 'longtask', buffered: true }); } catch {}
});
const bcdp = await browser.newBrowserCDPSession();
const status = (pid, key) => { try { return Math.round(+new RegExp(`${key}:\\s+(\\d+) kB`).exec(fs.readFileSync(`/proc/${pid}/status`, 'utf8'))[1] / 1024); } catch { return null; } };
async function sample(label) {
  const { processInfo } = await bcdp.send('SystemInfo.getProcessInfo');
  const rss = {};
  for (const { id, type } of processInfo) rss[type] = { rssMb: status(id, 'VmRSS'), peakMb: status(id, 'VmHWM') };
  const pageHeapMb = await page.evaluate(() => Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576)).catch(() => null);
  // precise JS heap (browser flag --enable-precise-memory-info): the page and every dedicated worker; what is
  // left of the renderer RSS after the JS heaps is DOM, WASM linear memory and other native memory
  const workerHeapsMb = [];
  for (const w of page.workers()) {
    try { workerHeapsMb.push(await w.evaluate(() => Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576))); } catch { workerHeapsMb.push(null); }
  }
  const uam = { workerJsHeapsMb: workerHeapsMb, nonJsMb: rss.renderer?.rssMb != null ? rss.renderer.rssMb - (pageHeapMb ?? 0) - workerHeapsMb.reduce((t, x) => t + (x ?? 0), 0) : null };
  console.log(JSON.stringify({ at: label, pageJsHeapMb: pageHeapMb, rss, heaps: uam }));
}
await page.goto(`${base}?ontologies=`, { waitUntil: 'load', timeout: 60000 });
try { await page.waitForNavigation({ timeout: 3000, waitUntil: 'load' }); } catch {}
await page.waitForFunction(() => window.crossOriginIsolated && !!window.__mcpTools?.loadRdf && (window.__startupComplete?.() ?? true), { timeout: 30000 });
await sleep(3000); await sample('startup');
for (const u of ['bench-lubm-tbox.nt', 'bench-lubm-abox.ttl']) await page.evaluate((url) => window.__mcpTools.loadRdf({ url }), new URL(u, base).href);
const idle = (ms) => page.waitForFunction((m) => performance.now() - window.__lastLongTask > m, ms, { timeout: 900000, polling: 500 });
await idle(20000); await sample('load-settled');
await page.evaluate(() => window.__mcpTools.runReasoning({ clearBefore: true, shaclValidation: false }));
await sample('runReasoning-returned');
await idle(20000); await sample('catch-up-settled');
await browser.close();
