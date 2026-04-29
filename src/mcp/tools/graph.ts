// src/mcp/tools/graph.ts
import * as Reactodia from '@reactodia/workspace';
import type { McpTool, McpResult } from '@/mcp/types';
import { rdfManager } from '@/utils/rdfManager';
import { getWorkspaceRefs, applyViewMode } from '@/mcp/workspaceContext';
import { mcpManifest, mcpServerDescription } from '@/mcp/manifest';
import { Parser as SparqlParser, Generator as SparqlGenerator } from 'sparqljs';
import { resolveOntologyLoadUrl, searchWellKnownOntologies } from '@/utils/wellKnownOntologies';
import { useSettingsStore } from '@/stores/settingsStore';

/** Prepend PREFIX declarations from the namespace map for any prefix not already declared in the query. */
function injectPrefixes(sparql: string): string {
  const namespaces = rdfManager.getNamespaces();
  const declared = new Set<string>();
  for (const m of sparql.matchAll(/(?:PREFIX|BASE)\s+(\S+)\s*:/gi)) declared.add(m[1].toLowerCase());
  const lines = namespaces
    .filter(ns => ns.prefix && ns.uri && !declared.has(ns.prefix.toLowerCase()))
    .map(ns => `PREFIX ${ns.prefix}: <${ns.uri}>`);
  return lines.length ? `${lines.join('\n')}\n${sparql}` : sparql;
}

const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';
function getElementLabel(data: Reactodia.ElementModel | undefined): string {
  return (data?.properties?.[RDFS_LABEL]?.[0] as { value?: string } | undefined)?.value ?? '';
}

function getCanvasIris(): string[] {
  try {
    const { ctx } = getWorkspaceRefs();
    return ctx.model.elements
      .filter(e => e instanceof Reactodia.EntityElement)
      .map(e => (e as Reactodia.EntityElement).iri);
  } catch { return []; }
}

// ---------------------------------------------------------------------------
// loadRdf
// ---------------------------------------------------------------------------
const loadRdf: McpTool = {
  name: 'loadRdf',
  description: 'Load RDF data into the graph from a URL or inline Turtle text.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL of an RDF document to fetch and load.' },
      turtle: { type: 'string', description: 'Inline Turtle text to load.' },
    },
    oneOf: [{ required: ['url'] }, { required: ['turtle'] }],
  },
  async handler(params): Promise<McpResult> {
    try {
      const p = params as { url?: string; turtle?: string };
      if (p.url) {
        await rdfManager.loadRDFFromUrl(p.url);
        return { success: true, data: { loaded: p.url } };
      }
      if (p.turtle) {
        const canvasBefore = getCanvasIris();
        await rdfManager.loadRDFIntoGraph(p.turtle, 'urn:vg:data', 'text/turtle');
        // Wait for the RDF worker change event to propagate to dataProvider.allSubjects
        await new Promise(r => setTimeout(r, 600));
        const { dataProvider } = getWorkspaceRefs();
        const allItems = await dataProvider.lookupAll();
        const canvasBeforeSet = new Set(canvasBefore);
        const newEntities = allItems
          .filter(item => !canvasBeforeSet.has(item.element.id))
          .slice(0, 100)
          .map(item => ({ iri: item.element.id, label: getElementLabel(item.element) || item.element.id }));
        return {
          success: true,
          data: {
            loaded: 'inline turtle',
            canvasNodesBefore: canvasBefore,
            newEntitiesAvailable: newEntities,
          },
        };
      }
      return { success: false, error: 'Provide either url or turtle' };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  },
};

