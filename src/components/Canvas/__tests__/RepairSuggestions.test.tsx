// src/components/Canvas/__tests__/RepairSuggestions.test.tsx
//
// Verifies the human "Apply repair" UI: it gets suggestions via the SAME
// rdfManager.suggestRepairs the agent path uses, renders the rationale +
// triple, and that clicking "Apply fix" performs the correct rdfManager
// mutation and surfaces an undoable toast. Also covers "Apply all verified".

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

// --- mocks (declared before importing the component under test) ---

const hoisted = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  }),
  rdf: {
    explainInconsistency: vi.fn(),
    validate: vi.fn(),
    runShaclValidation: vi.fn(),
    suggestRepairs: vi.fn(),
    removeTriple: vi.fn(),
    addTriple: vi.fn(),
    applyBatch: vi.fn(),
  },
  runReasoning: vi.fn(),
  // What the scripted reasoner behind rdfManager.suggestRepairs does, and the last instance of it.
  fake: { opts: {} as Record<string, unknown>, lib: undefined as unknown },
}));

vi.mock('sonner', () => ({ toast: hoisted.toast }));

// Keep term display deterministic and dependency-free.
vi.mock('../../../utils/termUtils', () => ({
  toPrefixed: (iri: string) => iri,
}));

vi.mock('../../../utils/rdfManager', () => ({
  rdfManager: hoisted.rdf,
}));

vi.mock('@/mcp/workspaceContext', () => ({
  getWorkspaceRefs: () => ({ runReasoning: hoisted.runReasoning }),
}));

import * as N3 from 'n3';
import { RepairSuggestions } from '../RepairSuggestions';
import type { RepairSuggestion } from '../../../mcp/tools/computeRepairs';
import { suggestDeletionRepairs } from '../../../mcp/tools/repairAdapter';
import { fakeRepairLibrary, type FakeRepairLibrary, type FakeRepairOptions } from '../../../mcp/__tests__/helpers/fakeRepairLibrary';

// The reasoner's repair() / assessEdit() / weaken() are scripted from the justifications the
// panel passes to suggestRepairs; the adapter that maps them is the real one.
const fakeLib = () => hoisted.fake.lib as FakeRepairLibrary;

/** What the shared repair computation returns for these justifications (the suggestions the panel must show). */
async function expectedRepairs(justifications: unknown[][]): Promise<RepairSuggestion[]> {
  return (await hoisted.rdf.suggestRepairs({ justifications })).repairs;
}

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const OWL_DISJOINT = 'http://www.w3.org/2002/07/owl#disjointWith';

const EX = 'http://ex/';

// A single contradiction: individual i is typed as both A and B, and A
// owl:disjointWith B. The least-destructive repair removes one ABox type
// assertion (not the TBox disjointWith axiom).
const JUSTIFICATION = [
  [
    { subject: `${EX}i`, predicate: RDF_TYPE, object: `${EX}A` },
    { subject: `${EX}i`, predicate: RDF_TYPE, object: `${EX}B` },
    { subject: `${EX}A`, predicate: OWL_DISJOINT, object: `${EX}B` },
  ],
];

function primeConsistentInconsistency() {
  hoisted.rdf.explainInconsistency.mockResolvedValue(JUSTIFICATION);
  hoisted.rdf.validate.mockResolvedValue({ consistent: true, unsatisfiable: [] });
  hoisted.rdf.runShaclValidation.mockResolvedValue({ conforms: true, violations: [], shapeCount: 0 });
  // Removing the single repair restores consistency (the scripted reasoner's default).
  hoisted.rdf.applyBatch.mockResolvedValue({ added: 0, removed: 1 });
  // The scripted reasoner offers no weakenings unless a test configures them.
}

