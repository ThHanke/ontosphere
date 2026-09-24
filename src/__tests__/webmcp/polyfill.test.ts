import { describe, it, expect, beforeEach } from 'vitest';
import { installModelContextPolyfill } from '../../webmcp/polyfill';

function resetPolyfill() {
  // Remove the polyfill between tests so each test starts fresh
  Object.defineProperty(document, 'modelContext', {
    value: undefined,
    configurable: true,
    writable: true,
  });
  (navigator as any).modelContext = undefined;
}

describe('installModelContextPolyfill', () => {
  beforeEach(() => {
    resetPolyfill();
  });

  it('installs document.modelContext when absent', () => {
    installModelContextPolyfill();
    expect(document.modelContext).toBeDefined();
  });

  it('aliases navigator.modelContext to the same shim', () => {
    installModelContextPolyfill();
    expect((navigator as any).modelContext).toBe(document.modelContext);
  });

  it('is a no-op when called twice', () => {
    installModelContextPolyfill();
    const first = document.modelContext;
    installModelContextPolyfill();
    expect(document.modelContext).toBe(first);
  });

  it('registerTool + getTools happy path', async () => {
    installModelContextPolyfill();
    const mc = document.modelContext!;
    await mc.registerTool({ name: 'test', description: 'A test tool', execute: async () => ({ ok: true }) });
    const tools = await mc.getTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('test');
    expect(tools[0].description).toBe('A test tool');
  });

  it('executeTool returns Promise<string> with JSON-parseable result', async () => {
    installModelContextPolyfill();
    const mc = document.modelContext!;
    await mc.registerTool({ name: 'ping', description: 'ping', execute: async () => ({ pong: true }) });
    const [registered] = await mc.getTools();
    const result = await mc.executeTool(registered, {});
    expect(typeof result).toBe('string');
    expect(JSON.parse(result)).toEqual({ pong: true });
  });

  it('JSON-stringify round-trip preserves the returned object', async () => {
    installModelContextPolyfill();
    const mc = document.modelContext!;
    const payload = { success: true, data: [1, 2, 3] };
    await mc.registerTool({ name: 'data', description: 'd', execute: async () => payload });
    const [t] = await mc.getTools();
    const result = await mc.executeTool(t, {});
    expect(JSON.parse(result)).toEqual(payload);
  });

  it('second registerTool call with same name overwrites (last-write-wins)', async () => {
    installModelContextPolyfill();
    const mc = document.modelContext!;
    await mc.registerTool({ name: 'dup', description: 'first', execute: async () => 1 });
    await mc.registerTool({ name: 'dup', description: 'second', execute: async () => 2 });
    const tools = await mc.getTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].description).toBe('second');
  });

  it('executeTool with inputs=undefined passes empty object to execute', async () => {
    installModelContextPolyfill();
    const mc = document.modelContext!;
    let received: unknown;
    await mc.registerTool({ name: 'capture', description: 'c', execute: async (inputs) => { received = inputs; return null; } });
    const [t] = await mc.getTools();
    await mc.executeTool(t, undefined as any);
    expect(received).toEqual({});
  });

  it('executeTool rejects when execute callback throws', async () => {
    installModelContextPolyfill();
    const mc = document.modelContext!;
    await mc.registerTool({ name: 'boom', description: 'b', execute: async () => { throw new Error('exploded'); } });
    const [t] = await mc.getTools();
    await expect(mc.executeTool(t, {})).rejects.toThrow('exploded');
  });

  it('executeTool rejects with descriptive message for unknown tool', async () => {
    installModelContextPolyfill();
    const mc = document.modelContext!;
    const stale = { name: 'ghost', title: 'ghost', description: 'g', origin: '', window: window };
    await expect(mc.executeTool(stale, {})).rejects.toThrow(/ghost/);
  });

  it('full integration: install → register → getTools → executeTool', async () => {
    installModelContextPolyfill();
    const mc = document.modelContext!;
    await mc.registerTool({ name: 'greet', description: 'returns greeting', execute: async (inputs: any) => `hello ${inputs.name}` });
    const tools = await mc.getTools();
    const greet = tools.find(t => t.name === 'greet')!;
    const result = await mc.executeTool(greet, { name: 'world' });
    expect(JSON.parse(result)).toBe('hello world');
  });
});