// ---------------------------------------------------------------------------
// loadOntology
// ---------------------------------------------------------------------------
const loadOntology: McpTool = {
  name: 'loadOntology',
  description:
    'Discover or load well-known ontologies. ' +
    'Pass url to load by prefix name (e.g. "ical", "mo", "bot", "gr") or by namespace/file URL. ' +
    'Pass query to search by use-case keyword (e.g. "calendar", "music", "building", "e-commerce"). ' +
    'Pass neither to list all ~55 registered ontologies. ' +
    'OWL/RDFS/RDF/XSD are always pre-loaded.',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'Prefix name, namespace IRI, or direct ontology URL to load.',
      },
      query: {
        type: 'string',
        description: 'Keyword or use-case phrase to search the registry (e.g. "calendar", "IoT", "spatial").',
      },
    },
  },
  async handler(params): Promise<McpResult> {
    const { url, query } = (params ?? {}) as { url?: string; query?: string };

    // Search mode
    if (!url?.trim()) {
      const ontologies = searchWellKnownOntologies(query ?? '').map(e => ({
        prefix: e.prefix,
        name: e.name,
        description: (e as any).description ?? '',
        namespace: e.url,
        loadUrl: resolveOntologyLoadUrl(e.prefix),
      }));
      return {
        success: true,
        data: { query: query || '(all)', count: ontologies.length, ontologies },
      };
    }

    // Load mode
    const resolvedUrl = resolveOntologyLoadUrl(url);
    const corsProxyUrl = useSettingsStore.getState().settings.corsProxyUrl;
    try {
      await rdfManager.loadRDFFromUrl(resolvedUrl, "urn:vg:ontologies", { corsProxyUrl: corsProxyUrl || undefined, timeoutMs: 15000 });
      return { success: true, data: { loaded: resolvedUrl, requestedAs: url !== resolvedUrl ? url : undefined } };
    } catch (e) {
      const suggestions = searchWellKnownOntologies(url)
        .map(p => ({ prefix: p.prefix, description: (p as any).description ?? p.name }));
      return {
        success: false,
        error: String(e),
        hint: 'Pass query instead of url to search the registry.',
        ...(suggestions.length ? { suggestions } : {}),
      };
    }
  },
};

