/**
 * Socratic pizza ontology demo — live qwen3:4b via OWUI relay.
 *
 * Two separate browser windows on the Xvfb virtual display (no iframes):
 *   Left  960×1080 — OWUI live chat
 *   Right 960×1080 — Ontosphere canvas
 *
 * Both pages are in the SAME Playwright context so BroadcastChannel works
 * across windows. Ontosphere is opened via window.open() from OWUI, which
 * creates a popup in the same storage partition.
 *
 * Recording is done by ffmpeg x11grab (no Playwright video). This avoids
 * the COEP ↔ Private Network Access conflict that broke the iframe stage page.
 *
 * The demo opens with a relay-activation sequence:
 *   1. Ontosphere left sidebar — AI Relay section visible with draggable bookmarklet
 *   2. Visual drag animation: bookmarklet "flies" from Ontosphere → OWUI
 *   3. Relay popup appears and connects
 *   4. Starter prompt sent → model calls help() → Socratic turns T0–T11
 *
 * Prerequisites:
 *   1. npm run dev                      # Ontosphere at localhost:8080
 *   2. npm run demo:owui:auth           # save .playwright/owui-auth.json
 *
 * Run (records video):
 *   OWUI_URL=https://gpuserver1-sit.iwm.fraunhofer.de \
 *   npm run demo:owui:video
 *
 * Output: docs/demo-videos/openwebui-socratic.webm / .mp4
 */

import { test, Page } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OWUI_URL  = process.env.OWUI_URL  || 'https://gpuserver1-sit.iwm.fraunhofer.de';
const VG_URL    = process.env.DEMO_BASE_URL || 'http://localhost:8080';
const AUTH_FILE = path.resolve(__dirname, '../.playwright/owui-auth.json');
const MODEL     = 'qwen3:4b';

// Playwright test-results path — collect-demo-videos.mjs scans this dir
const VIDEO_DIR  = path.resolve(__dirname, '../test-results/demo/demo-openwebui-socratic-recording');
const WEBM_PATH  = path.join(VIDEO_DIR, 'video.webm');

// Caption shown briefly before injection — tells viewer what's being asked
const TURN_TOPICS = [
  'Asking: what is the most fundamental OWL building block for a concept?',
  'Guide: build full ingredient hierarchy — PizzaTopping, PizzaBase, and 7 leaf varieties.',
  'Guide: model hasPart as an ObjectProperty with rdfs:domain and rdfs:range.',
  'Guide: add named pizza classes — SalamiPizza, HawaiianPizza, MargheritaPizza.',
  'Guide: define equivalentClass axioms via blank-node restrictions — anonymous someValuesFrom.',
  'Guide: expand all TBox nodes to reveal their asserted properties.',
  'Guide: switch to ABox — create 3 untyped pizza individuals.',
  'Guide: build pizza1 — add Salami, Mozzarella, ThinCrust parts and hasPart links.',
  'Guide: build pizza2 (Hawaiian) — add parts and links.',
  'Guide: build pizza3 (Margherita) — add parts and links.',
  'Guide: apply reasoning to derive all inferred triples.',
  'Guide: inspect pizza1, pizza2, pizza3 — trace the classification inference chain.',
];

// Caption shown after idle — describes what was just built
const AFTER_CAPTIONS = [
  'Pizza class on canvas — owl:Class, the atomic unit of OWL.',
  'Ingredient hierarchies — PizzaTopping and PizzaBase as independent classes, each with 5 and 2 leaf subclasses.',
  'hasPart ObjectProperty with rdfs:domain Pizza — ingredients stay semantically independent.',
  'Named pizza classes — SalamiPizza · HawaiianPizza · MargheritaPizza, each subClassOf Pizza.',
  'equivalentClass axioms loaded — pizza types defined by necessary-and-sufficient conditions.',
  'All TBox nodes expanded — asserted properties visible across the hierarchy.',
  'ABox view — pizza1 · pizza2 · pizza3 as bare NamedIndividuals, no class asserted.',
  'pizza1 built — salami1 · mozz1 · base1 as NamedIndividuals, typed and linked via hasPart.',
  'pizza2 (Hawaiian) built — pineapple1 · ham1 · base2 as NamedIndividuals, typed and linked via hasPart.',
  'pizza3 (Margherita) built — tom1 · mozz2 · base3 as NamedIndividuals, typed and linked via hasPart.',
  'reasoning complete — inferred triples materialised in urn:vg:inferred.',
  'Classification! pizza1 → SalamiPizza · pizza2 → HawaiianPizza · pizza3 → MargheritaPizza — all inferred, none asserted.',
];

