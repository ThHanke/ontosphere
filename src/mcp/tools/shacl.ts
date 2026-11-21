// src/mcp/tools/shacl.ts
import type { McpTool, McpResult } from '@/mcp/types';
import { rdfManager } from '@/utils/rdfManager';

const SHACL_GRAPH = 'urn:vg:shapes';

// ---------------------------------------------------------------------------
// loadShacl
// ---------------------------------------------------------------------------
const loadShacl: McpTool = {
  name: 'loadShacl',
  description: 'Load SHACL shapes from inline Turtle text into the shapes graph (urn:vg:shapes). Invalid Turtle fails the call and loads nothing. Pass baseIri to resolve relative IRIs (e.g. <#MyShape>). Call validateGraph to run validation after loading.',
  inputSchema: {
    type: 'object',
    required: ['turtle'],
    properties: {
      turtle: { type: 'string', description: 'Inline Turtle containing SHACL shape definitions.' },
      baseIri: { type: 'string', description: 'Base IRI for relative IRIs in the Turtle (optional).' },
    },
  },
  async handler(params): Promise<McpResult> {
    try {
      const { turtle, baseIri } = params as { turtle: string; baseIri?: string };
      if (!turtle?.trim()) return { success: false, error: 'turtle is required' };

      if (baseIri) await rdfManager.loadRDFIntoGraph(turtle, SHACL_GRAPH, 'text/turtle', undefined, undefined, baseIri);
      else await rdfManager.loadRDFIntoGraph(turtle, SHACL_GRAPH, 'text/turtle');

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
  description: 'Validate the data graph (urn:vg:data: everything loaded or authored as data, TBox and ABox) plus the inferred graph against SHACL shapes loaded in urn:vg:shapes. Findings are reported for subjects in urn:vg:data. Returns { conforms, violations, focus, focusComparison? }: conforms is true exactly when violations is empty; focus = { nodeShapes, shapesWithFocus, perShape, afterReasoning } counts the node shapes that select at least one focus node in the record (subjects in urn:vg:data) and the focus nodes per such shape; focusComparison compares the last validation without inferred triples to the last one after reasoning ({ nodeShapes, asserted, reasoned, newlyActive }). A shape whose validation throws (e.g. an unparsable SPARQL constraint) is reported as one violation naming the shape; the other shapes are still validated.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  async handler(): Promise<McpResult> {
    try {
      const result = await rdfManager.runShaclValidation();
      return {
        success: true,
        data: {
          conforms: result.conforms,
          violations: result.violations,
          ...(result.focus ? { focus: result.focus } : {}),
          ...(result.focusComparison ? { focusComparison: result.focusComparison } : {}),
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
  description: 'Load SHACL shapes from a URL into urn:vg:shapes (replacing the shapes loaded before). Supports direct .ttl file URLs, GitHub folder tree URLs (auto-discovers .ttl/.shacl files), and comma-separated mixes. Each file is parsed with its URL as base IRI. Returns { loaded, errors }; success is false when any file failed to fetch or parse; the error then names each failed file and the files that were loaded (those stay loaded).',
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
      if (manifest.errors.length > 0) {
        const failed = manifest.errors.map(e => `${e.url}: ${e.error}`).join('; ');
        return {
          success: false,
          error: `${manifest.errors.length} shape file(s) not loaded (${manifest.loaded.length} loaded: ${manifest.loaded.map(l => l.name).join(', ') || 'none'}): ${failed}`,
        };
      }
      return { success: true, data: manifest };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  },
};

export const shaclTools: McpTool[] = [loadShacl, validateGraph, loadShaclFromUrl];
