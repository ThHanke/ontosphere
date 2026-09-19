// src/mcp/__tests__/graph.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- mocks must be declared before importing the module under test ---
vi.mock('@/utils/rdfManager', () => ({
  rdfManager: {
    loadRDFFromUrl: vi.fn().mockResolvedValue(undefined),
    loadRDFIntoGraph: vi.fn().mockResolvedValue(undefined),
    exportToTurtle: vi.fn().mockResolvedValue('@prefix ex: <http://example.org/> .'),
    exportToJsonLD: vi.fn().mockResolvedValue('{}'),
    exportToRdfXml: vi.fn().mockResolvedValue('<rdf:RDF/>'),
    fetchQuadsPage: vi.fn().mockResolvedValue({ items: [], total: 0, offset: 0, limit: 0 }),
    sparqlQuery: vi.fn().mockResolvedValue({ type: 'select', rows: [] }),
    getNamespaces: vi.fn().mockReturnValue([]),
    canonicalize: vi.fn().mockResolvedValue({
      canonical: '_:c14n0 <http://ex/p> _:c14n1 .\n',
      hash: 'a'.repeat(64),
      quadCount: 1,
    }),
  },
}));

const mockCanvas = {
  exportSvg: vi.fn().mockResolvedValue('<svg/>'),
  exportRaster: vi.fn().mockResolvedValue('data:image/png;base64,abc'),
};

const mockLookupAll = vi.fn().mockResolvedValue([]);

vi.mock('@/mcp/workspaceContext', () => ({
  getWorkspaceRefs: vi.fn(() => ({
    ctx: {
      model: {
        elements: [],
        requestElementData: vi.fn().mockResolvedValue(undefined),
        requestLinks: vi.fn().mockResolvedValue(undefined),
      },
      view: { findAnyCanvas: () => mockCanvas },
    },
    dataProvider: { lookupAll: mockLookupAll },
  })),
}));

vi.mock('@/mcp/provenance', () => ({
  getProvenanceRecorder: () => ({ recordEdit: vi.fn().mockResolvedValue(null) }),
}));

import { graphTools } from '../tools/graph';
import { rdfManager } from '@/utils/rdfManager';
import { getWorkspaceRefs } from '@/mcp/workspaceContext';

const tool = (name: string) => {
  const t = graphTools.find((t) => t.name === name);
  if (!t) throw new Error(`Tool not found: ${name}`);
  return t;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockLookupAll.mockResolvedValue([]);
  (getWorkspaceRefs as ReturnType<typeof vi.fn>).mockReturnValue({
    ctx: {
      model: {
        elements: [],
        requestElementData: vi.fn().mockResolvedValue(undefined),
        requestLinks: vi.fn().mockResolvedValue(undefined),
      },
      view: { findAnyCanvas: () => mockCanvas },
    },
    dataProvider: { lookupAll: mockLookupAll },
  });
  mockCanvas.exportSvg.mockResolvedValue('<svg/>');
  mockCanvas.exportRaster.mockResolvedValue('data:image/png;base64,abc');
});