describe('RepairSuggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.fake.opts = {};
    hoisted.fake.lib = undefined;
    hoisted.rdf.suggestRepairs.mockImplementation(async (payload: { justifications?: never[] }) => {
      const lib = fakeRepairLibrary(payload.justifications ?? [], hoisted.fake.opts as FakeRepairOptions);
      hoisted.fake.lib = lib;
      return suggestDeletionRepairs({ lib, reskolemize: (q) => q, ...payload });
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the suggestion with its rationale (as the shared repair computation returns it)', async () => {
    primeConsistentInconsistency();
    // The UI must surface exactly what the shared computation produces.
    const expected = await expectedRepairs(JUSTIFICATION);
    expect(expected.length).toBeGreaterThan(0);

    render(<RepairSuggestions reasoningId="r1" isConsistent={false} />);

    await waitFor(() => {
      expect(screen.getByText(expected[0].rationale)).toBeTruthy();
    });
    // The repair id badge is shown.
    expect(screen.getByText(expected[0].id)).toBeTruthy();
  });

  it('Apply fix routes the removal through applyBatch (confirming the delta) and shows an undoable toast', async () => {
    primeConsistentInconsistency();
    const expected = await expectedRepairs(JUSTIFICATION);
    const repair = expected[0];

    render(<RepairSuggestions reasoningId="r1" isConsistent={false} />);

    const applyBtn = await screen.findByRole('button', { name: /Apply repair/i });
    fireEvent.click(applyBtn);

    // H1: the apply goes through applyBatch (which returns the REAL removed
    // delta), NOT the fire-and-forget removeTriple.
    await waitFor(() => {
      expect(hoisted.rdf.applyBatch).toHaveBeenCalled();
    });
    const [changes, graph] = hoisted.rdf.applyBatch.mock.calls[0];
    // C1: the IRI-object justification lives in the (default) data graph here.
    expect(graph).toBe('urn:vg:data');
    expect(changes.removes.length).toBe(1);
    expect(changes.removes[0].subject).toBe(repair.action.args.subjectIri);
    expect(changes.removes[0].predicate).toBe(repair.action.args.predicateIri);
    expect(changes.removes[0].object).toBe(repair.action.args.objectIri);

    // A success toast with an Undo action was shown (since removed >= 1).
    await waitFor(() => expect(hoisted.toast.success).toHaveBeenCalled());
    const call = hoisted.toast.success.mock.calls.find((c) => c[1] && c[1].action);
    expect(call).toBeTruthy();
    expect(call![1].action.label).toBe('Undo');

    // Invoking Undo re-adds the removed triple via applyBatch (same graph).
    hoisted.rdf.applyBatch.mockClear();
    await call![1].action.onClick();
    expect(hoisted.rdf.applyBatch).toHaveBeenCalled();
    const [undoChanges, undoGraph] = hoisted.rdf.applyBatch.mock.calls[0];
    expect(undoGraph).toBe('urn:vg:data');
    expect(undoChanges.adds.length).toBe(1);
    expect(undoChanges.removes).toEqual([]);
  });

  it('C1: applies a justification axiom located in urn:vg:ontologies to THAT graph (not hardcoded urn:vg:data)', async () => {
    // The disjointWith TBox axiom is the only available repair when the two type
    // assertions are pinned via a separate consistency setup; here we force a
    // single-axiom justification whose axiom carries graph='urn:vg:ontologies'.
    const ontologyGraphJustif = [
      [
        // The covering axiom physically resides in the imported ontology graph.
        {
          subject: `${EX}A`,
          predicate: OWL_DISJOINT,
          object: `${EX}B`,
          objectTermType: 'NamedNode',
          graph: 'urn:vg:ontologies',
        },
      ],
    ];
    hoisted.rdf.explainInconsistency.mockResolvedValue(ontologyGraphJustif);
    hoisted.rdf.validate.mockResolvedValue({ consistent: true, unsatisfiable: [] });
    hoisted.rdf.runShaclValidation.mockResolvedValue({ conforms: true, violations: [], shapeCount: 0 });
    // Simulate a store where the quad EXISTS in urn:vg:ontologies: a data-graph
    // removal returns {removed:0}; an ontologies-graph removal returns {removed:1}.
    hoisted.rdf.applyBatch.mockImplementation((changes: { removes?: { graph?: string }[] }, fallback: string) => {
      const g = changes.removes?.[0]?.graph ?? fallback;
      return Promise.resolve({ added: 0, removed: g === 'urn:vg:ontologies' ? 1 : 0 });
    });

    // Confirm the computation threads the graph into action.args.
    const expected = await expectedRepairs(ontologyGraphJustif);
    expect(expected[0].action.args.graph).toBe('urn:vg:ontologies');

    render(<RepairSuggestions reasoningId="rc1" isConsistent={false} />);
    const applyBtn = await screen.findByRole('button', { name: /Apply repair/i });
    fireEvent.click(applyBtn);

    await waitFor(() => expect(hoisted.rdf.applyBatch).toHaveBeenCalled());
    const [changes, fallbackGraph] = hoisted.rdf.applyBatch.mock.calls[0];
    // The removal targets the ontologies graph (a data-graph apply would no-op).
    expect(changes.removes[0].graph).toBe('urn:vg:ontologies');
    expect(fallbackGraph).toBe('urn:vg:ontologies');
    // removed >= 1 ⇒ success, NOT a warning.
    await waitFor(() => expect(hoisted.toast.success).toHaveBeenCalled());
    expect(hoisted.toast.warning).not.toHaveBeenCalled();
  });

  it('BUG C: a graphless repair makes VERIFY and APPLY target the IDENTICAL graph', async () => {
    // The justification axiom carries NO graph metadata. Stored data always has a graph (the
    // scripted reasoner puts such triples in urn:vg:data). The reasoner verifies removing that exact
    // quad, and APPLY must remove it from the same graph.
    primeConsistentInconsistency(); // JUSTIFICATION has no graph metadata

    render(<RepairSuggestions reasoningId="rbc" isConsistent={false} />);

    // VERIFY (fired on load): the quad the reasoner was asked to remove.
    await waitFor(() => expect(fakeLib()?.calls.assessEdit.length).toBeGreaterThan(0));
    const verifyGraph = fakeLib().calls.assessEdit[0].remove[0].graph.value;
    expect(verifyGraph).toBe('urn:vg:data');

    // APPLY must target the IDENTICAL graph.
    const applyBtn = await screen.findByRole('button', { name: /Apply repair/i });
    fireEvent.click(applyBtn);
    await waitFor(() => expect(hoisted.rdf.applyBatch).toHaveBeenCalled());
    const [changes, applyGraph] = hoisted.rdf.applyBatch.mock.calls[0];
    expect(applyGraph).toBe('urn:vg:data');
    expect(changes.removes[0].graph).toBe('urn:vg:data');
    // The invariant: verify graph === apply graph for this repair.
    expect(verifyGraph).toBe(changes.removes[0].graph);
  });

  it('BUG C: a graph-bearing repair makes VERIFY and APPLY both target THAT graph', async () => {
    // When the MIPS axiom carries graph='urn:vg:ontologies', verify AND apply must
    // both target it (not diverge to urn:vg:data).
    const ontologyGraphJustif = [
      [
        {
          subject: `${EX}A`,
          predicate: OWL_DISJOINT,
          object: `${EX}B`,
          objectTermType: 'NamedNode',
          graph: 'urn:vg:ontologies',
        },
      ],
    ];
    hoisted.rdf.explainInconsistency.mockResolvedValue(ontologyGraphJustif);
    hoisted.rdf.validate.mockResolvedValue({ consistent: true, unsatisfiable: [] });
    hoisted.rdf.runShaclValidation.mockResolvedValue({ conforms: true, violations: [], shapeCount: 0 });
    hoisted.rdf.applyBatch.mockImplementation((changes: { removes?: { graph?: string }[] }, fallback: string) => {
      const g = changes.removes?.[0]?.graph ?? fallback;
      return Promise.resolve({ added: 0, removed: g === 'urn:vg:ontologies' ? 1 : 0 });
    });

    render(<RepairSuggestions reasoningId="rbc2" isConsistent={false} />);

    await waitFor(() => expect(fakeLib()?.calls.assessEdit.length).toBeGreaterThan(0));
    const verifyGraph = fakeLib().calls.assessEdit[0].remove[0].graph.value;
    expect(verifyGraph).toBe('urn:vg:ontologies');

    const applyBtn = await screen.findByRole('button', { name: /Apply repair/i });
    fireEvent.click(applyBtn);
    await waitFor(() => expect(hoisted.rdf.applyBatch).toHaveBeenCalled());
    const [changes] = hoisted.rdf.applyBatch.mock.calls[0];
    expect(changes.removes[0].graph).toBe('urn:vg:ontologies');
    expect(verifyGraph).toBe(changes.removes[0].graph);
  });

  it('H1: a repair that matches 0 triples shows a warning and does NOT mark applied', async () => {
    primeConsistentInconsistency();
    // Override: applyBatch reports nothing was removed (graph/serialization miss).
    hoisted.rdf.applyBatch.mockResolvedValue({ added: 0, removed: 0 });

    render(<RepairSuggestions reasoningId="rh1" isConsistent={false} />);
    const applyBtn = await screen.findByRole('button', { name: /Apply repair/i });
    fireEvent.click(applyBtn);

    await waitFor(() => expect(hoisted.rdf.applyBatch).toHaveBeenCalled());
    // A warning is shown and success is NOT.
    await waitFor(() => expect(hoisted.toast.warning).toHaveBeenCalled());
    expect(hoisted.toast.success).not.toHaveBeenCalled();
    // The button is NOT switched to "Applied".
    expect(screen.queryByText(/^Applied$/)).toBeNull();
  });

  it('H2: a typed-literal repair is applied with its exact datatype reconstructed', async () => {
    const XSD_INT = 'http://www.w3.org/2001/XMLSchema#integer';
    const EX_AGE = `${EX}age`;
    // A justification whose covering axiom has a typed literal object "42"^^xsd:integer.
    const literalJustif = [
      [
        {
          subject: `${EX}i`,
          predicate: EX_AGE,
          object: '42',
          objectTermType: 'Literal',
          objectDatatype: XSD_INT,
          graph: 'urn:vg:data',
        },
      ],
    ];
    hoisted.rdf.explainInconsistency.mockResolvedValue(literalJustif);
    hoisted.rdf.validate.mockResolvedValue({ consistent: true, unsatisfiable: [] });
    hoisted.rdf.runShaclValidation.mockResolvedValue({ conforms: true, violations: [], shapeCount: 0 });
    hoisted.rdf.applyBatch.mockResolvedValue({ added: 0, removed: 1 });

    // The computation threads the datatype/termType into action.args.
    const expected = await expectedRepairs(literalJustif);
    expect(expected[0].action.args.objectTermType).toBe('Literal');
    expect(expected[0].action.args.objectDatatype).toBe(XSD_INT);

    render(<RepairSuggestions reasoningId="rh2" isConsistent={false} />);

    // BUG B: VERIFY must target the SAME typed-literal triple APPLY removes. The quad the
    // reasoner was asked to remove (on load) is the typed literal in urn:vg:data, so it cannot
    // "succeed" against a same-lexical "42" string sibling.
    await waitFor(() => expect(fakeLib()?.calls.assessEdit.length).toBeGreaterThan(0));
    const verified = fakeLib().calls.assessEdit[0].remove[0];
    expect(verified.subject.value).toBe(`${EX}i`);
    expect(verified.predicate.value).toBe(EX_AGE);
    expect(verified.object.value).toBe('42');
    expect((verified.object as { datatype?: { value: string } }).datatype?.value).toBe(XSD_INT);
    expect(verified.graph.value).toBe('urn:vg:data');

    const applyBtn = await screen.findByRole('button', { name: /Apply repair/i });
    fireEvent.click(applyBtn);

    await waitFor(() => expect(hoisted.rdf.applyBatch).toHaveBeenCalled());
    const [changes] = hoisted.rdf.applyBatch.mock.calls[0];
    // The object is passed as a structured literal term carrying the datatype,
    // so the worker matches "42"^^xsd:integer EXACTLY (not a same-lexical sibling).
    const obj = changes.removes[0].object;
    expect(typeof obj).toBe('object');
    expect(obj.value).toBe('42');
    expect(obj.type).toBe('literal');
    expect(obj.datatype).toBe(XSD_INT);
  });

  it('Apply all verified applies the full repair set in one batch', async () => {
    // Two independent contradictions → two removeLink repairs in the hitting set.
    const twoJustifs = [
      [
        { subject: `${EX}i`, predicate: RDF_TYPE, object: `${EX}A` },
        { subject: `${EX}A`, predicate: OWL_DISJOINT, object: `${EX}B` },
        { subject: `${EX}i`, predicate: RDF_TYPE, object: `${EX}B` },
      ],
      [
        { subject: `${EX}j`, predicate: RDF_TYPE, object: `${EX}C` },
        { subject: `${EX}C`, predicate: OWL_DISJOINT, object: `${EX}D` },
        { subject: `${EX}j`, predicate: RDF_TYPE, object: `${EX}D` },
      ],
    ];
    hoisted.rdf.explainInconsistency.mockResolvedValue(twoJustifs);
    hoisted.rdf.validate.mockResolvedValue({ consistent: true, unsatisfiable: [] });
    hoisted.rdf.runShaclValidation.mockResolvedValue({ conforms: true, violations: [], shapeCount: 0 });
    // Each single removal does NOT restore consistency, but the full set does (the scripted reasoner's default).
    hoisted.rdf.applyBatch.mockResolvedValue({ added: 0, removed: 2 });

    render(<RepairSuggestions reasoningId="r2" isConsistent={false} />);

    const applyAllBtn = await screen.findByRole('button', { name: /Apply all verified repairs/i });
    fireEvent.click(applyAllBtn);

    await waitFor(() => {
      expect(hoisted.rdf.applyBatch).toHaveBeenCalled();
    });
    const [changes, graph] = hoisted.rdf.applyBatch.mock.calls[0];
    expect(graph).toBe('urn:vg:data');
    expect(Array.isArray(changes.removes)).toBe(true);
    expect(changes.removes.length).toBe(2);
    expect(changes.adds).toEqual([]);
  });

  it('FIX1: a fast double-click on "Apply fix" applies the repair only once', async () => {
    primeConsistentInconsistency();
    // applyBatch is held open so the second click lands while the first call is
    // still in flight (isApplied has not flipped yet).
    let resolveApply: (v: { added: number; removed: number }) => void = () => {};
    const applyPromise = new Promise<{ added: number; removed: number }>((res) => {
      resolveApply = res;
    });
    hoisted.rdf.applyBatch.mockReturnValue(applyPromise);

    render(<RepairSuggestions reasoningId="rf1" isConsistent={false} />);
    const applyBtn = await screen.findByRole('button', { name: /Apply repair/i });

    // Two rapid clicks before the first applyBatch resolves.
    fireEvent.click(applyBtn);
    fireEvent.click(applyBtn);

    // The in-flight guard rejected the second click synchronously.
    expect(hoisted.rdf.applyBatch).toHaveBeenCalledTimes(1);

    // Resolve the first apply; still exactly one call (no late second fire).
    resolveApply({ added: 0, removed: 1 });
    await waitFor(() => expect(hoisted.toast.success).toHaveBeenCalled());
    expect(hoisted.rdf.applyBatch).toHaveBeenCalledTimes(1);
    // No misleading "matched no triples" warning for a repair that succeeded.
    expect(hoisted.toast.warning).not.toHaveBeenCalled();
  });

  it('FIX1: a fast double-click on "Apply all verified" applies the set only once', async () => {
    const twoJustifs = [
      [
        { subject: `${EX}i`, predicate: RDF_TYPE, object: `${EX}A` },
        { subject: `${EX}A`, predicate: OWL_DISJOINT, object: `${EX}B` },
        { subject: `${EX}i`, predicate: RDF_TYPE, object: `${EX}B` },
      ],
      [
        { subject: `${EX}j`, predicate: RDF_TYPE, object: `${EX}C` },
        { subject: `${EX}C`, predicate: OWL_DISJOINT, object: `${EX}D` },
        { subject: `${EX}j`, predicate: RDF_TYPE, object: `${EX}D` },
      ],
    ];
    hoisted.rdf.explainInconsistency.mockResolvedValue(twoJustifs);
    hoisted.rdf.validate.mockResolvedValue({ consistent: true, unsatisfiable: [] });
    hoisted.rdf.runShaclValidation.mockResolvedValue({ conforms: true, violations: [], shapeCount: 0 });
    let resolveApply: (v: { added: number; removed: number }) => void = () => {};
    const applyPromise = new Promise<{ added: number; removed: number }>((res) => {
      resolveApply = res;
    });
    hoisted.rdf.applyBatch.mockReturnValue(applyPromise);

    render(<RepairSuggestions reasoningId="rf2" isConsistent={false} />);
    const applyAllBtn = await screen.findByRole('button', { name: /Apply all verified repairs/i });

    fireEvent.click(applyAllBtn);
    fireEvent.click(applyAllBtn);

    // Only the first invocation reached applyBatch.
    expect(hoisted.rdf.applyBatch).toHaveBeenCalledTimes(1);
    resolveApply({ added: 0, removed: 2 });
    await waitFor(() => expect(hoisted.toast.success).toHaveBeenCalled());
    expect(hoisted.rdf.applyBatch).toHaveBeenCalledTimes(1);
  });

  it('FIX2: applyAllVerified marks Applied ONLY the repairs actually included in the batch', async () => {
    // Inject a mixed repair set: one real removeLink repair (in the batch) and
    // one inconsistency+!needsManualReview repair that lacks an objectIri (so it
    // is excluded from `removals` and must NOT be marked Applied).
    hoisted.rdf.suggestRepairs.mockResolvedValue({
      consistent: false,
      repairSetVerifiedConsistent: true,
      minimal: true,
      alternativeSets: 0,
      incomplete: false,
      weakenIncomplete: false,
      justifications: [],
      repairs: [
        {
          id: 'R1',
          issue: 'inconsistency',
          action: {
            tool: 'removeLink',
            args: { subjectIri: `${EX}i`, predicateIri: RDF_TYPE, objectIri: `${EX}A` },
          },
          rationale: 'Real repair included in the batch',
          verifiedConsistent: true,
          verifiedSet: true,
        },
        {
          id: 'R2',
          issue: 'inconsistency',
          // inconsistency + !needsManualReview but missing objectIri ⇒ excluded
          // from removals. Under the old broad filter this was wrongly marked Applied.
          action: {
            tool: 'removeLink',
            args: { subjectIri: `${EX}j`, predicateIri: RDF_TYPE },
          },
          rationale: 'Repair NOT applied (missing object)',
        },
      ],
    });

    hoisted.rdf.explainInconsistency.mockResolvedValue([[{ subject: `${EX}i`, predicate: RDF_TYPE, object: `${EX}A` }]]);
    hoisted.rdf.validate.mockResolvedValue({ consistent: true, unsatisfiable: [] });
    hoisted.rdf.runShaclValidation.mockResolvedValue({ conforms: true, violations: [], shapeCount: 0 });
    // Only the single valid removal is in the batch.
    hoisted.rdf.applyBatch.mockResolvedValue({ added: 0, removed: 1 });

    render(<RepairSuggestions reasoningId="rf3" isConsistent={false} />);

    const applyAllBtn = await screen.findByRole('button', { name: /Apply all verified repairs/i });
    fireEvent.click(applyAllBtn);

    await waitFor(() => expect(hoisted.rdf.applyBatch).toHaveBeenCalled());
    const [changes] = hoisted.rdf.applyBatch.mock.calls[0];
    // Only the well-formed repair was sent to the batch.
    expect(changes.removes.length).toBe(1);
    expect(changes.removes[0].subject).toBe(`${EX}i`);

    // R1 (applied) shows "Applied"; R2 (excluded) must NOT — its button stays "Apply fix".
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Apply repair R1/i }).textContent).toMatch(/Applied/);
    });
    expect(screen.getByRole('button', { name: /Apply repair R2/i }).textContent).toMatch(/Apply fix/);
    expect(screen.getByRole('button', { name: /Apply repair R2/i }).textContent).not.toMatch(/Applied/);
  });

  it('shows the consistent/conformant empty state when there are no issues', async () => {
    hoisted.rdf.validate.mockResolvedValue({ consistent: true, unsatisfiable: [] });
    hoisted.rdf.runShaclValidation.mockResolvedValue({ conforms: true, violations: [], shapeCount: 0 });

    render(<RepairSuggestions reasoningId="r3" isConsistent={true} />);

    await waitFor(() => {
      expect(screen.getByText(/No automatic repairs available/i)).toBeTruthy();
    });
    // No inconsistency justification lookup when consistent.
    expect(hoisted.rdf.explainInconsistency).not.toHaveBeenCalled();
  });

  it('renders an axiom-WEAKENING alternative and applies it as a remove+add batch', async () => {
    const RDFS_SUBCLASS = 'http://www.w3.org/2000/01/rdf-schema#subClassOf';
    // A subClassOf culprit: A ⊑ B is the only axiom in the justification.
    const subClassJustif = [
      [{ subject: `${EX}A`, predicate: RDFS_SUBCLASS, object: `${EX}B` }],
    ];
    hoisted.rdf.explainInconsistency.mockResolvedValue(subClassJustif);
    hoisted.rdf.validate.mockResolvedValue({ consistent: true, unsatisfiable: [] });
    hoisted.rdf.runShaclValidation.mockResolvedValue({ conforms: true, violations: [], shapeCount: 0 });
    // The reasoner offers A ⊑ C (C a superclass of B) as a verified weakening of the culprit A ⊑ B.
    const { namedNode, quad } = N3.DataFactory;
    hoisted.fake.opts = {
      weakenings: (culprit) => [{
        strategy: 'generalize',
        remove: culprit.quads,
        add: [quad(namedNode(`${EX}A`), namedNode(RDFS_SUBCLASS), namedNode(`${EX}C`), namedNode('urn:vg:data'))],
        verifiedConsistent: true,
        change: { from: `${EX}B`, to: `${EX}C` },
      }],
    } satisfies FakeRepairOptions;
    // The weakening batch removes A⊑B and adds A⊑C.
    hoisted.rdf.applyBatch.mockResolvedValue({ added: 1, removed: 1 });

    render(<RepairSuggestions reasoningId="rweak" isConsistent={false} />);

    // The weakening repair (id W1) is rendered. Its button's accessible name is
    // the aria-label "Apply repair W1: …"; the visible label is "Apply weakening".
    const weakenBtn = await screen.findByRole('button', { name: /Apply repair W1/i });
    expect(weakenBtn).toBeTruthy();
    expect(weakenBtn.textContent).toMatch(/Apply weakening/);
    // The "Weaken" badge is shown.
    expect(screen.getAllByText(/Weaken/).length).toBeGreaterThan(0);

    fireEvent.click(weakenBtn);

    await waitFor(() => expect(hoisted.rdf.applyBatch).toHaveBeenCalled());
    // The weakening apply is a remove+add batch (NOT a bare removal).
    const batchCall = hoisted.rdf.applyBatch.mock.calls.find(
      (c: [{ removes: unknown[]; adds: unknown[] }]) => c[0].adds && c[0].adds.length > 0,
    );
    expect(batchCall).toBeTruthy();
    const changes = batchCall![0];
    expect(changes.removes[0]).toMatchObject({ subject: `${EX}A`, predicate: RDFS_SUBCLASS, object: `${EX}B` });
    expect(changes.adds[0]).toMatchObject({ subject: `${EX}A`, predicate: RDFS_SUBCLASS, object: `${EX}C` });

    // A success toast with an Undo action (which reverses the batch) was shown.
    await waitFor(() => expect(hoisted.toast.success).toHaveBeenCalled());
    const call = hoisted.toast.success.mock.calls.find((c) => c[1] && c[1].action);
    expect(call).toBeTruthy();
    expect(call![1].action.label).toBe('Undo');

    // Undo re-adds A⊑B and removes A⊑C (the reverse batch).
    hoisted.rdf.applyBatch.mockClear();
    await call![1].action.onClick();
    expect(hoisted.rdf.applyBatch).toHaveBeenCalled();
    const undoChanges = hoisted.rdf.applyBatch.mock.calls[0][0];
    expect(undoChanges.adds[0]).toMatchObject({ subject: `${EX}A`, object: `${EX}B` });
    expect(undoChanges.removes[0]).toMatchObject({ subject: `${EX}A`, object: `${EX}C` });
  });
});
