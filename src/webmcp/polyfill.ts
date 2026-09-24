import type { ModelContext, ToolDefinition, RegisteredTool } from './types';

type RegistryEntry = ToolDefinition & { origin: string };

function createModelContextShim(): ModelContext {
  const toolRegistry = new Map<string, RegistryEntry>();

  function dispatchToolChange(target: ModelContext): void {
    const ev = new Event('toolchange');
    target.dispatchEvent(ev);
    if (typeof target.ontoolchange === 'function') {
      target.ontoolchange.call(target, ev);
    }
  }

  const shim: ModelContext = Object.assign(new EventTarget(), {
    ontoolchange: null as ((this: ModelContext, ev: Event) => any) | null,

    async registerTool(
      tool: ToolDefinition,
      opts?: { signal?: AbortSignal; exposedTo?: string[] }
    ): Promise<void> {
      if (!tool.name || !tool.description || typeof tool.execute !== 'function') {
        throw new TypeError('[WebMCP] registerTool: name, description, and execute are required');
      }
      toolRegistry.set(tool.name, { ...tool, origin: window.location.origin });
      dispatchToolChange(shim);

      if (opts?.signal) {
        opts.signal.addEventListener('abort', () => {
          toolRegistry.delete(tool.name);
          dispatchToolChange(shim);
        }, { once: true });
      }
    },

    async getTools(opts?: { fromOrigins?: string[] }): Promise<RegisteredTool[]> {
      if (opts?.fromOrigins) {
        console.warn('[WebMCP] getTools: fromOrigins is not supported by the local shim');
      }
      return Array.from(toolRegistry.values()).map(entry => ({
        name: entry.name,
        title: entry.title ?? entry.name,
        description: entry.description,
        inputSchema: entry.inputSchema,
        origin: entry.origin,
        window: window,
        annotations: entry.annotations,
      }));
    },

    async executeTool(
      tool: RegisteredTool,
      inputs?: object,
      opts?: { signal?: AbortSignal }
    ): Promise<string> {
      const entry = toolRegistry.get(tool.name);
      if (!entry) {
        throw new Error(`[WebMCP] executeTool: tool "${tool.name}" not found in registry`);
      }
      const signal = opts?.signal ?? new AbortController().signal;
      const result = await entry.execute(inputs ?? {}, { signal });
      return JSON.stringify(result);
    },
  } as Omit<ModelContext, keyof EventTarget>);

  return shim;
}

export function installModelContextPolyfill(): void {
  if (document.modelContext) return;

  const shim = createModelContextShim();
  Object.defineProperty(document, 'modelContext', { value: shim, configurable: true });
  (navigator as Navigator).modelContext = shim;
}