// ---------------------------------------------------------------------------
// queryGraph
// ---------------------------------------------------------------------------
const queryGraph: McpTool = {
  name: 'queryGraph',
  description: 'Run a SPARQL query or update against asserted data (urn:vg:data). Namespace prefixes are injected automatically. Supported: SELECT (return bindings), CONSTRUCT (return triples, read-only), INSERT DATA, DELETE DATA, DELETE WHERE, DELETE...INSERT...WHERE. Inferred triples are in GRAPH urn:vg:inferred.',
  inputSchema: {
    type: 'object',
    required: ['sparql'],
    properties: {
      sparql: { type: 'string', description: 'SPARQL query or update string.' },
      limit: { type: 'integer', default: 200, description: 'Max rows/triples to return (default 200).' },
    },
  },
  async handler(params): Promise<McpResult> {
    try {
      const { sparql: rawSparql, limit: rawLimit = 200 } = params as { sparql: string; limit?: number };
      if (!rawSparql) return { success: false, error: 'sparql is required' };

      const MAX_LIMIT = 1000;
      const effectiveLimit = Math.min(Math.max(1, rawLimit), MAX_LIMIT);

      const sparqlWithPrefixes = injectPrefixes(rawSparql);

      // Validate parse before sending to worker (gives better error messages)
      let parsed: any;
      try {
        parsed = new SparqlParser().parse(sparqlWithPrefixes);
      } catch (e) {
        return { success: false, error: `SPARQL parse error: ${String(e)}` };
      }
      if (parsed.type === 'query' && parsed.queryType === 'ASK') {
        return { success: false, error: 'ASK queries are not supported. Use SELECT or CONSTRUCT.' };
      }

      // Inject LIMIT into the query planner if the query has none — avoids streaming
      // the full result set through Comunica before the worker breaks the stream.
      let sparql = sparqlWithPrefixes;
      if (parsed.type === 'query' && parsed.limit == null) {
        parsed.limit = effectiveLimit;
        try { sparql = new SparqlGenerator().stringify(parsed); } catch (_) { /* keep original */ }
      }

      const workerResult = await rdfManager.sparqlQuery(sparql, { limit: effectiveLimit });

      if (workerResult.type === 'select') {
        const rows: Array<Record<string, string>> = workerResult.rows ?? [];
        return { success: true, data: { rows, total: rows.length, truncated: rows.length >= effectiveLimit } };
      }

      if (workerResult.type === 'construct') {
        const triples: Array<{ s: string; p: string; o: string }> = workerResult.triples ?? [];
        return {
          success: true,
          data: {
            triples,
            total: triples.length,
            truncated: triples.length >= effectiveLimit,
            ...(triples.length === 0
              ? { notice: 'CONSTRUCT matched 0 triples. Check that WHERE patterns match asserted data.' }
              : {}),
          },
        };
      }

      if (workerResult.type === 'update') {
        return { success: true, data: { updated: true } };
      }

      return { success: false, error: `Unexpected result type from worker: ${(workerResult as any)?.type}` };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  },
};

// ---------------------------------------------------------------------------
// exportGraph
// ---------------------------------------------------------------------------
const exportGraph: McpTool = {
  name: 'exportGraph',
  description: 'Export the current RDF graph in the requested serialisation format.',
  inputSchema: {
    type: 'object',
    required: ['format'],
    properties: {
      format: {
        type: 'string',
        enum: ['turtle', 'jsonld', 'rdfxml'],
        description: 'Serialisation format: turtle | jsonld | rdfxml',
      },
    },
  },
  async handler(params): Promise<McpResult> {
    try {
      const { format } = params as { format: string };
      let content: string;
      if (format === 'turtle') {
        content = await rdfManager.exportToTurtle();
      } else if (format === 'jsonld') {
        content = await rdfManager.exportToJsonLD();
      } else if (format === 'rdfxml') {
        content = await rdfManager.exportToRdfXml();
      } else {
        return { success: false, error: `Unknown format: ${format}` };
      }
      return { success: true, data: { content } };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  },
};

// ---------------------------------------------------------------------------
// exportImage  (SVG default — vector text, far fewer tokens than PNG base64)
// ---------------------------------------------------------------------------
const exportImage: McpTool = {
  name: 'exportImage',
  description: 'Export the current diagram canvas as SVG (default) or PNG. Use noCss: true to strip embedded CSS for smaller token-efficient output — recommended for AI relay use. Use focusIri to crop the export to a specific node and all its neighbours currently on canvas.',
  inputSchema: {
    type: 'object',
    properties: {
      format: {
        type: 'string',
        enum: ['svg', 'png'],
        default: 'svg',
        description: 'Image format: svg (default) | png',
      },
      noCss: {
        type: 'boolean',
        default: false,
        description: 'Strip embedded CSS from SVG output to reduce token count. Nodes lose visual styling but topology remains readable.',
      },
      focusIri: {
        type: 'string',
        description: 'IRI of a node to crop the export around. The exported viewBox covers that node plus all its direct neighbours currently on canvas, plus padding.',
      },
      focusPadding: {
        type: 'number',
        default: 80,
        description: 'Padding in canvas units around the focused neighbourhood (default 80).',
      },
    },
  },
  async handler(params): Promise<McpResult> {
    try {
      const { format = 'svg', noCss = false, focusIri, focusPadding = 80 } =
        (params ?? {}) as { format?: string; noCss?: boolean; focusIri?: string; focusPadding?: number };
      let canvas: Reactodia.CanvasApi | undefined;
      let ctx: Reactodia.WorkspaceContext | undefined;
      try {
        ({ ctx } = getWorkspaceRefs());
        canvas = ctx.view.findAnyCanvas();
      } catch {
        return { success: false, error: 'Canvas not available' };
      }
      if (!canvas) return { success: false, error: 'Canvas not available' };

      let contentBox: { x: number; y: number; width: number; height: number } | undefined;
      if (focusIri && ctx) {
        // Collect the focal element + all elements it is connected to on canvas.
        const elementById = new Map<string, Reactodia.Element>();
        for (const el of ctx.model.elements) {
          elementById.set(el.id, el);
        }
        const focalEl = ctx.model.elements.find(
          e => e instanceof Reactodia.EntityElement && (e as Reactodia.EntityElement).iri === focusIri
        ) as Reactodia.EntityElement | undefined;

        if (focalEl) {
          const neighbourhood = new Set<Reactodia.Element>([focalEl]);
          for (const lk of ctx.model.links) {
            const srcId = lk.sourceId as unknown as string;
            const tgtId = lk.targetId as unknown as string;
            if (srcId === focalEl.id) {
              const tgt = elementById.get(tgtId);
              if (tgt) neighbourhood.add(tgt);
            } else if (tgtId === focalEl.id) {
              const src = elementById.get(srcId);
              if (src) neighbourhood.add(src);
            }
          }

          // Union bounding box of the neighbourhood.
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const el of neighbourhood) {
            const size = canvas.renderingState.getElementSize(el) ?? { width: 160, height: 80 };
            minX = Math.min(minX, el.position.x);
            minY = Math.min(minY, el.position.y);
            maxX = Math.max(maxX, el.position.x + size.width);
            maxY = Math.max(maxY, el.position.y + size.height);
          }
          contentBox = {
            x: minX - focusPadding,
            y: minY - focusPadding,
            width: (maxX - minX) + focusPadding * 2,
            height: (maxY - minY) + focusPadding * 2,
          };
        }
      }

      if (format === 'svg') {
        let content = await canvas.exportSvg({ addXmlHeader: true, contentBox });
        if (noCss) {
          content = content.replace(/<style[\s\S]*?<\/style>/gi, '');
        }
        return { success: true, data: { content } };
      }
      if (format === 'png') {
        const content = await canvas.exportRaster({ mimeType: 'image/png', contentBox });
        return { success: true, data: { content } };
      }
      return { success: false, error: `Unknown format: ${format}` };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  },
};

// ---------------------------------------------------------------------------
// setViewMode
// ---------------------------------------------------------------------------
const setViewMode: McpTool = {
  name: 'setViewMode',
  description: 'Switch the canvas between ABox view (individuals/instances) and TBox view (classes/properties). Call before exportImage when you want to capture a specific layer.',
  inputSchema: {
    type: 'object',
    required: ['mode'],
    properties: {
      mode: {
        type: 'string',
        enum: ['abox', 'tbox'],
        description: 'abox = instance view, tbox = ontology/class view',
      },
    },
  },
  async handler(params): Promise<McpResult> {
    try {
      const { mode } = (params ?? {}) as { mode?: string };
      if (mode !== 'abox' && mode !== 'tbox') {
        return { success: false, error: 'mode must be "abox" or "tbox"' };
      }
      applyViewMode(mode);
      return { success: true, data: { mode } };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  },
};

// ---------------------------------------------------------------------------
// getGraphState
// ---------------------------------------------------------------------------
const getGraphState: McpTool = {
  name: 'getGraphState',
  description: 'Return a summary of what is currently on the canvas: node count, link count, and node details.',
  inputSchema: { type: 'object' },
  async handler(): Promise<McpResult> {
    try {
      const { ctx } = getWorkspaceRefs();
      const model = ctx.model;
      const nodes = model.elements
        .filter(e => e instanceof Reactodia.EntityElement)
        .map(e => {
          const entity = e as Reactodia.EntityElement;
          const data = entity.data;
          return {
            iri: entity.iri,
            label: getElementLabel(data),
            types: data?.types ?? [],
          };
        });
      return {
        success: true,
        data: {
          nodeCount: nodes.length,
          linkCount: model.links.length,
          nodes,
        },
      };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  },
};

// ---------------------------------------------------------------------------
// help
// ---------------------------------------------------------------------------
const help: McpTool = {
  name: 'help',
  async handler(params): Promise<McpResult> {
    const { tool } = (params ?? {}) as { tool?: string };
    if (tool) {
      const entry = mcpManifest.find(e => e.name === tool);
      if (!entry) return { success: false, error: `Unknown tool: ${tool}. Call help() with no arguments to list all tools.` };
      return { success: true, data: { content: JSON.stringify({ name: entry.name, description: entry.description, inputSchema: entry.inputSchema }) } };
    }
    const instructions = [
      mcpServerDescription,
      '',
      'RELAY OUTPUT FORMAT',
      'Emit one MCP JSON-RPC 2.0 request per line, each wrapped in single backtick chars (U+0060).',
      'Format: BACKTICK{"jsonrpc":"2.0","id":<N>,"method":"tools/call","params":{"name":"<tool>","arguments":{...}}}BACKTICK',
      'Replace BACKTICK with the actual backtick character (`) and fill in tool name and arguments.',
      '',
      'Rules:',
      '1. Multiple tool calls per response are allowed — they run sequentially.',
      '2. Use a different integer id for each call.',
      '3. Wait for the injected result message before issuing more calls.',
      '4. Never output a tool call unless you intend it to run — the relay executes everything it finds.',
      '5. addLink requires both nodes to already exist on canvas — never issue addNode and addLink for the same node in one response.',
      '',
      'Reading results:',
      'The relay injects a message starting with [Ontosphere — N tools ✓] followed by one backtick-wrapped',
      'JSON-RPC 2.0 response per call. result.content[0].text holds the outcome summary.',
      '- result means success; error means failure (check error.message).',
      '- A Canvas summary line and SVG may follow.',
      '',
      'Timeout / late results:',
      'Long operations (layout, reasoning) may exceed the relay timeout. A timed-out call returns a JSON-RPC',
      'error with data.lateResult=true. Do NOT retry — a [Ontosphere — late result for <tool>] follow-up',
      'will be injected automatically when the operation completes.',
      '',
      'ONTOLOGY DISCOVERY',
      'OWL, RDFS, RDF, and XSD axioms are always pre-loaded — you can use owl:, rdfs:, rdf:, xsd: immediately.',
      'All other ontologies must be loaded explicitly before use:',
      '  1. searchOntologies("your use case") — find the right prefix (e.g. "calendar" → ical, "music" → mo, "building" → bot)',
      '  2. loadOntology("<prefix>") — load into the TBox. Repeat for each domain you need.',
      '  3. Only then start addNode / addLink — types will resolve correctly.',
      '',
      'GRAPH ARCHITECTURE',
      'Asserted triples live in urn:vg:data — all mutation tools (addNode, addLink, updateNode, SPARQL CONSTRUCT, etc.) operate here only.',
      'Inferred triples live in urn:vg:inferred — written by runReasoning, cleared by clearInferred, and read-only from all other tools.',
      'SHACL shapes live in urn:vg:shapes — loaded by loadShacl, read by validateGraph.',
      'Mutation tools never touch urn:vg:inferred or urn:vg:shapes; the separation is structural.',
      '',
      'Common namespace prefixes usable in argument values:',
      'rdf: rdfs: owl: xsd: foaf: skos: dc: dcterms: schema: ex:',
      '',
      'TOOLS',
      ...mcpManifest.map(e => `${e.name} — ${e.description}`),
      '',
      'Call help({"tool":"<name>"}) for the full schema of any tool.',
    ].join('\n');
    return { success: true, data: { content: instructions } };
  },
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
export const graphTools: McpTool[] = [
  loadRdf,
  loadOntology,
  queryGraph,
  exportGraph,
  exportImage,
  setViewMode,
  getGraphState,
  help,
];
