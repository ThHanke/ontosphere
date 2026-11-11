// MCP calls are rejected until startup loading is complete (see utils/startupReady.ts).
import { describe, it, expect, beforeEach, vi } from 'vitest';

async function freshServer() {
  vi.resetModules();
  const ready = await import('@/utils/startupReady');
  const server = await import('../ontosphereMcpServer');
  await server.registerMcpTools();
  const tools = (window as any).__mcpTools as Record<string, (p: unknown) => Promise<any>>;
  return { ready, tools };
}

describe('MCP startup guard', () => {
  beforeEach(() => { vi.useRealTimers(); });

  it('rejects every tool while startup is pending, then accepts calls', async () => {
    const { ready, tools } = await freshServer();
    ready.expectStartup();

    for (const name of ['validateGraph', 'runReasoning', 'loadShacl', 'queryGraph']) {
      const res = await tools[name]({});
      expect(res.success, name).toBe(false);
      expect(res.error, name).toMatch(/still loading/i);
    }

    ready.markStartupComplete();
    // loadShacl without its required param now reaches schema validation, not the guard
    const res = await tools.loadShacl({});
    expect(res.error).toMatch(/Missing required param/);
  });

  it('does not reject when the host never announced a startup (tests, other hosts)', async () => {
    const { tools } = await freshServer();
    const res = await tools.loadShacl({});
    expect(res.error).toMatch(/Missing required param/);
  });

  it('unlocks after the timeout if startup never reports completion', async () => {
    const { ready, tools } = await freshServer();
    vi.useFakeTimers();
    ready.expectStartup();
    expect((await tools.loadShacl({})).error).toMatch(/still loading/i);
    vi.advanceTimersByTime(121_000);
    expect((await tools.loadShacl({})).error).toMatch(/Missing required param/);
    vi.useRealTimers();
  });
});
