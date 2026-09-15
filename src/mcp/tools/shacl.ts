// src/mcp/tools/shacl.ts
import type { McpTool, McpResult } from '@/mcp/types';
import { rdfManager } from '@/utils/rdfManager';

const SHACL_GRAPH = 'urn:vg:shapes';

// ---------------------------------------------------------------------------
// loadShacl
// ---------------------------------------------------------------------------
const loadShacl: McpTool = {
  name: 'loadShacl',
  description: 'Load SHACL shapes from inline Turtle text into the shapes graph (urn:vg:shapes). Call validateGraph to run validation after loading.',
  inputSchema: {
    type: 'object',
    required: ['turtle'],
    properties: {
      turtle: { type: 'string', description: 'Inline Turtle containing SHACL shape definitions.' },
    },
  },
  async handler(params): Promise<McpResult> {
    try {
      const { turtle } = params as { turtle: string };
      if (!turtle?.trim()) return { success: false, error: 'turtle is required' };

      await rdfManager.loadRDFIntoGraph(turtle, SHACL_GRAPH, 'text/turtle');

      const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
      const SH_NODESHAPE = 'http://www.w3.org/ns/shacl#NodeShape';
      const SH_PROPERTYSHAPE = 'http://www.w3.org/ns/shacl#PropertyShape';
      const { items } = await rdfManager.fetchQuadsPage({ graphName: SHACL_GRAPH, limit: 0 });
      const shapes = (items ?? [])
        .filter(q => q.predicate === RDF_TYPE && (q.object === SH_NODESHAPE || q.object === SH_PROPERTYSHAPE))
        .map(q => q.subject);

      return { success: true, data: { loaded: shapes.length, shapes } };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  },
};

// ---------------------------------------------------------------------------
// validateGraph
// ---------------------------------------------------------------------------
const validateGraph: McpTool = {
  name: 'validateGraph',
  description: 'Validate the asserted graph (urn:vg:data) plus inferred graph against SHACL shapes loaded in urn:vg:shapes. Returns conforms flag, structured violation list, and how many shapes selected at least one focus node: conforms:true with untargetedShapeCount equal to shapeCount means nothing was checked.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  async handler(): Promise<McpResult> {
    try {
      const result = await rdfManager.runShaclValidation();
      const targeted = (result.shapeTargets ?? []).filter((t) => t.targetCount > 0);
      return {
        success: true,
        data: {
          conforms: result.conforms,
          violations: result.violations,
          shapeCount: result.shapeTargets?.length ?? 0,
          untargetedShapeCount: result.untargetedShapeCount ?? 0,
          // only shapes that checked something; the full list can run to hundreds of entries
          targetedShapes: targeted,
        },
      };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  },
};

// ---------------------------------------------------------------------------
// loadShaclFromUrl
// ---------------------------------------------------------------------------
const loadShaclFromUrl: McpTool = {
  name: 'loadShaclFromUrl',
  description: 'Load SHACL shapes from a URL into urn:vg:shapes. Supports direct .ttl file URLs, GitHub folder tree URLs (auto-discovers .ttl/.shacl files), and comma-separated mixes.',
  inputSchema: {
    type: 'object',
    required: ['url'],
    properties: {
      url: { type: 'string', description: 'URL to load shapes from. Can be a direct .ttl URL, a GitHub tree URL (https://github.com/owner/repo/tree/branch/path), or comma-separated mix of both.' },
    },
  },
  async handler(params): Promise<McpResult> {
    try {
      const { url } = params as { url: string };
      if (!url?.trim()) return { success: false, error: 'url is required' };

      const { loadShaclShapes } = await import('@/utils/shaclShapeLoader');
      const manifest = await loadShaclShapes(url);
      return { success: true, data: manifest };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  },
};

export const shaclTools: McpTool[] = [loadShacl, validateGraph, loadShaclFromUrl];
