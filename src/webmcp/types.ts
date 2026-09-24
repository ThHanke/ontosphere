// WebMCP type aliases — spec types from webmcp-types package, re-exported under local names
export type { WebMCP } from 'webmcp-types';

// Convenience aliases matching the plan's naming
export type ToolDefinition = WebMCP.ModelContextTool;
export type RegisteredTool = WebMCP.RegisteredTool;
export type ModelContext = WebMCP.ModelContext;
