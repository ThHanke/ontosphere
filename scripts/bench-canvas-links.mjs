// Small, reproducible setup for the canvas link-creation cost (plan 002): N individuals with about 2N
// object-property links among them, loaded into the app; measures the time from loadRdf until the main
// thread has been free of long tasks for 3 s. Needs vite on :8091 (override with BASE).
//   node scripts/bench-canvas-links.mjs 250 500 1000 2000 | tee logs/canvas-links.log
import { createRequire } from 'module';
import fs from 'node:fs';
const require = createRequire(new URL('../package.json', import.meta.url));
const { chromium } = require('playwright');
const base = process.env.BASE ?? 'http://127.0.0.1:8091/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sizes = process.argv.slice(2).map(Number).filter(Boolean);
const linksPer = parseInt(process.env.LINKS_PER ?? '2', 10);

function synth(n) {
  const lines = ['@prefix ex: <http://e.test/> .', '@prefix owl: <http://www.w3.org/2002/07/owl#> .',
    'ex:C a owl:Class .', 'ex:p a owl:ObjectProperty .'];
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < n; i++) {
    lines.push(`ex:i${i} a owl:NamedIndividual, ex:C .`);
    for (let k = 0; k < linksPer; k++) lines.push(`ex:i${i} ex:p ex:i${Math.floor(rnd() * n)} .`);
  }
  return lines.join('\n');
}

for (const n of sizes) {
  const file = `bench-synth-${n}.ttl`;
  fs.writeFileSync(new URL(`../public/${file}`, import.meta.url), synth(n));
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await ctx.addInitScript(() => {
    // heartbeat: a timer that records when the main thread was blocked for more than 150 ms; unlike
    // longtask entries (delivered after the task ends) it cannot report "idle" while a giant task runs
    window.__lastBusy = performance.now(); window.__lastBeat = performance.now();
    setInterval(() => { const n = performance.now(); if (n - window.__lastBeat > 150) window.__lastBusy = n; window.__lastBeat = n; }, 50);
    window.__lastLongTask = performance.now(); window.__longMs = 0; window.__longMax = 0; window.__longN = 0;
    try { new PerformanceObserver((l) => { window.__lastLongTask = performance.now(); for (const e of l.getEntries()) { window.__longMs += e.duration; window.__longN++; window.__longMax = Math.max(window.__longMax, e.duration); } }).observe({ type: 'longtask', buffered: true }); } catch {}
  });
  await page.goto(`${base}?ontologies=`, { waitUntil: 'load', timeout: 60000 });
  try { await page.waitForNavigation({ timeout: 3000, waitUntil: 'load' }); } catch {}
  await page.waitForFunction(() => window.crossOriginIsolated && !!window.__mcpTools?.loadRdf && (window.__startupComplete?.() ?? true), { timeout: 30000 });
  await sleep(3000);
  let cdp = null;
  if (process.env.PROFILE) { cdp = await ctx.newCDPSession(page); await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 2000 }); await cdp.send('Profiler.start'); }
  const t0 = Date.now();
  await page.evaluate((url) => { window.__longMs = 0; window.__longMax = 0; window.__longN = 0; return window.__mcpTools.loadRdf({ url }); }, new URL(file, base).href);
  const loadMs = Date.now() - t0;
  await page.waitForFunction(() => performance.now() - window.__lastBusy > 5000 && performance.now() - window.__lastBeat < 200, null, { timeout: 600000, polling: 500 });
  const settledMs = Date.now() - t0 - 5000;
  const longMs = await page.evaluate(() => Math.round(window.__longMs));
  const longMaxMs = await page.evaluate(() => Math.round(window.__longMax));
  const longCount = await page.evaluate(() => window.__longN);
  if (cdp) {
    const { profile } = await cdp.send('Profiler.stop');
    const byId = new Map(profile.nodes.map((nd) => [nd.id, nd]));
    const self = new Map();
    profile.samples.forEach((id, i) => self.set(id, (self.get(id) || 0) + profile.timeDeltas[i]));
    const agg = {}; let total = 0;
    for (const [id, t] of self) { const c = byId.get(id).callFrame; const k = `${c.functionName || '(anon)'} ${c.url.split('/').pop().split('?')[0]}:${c.lineNumber}`; agg[k] = (agg[k] || 0) + t; total += t; }
    // inclusive share of createLinks: samples whose stack passes through a createLinks frame
    const parent = new Map(); for (const nd of profile.nodes) for (const ch of nd.children ?? []) parent.set(ch, nd.id);
    let inCreateLinks = 0, inIdle = 0;
    for (const [id, t] of self) { let cur = id, hit = false; while (cur) { if (byId.get(cur).callFrame.functionName === 'createLinks') { hit = true; break; } cur = parent.get(cur); } if (hit) inCreateLinks += t; if (byId.get(id).callFrame.functionName === '(idle)') inIdle += t; }
    console.log('PROFILE', n, JSON.stringify({ totalMs: Math.round(total / 1000), idleMs: Math.round(inIdle / 1000), createLinksInclusiveMs: Math.round(inCreateLinks / 1000) }));
    for (const [k, v] of Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log('  ', Math.round(v / 1000), 'ms', k);
  }
  console.log(JSON.stringify({ individuals: n, linkTriples: n * linksPer, loadRdfMs: loadMs, settledMs, longTaskMs: longMs, longTaskCount: longCount, longestTaskMs: longMaxMs }));
  await ctx.close(); await browser.close();
  fs.rmSync(new URL(`../public/${file}`, import.meta.url));
}
