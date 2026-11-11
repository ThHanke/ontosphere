// Functional check for the lazily mounted authoring decorators: with N individuals loaded, none is mounted
// until an element is hovered or selected; the hovered element then shows its inline actions.
//   node scripts/check-authoring-decorators.mjs [N]
import { createRequire } from 'module';
import fs from 'node:fs';
const require = createRequire(new URL('../package.json', import.meta.url));
const { chromium } = require('playwright');
const base = process.env.BASE ?? 'http://127.0.0.1:8091/';
const n = parseInt(process.argv[2] ?? '300', 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const file = `bench-synth-deco-${n}.ttl`;
const lines = ['@prefix ex: <http://e.test/> .', '@prefix owl: <http://www.w3.org/2002/07/owl#> .', 'ex:C a owl:Class .', 'ex:p a owl:ObjectProperty .'];
for (let i = 0; i < n; i++) { lines.push(`ex:i${i} a owl:NamedIndividual, ex:C .`); lines.push(`ex:i${i} ex:p ex:i${(i * 7 + 3) % n} .`); }
fs.writeFileSync(new URL(`../public/${file}`, import.meta.url), lines.join('\n'));
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await ctx.addInitScript(() => { window.__lastBusy = performance.now(); window.__lastBeat = performance.now(); setInterval(() => { const x = performance.now(); if (x - window.__lastBeat > 150) window.__lastBusy = x; window.__lastBeat = x; }, 50); });
await page.goto(`${base}?ontologies=`, { waitUntil: 'load', timeout: 60000 });
try { await page.waitForNavigation({ timeout: 3000, waitUntil: 'load' }); } catch {}
await page.waitForFunction(() => window.crossOriginIsolated && !!window.__mcpTools?.loadRdf && (window.__startupComplete?.() ?? true), { timeout: 30000 });
await sleep(2000);
await page.evaluate((url) => window.__mcpTools.loadRdf({ url }), new URL(file, base).href);
await page.waitForFunction(() => performance.now() - window.__lastBusy > 8000 && performance.now() - window.__lastBeat < 200, null, { timeout: 300000, polling: 500 });
const cdp = await ctx.newCDPSession(page);
const count = async (label) => {
  const r = await page.evaluate(() => ({
    decorators: document.querySelectorAll('.reactodia-authoring-state__decorator').length,
    actionButtons: document.querySelectorAll('.reactodia-authoring-state__action').length,
    elements: document.querySelectorAll('.reactodia-overlaid-element').length,
  }));
  const d = await cdp.send('Memory.getDOMCounters');
  console.log(label, JSON.stringify({ ...r, nodes: d.nodes, listeners: d.jsEventListeners }));
};
await count('after load, nothing hovered or selected');
const boxes = await page.evaluate(() => [...document.querySelectorAll('.reactodia-overlaid-element')].slice(0, 40).map((el) => { const b = el.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height, id: el.getAttribute('data-element-id') }; }).filter((b) => b.x > 0 && b.y > 60 && b.x < 1400 && b.y < 880));
console.log('visible candidate elements', boxes.length);
if (boxes.length) {
  const t = boxes[0];
  await page.mouse.move(t.x, t.y); await page.mouse.move(t.x + 2, t.y + 2); await sleep(500);
  await count('hovering one element');
  const hoverButtons = await page.evaluate((id) => [...document.querySelectorAll('.reactodia-authoring-state__action')].map((b) => b.textContent), t.id);
  console.log('inline action buttons while hovering', JSON.stringify(hoverButtons));
  await page.mouse.move(5, 500); await sleep(500);
  await count('pointer moved away');
  await page.mouse.click(t.x, t.y); await sleep(700);
  await count('after selecting it');
}
await page.screenshot({ path: 'logs/decorators-check.png' });
await browser.close();
fs.rmSync(new URL(`../public/${file}`, import.meta.url));
