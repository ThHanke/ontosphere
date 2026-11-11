import { Page, Frame, FrameLocator, Locator } from '@playwright/test';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

/** MCP tool call parsed from a seed. */
export interface ToolCall {
  kind: 'tool';
  name: string;
  arguments: Record<string, unknown>;
}

/** UI action parsed from an ```action block. */
export interface SeedAction {
  kind: 'action';
  type: 'click' | 'fill' | 'scroll' | 'drag' | 'dragTo' | 'select' | 'hover' | 'key' | 'wait' | 'waitFor';
  selector?: string;
  targetSelector?: string;
  value?: string;
  dx?: number;
  dy?: number;
  ms?: number;
}

/** One step in a seed — either a tool call or a UI action. */
export type SeedStep = ToolCall | SeedAction;

/** Parsed turn from a seed markdown file. */
export interface SeedTurn {
  caption: string;
  slug?: string;
  toolCalls: Array<{ name: string; arguments: Record<string, unknown> }>;
  steps: SeedStep[];
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Metadata recorded for each keyframe screenshot. */
export interface KeyframeMeta {
  slug: string;
  stepIndex: number;
  caption: string;
  file: string;
  elementCount: number;
  timestampMs: number;
}

export class DemoRunner {
  private chatFrame!: FrameLocator;
  private appFrame!: FrameLocator;
  private chatFrameHandle!: Frame;
  private appFrameHandle!: Frame;
  private keyframes: KeyframeMeta[] = [];
  private demoName = '';
  private stepCounter = 0;
  private startTime = Date.now();
  private cursorPos = { x: 0, y: 0 };
  private cursorReady = false;

  constructor(private page: Page, private baseURL: string) {}

