// src/mcp/__tests__/diagnostics.test.ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockRunReasoning,
  mockReasonerJustifications,
  mockRunShacl,
  mockValidate,
  mockFetchQuadsPage,
  mockSuggestRepairs,
} = vi.hoisted(() => ({
  mockRunReasoning: vi.fn(),
  mockReasonerJustifications: vi.fn(),
  mockRunShacl: vi.fn(),
  mockValidate: vi.fn(),
  mockFetchQuadsPage: vi.fn(),
  mockSuggestRepairs: vi.fn(),
}));

// explainDiagnostics makes no explain call of its own: the justifications are what the reasoner's
// repair() found, returned by suggestRepairs. mockReasonerJustifications scripts that answer.
vi.mock('@/utils/rdfManager', () => ({
  rdfManager: {
    getNamespaces: () => [],
    runReasoning: mockRunReasoning,
    runShaclValidation: mockRunShacl,
    validate: mockValidate,
    fetchQuadsPage: mockFetchQuadsPage,
    suggestRepairs: mockSuggestRepairs,
  },
}));

// reasoning.ts also imports these — keep them inert for this suite.
vi.mock('@/mcp/workspaceContext', () => ({ getWorkspaceRefs: vi.fn(() => ({ ctx: {}, dataProvider: {} })) }));
vi.mock('@/stores/appConfigStore', () => ({
  useAppConfigStore: { getState: vi.fn(() => ({ config: { shaclEnabled: true }, setShaclEnabled: vi.fn() })) },
}));

import { reasoningTools } from '../tools/reasoning';
import { suggestDeletionRepairs } from '../tools/repairAdapter';
import { fakeRepairLibrary, type FakeRepairLibrary, type FakeRepairOptions } from './helpers/fakeRepairLibrary';

const explainDiagnostics = reasoningTools.find((t) => t.name === 'explainDiagnostics')!;

// The reasoner's repair() / assessEdit() / weaken() are scripted from the justifications the
// handler passes to suggestRepairs; the adapter that maps them is the real one.
let fakeReasoner: FakeRepairOptions = {};
let lib: FakeRepairLibrary | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  fakeReasoner = {};
  lib = undefined;
  mockSuggestRepairs.mockImplementation(async (payload: object) => {
    lib = fakeRepairLibrary(await mockReasonerJustifications(), fakeReasoner);
    return suggestDeletionRepairs({ lib, reskolemize: (q) => q, ...payload });
  });
  // sensible "clean" defaults; individual tests override.
  mockRunReasoning.mockResolvedValue({ isConsistent: true, errors: [] });
  mockReasonerJustifications.mockResolvedValue([]);
  mockRunShacl.mockResolvedValue({ conforms: true, violations: [], shapeCount: 0 });
  mockValidate.mockResolvedValue({ consistent: true, unsatisfiable: [] });
  mockFetchQuadsPage.mockResolvedValue({ items: [] });
});

