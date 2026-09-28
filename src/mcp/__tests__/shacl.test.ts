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

  it('reports how many shapes selected a focus node', async () => {
    mockRunShaclValidation.mockResolvedValue({
      conforms: true,
      violations: [],
      shapeCount: 2,
      shapeTargets: [
        { shape: EX + 'PersonShape', targetCount: 3 },
        { shape: EX + 'SemiconductorShape', targetCount: 0 },
      ],
      untargetedShapeCount: 1,
    });

    const result = await validateGraph.handler({}) as any;
    expect(result.data.shapeCount).toBe(2);
    expect(result.data.untargetedShapeCount).toBe(1);
    expect(result.data.targetedShapes).toEqual([{ shape: EX + 'PersonShape', targetCount: 3 }]);
  });
});
