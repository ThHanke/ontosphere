// @vitest-environment node
// Repro for reviewer claim: loadRdf inline turtle drops user @prefix lines for built-in prefix names.
import { describe, it, expect, vi } from 'vitest';

const { loadRDFIntoGraph } = vi.hoisted(() => ({ loadRDFIntoGraph: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/utils/rdfManager', () => ({
  rdfManager: {
    loadRDFIntoGraph, loadRDFFromUrl: vi.fn(),
    getNamespaces: vi.fn().mockReturnValue([]), canonicalize: vi.fn(),
    fetchQuadsPage: vi.fn().mockResolvedValue({ items: [], total: 0, offset: 0, limit: 0 }),
    sparqlQuery: vi.fn().mockResolvedValue({ type: 'select', rows: [] }),
  },
}));
vi.mock('@/mcp/workspaceContext', () => ({ getWorkspaceRefs: vi.fn(() => ({ ctx: { model: { elements: [], requestElementData: vi.fn(), requestLinks: vi.fn() }, view: { findAnyCanvas: () => ({}) } }, dataProvider: { lookupAll: vi.fn().mockResolvedValue([]) } })) }));
vi.mock('@/mcp/provenance', () => ({ getProvenanceRecorder: () => ({ recordEdit: vi.fn().mockResolvedValue(null) }) }));
vi.mock('@/stores/ontologyStore', () => ({ useOntologyStore: { getState: vi.fn(() => ({ loadOntology: vi.fn() })) } }));

import { graphTools } from '../tools/graph';

it('user-defined ex: prefix keeps its namespace', async () => {
  const t = graphTools.find((x) => x.name === 'loadRdf')!;
  await t.handler({ turtle: '@prefix ex: <http://my.org/band-gap#> .\nex:a a ex:B .' } as any);
  const sent = JSON.stringify(loadRDFIntoGraph.mock.calls);
  console.log('SENT TO LOADER:', sent);
  expect(sent).toContain('http://my.org/band-gap#');
  expect(sent).not.toContain('http://example.org/');
});

it('malformed built-in prefix line (space inside <>) still resolves to the built-in', async () => {
  loadRDFIntoGraph.mockClear();
  const t = graphTools.find((x) => x.name === 'loadRdf')!;
  await t.handler({ turtle: '@prefix owl: < http://www.w3.org/2002/07/owl#> .\n<urn:a> a owl:Class .' } as any);
  const sent = String(loadRDFIntoGraph.mock.calls[0][0]);
  expect(sent.match(/@prefix owl:/g)?.length).toBe(1);
  expect(sent).toContain('<http://www.w3.org/2002/07/owl#>');
});

it('a redundant built-in declaration on the same line does not take the user declaration with it', async () => {
  loadRDFIntoGraph.mockClear();
  const t = graphTools.find((x) => x.name === 'loadRdf')!;
  await t.handler({ turtle: '@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> . @prefix ex: <http://my.org/two#> .\nex:a a ex:B .' } as any);
  const sent = String(loadRDFIntoGraph.mock.calls[0][0]);
  expect(sent).toContain('@prefix ex: <http://my.org/two#>');
  expect(sent).not.toContain('@prefix ex: <http://example.org/>');
});

it('a built-in prefix declared without an iri is dropped and the built-in injected', async () => {
  loadRDFIntoGraph.mockClear();
  const t = graphTools.find((x) => x.name === 'loadRdf')!;
  await t.handler({ turtle: '@prefix owl: .\n<urn:a> a owl:Class .' } as any);
  const sent = String(loadRDFIntoGraph.mock.calls[0][0]);
  expect(sent.match(/@prefix owl:/g)?.length).toBe(1);
});
