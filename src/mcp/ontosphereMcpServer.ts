// src/mcp/ontosphereMcpServer.ts
import { mcpManifest } from './manifest';
import { graphTools } from './tools/graph';
import { nodeTools } from './tools/nodes';
import { linkTools } from './tools/links';
import { layoutTools } from './tools/layout';
import { reasoningTools } from './tools/reasoning';
import { namespaceTools } from './tools/namespaceTools';
import { navigationTools } from './tools/navigation';
import { shaclTools } from './tools/shacl';
import { provenanceTools } from './tools/provenanceTools';
import { metadataTools } from './tools/metadataTools';
import { setNamespaceRegistryGetter } from './tools/iriUtils';
import { useOntologyStore } from '@/stores/ontologyStore';
import type { McpTool } from './types';

const allTools: McpTool[] = [
  ...graphTools,
  ...nodeTools,
  ...linkTools,
  ...layoutTools,
  ...reasoningTools,
  ...namespaceTools,
  ...navigationTools,
  ...shaclTools,
  ...provenanceTools,
  ...metadataTools,
];

function withSchemaValidation(tool: McpTool): (params: unknown) => Promise<import('./types').McpResult> {
  return (params: unknown) => {
    const required = (tool.inputSchema?.required as string[]) ?? [];
    const properties = (tool.inputSchema?.properties ?? {}) as Record<string, unknown>;
    const provided = Object.keys((params as Record<string, unknown>) ?? {});
    const p = (params as Record<string, unknown>) ?? {};
    const missing = required.filter(r => p[r] === undefined);

    if (missing.length > 0) {
      const hints = missing.map(req => {
        const similar = provided.find(
          k => k.toLowerCase().includes(req.toLowerCase()) || req.toLowerCase().includes(k.toLowerCase())
        );
        return similar ? `"${req}" (you passed "${similar}" — rename to "${req}")` : `"${req}"`;
      });
      const accepts = Object.keys(properties).join(', ');
      return Promise.resolve({
        success: false,
        error: `Missing required param(s): ${hints.join('; ')}. "${tool.name}" accepts: ${accepts}.`,
      } as import('./types').McpResult);
    }
    return tool.handler(params);
  };
}

export async function registerMcpTools(): Promise<void> {
  setNamespaceRegistryGetter(() => useOntologyStore.getState().namespaceRegistry);

  // Build the tool map unconditionally so the relay bridge can use it
  // even in browsers without the navigator.modelContext MCP polyfill.
  const toolMap: Record<string, (params: unknown) => Promise<import('./types').McpResult>> = {};
  for (const tool of allTools) {
    toolMap[tool.name] = withSchemaValidation(tool);
  }
  window.__mcpTools = toolMap;

  const mc = document.modelContext;
  if (!mc) {
    console.warn('[MCP] document.modelContext not available; skipping tool registration');
    return;
  }
  for (const entry of mcpManifest) {
    const tool = allTools.find(t => t.name === entry.name);
    if (!tool) {
      console.warn(`[MCP] No handler found for tool: ${entry.name}`);
      continue;
    }
    const wrappedHandler = withSchemaValidation(tool);
    await mc.registerTool({
      name: entry.name,
      description: entry.description,
      inputSchema: entry.inputSchema as object,
      execute: (inputs, _opts) => wrappedHandler(inputs),
    });
  }
  console.log(`[MCP] Registered ${mcpManifest.length} tools via document.modelContext`);
}
