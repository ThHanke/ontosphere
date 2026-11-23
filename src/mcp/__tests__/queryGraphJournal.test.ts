// @vitest-environment node
// A SPARQL Update through queryGraph is journaled like the other mutating tools.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const EX = 'http://example.org/';
const { recordEdit, store } = vi.hoisted(() => ({
  recordEdit: vi.fn().mockResolvedValue('b1'),
  store: { graphs: new Map<string, any[]>() },
}));
const nn = (v: string) => ({ termType: 'NamedNode', value: v });

vi.mock('@/utils/rdfManager', () => ({
  rdfManager: {
    getNamespaces: () => [],
    getGraphCounts: async () => Object.fromEntries([...store.graphs].map(([g, q]) => [g, q.length])),
    fetchQuadsPage: async ({ graphName }: { graphName: string }) => ({ items: store.graphs.get(graphName) ?? [] }),
    // stands in for the worker: the update replaces the label in urn:vg:ontologies
    sparqlQuery: async () => {
      store.graphs.set('urn:vg:ontologies', [
        { subject: nn(`${EX}C`), predicate: nn(`${EX}label`), object: { termType: 'Literal', value: 'new', language: 'en' } },
      ]);
      return { type: 'update' };
    },
  },
}));
vi.mock('@/mcp/provenance', () => ({ getProvenanceRecorder: () => ({ recordEdit }) }));
vi.mock('@/mcp/workspaceContext', () => ({ getWorkspaceRefs: vi.fn(), applyViewMode: vi.fn() }));

import { graphTools, sparqlUpdateGraphs } from '../tools/graph';
import { Parser } from 'sparqljs';

const queryGraph = graphTools.find((t) => t.name === 'queryGraph')!;

beforeEach(() => {
  recordEdit.mockClear();
  store.graphs = new Map([
    ['urn:vg:ontologies', [{ subject: nn(`${EX}C`), predicate: nn(`${EX}label`), object: { termType: 'Literal', value: 'old', language: 'en' } }]],
    ['urn:vg:data', []],
  ]);
});

describe('queryGraph SPARQL Update journaling', () => {
  it('records the quads added and removed in the graph the update wrote to', async () => {
    const r: any = await queryGraph.handler({
      sparql: `DELETE { GRAPH <urn:vg:ontologies> { <${EX}C> <${EX}label> ?o } } INSERT { GRAPH <urn:vg:ontologies> { <${EX}C> <${EX}label> "new"@en } } WHERE { GRAPH <urn:vg:ontologies> { <${EX}C> <${EX}label> ?o } }`,
    });
    expect(r).toEqual({ success: true, data: { updated: true, added: 1, removed: 1 } });
    expect(recordEdit).toHaveBeenCalledTimes(1);
    const edit = recordEdit.mock.calls[0][0];
    expect(edit.tool).toBe('queryGraph');
    expect(edit.added).toEqual([{ s: `${EX}C`, p: `${EX}label`, o: 'new', ot: 'literal', g: 'urn:vg:ontologies', lang: 'en' }]);
    expect(edit.removed).toEqual([{ s: `${EX}C`, p: `${EX}label`, o: 'old', ot: 'literal', g: 'urn:vg:ontologies', lang: 'en' }]);
  });

  it('reads the written graphs off the update, or falls back to all graphs', () => {
    const p = (q: string) => new Parser().parse(q) as any;
    expect(sparqlUpdateGraphs(p(`INSERT DATA { GRAPH <urn:vg:ontologies> { <${EX}a> <${EX}p> <${EX}b> } }`))).toEqual(['urn:vg:ontologies']);
    expect(sparqlUpdateGraphs(p(`DELETE WHERE { GRAPH ?g { <${EX}a> ?p ?o } }`))).toBeNull();
    expect(sparqlUpdateGraphs(p(`CLEAR GRAPH <urn:vg:data>`))).toBeNull();
  });
});