describe('explainDiagnostics', () => {
  it('is registered', () => {
    expect(explainDiagnostics).toBeTruthy();
  });

  it('clean graph → consistent, no issues, "No issues detected." brief', async () => {
    const res = await explainDiagnostics.handler({});
    expect(res.success).toBe(true);
    const data = (res as any).data;
    expect(data.isConsistent).toBe(true);
    expect(data.justifications).toEqual([]);
    expect(data.repairBrief).toBe('No issues detected.');
    // consistent: no explain, no repair search
    expect(mockSuggestRepairs).not.toHaveBeenCalled();
    expect(mockReasonerJustifications).not.toHaveBeenCalled();
  });

  it('inconsistent graph → returns justifications and a clash brief', async () => {
    mockRunReasoning.mockResolvedValue({ isConsistent: false, errors: [] });
    mockReasonerJustifications.mockResolvedValue([
      [
        { subject: 'http://ex/frank', predicate: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', object: 'http://ex/Employee' },
        { subject: 'http://ex/Employee', predicate: 'http://www.w3.org/2002/07/owl#disjointWith', object: 'http://ex/Contractor' },
      ],
    ]);
    const res = await explainDiagnostics.handler({ maxJustifications: 2 });
    expect(res.success).toBe(true);
    expect((res as any).data.isConsistent).toBe(false);
    expect((res as any).data.justifications).toHaveLength(1);
    expect((res as any).data.justifications[0]).toHaveLength(2);
    expect(mockSuggestRepairs).toHaveBeenCalledWith(expect.objectContaining({ maxJustifications: 2 }));
    expect((res as any).data.repairBrief.toLowerCase()).toContain('disjointwith');
  });

  it('inconsistent graph → returns ranked, verified suggestedRepairs targeting a justification axiom', async () => {
    mockRunReasoning.mockResolvedValue({ isConsistent: false, errors: [] });
    const mips = [
      [
        { subject: 'http://ex/frank', predicate: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', object: 'http://ex/Employee' },
        { subject: 'http://ex/frank', predicate: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', object: 'http://ex/Contractor' },
        { subject: 'http://ex/Employee', predicate: 'http://www.w3.org/2002/07/owl#disjointWith', object: 'http://ex/Contractor' },
      ],
    ];
    mockReasonerJustifications.mockResolvedValue(mips);

    const res = (await explainDiagnostics.handler({ maxJustifications: 3 })) as { success: boolean; data: any };
    expect(res.success).toBe(true);
    expect(Array.isArray((res as any).data.suggestedRepairs)).toBe(true);
    expect((res as any).data.suggestedRepairs.length).toBeGreaterThanOrEqual(1);

    const top = (res as any).data.suggestedRepairs[0];
    // The action targets an axiom that actually appears in a justification.
    const axiomKeys = new Set(mips.flat().map((a) => `${a.subject} ${a.predicate} ${a.object}`));
    const topKey = `${top.action.args.subjectIri} ${top.action.args.predicateIri} ${top.action.args.objectIri}`;
    expect(axiomKeys.has(topKey)).toBe(true);
    // The top candidate was symbolically verified.
    expect(top.verifiedConsistent).toBe(true);
    expect(top.action.tool).toMatch(/removeLink|removeTriple/);
    // The reasoner was asked for the repairs; explainDiagnostics supplies no justifications of its own.
    expect(mockSuggestRepairs).toHaveBeenCalledWith(expect.objectContaining({ maxJustifications: 3 }));
    expect(mockSuggestRepairs.mock.calls[0][0]).not.toHaveProperty('justifications');
    expect((res as any).data.justifications.map((j: any[]) => j.map(({ subject, predicate, object }) => ({ subject, predicate, object })))).toEqual(mips);
    // The brief enumerates the ranked repairs.
    expect((res as any).data.repairBrief).toContain('SUGGESTED REPAIRS');
  });

  it('does not ask the reasoner for repairs when the graph is consistent', async () => {
    await explainDiagnostics.handler({});
    expect(mockSuggestRepairs).not.toHaveBeenCalled();
  });

  it('M2: two disjoint contradictions → per-axiom false, but full-set verified true is surfaced', async () => {
    mockRunReasoning.mockResolvedValue({ isConsistent: false, errors: [] });
    // Two INDEPENDENT contradictions (no shared axiom).
    const mips = [
      [
        { subject: 'http://ex/frank', predicate: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', object: 'http://ex/A' },
        { subject: 'http://ex/frank', predicate: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', object: 'http://ex/B' },
      ],
      [
        { subject: 'http://ex/gina', predicate: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', object: 'http://ex/P' },
        { subject: 'http://ex/gina', predicate: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', object: 'http://ex/Q' },
      ],
    ];
    mockReasonerJustifications.mockResolvedValue(mips);
    // Per-axiom removal NEVER restores consistency (the other clash remains); the FULL set
    // together DOES (the fake's default: only the whole set is consistent).

    const res = (await explainDiagnostics.handler({ maxJustifications: 3 })) as { success: boolean; data: any };
    expect(res.success).toBe(true);

    const inc = (res as any).data.suggestedRepairs.filter((r: any) => r.issue === 'inconsistency' && !r.needsManualReview);
    expect(inc.length).toBeGreaterThanOrEqual(2);
    // Every per-axiom verdict is false…
    for (const r of inc) expect(r.verifiedConsistent).toBe(false);
    // …yet the full-set verdict is true and surfaced both top-level and per-repair.
    expect((res as any).data.repairSetVerifiedConsistent).toBe(true);
    for (const r of inc) expect(r.verifiedSet).toBe(true);
    // The brief must NOT read a per-axiom false as "this repair is wrong".
    expect((res as any).data.repairBrief).toContain('apply the full repair set');
    expect((res as any).data.repairBrief).toContain('restore consistency');
    // The reasoner's repair set holds BOTH axioms, and each per-axiom check removed exactly one.
    expect(lib!.chosen).toHaveLength(2);
    const removalSizes = lib!.calls.assessEdit.map((c) => c.remove.length);
    expect(removalSizes).toContain(2); // the full-set match check
    expect(removalSizes.filter((n) => n === 1)).toHaveLength(2); // one check per axiom
  });

  it('BUG B: the removal the reasoner checks AND the suggested action carry the graph + typed-literal threaded from the MIPS', async () => {
    mockRunReasoning.mockResolvedValue({ isConsistent: false, errors: [] });
    const XSD_INT = 'http://www.w3.org/2001/XMLSchema#integer';
    // A single-axiom MIPS whose covering axiom lives in urn:vg:ontologies and
    // has a typed-literal object — the worker's explainInconsistency threads
    // graph + objectTermType + objectDatatype. The reasoner is asked to remove that exact quad, and
    // action.args carries the same term, so the apply path (removeLink) removes the SAME triple.
    mockReasonerJustifications.mockResolvedValue([
      [
        {
          subject: 'http://ex/i',
          predicate: 'http://ex/age',
          object: '42',
          objectTermType: 'Literal',
          objectDatatype: XSD_INT,
          graph: 'urn:vg:ontologies',
        },
      ],
    ]);

    const res = (await explainDiagnostics.handler({ maxJustifications: 3 })) as { success: boolean; data: any };
    expect(res.success).toBe(true);

    // The reasoner was asked to remove the EXACT quad: typed literal, in the ontologies graph.
    expect(lib!.calls.assessEdit.length).toBeGreaterThan(0);
    const removed = lib!.calls.assessEdit[0].remove;
    expect(removed).toHaveLength(1);
    expect(removed[0].subject.value).toBe('http://ex/i');
    expect(removed[0].predicate.value).toBe('http://ex/age');
    expect(removed[0].object.value).toBe('42');
    expect((removed[0].object as { datatype?: { value: string } }).datatype?.value).toBe(XSD_INT);
    expect(removed[0].graph.value).toBe('urn:vg:ontologies');

    // The suggested action carries the same metadata, so apply removes that triple.
    const action = (res as any).data.suggestedRepairs[0].action.args;
    expect(action).toMatchObject({
      subjectIri: 'http://ex/i',
      predicateIri: 'http://ex/age',
      objectIri: '42',
      objectTermType: 'Literal',
      objectDatatype: XSD_INT,
      graph: 'urn:vg:ontologies',
    });
  });

  it('L2: a matchedCount < requestedCount surfaces a warning (nothing-matched vs still-inconsistent)', async () => {
    mockRunReasoning.mockResolvedValue({ isConsistent: false, errors: [] });
    mockReasonerJustifications.mockResolvedValue([
      [
        { subject: 'http://ex/frank', predicate: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', object: 'http://ex/A' },
        { subject: 'http://ex/frank', predicate: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', object: 'http://ex/B' },
      ],
    ]);
    // One removal requested but zero matched (serialization mismatch): the reasoner reports it
    // as an unmatched removal, and the set does not restore consistency.
    fakeReasoner = { unmatchedRemovals: true, setVerified: false };
    const res = (await explainDiagnostics.handler({})) as { success: boolean; data: any };
    expect(res.success).toBe(true);
    expect((res as any).data.repairSetMatchWarning).toBeTruthy();
    expect((res as any).data.repairSetMatchWarning).toContain('0 of 1');
    expect((res as any).data.repairBrief).toContain('WARNING');
  });

  it('unsatisfiable class from Konclude is reported', async () => {
    mockValidate.mockResolvedValue({ consistent: true, unsatisfiable: ['http://ex/EmptyClass'] });
    const res = await explainDiagnostics.handler({});
    expect((res as any).data.unsatisfiableClasses).toContain('http://ex/EmptyClass');
    expect((res as any).data.repairBrief).toContain('EmptyClass');
  });

  // Profile detection removed — will be re-added via rdf-reasoner-konclude API.

  it('SHACL violation is reported', async () => {
    mockRunShacl.mockResolvedValue({
      conforms: false,
      violations: [{ focusNode: 'http://ex/projectAlpha', path: null, severity: 'sh:Violation', message: 'missing rdfs:comment', sourceShape: 'http://ex/S', constraint: 'http://www.w3.org/ns/shacl#MinCountConstraintComponent' }],
      shapeCount: 1,
    });
    const res = await explainDiagnostics.handler({});
    expect((res as any).data.shaclViolations).toHaveLength(1);
    expect((res as any).data.repairBrief).toContain('projectAlpha');
  });

  it('returns success:false with context on internal error', async () => {
    mockRunReasoning.mockRejectedValue(new Error('worker boom'));
    const res = await explainDiagnostics.handler({});
    expect(res.success).toBe(false);
    expect((res as any).error).toContain('explainDiagnostics');
    expect((res as any).error).toContain('worker boom');
  });
});