// T0–T11: Socratic arc guiding qwen3 through a rich pizza ontology.
const TURNS = [
  // T0 — root class
  'I want to learn OWL ontology concepts through a hands-on example. I will guide you through the pizza domain step by step — one concept at a time. Rule: for each question I ask, model exactly the concept I ask about on the canvas, then stop and wait. Do not add anything beyond what I asked. Do not arrange nodes automatically. Use the ex: prefix for all IRIs (ex: maps to http://example.org/). First question: in OWL, what is the most fundamental building block for representing a concept? Create a single Pizza class — just this one node, nothing more. Wait for my next question.',

  // T1 — ingredient hierarchy
  'A pizza is made of two kinds of ingredient — a topping and a base. In OWL these form their own separate class hierarchies, distinct from the pizza itself. Add ex:PizzaTopping and ex:PizzaBase as independent owl:Class nodes — they are not a kind of pizza, so do not add any subClassOf edge to ex:Pizza. Then add five specific topping subclasses (each rdfs:subClassOf ex:PizzaTopping): ex:SalamiTopping, ex:HamTopping, ex:PineappleTopping, ex:MozzarellaTopping, ex:TomatoTopping. Add two base subclasses (each rdfs:subClassOf ex:PizzaBase): ex:ThinCrustBase, ex:DeepPanBase. All nodes and all subClassOf edges required. Then arrange the canvas. Wait for my next question.',

  // T2 — owl:ObjectProperty hasPart with rdfs:domain only (NO range)
  'In OWL, the relationship between a pizza and its parts is an owl:ObjectProperty. Create ex:hasPart as an ObjectProperty on the canvas. Declare its domain using rdfs:domain pointing to ex:Pizza — this tells the reasoner that anything with a hasPart connection is a pizza. Do not declare a range — leaving it open keeps ingredients semantically clean. Important: use rdfs:domain, not owl:domain. Wait for my next question.',

  // T3 — named pizza subclasses
  'There are many specific kinds of pizza. Add three named pizza classes: ex:SalamiPizza, ex:HawaiianPizza, and ex:MargheritaPizza. Each is a subclass of ex:Pizza — add all three nodes and all three rdfs:subClassOf ex:Pizza edges. Then arrange the hierarchy. Wait for my next question.',

  // T4 — owl:equivalentClass + owl:Restriction (defined classes)
  'In OWL a class can be defined by what it must contain — not just named, but provably equivalent to a restriction on its parts. SalamiPizza IS the class of things that necessarily have a SalamiTopping as a part; HawaiianPizza IS the class of things that necessarily have a PineappleTopping; MargheritaPizza necessarily has a TomatoTopping. Express each of the three pizza classes as an owl:equivalentClass restriction on ex:hasPart — use the restriction pattern from the tool description you read at startup. Do all three pizza classes. Wait for my next question.',

  // T5 — expandNode all + runLayout
  'Expand all class nodes on the canvas to reveal their asserted properties, then arrange. Wait for my next question.',

  // T6 — ABox: setViewMode + 3 untyped NamedIndividuals
  'Everything so far is the TBox — the schema. Switch to the individuals view (ABox) and create three pizza individuals: ex:pizza1, ex:pizza2, and ex:pizza3. Give each only the owl:NamedIndividual type — do NOT assert any pizza class (not Pizza, not SalamiPizza, nothing). Only the three bare nodes. The reasoner will classify them once we add ingredients. Arrange. Wait for my next question.',

  // T7 — build pizza1 (Salami)
  'Build ex:pizza1 as a Salami pizza. Add three ingredient individuals using addNode with typeIris (array): ex:salami1 with typeIris:["owl:NamedIndividual","ex:SalamiTopping"] label "salami1", ex:mozz1 with typeIris:["owl:NamedIndividual","ex:MozzarellaTopping"] label "mozz1", ex:base1 with typeIris:["owl:NamedIndividual","ex:ThinCrustBase"] label "base1". Then add an ex:hasPart edge FROM ex:pizza1 TO each ingredient. Do not assert any pizza class on ex:pizza1 — leave it untyped; the reasoner will classify it. Wait for my next question.',

  // T8 — build pizza2 (Hawaiian)
  'Build ex:pizza2 as a Hawaiian pizza. Add three ingredient individuals using addNode with typeIris (array): ex:pineapple1 with typeIris:["owl:NamedIndividual","ex:PineappleTopping"] label "pineapple1", ex:ham1 with typeIris:["owl:NamedIndividual","ex:HamTopping"] label "ham1", ex:base2 with typeIris:["owl:NamedIndividual","ex:DeepPanBase"] label "base2". Add ex:hasPart edges FROM ex:pizza2 TO each ingredient. Do not assert any class type on pizza2. Arrange. Wait for my next question.',

  // T9 — build pizza3 (Margherita) — explicit "pizza3 ONLY" to prevent model repeating pizza2
  'Now focus ONLY on ex:pizza3 (the Margherita). ex:pizza2 is already finished — do not touch it. ex:pizza3 has no ingredients yet. Add three ingredient individuals using addNode with typeIris (array): ex:tom1 with typeIris:["owl:NamedIndividual","ex:TomatoTopping"] label "tom1", ex:mozz2 with typeIris:["owl:NamedIndividual","ex:MozzarellaTopping"] label "mozz2", ex:base3 with typeIris:["owl:NamedIndividual","ex:ThinCrustBase"] label "base3". Add ex:hasPart edges with ex:pizza3 as subject: pizza3→tom1, pizza3→mozz2, pizza3→base3. Do not assert any class on pizza3. Arrange. Wait for my next question.',

  // T10 — runReasoning
  'The schema and all three pizzas are in place. Now apply reasoning to derive everything that can be inferred. Wait for my next question.',

  // T11 — classification showcase via graph query
  'The equivalentClass axioms we defined in the TBox should have been applied consistently across all three pizzas. Verify that the classification held: did each pizza receive the type its ingredient composition implies? Use whatever tool gives you the clearest proof — querying the graph or inspecting individual nodes. Show the evidence, state which types are inferred vs asserted, and trace the reasoning results for at least one pizza.',
];

