// src/mcp/__tests__/shacl.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const SHACL_GRAPH = 'urn:vg:shapes';
const SH_NODESHAPE = 'http://www.w3.org/ns/shacl#NodeShape';
const SH_PROPERTYSHAPE = 'http://www.w3.org/ns/shacl#PropertyShape';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';
const EX = 'http://example.org/';

const { mockLoadRDFIntoGraph, mockFetchQuadsPage, mockRunShaclValidation } = vi.hoisted(() => ({
  mockLoadRDFIntoGraph: vi.fn().mockResolvedValue(undefined),
  mockFetchQuadsPage: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  mockRunShaclValidation: vi.fn().mockResolvedValue({ conforms: true, violations: [], shapeCount: 0 }),
}));

vi.mock('@/utils/rdfManager', () => ({
  rdfManager: {
    loadRDFIntoGraph: mockLoadRDFIntoGraph,
    fetchQuadsPage: mockFetchQuadsPage,
    runShaclValidation: mockRunShaclValidation,
  },
}));

import { shaclTools } from '../tools/shacl';

const loadShacl = shaclTools.find(t => t.name === 'loadShacl')!;
const validateGraph = shaclTools.find(t => t.name === 'validateGraph')!;

beforeEach(() => {
  mockLoadRDFIntoGraph.mockClear().mockResolvedValue(undefined);
  mockFetchQuadsPage.mockClear().mockResolvedValue({ items: [], total: 0 });
  mockRunShaclValidation.mockClear().mockResolvedValue({ conforms: true, violations: [], shapeCount: 0 });
});

// ---------------------------------------------------------------------------
describe('loadShacl', () => {
  it('loads turtle and counts NodeShapes', async () => {
    mockFetchQuadsPage.mockResolvedValue({
      items: [
        { subject: EX + 'PersonShape', predicate: RDF_TYPE, object: SH_NODESHAPE },
        { subject: EX + 'OrgShape', predicate: RDF_TYPE, object: SH_NODESHAPE },
      ],
      total: 2,
    });
    const result = await loadShacl.handler({ turtle: '@prefix sh: <http://www.w3.org/ns/shacl#> .' }) as any;
    expect(result.success).toBe(true);
    expect(result.data.loaded).toBe(2);
    expect(result.data.shapes).toContain(EX + 'PersonShape');
    expect(mockLoadRDFIntoGraph).toHaveBeenCalledWith(expect.any(String), SHACL_GRAPH, 'text/turtle');
  });

  it('returns error when turtle is missing', async () => {
    const result = await loadShacl.handler({});
    expect(result.success).toBe(false);
    expect((result as any).error).toContain('turtle is required');
  });

  it('returns error when loadRDFIntoGraph throws (malformed Turtle)', async () => {
    mockLoadRDFIntoGraph.mockRejectedValue(new Error('Parse error at line 1'));
    const result = await loadShacl.handler({ turtle: 'NOT VALID TURTLE @@@@' });
    expect(result.success).toBe(false);
    expect((result as any).error).toContain('Parse error');
  });
});

// ---------------------------------------------------------------------------
describe('validateGraph', () => {
  it('returns conforms=false with violation when node missing required property', async () => {
    mockRunShaclValidation.mockResolvedValue({
      conforms: false,
      violations: [{
        focusNode: EX + 'Alice',
        path: RDFS_LABEL,
        severity: 'sh:Warning',
        message: 'Class should have an rdfs:label',
        sourceShape: EX + 'PersonShape',
        constraint: 'http://www.w3.org/ns/shacl#MinCountConstraintComponent',
        source: 'shacl',
      }],
      shapeCount: 1,
    });

    const result = await validateGraph.handler({}) as any;
    expect(result.success).toBe(true);
    expect(result.data.conforms).toBe(false);
    expect(result.data.violations).toHaveLength(1);
    expect(result.data.violations[0].focusNode).toBe(EX + 'Alice');
    expect(result.data.violations[0].path).toBe(RDFS_LABEL);
  });

  it('returns conforms=true when all shapes satisfied', async () => {
    const result = await validateGraph.handler({}) as any;
    expect(result.success).toBe(true);
    expect(result.data.conforms).toBe(true);
    expect(result.data.violations).toHaveLength(0);
  });

  it('returns conforms=true with empty violations when no shapes loaded', async () => {
    mockRunShaclValidation.mockResolvedValue({
      conforms: true,
      violations: [],
      shapeCount: 0,
    });

    const result = await validateGraph.handler({}) as any;
    expect(result.success).toBe(true);
    expect(result.data.conforms).toBe(true);
    expect(result.data.violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe('validateGraph focus counts and loadShaclFromUrl failures', () => {
  it('passes the focus-node summary and the asserted/reasoned comparison through', async () => {
    const focus = { nodeShapes: 3, shapesWithFocus: 2, perShape: { [EX + 'S']: 4, [EX + 'T']: 1 }, afterReasoning: true };
    const focusComparison = { nodeShapes: 3, asserted: 1, reasoned: 2, newlyActive: [EX + 'T'] };
    mockRunShaclValidation.mockResolvedValue({ conforms: true, violations: [], shapeCount: 3, focus, focusComparison });
    const result = await validateGraph.handler({}) as any;
    expect(result.data).toEqual({ conforms: true, violations: [], focus, focusComparison });
  });

  it('loadShaclFromUrl fails when a file does not parse and names it', async () => {
    vi.doMock('@/utils/shaclShapeLoader', () => ({
      loadShaclShapes: vi.fn().mockResolvedValue({
        loaded: [{ name: 'good.ttl', url: 'https://ex.org/good.ttl', shapeCount: 1 }],
        errors: [{ url: 'https://ex.org/bad.ttl', error: 'Unexpected "shape:"' }],
      }),
    }));
    const tool = shaclTools.find(t => t.name === 'loadShaclFromUrl')!;
    const result = await tool.handler({ url: 'https://ex.org/good.ttl,https://ex.org/bad.ttl' }) as any;
    expect(result.success).toBe(false);
    expect(result.error).toContain('https://ex.org/bad.ttl');
    expect(result.error).toContain('good.ttl');
    vi.doUnmock('@/utils/shaclShapeLoader');
  });

  it('loadShacl passes baseIri to the parser', async () => {
    await loadShacl.handler({ turtle: '<#S> a <http://www.w3.org/ns/shacl#NodeShape> .', baseIri: 'https://ex.org/s.ttl' });
    expect(mockLoadRDFIntoGraph).toHaveBeenCalledWith(expect.any(String), SHACL_GRAPH, 'text/turtle', undefined, undefined, 'https://ex.org/s.ttl');
  });
});
