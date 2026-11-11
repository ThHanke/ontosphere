// Renderer memory over time for an arbitrary app URL (a startup-parameters load): samples VmRSS every 3 s
// until startup is complete and the main thread has been idle for 15 s; prints the peak, the timeline
// and the JS heaps of the page and each worker (precise memory info).
//   node scripts/profile-url-memory.mjs "<url>"
import { createRequire } from 'module';
import fs from 'node:fs';
const require = createRequire(new URL('../package.json', import.meta.url));
const { chromium } = require('playwright');
const url = process.argv[2];
if (!url) { console.error('usage: node scripts/profile-url-memory.mjs <url>'); process.exit(2); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ headless: true, args: ['--enable-precise-memory-info'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await ctx.addInitScript(() => { window.__lastBusy = performance.now(); window.__lastBeat = performance.now(); setInterval(() => { const n = performance.now(); if (n - window.__lastBeat > 150) window.__lastBusy = n; window.__lastBeat = n; }, 50); });
const bcdp = await browser.newBrowserCDPSession();
const rss = async () => { const { processInfo } = await bcdp.send('SystemInfo.getProcessInfo'); let r = 0, p = 0, gpu = 0; for (const { id, type } of processInfo) { try { const t = fs.readFileSync(`/proc/${id}/status`, 'utf8'); const v = +/VmRSS:\s+(\d+) kB/.exec(t)[1] / 1024, h = +/VmHWM:\s+(\d+) kB/.exec(t)[1] / 1024; if (type === 'renderer') { r = Math.max(r, v); p = Math.max(p, h); } if (type === 'GPU') gpu = v; } catch {} } return { rss: Math.round(r), peak: Math.round(p), gpu: Math.round(gpu) }; };
const t0 = Date.now(); let done = false; const timeline = [];
const sampler = (async () => { while (!done) { try { const s = await rss(); timeline.push([Math.round((Date.now() - t0) / 1000), s.rss, s.peak]); } catch {} await sleep(3000); } })();
await page.goto(url, { waitUntil: 'load', timeout: 120000 });
try { await page.waitForNavigation({ timeout: 3000, waitUntil: 'load' }); } catch {}
await page.waitForFunction(() => window.__mcpTools && (window.__startupComplete?.() ?? false), null, { timeout: 600000, polling: 1000 });
const startupS = Math.round((Date.now() - t0) / 1000);
await page.waitForFunction(() => performance.now() - window.__lastBusy > 15000 && performance.now() - window.__lastBeat < 200, null, { timeout: 600000, polling: 1000 });
done = true; await sampler;
const end = await rss();
const pageHeapMb = await page.evaluate(() => Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576)).catch(() => null);
const workers = []; for (const w of page.workers()) { try { workers.push(await w.evaluate(() => Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576))); } catch { workers.push(null); } }
const dom = await (await ctx.newCDPSession(page)).send('Memory.getDOMCounters');
const counts = await page.evaluate(() => ({ elements: document.querySelectorAll('.reactodia-overlaid-element').length, links: document.querySelectorAll('.reactodia-link-label').length }));
console.log(JSON.stringify({ url: url.slice(0, 80), startupCompleteAtS: startupS, peakRendererMb: Math.max(...timeline.map((t) => t[2]), end.peak), endRendererMb: end.rss, gpuMb: end.gpu, pageJsHeapMb: pageHeapMb, workerJsHeapsMb: workers, domNodes: dom.nodes, listeners: dom.jsEventListeners, ...counts }));
console.log('timeline (s, rssMb, peakMb)', JSON.stringify(timeline.filter((_, i) => i % 4 === 0)));
await browser.close();
