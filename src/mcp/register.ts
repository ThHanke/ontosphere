// src/mcp/register.ts
export function registerMcp(): void {
  import('./ontosphereMcpServer').then(({ registerMcpTools }) => {
    registerMcpTools().catch(err => {
      console.error('[MCP] Failed to register tools:', err);
    });
  });
}