// ---------------------------------------------------------------------------
describe('loadRdf', () => {
  it('calls loadRDFFromUrl when url is provided', async () => {
    const result = await tool('loadRdf').handler({ url: 'http://example.org/data.ttl' });
    expect(rdfManager.loadRDFFromUrl).toHaveBeenCalledWith('http://example.org/data.ttl');
    expect(result).toEqual({ success: true, data: { loaded: 'http://example.org/data.ttl' } });
  });

  it('calls loadRDFIntoGraph when turtle is provided', async () => {
    const turtle = '@prefix ex: <http://example.org/> .';
    const result = await tool('loadRdf').handler({ turtle });
    // injectTurtlePrefixes prepends missing built-in prefixes before parsing
    const [injectedTurtle] = (rdfManager.loadRDFIntoGraph as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(injectedTurtle).toContain('@prefix ex: <http://example.org/> .');
    expect(rdfManager.loadRDFIntoGraph).toHaveBeenCalledWith(injectedTurtle, 'urn:vg:data', 'text/turtle');
    expect(result).toMatchObject({
      success: true,
      data: expect.objectContaining({ loaded: 'inline turtle' }),
    });
  });

  it("keeps a document's own binding for a pre-loaded prefix", async () => {
    const turtle = '@prefix ex: <http://www.example.org/#> .\nex:a ex:p ex:b .';
    await tool('loadRdf').handler({ turtle });
    const [loaded] = (rdfManager.loadRDFIntoGraph as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(loaded).toContain('@prefix ex: <http://www.example.org/#> .');
    expect(loaded).not.toContain('@prefix ex: <http://example.org/> .');
  });

  it('drops a redundant pre-loaded prefix line, including one with spaces in the IRI', async () => {
    const turtle = '@prefix owl: < http://www.w3.org/2002/07/owl# > .\nex:A a owl:Class .';
    await tool('loadRdf').handler({ turtle });
    const [loaded] = (rdfManager.loadRDFIntoGraph as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(loaded.match(/@prefix owl:/g)).toHaveLength(1);
    expect(loaded).toContain('@prefix owl: <http://www.w3.org/2002/07/owl#> .');
  });

  it('returns error when neither url nor turtle is provided', async () => {
    const result = await tool('loadRdf').handler({});
    expect(result).toEqual({ success: false, error: 'Provide either url or turtle' });
  });
});

// ---------------------------------------------------------------------------
describe('exportGraph', () => {
  it('calls exportToTurtle for turtle format', async () => {
    const result = await tool('exportGraph').handler({ format: 'turtle' });
    expect(rdfManager.exportToTurtle).toHaveBeenCalled();
    expect(result).toEqual({ success: true, data: { content: '@prefix ex: <http://example.org/> .' } });
  });

  it('calls exportToJsonLD for jsonld format', async () => {
    const result = await tool('exportGraph').handler({ format: 'jsonld' });
    expect(rdfManager.exportToJsonLD).toHaveBeenCalled();
    expect(result).toEqual({ success: true, data: { content: '{}' } });
  });

  it('calls exportToRdfXml for rdfxml format', async () => {
    const result = await tool('exportGraph').handler({ format: 'rdfxml' });
    expect(rdfManager.exportToRdfXml).toHaveBeenCalled();
    expect(result).toEqual({ success: true, data: { content: '<rdf:RDF/>' } });
  });

  it('returns error for unknown format', async () => {
    const result = await tool('exportGraph').handler({ format: 'ntriples' });
    expect(result).toEqual({ success: false, error: 'Unknown format: ntriples' });
  });
});

// ---------------------------------------------------------------------------
describe('queryGraph', () => {
  const EX = 'http://example.org/';
  const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';

  function mockSelect(rows: Array<Record<string, string>>) {
    (rdfManager.sparqlQuery as ReturnType<typeof vi.fn>).mockResolvedValue({ type: 'select', rows });
  }

  function mockConstruct(triples: Array<{ s: string; p: string; o: string }>) {
    (rdfManager.sparqlQuery as ReturnType<typeof vi.fn>).mockResolvedValue({ type: 'construct', triples });
  }

  function mockUpdate() {
    (rdfManager.sparqlQuery as ReturnType<typeof vi.fn>).mockResolvedValue({ type: 'update' });
  }

  function mockAsk(answer: boolean) {
    (rdfManager.sparqlQuery as ReturnType<typeof vi.fn>).mockResolvedValue({ type: 'ask', boolean: answer });
  }

  it('returns rows for SELECT *', async () => {
    mockSelect([
      { s: EX + 'Alice', p: RDFS_LABEL, o: 'Alice' },
      { s: EX + 'Bob', p: RDFS_LABEL, o: 'Bob' },
    ]);
    const result = await tool('queryGraph').handler({ sparql: 'SELECT * WHERE { ?s ?p ?o }' }) as any;
    expect(result.success).toBe(true);
    expect(result.data.rows).toHaveLength(2);
    expect(result.data.rows[0]).toMatchObject({ s: 'ex:Alice', p: 'rdfs:label', o: 'Alice' });
  });

  it('SELECT with bound subject returns matching rows', async () => {
    mockSelect([
      { p: RDFS_LABEL, o: 'Alice' },
      { p: EX + 'age', o: '30' },
    ]);
    const result = await tool('queryGraph').handler({
      sparql: `SELECT ?p ?o WHERE { <${EX}Alice> ?p ?o }`,
    }) as any;
    expect(result.success).toBe(true);
    expect(result.data.rows).toHaveLength(2);
    expect(result.data.rows.map((r: any) => r.p)).toContain('rdfs:label');
  });

  it('truncates results when limit is exceeded', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({ s: EX + `s${i}`, p: EX + 'p', o: `v${i}` }));
    mockSelect(rows);
    const result = await tool('queryGraph').handler({ sparql: 'SELECT * WHERE { ?s ?p ?o }', limit: 3 }) as any;
    expect(result.success).toBe(true);
    expect(result.data.rows).toHaveLength(3);
    expect(result.data.truncated).toBe(true);
  });

  it('returns parse error for invalid SPARQL', async () => {
    const result = await tool('queryGraph').handler({ sparql: 'NOT VALID SPARQL' });
    expect(result.success).toBe(false);
    expect((result as any).error).toContain('SPARQL parse error');
  });

  it('ASK returns boolean true when the worker says true', async () => {
    mockAsk(true);
    const result = await tool('queryGraph').handler({ sparql: `ASK { <${EX}Alice> ?p ?o }` }) as any;
    expect(result.success).toBe(true);
    expect(result.data.type).toBe('ask');
    expect(result.data.boolean).toBe(true);
  });

  it('ASK returns boolean false when the worker says false', async () => {
    mockAsk(false);
    const result = await tool('queryGraph').handler({ sparql: `ASK { <${EX}NoSuchThing> ?p ?o }` }) as any;
    expect(result.success).toBe(true);
    expect(result.data.type).toBe('ask');
    expect(result.data.boolean).toBe(false);
  });

  it('CONSTRUCT returns triples without writing to store', async () => {
    const EX_MANAGES = EX + 'manages';
    const EX_MANAGED_BY = EX + 'managedBy';
    mockConstruct([{ s: EX + 'Team', p: EX_MANAGED_BY, o: EX + 'Alice' }]);
    const result = await tool('queryGraph').handler({
      sparql: `CONSTRUCT { ?team <${EX_MANAGED_BY}> ?mgr } WHERE { ?mgr <${EX_MANAGES}> ?team }`,
    }) as any;
    expect(result.success).toBe(true);
    expect(result.data.triples).toHaveLength(1);
    expect(result.data.triples[0]).toEqual({ s: 'ex:Team', p: 'ex:managedBy', o: 'ex:Alice' });
  });

  it('CONSTRUCT returns notice when 0 triples matched', async () => {
    mockConstruct([]);
    const result = await tool('queryGraph').handler({
      sparql: `CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }`,
    }) as any;
    expect(result.success).toBe(true);
    expect(result.data.triples).toHaveLength(0);
    expect(result.data.notice).toMatch(/0 triples/);
  });

  it('INSERT DATA returns updated:true', async () => {
    mockUpdate();
    const result = await tool('queryGraph').handler({
      sparql: `INSERT DATA { <${EX}Alice> <${RDFS_LABEL}> "Alice" }`,
    }) as any;
    expect(result.success).toBe(true);
    expect(result.data.updated).toBe(true);
  });

  it('DELETE DATA returns updated:true', async () => {
    mockUpdate();
    const result = await tool('queryGraph').handler({
      sparql: `DELETE DATA { <${EX}Alice> <${RDFS_LABEL}> "Alice" }`,
    }) as any;
    expect(result.success).toBe(true);
    expect(result.data.updated).toBe(true);
  });

  it('DELETE WHERE returns updated:true', async () => {
    mockUpdate();
    const result = await tool('queryGraph').handler({
      sparql: `DELETE WHERE { <${EX}Alice> ?p ?o }`,
    }) as any;
    expect(result.success).toBe(true);
    expect(result.data.updated).toBe(true);
  });

  it('DELETE...INSERT...WHERE returns updated:true', async () => {
    mockUpdate();
    const result = await tool('queryGraph').handler({
      sparql: `DELETE { <${EX}Alice> <${EX}name> ?old } INSERT { <${EX}Alice> <${EX}name> "Alicia" } WHERE { <${EX}Alice> <${EX}name> ?old }`,
    }) as any;
    expect(result.success).toBe(true);
    expect(result.data.updated).toBe(true);
  });

  it('passes injected prefixes + limit to sparqlQuery worker', async () => {
    mockSelect([]);
    await tool('queryGraph').handler({ sparql: 'SELECT * WHERE { ?s ?p ?o }', limit: 50 });
    expect(rdfManager.sparqlQuery).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ limit: 50 }),
    );
  });

  it('normalises bare IRIs in PREFIX declarations (AI omits angle brackets)', async () => {
    mockSelect([]);
    const result = await tool('queryGraph').handler({
      sparql: 'PREFIX rdf: http://www.w3.org/1999/02/22-rdf-syntax-ns#\nSELECT * WHERE { ?s ?p ?o }',
    }) as any;
    // Normalization must turn the bare IRI into a valid IRIREF so sparqljs parses without error
    expect(result.success).toBe(true);
    expect(rdfManager.sparqlQuery).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe('exportImage', () => {
  it('returns svg content for svg format', async () => {
    const result = await tool('exportImage').handler({ format: 'svg' });
    expect(mockCanvas.exportSvg).toHaveBeenCalledWith({ addXmlHeader: true });
    expect(result).toEqual({ success: true, data: { content: '<svg/>' } });
  });

  it('strips style block when noCss is true', async () => {
    mockCanvas.exportSvg.mockResolvedValue('<svg><style>body{color:red}</style><g/></svg>');
    const result = await tool('exportImage').handler({ format: 'svg', noCss: true });
    expect((result as any).data.content).toBe('<svg><g/></svg>');
  });

  it('returns png data uri for png format', async () => {
    const result = await tool('exportImage').handler({ format: 'png' });
    expect(mockCanvas.exportRaster).toHaveBeenCalledWith({ mimeType: 'image/png' });
    expect(result).toEqual({ success: true, data: { content: 'data:image/png;base64,abc' } });
  });

  it('returns error when canvas is unavailable', async () => {
    (getWorkspaceRefs as ReturnType<typeof vi.fn>).mockReturnValue({
      ctx: { model: { elements: [] }, view: { findAnyCanvas: () => undefined } },
      dataProvider: { lookupAll: mockLookupAll },
    });
    const result = await tool('exportImage').handler({ format: 'svg' });
    expect(result).toEqual({ success: false, error: 'Canvas not available' });
  });

  it('returns error when getWorkspaceRefs throws', async () => {
    (getWorkspaceRefs as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('not initialised');
    });
    const result = await tool('exportImage').handler({ format: 'png' });
    expect(result).toEqual({ success: false, error: 'Canvas not available' });
  });
});

// ---------------------------------------------------------------------------
describe('suggestOntologiesForTask', () => {
  it('no params returns all 9 packs with full ontology details', async () => {
    const result = await tool('suggestOntologiesForTask').handler({});
    expect(result.success).toBe(true);
    expect((result as any).data.count).toBe(9);
    const packs = (result as any).data.packs;
    expect(packs).toHaveLength(9);
    for (const pack of packs) {
      expect(pack).toHaveProperty('packId');
      expect(pack).toHaveProperty('packName');
      expect(pack).toHaveProperty('description');
      expect(pack).toHaveProperty('ontologies');
    }
  });

  it('empty task returns all 9 packs', async () => {
    const result = await tool('suggestOntologiesForTask').handler({ task: '' });
    expect(result.success).toBe(true);
    expect((result as any).data.count).toBe(9);
  });

  it('"model people I know" returns people pack with foaf ontology', async () => {
    const result = await tool('suggestOntologiesForTask').handler({ task: 'model people I know' });
    expect(result.success).toBe(true);
    const packs = (result as any).data.packs;
    const people = packs.find((p: any) => p.packId === 'people');
    expect(people).toBeDefined();
    expect(people.ontologies).toBeDefined();
    const prefixes = people.ontologies.map((o: any) => o.prefix);
    expect(prefixes).toContain('foaf');
  });

  it('"zzznomatch999" returns all packs with full ontology details', async () => {
    const result = await tool('suggestOntologiesForTask').handler({ task: 'zzznomatch999' });
    expect(result.success).toBe(true);
    expect((result as any).data.count).toBe(9);
    for (const pack of (result as any).data.packs) {
      expect(pack).toHaveProperty('ontologies');
    }
  });

  it('all prefix values in returned ontologies are non-empty strings', async () => {
    const result = await tool('suggestOntologiesForTask').handler({ task: 'sensor' });
    const packs = (result as any).data.packs;
    for (const pack of packs) {
      if (pack.ontologies) {
        for (const ont of pack.ontologies) {
          expect(typeof ont.prefix).toBe('string');
          expect(ont.prefix.length).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('canonicalizeGraph (RDFC-1.0)', () => {
  it('returns canonical, hash, and quadCount from rdfManager.canonicalize', async () => {
    const result = await tool('canonicalizeGraph').handler({});
    expect(result.success).toBe(true);
    const data = (result as any).data;
    expect(typeof data.canonical).toBe('string');
    expect(data.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(data.quadCount).toBe(1);
  });

  it('forwards graph and includeInferred options to rdfManager.canonicalize', async () => {
    await tool('canonicalizeGraph').handler({ graph: 'urn:vg:data', includeInferred: true });
    expect(rdfManager.canonicalize).toHaveBeenCalledWith({
      graph: 'urn:vg:data',
      includeInferred: true,
    });
  });

  it('defaults includeInferred to false when omitted', async () => {
    await tool('canonicalizeGraph').handler({});
    expect(rdfManager.canonicalize).toHaveBeenCalledWith({
      graph: undefined,
      includeInferred: false,
    });
  });

  it('returns an error result when canonicalize throws', async () => {
    (rdfManager.canonicalize as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('boom'),
    );
    const result = await tool('canonicalizeGraph').handler({});
    expect(result.success).toBe(false);
    expect((result as any).error).toContain('boom');
  });
});