  private async waitForFrame(predicate: (f: Frame) => boolean, timeout = 15_000): Promise<Frame> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const found = this.page.frames().find(predicate);
      if (found) return found;
      await this.page.waitForTimeout(200);
    }
    throw new Error('waitForFrame: timed out');
  }

  /** Open demo-stage.html and wait for both iframes to be ready. */
  async openStage(): Promise<void> {
    await this.page.goto(`${this.baseURL}/demo-stage.html`);
    this.cursorReady = false;

    this.chatFrame = this.page.frameLocator('iframe >> nth=0');
    this.appFrame  = this.page.frameLocator('iframe >> nth=1');

    this.chatFrameHandle = await this.waitForFrame(
      f => f.url().includes('relay-mock-chat'),
    );
    this.appFrameHandle = await this.waitForFrame(
      f => f.url().startsWith(this.baseURL)
        && !f.url().includes('relay-mock-chat')
        && !f.url().includes('demo-stage'),
    );

    await this.appFrameHandle.waitForFunction(
      () => !!(window as any).__mcpTools && typeof (window as any).__mcpTools['addNode'] === 'function' && ((window as any).__startupComplete?.() ?? true),
      { timeout: 20_000 },
    );
  }

  /** Inject bookmarklet into the chat iframe; waits for relay popup. */
  async injectBookmarklet(): Promise<void> {
    const bookmarkletSrc = fs.readFileSync(
      path.resolve(__dirname, '../public/relay-bookmarklet.js'), 'utf8',
    )
      .replace(/__RELAY_ORIGIN__/g, this.baseURL)
      .replace(/__RELAY_URL__/g, `${this.baseURL}/relay.html`);

    const popupPromise = this.page.waitForEvent('popup', { timeout: 10_000 });
    await this.chatFrameHandle.evaluate((src) => {
      (window as any).__vgRelayActive = false;
      new Function(src)();
    }, bookmarkletSrc);
    const relayPopup = await popupPromise;
    await relayPopup.waitForLoadState('domcontentloaded');
  }

  /** Click a scenario button in the mock chat. */
  async clickScenario(name: 'single' | 'batch' | 'full' | 'prefixed' | 'unknown-tool'): Promise<void> {
    await this.chatFrame.locator(`[data-scenario="${name}"]`).click();
  }

  /** Switch UI mode in the mock chat. */
  async switchMode(mode: 'fhgenie' | 'openwebui' | 'chatgpt'): Promise<void> {
    await this.chatFrame.locator(`#mode-${mode}`).click();
  }

  /** Wait for a Ontosphere result to appear in the chat stream. */
  async waitForResult(timeout = 15_000): Promise<string> {
    const locator = this.chatFrame.locator('#chat-stream .msg-user', { hasText: '[Ontosphere' }).last();
    await locator.waitFor({ state: 'visible', timeout });
    return locator.innerText();
  }

  /** Clear the chat. */
  async clearChat(): Promise<void> {
    await this.chatFrame.locator('[data-scenario="clear"]').click();
  }

  /** Get the chat frame locator (stage mode only). */
  getChatFrame(): FrameLocator { return this.chatFrame; }

  /** Get the app frame locator (stage mode only). */
  getAppFrame(): FrameLocator { return this.appFrame; }

  /** Animate the cursor overlay to a Locator's center. Works with frame-targeted locators. */
  async cursorTo(locator: Locator, durationMs = 400): Promise<void> {
    const box = await locator.boundingBox();
    if (box) {
      await this.animateCursorTo(box.x + box.width / 2, box.y + box.height / 2, durationMs);
    }
  }

  /** Open the app alone (full viewport) and wait for MCP tools to be ready. */
  async openApp(): Promise<void> {
    await this.page.goto(this.baseURL);
    this.cursorReady = false;
    await this.page.waitForFunction(
      () => !!(window as any).__mcpTools && typeof (window as any).__mcpTools['addNode'] === 'function' && ((window as any).__startupComplete?.() ?? true),
      { timeout: 20_000 },
    );
  }

  // ── Seed parsing ─────────────────────────────────────────────────────────

  /** Parse an ```action block line into a SeedAction. Returns null for unknown types. */
  private static parseActionLine(line: string): SeedAction | null {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return null;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) return null;

    const type = trimmed.slice(0, colonIdx).trim().toLowerCase();
    const rest = trimmed.slice(colonIdx + 1).trim();

    switch (type) {
      case 'click':
        return { kind: 'action', type: 'click', selector: rest };
      case 'hover':
        return { kind: 'action', type: 'hover', selector: rest };
      case 'waitfor':
        return { kind: 'action', type: 'waitFor', selector: rest };
      case 'key':
        return { kind: 'action', type: 'key', value: rest };
      case 'wait': {
        const ms = parseInt(rest, 10);
        return isNaN(ms) ? null : { kind: 'action', type: 'wait', ms };
      }
      case 'fill': {
        const pipeIdx = rest.indexOf('|');
        if (pipeIdx === -1) return null;
        return { kind: 'action', type: 'fill', selector: rest.slice(0, pipeIdx).trim(), value: rest.slice(pipeIdx + 1).trim() };
      }
      case 'scroll': {
        const parts = rest.split(/\s+/).map(Number);
        if (parts.length < 2 || parts.some(isNaN)) return null;
        return { kind: 'action', type: 'scroll', dx: parts[0], dy: parts[1] };
      }
      case 'drag': {
        const pipeIdx = rest.indexOf('|');
        if (pipeIdx === -1) return null;
        const sel = rest.slice(0, pipeIdx).trim();
        const nums = rest.slice(pipeIdx + 1).trim().split(/\s+/).map(Number);
        if (nums.length < 2 || nums.some(isNaN)) return null;
        return { kind: 'action', type: 'drag', selector: sel, dx: nums[0], dy: nums[1] };
      }
      case 'dragto': {
        const pipeIdx = rest.indexOf('|');
        if (pipeIdx === -1) return null;
        return { kind: 'action', type: 'dragTo', selector: rest.slice(0, pipeIdx).trim(), targetSelector: rest.slice(pipeIdx + 1).trim() };
      }
      case 'select': {
        const pipeIdx = rest.indexOf('|');
        if (pipeIdx === -1) return null;
        return { kind: 'action', type: 'select', selector: rest.slice(0, pipeIdx).trim(), value: rest.slice(pipeIdx + 1).trim() };
      }
      default:
        return null;
    }
  }

  /**
   * Parse a seed markdown file into turns.
   * Each turn groups JSON-RPC tool calls and UI action blocks under the nearest
   * preceding snapshot caption (or the assistant turn prose if no snapshot follows).
   */
  static parseSeed(seedPath: string): SeedTurn[] {
    const content = fs.readFileSync(seedPath, 'utf8');
    const lines = content.split('\n');
    const turns: SeedTurn[] = [];
    let current: SeedTurn | null = null;

    const TOOL_RE = /^`(\{"jsonrpc":"2\.0",.+\})`\s*$/;
    let inSnapshot = false;
    let snapshotCaption = '';
    let snapshotSlug = '';
    let inAction = false;

    const flush = () => {
      if (current && current.steps.length > 0) {
        turns.push(current);
        current = null;
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Snapshot blocks
      if (line.startsWith('```snapshot')) {
        inSnapshot = true;
        snapshotCaption = '';
        snapshotSlug = '';
        continue;
      }
      if (inSnapshot) {
        if (line.startsWith('```')) {
          inSnapshot = false;
          if (current) {
            current.caption = snapshotCaption || current.caption;
            if (snapshotSlug) current.slug = snapshotSlug;
          }
          continue;
        }
        const m = line.match(/^caption:\s*(.+)/);
        if (m) snapshotCaption = m[1].trim();
        const s = line.match(/^slug:\s*(.+)/);
        if (s) snapshotSlug = s[1].trim();
        continue;
      }

      // Action blocks
      if (line.startsWith('```action')) {
        inAction = true;
        if (!current) current = { caption: '', toolCalls: [], steps: [] };
        continue;
      }
      if (inAction) {
        if (line.startsWith('```')) {
          inAction = false;
          continue;
        }
        const action = DemoRunner.parseActionLine(line);
        if (action && current) {
          current.steps.push(action);
        }
        continue;
      }

      // New assistant or user turn marker
      if (line.startsWith('**Assistant:**') || line.startsWith('**You:**')) {
        flush();
        const prose = line.replace(/\*\*(?:Assistant|You):\*\*\s*/, '').trim();
        current = { caption: prose.substring(0, 120), toolCalls: [], steps: [] };
        continue;
      }

      const toolMatch = line.match(TOOL_RE);
      if (toolMatch) {
        try {
          const rpc = JSON.parse(toolMatch[1]);
          if (rpc.params?.name && current) {
            const tc: ToolCall = { kind: 'tool', name: rpc.params.name, arguments: rpc.params.arguments ?? {} };
            current.toolCalls.push({ name: tc.name, arguments: tc.arguments });
            current.steps.push(tc);
          }
        } catch { /* skip malformed */ }
      }
    }
    flush();
    return turns;
  }

  // ── Animated cursor ──────────────────────────────────────────────────────

  private async initCursor(): Promise<void> {
    if (this.cursorReady) return;
    const vp = this.page.viewportSize() ?? { width: 1920, height: 1080 };
    this.cursorPos = { x: vp.width / 2, y: vp.height / 2 };
    await this.page.evaluate(([x, y]: [number, number]) => {
      const el = document.createElement('div');
      el.id = '__demo_cursor__';
      el.innerHTML = `<svg width="36" height="44" viewBox="0 0 36 44" xmlns="http://www.w3.org/2000/svg">
        <path d="M2,2 L2,36 L10,28 L18,44 L22,42 L14,26 L26,26 Z"
              fill="#fff" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/>
      </svg>`;
      Object.assign(el.style, {
        position: 'fixed',
        left: `${x}px`,
        top: `${y}px`,
        width: '36px',
        height: '44px',
        pointerEvents: 'none',
        zIndex: '999998',
        filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.35))',
        transition: 'none',
      });
      document.body.appendChild(el);
    }, [this.cursorPos.x, this.cursorPos.y] as [number, number]);
    this.cursorReady = true;
  }

  /**
   * Animate the visible cursor overlay + real Playwright mouse to (x, y).
   * Uses CSS transition for smooth visual movement and mouse.move for event targets.
   */
  private async animateCursorTo(x: number, y: number, durationMs = 400): Promise<void> {
    await this.initCursor();
    const steps = Math.max(8, Math.round(durationMs / 16));
    await this.page.evaluate(([tx, ty, dur]: [number, number, number]) => {
      const el = document.getElementById('__demo_cursor__');
      if (!el) return;
      el.style.transition = `left ${dur}ms cubic-bezier(0.25,0.1,0.25,1), top ${dur}ms cubic-bezier(0.25,0.1,0.25,1)`;
      el.style.left = `${tx}px`;
      el.style.top = `${ty}px`;
    }, [x, y, durationMs] as [number, number, number]);
    await this.page.mouse.move(x, y, { steps });
    await this.page.waitForTimeout(Math.max(50, durationMs - 100));
    this.cursorPos = { x, y };
  }

  /** Get center coordinates of an element, or null if not found. */
  private async getCenter(selector: string): Promise<{ x: number; y: number } | null> {
    try {
      const box = await this.page.locator(selector).first().boundingBox();
      if (!box) return null;
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    } catch { return null; }
  }

  // ── Step execution ───────────────────────────────────────────────────────

  /** Execute a single UI action on the page. */
  private async executeAction(action: SeedAction): Promise<void> {
    switch (action.type) {
      case 'click': {
        const c = await this.getCenter(action.selector!);
        if (c) await this.animateCursorTo(c.x, c.y);
        await this.page.locator(action.selector!).click();
        break;
      }
      case 'hover': {
        const c = await this.getCenter(action.selector!);
        if (c) await this.animateCursorTo(c.x, c.y);
        await this.page.locator(action.selector!).hover();
        break;
      }
      case 'waitFor':
        await this.page.locator(action.selector!).waitFor({ state: 'visible', timeout: 10_000 });
        break;
      case 'key':
        await this.page.keyboard.press(action.value!);
        break;
      case 'wait':
        await this.page.waitForTimeout(action.ms!);
        break;
      case 'fill': {
        const c = await this.getCenter(action.selector!);
        if (c) await this.animateCursorTo(c.x, c.y);
        await this.page.locator(action.selector!).fill(action.value!);
        break;
      }
      case 'scroll': {
        const vp = this.page.viewportSize() ?? { width: 1920, height: 1080 };
        await this.page.mouse.move(vp.width / 2, vp.height / 2);
        await this.page.mouse.wheel(action.dx!, action.dy!);
        break;
      }
      case 'drag': {
        const box = await this.page.locator(action.selector!).boundingBox();
        if (box) {
          const cx = box.x + box.width / 2;
          const cy = box.y + box.height / 2;
          await this.animateCursorTo(cx, cy);
          await this.page.mouse.down();
          const tx = cx + action.dx!;
          const ty = cy + action.dy!;
          await this.animateCursorTo(tx, ty, 600);
          await this.page.mouse.up();
        }
        break;
      }
      case 'select': {
        const c = await this.getCenter(action.selector!);
        if (c) await this.animateCursorTo(c.x, c.y);
        const selectEl = this.page.locator(action.selector!);
        const matchValue = action.value!;
        const optionValue = await selectEl.evaluate((sel: HTMLSelectElement, match: string) => {
          for (const opt of Array.from(sel.options)) {
            if (opt.text.includes(match)) return opt.value;
          }
          return null;
        }, matchValue);
        if (optionValue !== null) {
          await selectEl.selectOption(optionValue);
        }
        break;
      }
      case 'dragTo': {
        const srcBox = await this.page.locator(action.selector!).boundingBox();
        const tgtBox = await this.page.locator(action.targetSelector!).boundingBox();
        if (srcBox && tgtBox) {
          const sx = srcBox.x + srcBox.width / 2;
          const sy = srcBox.y + srcBox.height / 2;
          const tx = tgtBox.x + tgtBox.width / 2;
          const ty = tgtBox.y + tgtBox.height / 2;
          await this.animateCursorTo(sx, sy);
          await this.page.mouse.down();
          await this.animateCursorTo(tx, ty, 600);
          await this.page.mouse.up();
        }
        break;
      }
    }
  }

  /**
   * Execute a parsed seed turn: run each step (tool call or UI action) in order,
   * pausing between steps for visibility.
   */
  async runSeedTurn(
    turn: SeedTurn,
    delayMs = 300,
    opts: { captionAfter?: boolean } = {},
  ): Promise<void> {
    if (turn.caption && !opts.captionAfter) await this.caption(turn.caption);

    for (const step of turn.steps) {
      if (step.kind === 'tool') {
        await this.page.evaluate(
          async ([name, args]: [string, Record<string, unknown>]) => {
            const tool = (window as any).__mcpTools?.[name];
            if (tool) await tool(args);
          },
          [step.name, step.arguments] as [string, Record<string, unknown>],
        );
      } else {
        await this.executeAction(step);
      }
      await this.page.waitForTimeout(delayMs);
    }

    if (turn.caption && opts.captionAfter) await this.caption(turn.caption);

    this.stepCounter++;
    if (turn.slug && process.env.DEMO_KEYFRAMES) {
      await this.page.waitForTimeout(500);
      await this.captureKeyframe(turn.slug, { caption: turn.caption });
    }
  }

  /**
   * Poll until `check()` returns true or timeout expires.
   * Logs a warning on timeout — does NOT hard-fail so demo recording continues.
   */
  async verifyState(
    check: () => Promise<boolean>,
    description: string,
    timeout = 5000,
  ): Promise<boolean> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      try {
        if (await check()) return true;
      } catch { /* selector may not exist yet */ }
      await this.page.waitForTimeout(200);
    }
    console.warn(`[verifyState] TIMEOUT: ${description}`);
    return false;
  }

  /** Pause recording for a given number of milliseconds. */
  async pauseMs(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  // ── Stage-mode (side-by-side) helpers ────────────────────────────────────

  /**
   * Add a message to the mock chat frame.
   * role 'user' appears instantly; role 'ai' streams word-by-word.
   */
  async addChatMessage(role: 'user' | 'ai', text: string): Promise<void> {
    await this.chatFrameHandle.evaluate(
      ([r, t]) => { (window as any).addMessage(r, t); },
      [role, text] as [string, string],
    );
  }

  /**
   * Wait for the current AI message to finish streaming.
   * The mock chat sets status-bar text to 'AI done' when stream completes.
   */
  async waitForChatStream(timeout = 60_000): Promise<void> {
    await this.chatFrame
      .locator('#status-bar')
      .filter({ hasText: /AI done/ })
      .waitFor({ state: 'visible', timeout });
  }

  /** Set the mock chat word-streaming speed (ms per word). Default is 18. */
  async setStreamSpeed(msPerWord: number): Promise<void> {
    await this.chatFrameHandle.evaluate(
      (ms) => { (window as any).STREAM_DELAY_MS = ms; },
      msPerWord,
    );
  }

  /**
   * Call an MCP tool on the app iframe (stage mode).
   * Use this instead of runSeedTurn when the app is loaded inside demo-stage.html.
   */
  async callToolOnStage(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<void> {
    await this.appFrameHandle.evaluate(
      async ([n, a]: [string, Record<string, unknown>]) => {
        const tool = (window as any).__mcpTools?.[n];
        if (tool) await tool(a);
      },
      [name, args] as [string, Record<string, unknown>],
    );
  }

  /**
   * Show a caption overlay at the bottom of the viewport.
   * Stays visible until clearCaption() or the next caption() call.
   */
  async caption(text: string): Promise<void> {
    await this.page.evaluate((t) => {
      let el = document.getElementById('__demo_caption__');
      if (!el) {
        el = document.createElement('div');
        el.id = '__demo_caption__';
        Object.assign(el.style, {
          position:        'fixed',
          bottom:          '160px',
          left:            '50%',
          transform:       'translateX(-50%)',
          maxWidth:        '80%',
          padding:         '14px 32px',
          background:      'rgba(0,0,0,0.72)',
          color:           '#fff',
          fontSize:        '28px',
          fontFamily:      'system-ui, sans-serif',
          fontWeight:      '500',
          lineHeight:      '1.4',
          borderRadius:    '8px',
          textAlign:       'center',
          zIndex:          '999999',
          pointerEvents:   'none',
          backdropFilter:  'blur(4px)',
          boxShadow:       '0 4px 24px rgba(0,0,0,0.4)',
          transition:      'opacity 0.25s',
        });
        document.body.appendChild(el);
      }
      el.textContent = t;
      el.style.opacity = '1';
    }, text);
  }

  /** Remove the caption overlay. */
  async clearCaption(): Promise<void> {
    await this.page.evaluate(() => {
      const el = document.getElementById('__demo_caption__');
      if (el) el.remove();
    });
  }

  /**
   * Show caption, pause for ms, then clear it.
   * Convenience wrapper for show-read-hide pattern.
   */
  async captionPause(text: string, ms = 3_000): Promise<void> {
    await this.caption(text);
    await this.pauseMs(ms);
    await this.clearCaption();
  }

  // ── Keyframe inspection ───────────────────────────────────────────────────

  /** Set the demo name for keyframe output subdirectory. */
  setDemoName(name: string): void {
    this.demoName = name;
    this.startTime = Date.now();
  }

  /** Capture a keyframe screenshot with metadata. Requires DEMO_KEYFRAMES=1. */
  async captureKeyframe(slug: string, extra: { caption?: string } = {}): Promise<void> {
    if (!process.env.DEMO_KEYFRAMES) return;
    const dir = path.resolve('docs', 'demo-keyframes', this.demoName || 'unnamed');
    fs.mkdirSync(dir, { recursive: true });
    const idx = String(this.keyframes.length + 1).padStart(2, '0');
    const file = path.join(dir, `${idx}-${slug}.png`);
    await this.page.screenshot({ path: file, fullPage: true });
    const elementCount = await this.page.locator('.reactodia-overlaid-element').count().catch(() => 0);
    this.keyframes.push({
      slug,
      stepIndex: this.stepCounter,
      caption: extra.caption ?? '',
      file,
      elementCount,
      timestampMs: Date.now() - this.startTime,
    });
  }

  /** Write keyframe summary (JSON + markdown) after all turns complete. */
  writeKeyframeSummary(): void {
    if (!this.keyframes.length) return;
    const dir = path.resolve('docs', 'demo-keyframes', this.demoName || 'unnamed');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(this.keyframes, null, 2));
    const lines = ['# Keyframe Summary', `Demo: ${this.demoName}`, `Keyframes: ${this.keyframes.length}`, ''];
    for (const kf of this.keyframes) {
      lines.push(`## ${kf.slug}`);
      lines.push(`- Step: ${kf.stepIndex}`);
      lines.push(`- Caption: ${kf.caption}`);
      lines.push(`- Elements on canvas: ${kf.elementCount}`);
      lines.push(`- Time: ${(kf.timestampMs / 1000).toFixed(1)}s`);
      lines.push(`- File: ${kf.file}`);
      lines.push('');
    }
    fs.writeFileSync(path.join(dir, 'summary.md'), lines.join('\n'));
  }
}
