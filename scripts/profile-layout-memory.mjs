// Memory and time of the layout step on a LUBM-1 session: load, settle, press Layout (the configured
// currentLayout), sample renderer RSS every 3 s until the main thread has been idle for 20 s.
//   node scripts/profile-layout-memory.mjs [layout-name-in-settings, informational]
import { createRequire } from 'module';
import fs from 'node:fs';
const require = createRequire(new URL('../package.json', import.meta.url));
const { chromium } = require('playwright');
const base = process.env.BASE ?? 'http://127.0.0.1:8091/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ headless: !process.env.HEADED });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await ctx.addInitScript(() => { window.__lastBusy = performance.now(); window.__lastBeat = performance.now(); setInterval(() => { const n = performance.now(); if (n - window.__lastBeat > 150) window.__lastBusy = n; window.__lastBeat = n; }, 50); });
const bcdp = await browser.newBrowserCDPSession();
const rss = async () => { const { processInfo } = await bcdp.send('SystemInfo.getProcessInfo'); let r = 0, w = 0; for (const { id, type } of processInfo) { try { const t = fs.readFileSync(`/proc/${id}/status`, 'utf8'); const v = +/VmRSS:\s+(\d+) kB/.exec(t)[1] / 1024; const h = +/VmHWM:\s+(\d+) kB/.exec(t)[1] / 1024; if (type === 'renderer') { r = Math.max(r, v); w = Math.max(w, h); } } catch {} } return { rssMb: Math.round(r), peakMb: Math.round(w) }; };
await page.goto(`${base}?ontologies=`, { waitUntil: 'load', timeout: 60000 });
try { await page.waitForNavigation({ timeout: 3000, waitUntil: 'load' }); } catch {}
await page.waitForFunction(() => window.crossOriginIsolated && !!window.__mcpTools?.loadRdf && (window.__startupComplete?.() ?? true), { timeout: 30000 });
await sleep(2000);
for (const u of ['bench-lubm-tbox.nt', 'bench-lubm-abox.ttl']) await page.evaluate((url) => window.__mcpTools.loadRdf({ url }), new URL(u, base).href);
const idle = (ms) => page.waitForFunction((m) => performance.now() - window.__lastBusy > m && performance.now() - window.__lastBeat < 200, ms, { timeout: 1800000, polling: 1000 });
await idle(20000);
console.log('before layout', JSON.stringify(await rss()));
const t0 = Date.now();
const click = page.getByRole('button', { name: 'Layout' }).first().click({ timeout: 600000 }).catch((e) => console.log('click failed', String(e).slice(0, 120)));
let done = false, peak = 0, samples = [];
const sampler = (async () => { while (!done) { try { const s = await rss(); peak = Math.max(peak, s.rssMb, s.peakMb); samples.push([Math.round((Date.now() - t0) / 1000), s.rssMb]); } catch {} await sleep(3000); } })();
await click;
await idle(20000);
done = true; await sampler;
console.log('layout step', JSON.stringify({ seconds: Math.round((Date.now() - t0) / 1000) - 20, peakRssMb: peak, rssAfterMb: (await rss()).rssMb, samples: samples.filter((_, i) => i % 5 === 0).slice(0, 30) }));
await browser.close();