// ── ffmpeg recording ───────────────────────────────────────────────────────────

function startRecording(): ChildProcess {
  const display = (process.env.DISPLAY ?? ':99').split('.')[0];
  fs.mkdirSync(VIDEO_DIR, { recursive: true });
  const proc = spawn('ffmpeg', [
    '-y',
    '-f', 'x11grab',
    '-video_size', '1920x1080',
    '-framerate', '25',
    '-i', `${display}.0`,
    '-c:v', 'libvpx-vp9',
    '-b:v', '1500k',
    '-deadline', 'realtime',
    '-cpu-used', '8',
    WEBM_PATH,
  ], { stdio: ['pipe', 'pipe', 'pipe'] });
  proc.stderr?.on('data', () => {}); // suppress ffmpeg progress output
  return proc;
}

async function stopRecording(proc: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (proc.exitCode !== null) { resolve(); return; }
    proc.once('exit', () => resolve());
    proc.stdin?.write('q');  // graceful stop
    setTimeout(() => { proc.kill('SIGKILL'); resolve(); }, 10_000);
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

const demoStart = Date.now();
function demoLog(...args: unknown[]) {
  const s = ((Date.now() - demoStart) / 1000).toFixed(1);
  console.log(`[demo +${s}s]`, ...args);
}

// Inject a caption overlay on both visible windows simultaneously.
async function caption(owuiPage: Page, appPage: Page | null, text: string): Promise<void> {
  const inject = (t: string) => {
    let el = document.getElementById('__cap__') as HTMLElement | null;
    if (!el) {
      el = document.createElement('div');
      el.id = '__cap__';
      Object.assign(el.style, {
        position: 'fixed', bottom: '36px', left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.84)', color: '#fff',
        font: '600 17px/1.45 "Inter",sans-serif',
        padding: '13px 30px', borderRadius: '8px',
        zIndex: '99999', pointerEvents: 'none',
        maxWidth: '80%', textAlign: 'center',
        boxShadow: '0 4px 28px rgba(0,0,0,0.45)',
      });
      document.body.appendChild(el);
    }
    el.textContent = t;
    el.style.display = 'block';
  };
  await Promise.all([
    owuiPage.evaluate(inject, text).catch(() => {}),
    appPage ? appPage.evaluate(inject, text).catch(() => {}) : Promise.resolve(),
  ]);
}

