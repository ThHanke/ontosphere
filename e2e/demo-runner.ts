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

  /** Open demo-stage.html and wait for both iframes to be ready. */
  async openStage(): Promise<void> {
    await this.page.goto(`${this.baseURL}/demo-stage.html`);

    // Resolve chat frame (relay-mock-chat.html)
    this.chatFrameHandle = await this.page.waitForFrame(
      frame => frame.url().includes('relay-mock-chat'),
      { timeout: 15_000 },
    );
    this.chatFrame = this.page.frameLocator('iframe:first-child');

    // Resolve app frame (root app)
    this.appFrameHandle = await this.page.waitForFrame(
      frame => frame.url() === `${this.baseURL}/` || frame.url() === `${this.baseURL}`,
      { timeout: 15_000 },
    );
    this.appFrame = this.page.frameLocator('iframe:last-child');

    // Wait for __mcpTools to register in the app iframe
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

  /** Wait for the injected result to appear in the chat stream. */
  async waitForResult(timeout = 15_000): Promise<string> {
    const locator = this.chatFrame.locator('#chat-stream .msg-user').last();
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
}
