// src/mcp/register.ts
import { installModelContextPolyfill } from '../webmcp/polyfill';

export function registerMcp(): void {
  installModelContextPolyfill();
  import('./ontosphereMcpServer').then(({ registerMcpTools }) => {
    registerMcpTools().catch(err => {
      console.error('[MCP] Failed to register tools:', err);
    });
  });
}