async function clearCaption(owuiPage: Page, appPage: Page | null): Promise<void> {
  const clear = () => {
    const el = document.getElementById('__cap__');
    if (el) el.style.display = 'none';
  };
  await Promise.all([
    owuiPage.evaluate(clear).catch(() => {}),
    appPage ? appPage.evaluate(clear).catch(() => {}) : Promise.resolve(),
  ]);
}

// isBusy checks the OWUI page: content-length growth OR relay has queued work OR model still streaming.
// Skips <details> subtrees so qwen3 CoT tokens don't block idle detection, but still checks
// __vgIsStreaming so we don't declare done while the model is mid-CoT thinking between tool calls.
async function isBusy(owuiPage: Page, prevLen: number): Promise<{ busy: boolean; len: number }> {
  const state = await owuiPage.evaluate(() => {
    const relayBusy = !((window as any).__vgIsRelayIdle?.() ?? true);
    const streaming = (window as any).__vgIsStreaming?.() ?? false;
    let len = 0;
    function walk(node: Node) {
      if (node.nodeType === Node.TEXT_NODE) {
        len += (node.textContent ?? '').length;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if ((node as Element).tagName === 'DETAILS') return;
        for (const child of node.childNodes) walk(child);
      }
    }
    walk(document.body);
    return { relayBusy, streaming, len };
  }).catch(() => ({ relayBusy: false, streaming: false, len: prevLen }));
  const growing = prevLen >= 0 && state.len !== prevLen;
  return { busy: state.relayBusy || state.streaming || growing, len: state.len };
}

async function waitIdle(owuiPage: Page, timeout = 300_000, stableMs = 3_000): Promise<boolean> {
  const deadline = Date.now() + timeout;
  const pollMs = 500;
  let silentMs = 0;
  let lastLen = -1;
  while (Date.now() < deadline) {
    const { busy, len } = await isBusy(owuiPage, lastLen);
    lastLen = len;
    if (busy) silentMs = 0; else silentMs += pollMs;
    if (silentMs >= stableMs) return true;
    await sleep(pollMs);
  }
  return false;
}

// waitRelayFlush checks __vgIsRelayIdle on OWUI (where the bookmarklet runs).
// Waits for relay to start processing, then waits for STABLE_MS of continuous silence.
async function waitRelayFlush(owuiPage: Page): Promise<void> {
  const POLL_MS          = 500;
  const ACTIVITY_WAIT_MS = 45_000;
  const STABLE_MS        = 45_000;
  const FINISH_WAIT_MS   = 300_000;

  const actDeadline = Date.now() + ACTIVITY_WAIT_MS;
  let relayBecameActive = false;
  while (Date.now() < actDeadline) {
    const isIdle = await owuiPage.evaluate(() => (window as any).__vgIsRelayIdle?.() ?? true).catch(() => true);
    if (!isIdle) { relayBecameActive = true; break; }
    await sleep(POLL_MS);
  }
  if (!relayBecameActive) return;

  const finDeadline = Date.now() + FINISH_WAIT_MS;
  let silentMs = 0;
  while (Date.now() < finDeadline) {
    const isIdle = await owuiPage.evaluate(() => (window as any).__vgIsRelayIdle?.() ?? true).catch(() => true);
    if (isIdle) {
      silentMs += POLL_MS;
      if (silentMs >= STABLE_MS) return;
    } else {
      silentMs = 0;
    }
    await sleep(POLL_MS);
  }
}

async function waitQuiet(owuiPage: Page, quietMs = 10_000, maxMs = 45_000): Promise<void> {
  const pollMs = 500;
  let silentMs = 0;
  let lastLen = -1;
  const deadline = Date.now() + maxMs;
  while (silentMs < quietMs && Date.now() < deadline) {
    const { busy, len } = await isBusy(owuiPage, lastLen);
    lastLen = len;
    if (busy) silentMs = 0; else silentMs += pollMs;
    await sleep(pollMs);
  }
}

async function inject(owuiPage: Page, text: string, retries = 8): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    const ok = await owuiPage.evaluate(
      (t) => typeof (window as any).__vgInjectResult === 'function'
        ? (window as any).__vgInjectResult(t) : false,
      text,
    ).catch(() => false);
    if (ok !== false) return true;
    await sleep(500);
  }
  return false;
}

