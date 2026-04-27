import { Page, Frame, FrameLocator } from '@playwright/test';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

/** Parsed turn from a seed markdown file. */
export interface SeedTurn {
  caption: string;
  toolCalls: Array<{ name: string; arguments: Record<string, unknown> }>;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class DemoRunner {
  private chatFrame!: FrameLocator;
  private appFrame!: FrameLocator;
  private chatFrameHandle!: Frame;
  private appFrameHandle!: Frame;

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
      () => !!(window as any).__mcpTools && typeof (window as any).__mcpTools['addNode'] === 'function',
      { timeout: 20_000 },
    );
  }

  /** Inject bookmarklet into the chat iframe; waits for relay popup. */
  async injectBookmarklet(): Promise<void> {
    const bookmarkletSrc = fs.readFileSync(
      path.resolve(__dirname, '../public/relay-bookmarklet.js'), 'utf8',
    )
      .replace("var RELAY_ORIGIN = '__RELAY_ORIGIN__';", `var RELAY_ORIGIN = '${this.baseURL}';`)
      .replace("var RELAY_URL    = '__RELAY_URL__';",    `var RELAY_URL = '${this.baseURL}/relay.html';`);

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

  /** Wait for a VisGraph result to appear in the chat stream. */
  async waitForResult(timeout = 15_000): Promise<string> {
    const locator = this.chatFrame.locator('#chat-stream .msg-user', { hasText: '[Ontosphere' }).last();
    await locator.waitFor({ state: 'visible', timeout });
    return locator.innerText();
  }

  /** Clear the chat. */
  async clearChat(): Promise<void> {
    await this.chatFrame.locator('[data-scenario="clear"]').click();
  }

  /** Open the app alone (full viewport) and wait for MCP tools to be ready. */
  async openApp(): Promise<void> {
    await this.page.goto(this.baseURL);
    await this.page.waitForFunction(
      () => !!(window as any).__mcpTools && typeof (window as any).__mcpTools['addNode'] === 'function',
      { timeout: 20_000 },
    );
  }

  /**
   * Parse a seed markdown file into turns.
   * Each turn groups the JSON-RPC tool calls under the nearest preceding
   * snapshot caption (or the assistant turn prose if no snapshot follows).
   */
  static parseSeed(seedPath: string): SeedTurn[] {
    const content = fs.readFileSync(seedPath, 'utf8');
    const lines = content.split('\n');
    const turns: SeedTurn[] = [];
    let current: SeedTurn | null = null;

    // Match backtick-wrapped JSON-RPC tool calls
    const TOOL_RE = /^`(\{"jsonrpc":"2\.0",.+\})`\s*$/;
    // Match snapshot blocks: ```snapshot ... caption: ... ```
    let inSnapshot = false;
    let snapshotCaption = '';

    const flush = () => {
      if (current && current.toolCalls.length > 0) {
        turns.push(current);
        current = null;
      }
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith('```snapshot')) {
        inSnapshot = true;
        snapshotCaption = '';
        continue;
      }
      if (inSnapshot) {
        if (line.startsWith('```')) {
          inSnapshot = false;
          if (current) current.caption = snapshotCaption || current.caption;
          continue;
        }
        const m = line.match(/^caption:\s*(.+)/);
        if (m) snapshotCaption = m[1].trim();
        continue;
      }

      // New assistant or user turn marker
      if (line.startsWith('**Assistant:**') || line.startsWith('**You:**')) {
        flush();
        const prose = line.replace(/\*\*(?:Assistant|You):\*\*\s*/, '').trim();
        current = { caption: prose.substring(0, 120), toolCalls: [] };
        continue;
      }

      const toolMatch = line.match(TOOL_RE);
      if (toolMatch) {
        try {
          const rpc = JSON.parse(toolMatch[1]);
          if (rpc.params?.name && current) {
            current.toolCalls.push({ name: rpc.params.name, arguments: rpc.params.arguments ?? {} });
          }
        } catch { /* skip malformed */ }
      }
    }
    flush();
    return turns;
  }

  /**
   * Execute a parsed seed turn: call each tool on the app frame,
   * pausing between calls for visibility.
   */
  async runSeedTurn(turn: SeedTurn, delayMs = 300): Promise<void> {
    if (turn.caption) await this.caption(turn.caption);
    for (const call of turn.toolCalls) {
      await this.page.evaluate(
        async ([name, args]: [string, Record<string, unknown>]) => {
          const tool = (window as any).__mcpTools?.[name];
          if (tool) await tool(args);
        },
        [call.name, call.arguments] as [string, Record<string, unknown>],
      );
      await this.page.waitForTimeout(delayMs);
    }
  }

  /** Pause recording for a given number of milliseconds. */
  async pauseMs(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
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
}
