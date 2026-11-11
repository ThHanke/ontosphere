// CPU profile of the main thread across a whole LUBM-1 session (load, settle, reasoning), with the
// rdf-worker -> page messages timestamped so batch arrivals line up with what the main thread does.
// Needs vite on :8091. Usage: node scripts/profile-lubm-batches.mjs | tee logs/lubm-batches.log
import { createRequire } from 'module';
const require = createRequire(new URL('../package.json', import.meta.url));
const { chromium } = require('playwright');
const base = process.env.BASE ?? 'http://127.0.0.1:8091/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BUCKET_MS = 5000;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await ctx.addInitScript(() => {
  const W = window.Worker;
  window.__msgs = [];
  window.Worker = class extends W {
    constructor(...a) {
      super(...a);
      this.addEventListener('message', (e) => {
        const d = e.data; if (!d || typeof d !== 'object') return;
        let n = 0;
        for (const k of ['items', 'added', 'removed', 'quads', 'subjects']) if (Array.isArray(d[k])) n += d[k].length;
        const p = d.payload; if (p && typeof p === 'object') for (const k of ['items', 'added', 'removed', 'quads', 'subjects']) if (Array.isArray(p[k])) n += p[k].length;
        window.__msgs.push({ t: performance.now(), type: String(d.type) + (d.event ? ':' + d.event : '') + (d.stage ? ':' + d.stage : ''), n });
      });
    }
  };
});
await page.goto(`${base}?ontologies=`, { waitUntil: 'load', timeout: 60000 });
try { await page.waitForNavigation({ timeout: 3000, waitUntil: 'load' }); } catch {}
await page.waitForFunction(() => window.crossOriginIsolated && !!window.__mcpTools?.loadRdf && (window.__startupComplete?.() ?? true), { timeout: 30000 });
await sleep(2000);

const cdp = await ctx.newCDPSession(page);
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 5000 });
await cdp.send('Profiler.start');
const perfStart = await page.evaluate(() => { window.__msgs = []; return performance.now(); });
const marks = [];
const mark = async (name) => marks.push({ name, t: (await page.evaluate(() => performance.now())) - perfStart });
for (const u of ['bench-lubm-tbox.nt', 'bench-lubm-abox.ttl']) {
  await mark(`loadRdf ${u} start`);
  await page.evaluate((url) => window.__mcpTools.loadRdf({ url }), new URL(u, base).href);
  await mark(`loadRdf ${u} returned`);
}
await sleep(60000); // let the canvas settle before reasoning; the timeline shows when it does
await mark('runReasoning start');
await page.evaluate(() => window.__mcpTools.runReasoning({ clearBefore: true, shaclValidation: false }));
await mark('runReasoning returned');
await sleep(5000);
const { profile } = await cdp.send('Profiler.stop');
const msgs = (await page.evaluate(() => window.__msgs)).map((m) => ({ ...m, t: m.t - perfStart }));

// samples -> per-bucket categories
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const parent = new Map(); for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const cat = new Map();
const categoryOf = (id) => {
  if (cat.has(id)) return cat.get(id);
  let cur = id; let r = 'other-js';
  const own = byId.get(id).callFrame.functionName;
  if (own === '(idle)') r = 'idle'; else if (own === '(garbage collector)') r = 'gc'; else if (own === '(program)') r = 'native';
  else while (cur) {
    const f = byId.get(cur).callFrame.functionName;
    if (f === 'createLinks') { r = 'createLinks'; break; }
    if (/^(performWorkOnRoot|renderRootSync|commitRoot|flushPassiveEffects|flushSyncWorkOnAllRoots|performSyncWorkOnRoot)/.test(f)) { r = 'react'; break; }
    if (/^(notifySubjectSubscribers|handler|addGraph)$/.test(f) && r === 'other-js') r = 'app-handlers';
    cur = parent.get(cur);
  }
  cat.set(id, r); return r;
};
const buckets = new Map(); let tUs = 0;
profile.samples.forEach((id, i) => {
  tUs += profile.timeDeltas[i];
  const b = Math.floor(tUs / 1000 / BUCKET_MS);
  const c = categoryOf(id);
  const o = buckets.get(b) ?? {}; o[c] = (o[c] ?? 0) + profile.timeDeltas[i] / 1000; buckets.set(b, o);
});
const msgBuckets = new Map();
for (const m of msgs) { const b = Math.floor(m.t / BUCKET_MS); const o = msgBuckets.get(b) ?? { msgs: 0, quads: 0, big: [] }; o.msgs++; o.quads += m.n; if (m.n >= 1000) o.big.push(`${m.type}(${m.n})`); msgBuckets.set(b, o); }
console.log('MARKS', JSON.stringify(marks.map((m) => [m.name, Math.round(m.t / 100) / 10 + ' s'])));
console.log('window  | busy ms by category | worker messages (count, quads) and big batches');
const maxB = Math.max(...buckets.keys(), ...msgBuckets.keys());
for (let b = 0; b <= maxB; b++) {
  const o = buckets.get(b) ?? {}; const m = msgBuckets.get(b);
  const parts = Object.entries(o).filter(([k]) => k !== 'idle').sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${Math.round(v)}`).join(', ');
  console.log(`${String(b * 5).padStart(4)}s | idle ${Math.round(o.idle ?? 0)} | ${parts} | ${m ? `${m.msgs} msgs, ${m.quads} quads ${m.big.slice(0, 3).join(' ')}` : '-'}`);
}
await browser.close();