async function clickSend(owuiPage: Page): Promise<void> {
  await owuiPage.locator('#send-message-button:not([disabled])').click({ timeout: 3_000 }).catch(() => {});
}

// ── Test ──────────────────────────────────────────────────────────────────────

test('openwebui-socratic: Socratic pizza ontology — live qwen3:4b via OWUI relay', async ({ page, context }) => {
  test.setTimeout(2_700_000); // 45 min

  let ffmpegProc: ReturnType<typeof startRecording> | null = null;

  try {
    await context.exposeFunction('__demoLog__', (msg: string) => { demoLog(msg); });

    // ── 1. Load auth state ─────────────────────────────────────────────────
    if (fs.existsSync(AUTH_FILE)) {
      const state = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8')) as {
        cookies?: Array<Record<string, unknown>>;
        origins?: Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }>;
      };
      if (state.cookies?.length)
        await context.addCookies(state.cookies as unknown as Parameters<typeof context.addCookies>[0]);
      if (state.origins?.length) {
        await context.addInitScript((origins) => {
          const entry = (origins as Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }>)
            .find(o => o.origin === location.origin);
          if (entry?.localStorage)
            for (const { name, value } of entry.localStorage)
              try { localStorage.setItem(name, value); } catch { /* ignore */ }
        }, state.origins);
      }
    }

    // ── 2. Open OWUI (left half, 960×1080) ────────────────────────────────
    const owuiPage = page;
    demoLog('step 1: navigating to OWUI');
    await owuiPage.goto(`${OWUI_URL}/`);
    await owuiPage.waitForSelector('#chat-input', { timeout: 90_000 });
    demoLog('step 1: OWUI loaded');

    // Pre-seed Ontosphere app localStorage (autoApplyLayout, no workflow catalog).
    // Done via a throwaway page — addInitScript runs on navigation, not on already-loaded pages.
    const appAuthPage = await context.newPage();
    const appUrl = `${VG_URL}/?ontologies=${encodeURIComponent('owl,rdf,rdfs')}`;
    await appAuthPage.goto(appUrl);
    await appAuthPage.waitForFunction(() => !!(window as any).__mcpTools?.addNode && ((window as any).__startupComplete?.() ?? true), { timeout: 30_000 });
    await appAuthPage.evaluate(() => {
      localStorage.setItem('ontology-painter-config', JSON.stringify({
        config: { autoApplyLayout: true, workflowCatalogEnabled: false },
      }));
    });
    await appAuthPage.close();
    demoLog('step 1: app auth OK');

    // ── 3. Position OWUI window at left half via CDP ───────────────────────
    const owuiCdp = await context.newCDPSession(owuiPage);
    const { windowId: owuiWinId } = await owuiCdp.send('Browser.getWindowForTarget', {});
    await owuiCdp.send('Browser.setWindowBounds', {
      windowId: owuiWinId,
      bounds: { left: 0, top: 0, width: 960, height: 1080 },
    });
    demoLog('step 2: OWUI window positioned left');

    // ── 4. Open Ontosphere as popup (same context = shared BroadcastChannel) ─
    // window.open with popup=yes creates a separate browser window, not a tab.
    // Both pages share the same Playwright context → same storage partition →
    // BroadcastChannel('ontosphere-relay-v1') works across both windows.
    const appPagePromise = context.waitForEvent('page');
    await owuiPage.evaluate((url) => {
      window.open(url, 'ontosphere', 'left=960,top=0,width=960,height=1080,popup=yes');
    }, appUrl);
    const appPage = await appPagePromise;
    await appPage.waitForFunction(() => !!(window as any).__mcpTools?.addNode && ((window as any).__startupComplete?.() ?? true), { timeout: 30_000 });
    demoLog('step 2: Ontosphere popup loaded');

    // Ensure Ontosphere window is positioned at right half.
    const appCdp = await context.newCDPSession(appPage);
    const { windowId: appWinId } = await appCdp.send('Browser.getWindowForTarget', {});
    await appCdp.send('Browser.setWindowBounds', {
      windowId: appWinId,
      bounds: { left: 960, top: 0, width: 960, height: 1080 },
    });
    demoLog('step 3: both windows positioned');

    // Start recording only after both windows are in their final positions
    // so the URL-bar blur coordinates are always valid.
    ffmpegProc = startRecording();
    demoLog('ffmpeg recording started');

    // Wrap __mcpTools so tool calls are logged.
    await appPage.evaluate(() => {
      const log = (window as any).__demoLog__ as (msg: string) => void;
      const tools = (window as any).__mcpTools as Record<string, (p: unknown) => Promise<unknown>>;
      (window as any).__demoMcpCallCount__ = 0;
      for (const name of Object.keys(tools)) {
        const orig = tools[name];
        tools[name] = async (params: unknown) => {
          (window as any).__demoMcpCallCount__++;
          const argStr = JSON.stringify(params ?? {});
          log?.(`[MCP→] ${name} ${argStr.length > 400 ? argStr.slice(0, 400) + '…' : argStr}`);
          const result = await orig(params);
          const resStr = JSON.stringify(result ?? {});
          log?.(`[MCP←] ${name} ${resStr.length > 200 ? resStr.slice(0, 200) + '…' : resStr}`);
          return result;
        };
      }
    });

    // Hide broken avatar images in OWUI (profile pic URLs don't resolve in automation).
    await owuiPage.evaluate(() => {
      const hide = (img: HTMLImageElement) => { img.style.display = 'none'; };
      document.querySelectorAll<HTMLImageElement>('img').forEach(img => {
        img.addEventListener('error', () => hide(img), { once: true });
        if (img.complete && img.naturalWidth === 0) hide(img);
      });
      new MutationObserver(muts => {
        for (const m of muts) for (const n of m.addedNodes) {
          if ((n as Element).querySelectorAll)
            (n as Element).querySelectorAll<HTMLImageElement>('img').forEach(img =>
              img.addEventListener('error', () => hide(img), { once: true })
            );
        }
      }).observe(document.body, { childList: true, subtree: true });
    });
    await sleep(1_500);

    // ── 5. Show relay setup in Ontosphere — open AI Relay section ─────────
    await caption(owuiPage, appPage, 'Setting up Ontosphere Relay…');
    // Expand left sidebar if collapsed
    await appPage.locator('button[aria-label="Expand sidebar"]').click({ timeout: 5_000 }).catch(() => {});
    await sleep(500);
    // Click "AI Relay" accordion trigger to expand relay section
    await appPage.locator('text=AI Relay').click({ timeout: 5_000 }).catch(() => {});
    await sleep(800);
    demoLog('step 4: AI Relay section opened in Ontosphere');

    // ── 6. Visual bookmarklet drag: animate button flying from Ontosphere to OWUI ──
    await caption(owuiPage, appPage, 'Drag "Ontosphere Relay" to the AI chat tab to install…');
    await sleep(1_500);

    // Animate a ghost "button" flying from the relay section toward OWUI.
    // Pure CSS transition — no real drag needed, relay is injected programmatically next.
    await appPage.evaluate(() => {
      const btn = document.querySelector('[aria-label="Drag to bookmark bar to install Ontosphere Relay"]') as HTMLElement | null;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const ghost = document.createElement('div');
      ghost.style.cssText = [
        `position:fixed`,
        `left:${rect.left}px`,
        `top:${rect.top}px`,
        `width:${rect.width}px`,
        `height:${rect.height}px`,
        `background:#3b82f6`,
        `color:#fff`,
        `border-radius:6px`,
        `display:flex`,
        `align-items:center`,
        `justify-content:center`,
        `font:600 13px/1 sans-serif`,
        `gap:6px`,
        `padding:0 12px`,
        `z-index:99999`,
        `pointer-events:none`,
        `transition:left 0.9s ease-in, top 0.9s ease-in, opacity 0.9s ease-in`,
        `box-shadow:0 4px 14px rgba(0,0,0,0.4)`,
      ].join(';');
      ghost.innerHTML = '⚡ Ontosphere Relay';
      document.body.appendChild(ghost);
      requestAnimationFrame(() => {
        ghost.style.left = '-960px';  // flies off left edge toward OWUI window
        ghost.style.top  = '40px';
        ghost.style.opacity = '0';
      });
      setTimeout(() => ghost.remove(), 1_100);
    });
    await sleep(1_200);
    await clearCaption(owuiPage, appPage);

    // ── 7. Inject relay bookmarklet into OWUI ─────────────────────────────
    // Fetch relay code from Ontosphere (HTTP — no mixed-content issues here).
    const relayCode = await appPage.evaluate(async (vgUrl: string) => {
      const r = await fetch('/relay-bookmarklet.js');
      let src: string = await r.text();
      src = src.replace(/__RELAY_URL__/g,    `${vgUrl}/relay.html`);
      src = src.replace(/__RELAY_ORIGIN__/g, vgUrl);
      src = src.replace(/\}\)\(\);\s*$/, [
        '  window.__vgInjectResult = injectResult;',
        '  window.__vgIsStreaming   = isAiStreaming;',
        '  window.__vgIsRelayIdle  = function() { return callQueue.length === 0 && !isProcessing; };',
        '})();',
      ].join('\n'));
      return src;
    }, VG_URL);

    const relayPopupPromise = context.waitForEvent('page', { timeout: 20_000 });
    await owuiPage.evaluate((src: string) => { new Function(src)(); }, relayCode);
    const relayPopup = await relayPopupPromise;
    await relayPopup.waitForLoadState('domcontentloaded');

    // Position relay popup in bottom-right corner of Ontosphere window.
    const relayPopupCdp = await context.newCDPSession(relayPopup);
    const { windowId: relayWinId } = await relayPopupCdp.send('Browser.getWindowForTarget', {});
    await relayPopupCdp.send('Browser.setWindowBounds', {
      windowId: relayWinId,
      bounds: { left: 1580, top: 840, width: 340, height: 220 },
    });
    await sleep(800);
    demoLog('step 5: relay injected, popup open');
    await caption(owuiPage, appPage, 'Relay connected ✓ — model ready for instructions');
    await sleep(2_000);
    await clearCaption(owuiPage, appPage);

    // ── 8. Select model ────────────────────────────────────────────────────
    while (true) {
      const rm = await owuiPage.$('button[aria-label*="Remove Model"]');
      if (!rm) break;
      await rm.click();
      await sleep(300);
    }
    const modelBtn = await owuiPage.$('#model-selector-0-button');
    if (modelBtn) {
      await modelBtn.click();
      await sleep(400);
      const search = await owuiPage.$('input[placeholder*="Search" i]');
      if (search) { await search.fill(MODEL); await sleep(400); }
      const pick = await owuiPage.$(`button:has-text("${MODEL}")`);
      if (pick) { await pick.click(); await sleep(400); }
    }

    // ── 9. Send starter prompt → /c/ URL ──────────────────────────────────
    await caption(owuiPage, appPage, 'Sending relay starter prompt…');
    const STARTER_LINES = [
      'You are connected to Ontosphere via a relay. A script in this tab intercepts your tool calls, runs them in Ontosphere, and injects results back as a user message. Always demonstrate answers by BUILDING in Ontosphere — never describe what you would do, always do it. Every response to a question about a concept must include tool calls that construct that concept in the graph. If a tool call returns success:false, read the error, fix the argument, and retry the same call immediately — never skip a failed call. Ask the user what they would like to build.',
      '',
      'Output format — one JSON-RPC 2.0 call per line, backtick-wrapped:',
      '`{"jsonrpc":"2.0","id":<N>,"method":"tools/call","params":{"name":"<toolName>","arguments":{...}}}`',
      '',
      'Call help first to get full instructions and the tool list:',
      '`{"jsonrpc":"2.0","id":0,"method":"tools/call","params":{"name":"help","arguments":{}}}`',
    ];
    await owuiPage.locator('#chat-input').click();
    for (let i = 0; i < STARTER_LINES.length; i++) {
      if (STARTER_LINES[i]) await owuiPage.keyboard.type(STARTER_LINES[i], { delay: 2 });
      if (i < STARTER_LINES.length - 1) await owuiPage.keyboard.press('Shift+Enter');
    }
    demoLog('step 6: sending starter prompt');
    await owuiPage.keyboard.press('Enter');
    await owuiPage.waitForFunction(() => location.pathname.startsWith('/c/'), { timeout: 15_000 });
    demoLog('step 6: starter prompt sent, chat URL:', await owuiPage.evaluate(() => location.pathname));

    // ── 10. Wait for model's help() cycle ─────────────────────────────────
    demoLog('step 7: waiting for first MCP call (up to 3 min)…');
    await caption(owuiPage, appPage, 'Model familiarising with MCP tools — calling help()…');
    {
      const HELP_MAX_MS = 180_000;
      const POLL_MS = 500;
      const deadline = Date.now() + HELP_MAX_MS;
      let gotFirst = false;
      while (Date.now() < deadline) {
        const n = await appPage.evaluate(() => (window as any).__demoMcpCallCount__ ?? 0);
        if (n > 0) { gotFirst = true; break; }
        await sleep(POLL_MS);
      }
      if (!gotFirst) {
        throw new Error('Model did not call any tools during help() cycle — check OWUI model availability.');
      }
      demoLog('step 7: first MCP call received — waiting quiet…');
      await waitQuiet(owuiPage, 15_000, 60_000);
    }
    const mcpCallCount = await appPage.evaluate(() => (window as any).__demoMcpCallCount__ ?? 0);
    demoLog(`step 7: help() cycle OK — ${mcpCallCount} MCP call(s)`);
    await sleep(3_000);
    await clearCaption(owuiPage, appPage);

    // ── 11. Socratic turns T0–T11 ─────────────────────────────────────────
    await clearCaption(owuiPage, appPage);
    demoLog(`turn 1/${TURNS.length}: "${TURN_TOPICS[0]}" — sending`);
    await caption(owuiPage, appPage, TURN_TOPICS[0]);
    await sleep(3_000);
    await inject(owuiPage, TURNS[0]);
    await sleep(400);
    await clickSend(owuiPage);
    await clearCaption(owuiPage, appPage);

    for (let i = 0; i < TURNS.length; i++) {
      await waitIdle(owuiPage, 300_000, 10_000);
      demoLog(`turn ${i + 1}/${TURNS.length}: idle — model done`);

      await waitRelayFlush(owuiPage);
      demoLog(`turn ${i + 1}/${TURNS.length}: relay flushed`);

      await caption(owuiPage, appPage, AFTER_CAPTIONS[i]);
      await sleep(4_000);

      if (i < TURNS.length - 1) {
        demoLog(`turn ${i + 2}/${TURNS.length}: "${TURN_TOPICS[i + 1]}" — sending`);
        await caption(owuiPage, appPage, TURN_TOPICS[i + 1]);
        await sleep(3_000);
        await inject(owuiPage, TURNS[i + 1]);
        await sleep(400);
        await clickSend(owuiPage);
        await clearCaption(owuiPage, appPage);
      } else {
        await sleep(3_000);
        await clearCaption(owuiPage, appPage);
      }
    }

    // ── 12. Export Turtle snapshot ────────────────────────────────────────
    try {
      const turtleData = await appPage.evaluate(async () => {
        const tools = (window as any).__mcpTools;
        if (!tools?.exportGraph) return null;
        const result = await tools.exportGraph({ format: 'turtle' });
        return result?.data?.content ?? null;
      });
      if (turtleData) {
        const turtlePath = path.resolve(__dirname, '../logs/demo-last-run-data.ttl');
        fs.mkdirSync(path.dirname(turtlePath), { recursive: true });
        fs.writeFileSync(turtlePath, turtleData, 'utf8');
        demoLog(`turtle exported → logs/demo-last-run-data.ttl (${turtleData.length} chars)`);
      }
    } catch (e) {
      demoLog('turtle export failed:', e);
    }

    // ── 13. End card ──────────────────────────────────────────────────────
    demoLog('all turns done — end card');
    await caption(owuiPage, appPage, 'Pizza ontology — TBox · ABox · named pizza classes · equivalentClass axioms · reasoning — built through Socratic questioning alone');
    await sleep(6_000);
    await clearCaption(owuiPage, appPage);

  } finally {
    // Close relay popup before stopping recording so the final frame is clean.
    await context.pages()
      .find(p => p.url().includes('relay.html'))
      ?.close().catch(() => {});

    if (ffmpegProc) {
      demoLog('stopping ffmpeg recording…');
      await stopRecording(ffmpegProc);
    }

    if (fs.existsSync(WEBM_PATH)) {
      const mb = (fs.statSync(WEBM_PATH).size / 1024 / 1024).toFixed(1);
      demoLog(`video saved → ${WEBM_PATH} (${mb} MB)`);
    } else {
      demoLog('video file not found — ffmpeg may have failed');
    }
  }
});
