import { Page, Frame, FrameLocator } from '@playwright/test';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

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
          bottom:          '48px',
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
