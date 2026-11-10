// src/mcp/__tests__/repairAdapter.test.ts
// @vitest-environment node
//
// The mapping from the reasoner's repair() / assessEdit() / weaken() results onto RepairSuggestion
// (field mapping table of the repair plan), with a scripted reasoner. The real reasoner is covered
// by repairAdapter.integration.test.ts.
import { describe, it, expect } from 'vitest';
import * as N3 from 'n3';
import type { Axiom, RepairResult } from 'rdf-reasoner-konclude';
import { suggestDeletionRepairs, quadToTriple, SIZE_WEIGHT, type RepairLibrary } from '../tools/repairAdapter';
import { fakeRepairLibrary, tripleToQuad } from './helpers/fakeRepairLibrary';

const { namedNode, blankNode, quad, literal } = N3.DataFactory;
const EX = 'http://ex/';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const OWL_DISJOINT = 'http://www.w3.org/2002/07/owl#disjointWith';
const OWL_CLASS = 'http://www.w3.org/2002/07/owl#Class';
const SUBCLASS = 'http://www.w3.org/2000/01/rdf-schema#subClassOf';
const XSD_INT = 'http://www.w3.org/2001/XMLSchema#integer';
const identity = (q: N3.Quad) => q;

const t = (s: string, p: string, o: string, extra: object = {}) => ({ subject: `${EX}${s}`, predicate: p, object: `${EX}${o}`, ...extra });
const clash = [
  t('i', RDF_TYPE, 'A'),
  t('i', RDF_TYPE, 'B'),
  { subject: `${EX}A`, predicate: OWL_DISJOINT, object: `${EX}B` },
];

describe('suggestDeletionRepairs — mapping to RepairSuggestion', () => {
  it('maps the repair of one clash: id, issue, removeLink action, rationale, coverage, verdicts', async () => {
    const lib = fakeRepairLibrary([clash]);
    const res = await suggestDeletionRepairs({ lib, reskolemize: identity });

    expect(res.consistent).toBe(false);
    expect(res.repairs).toHaveLength(1);
    const r = res.repairs[0];
    expect(r.id).toBe('R1');
    expect(r.issue).toBe('inconsistency');
    expect(r.kind).toBeUndefined(); // a deletion carries no kind
    expect(r.action.tool).toBe('removeLink');
    // least destructive: an ABox assertion, not the disjointWith axiom
    expect(r.action.args).toMatchObject({ subjectIri: `${EX}i`, predicateIri: RDF_TYPE, objectIri: `${EX}A`, graph: 'urn:vg:data', objectTermType: 'NamedNode' });
    expect(r.rationale).toContain('Remove i type A');
    expect(r.rationale).toContain('an ABox/assertion');
    expect(r.rationale).toContain('resolves contradiction 1');
    expect(r.justificationsCovered).toEqual([0]);
    expect(r.verifiedConsistent).toBe(true); // one axiom: the set verdict
    expect(r.verifiedSet).toBe(true);
    expect(r.minimalityVerified).toBe(true);
    expect(res.repairSetVerifiedConsistent).toBe(true);
    expect(res.minimal).toBe(true);
    expect(res.incomplete).toBe(false);
  });

  it('carries the literal datatype, language and graph of the axiom into action.args', async () => {
    const lit = { subject: `${EX}i`, predicate: `${EX}age`, object: '42', objectTermType: 'Literal', objectDatatype: XSD_INT, graph: 'urn:vg:ontologies' };
    const lang = { subject: `${EX}j`, predicate: `${EX}name`, object: 'Hund', objectTermType: 'Literal', objectLanguage: 'de' };
    const res = await suggestDeletionRepairs({ lib: fakeRepairLibrary([[lit], [lang]]), reskolemize: identity });
    const byS = (s: string) => res.repairs.find((r) => r.action.args.subjectIri === s)!;
    expect(byS(`${EX}i`).action.args).toMatchObject({ objectIri: '42', objectTermType: 'Literal', objectDatatype: XSD_INT, graph: 'urn:vg:ontologies' });
    expect(byS(`${EX}j`).action.args).toMatchObject({ objectIri: 'Hund', objectTermType: 'Literal', objectLanguage: 'de' });
  });

  it('translates reasoner blank nodes back to the stored skolem IRIs', async () => {
    const bq = quad(namedNode(`${EX}A`), namedNode(SUBCLASS), blankNode('r1'), namedNode('urn:vg:data'));
    const lib: RepairLibrary = {
      repair: async () => ({
        consistent: false,
        justifications: [{ axioms: [{ principal: bq, quads: [bq] }], context: [] }],
        repairs: [{ remove: [{ principal: bq, quads: [bq] }], covers: [0], verifiedConsistent: true, minimal: true }],
        incomplete: false,
      } as RepairResult),
      assessEdit: async () => ({ consistent: true, lostDisjointPairs: [], pairsChecked: [], unmatchedRemovals: [], incomplete: false }),
      weaken: async () => ({ weakenings: [], incomplete: false }),
    };
    const reskolemize = (q: N3.Quad) =>
      quad(q.subject, q.predicate, q.object.termType === 'BlankNode' ? namedNode(`urn:vg:bnode:${q.object.value}`) : q.object, q.graph);
    const res = await suggestDeletionRepairs({ lib, reskolemize, weaken: false });
    expect(res.repairs[0].action.args.objectIri).toBe('urn:vg:bnode:r1');
    expect(res.justifications[0][0].object).toBe('urn:vg:bnode:r1');
  });

  it('numbers the repairs of several clashes and ranks by coverage, destructiveness, then key', async () => {
    // axiom X is in both justifications (covers 2); the others cover one each
    const shared = t('x', RDF_TYPE, 'Shared');
    const j1 = [shared, t('a', RDF_TYPE, 'A1')];
    const j2 = [shared, t('b', RDF_TYPE, 'B1')];
    const j3 = [t('c', RDF_TYPE, 'C1'), t('c', RDF_TYPE, 'C2')];
    const res = await suggestDeletionRepairs({ lib: fakeRepairLibrary([j1, j2, j3]), reskolemize: identity });
    expect(res.repairs.map((r) => r.id)).toEqual(['R1', 'R2']);
    expect(res.repairs[0].action.args.objectIri).toBe(`${EX}Shared`);
    expect(res.repairs[0].justificationsCovered).toEqual([0, 1]);
    expect(res.repairs[0].rationale).toContain('resolves 2 of the 3 contradictions');
    expect(res.repairs[1].justificationsCovered).toEqual([2]);
  });

  it('computes coverage against the justifications the caller shows', async () => {
    const shown = [[t('z', RDF_TYPE, 'Other')], clash];
    const res = await suggestDeletionRepairs({ lib: fakeRepairLibrary([clash]), reskolemize: identity, justifications: shown });
    expect(res.repairs[0].justificationsCovered).toEqual([1]);
  });

  it('with several axioms: one consistency check per axiom plus one for the whole set', async () => {
    const lib = fakeRepairLibrary([[t('a', RDF_TYPE, 'A')], [t('b', RDF_TYPE, 'B')]]);
    const res = await suggestDeletionRepairs({ lib, reskolemize: identity });
    expect(res.repairs).toHaveLength(2);
    expect(lib.calls.assessEdit.map((c) => c.remove.length).sort()).toEqual([1, 1, 2]);
    // pairs: [] keeps assessEdit to a consistency check (no disjointness probes)
    for (const c of lib.calls.assessEdit) expect(c.opts).toEqual({ pairs: [] });
    for (const r of res.repairs) expect(r.verifiedConsistent).toBe(false); // alone, the other clash remains
    expect(res.repairSetVerifiedConsistent).toBe(true);
    for (const r of res.repairs) expect(r.verifiedSet).toBe(true);
  });

  it('with one axiom the set verdict is its verdict (no extra per-axiom check)', async () => {
    const lib = fakeRepairLibrary([clash]);
    await suggestDeletionRepairs({ lib, reskolemize: identity });
    expect(lib.calls.assessEdit).toHaveLength(1); // only the set-level match check
  });

  it('leaves verdict fields unset when the reasoner did not verify', async () => {
    const res = await suggestDeletionRepairs({ lib: fakeRepairLibrary([clash], { setVerified: null }), reskolemize: identity });
    expect(res.repairSetVerifiedConsistent).toBeNull();
    expect(res.repairs[0].verifiedSet).toBeUndefined();
    expect(res.repairs[0].verifiedConsistent).toBeUndefined();
  });

  it('warns when requested removals matched no quad of the store', async () => {
    const res = await suggestDeletionRepairs({ lib: fakeRepairLibrary([clash], { unmatchedRemovals: true }), reskolemize: identity });
    expect(res.repairSetMatchWarning).toContain('Only 0 of 1');
  });

  it('gives a manual-review marker for an empty justification', async () => {
    const res = await suggestDeletionRepairs({ lib: fakeRepairLibrary([clash, []]), reskolemize: identity });
    const marker = res.repairs.find((r) => r.needsManualReview)!;
    expect(marker.justificationsCovered).toEqual([1]);
    expect(marker.rationale).toContain('Contradiction 2');
    expect(marker.id).toBe('R2');
  });

  it('gives manual-review markers, with the reason, when the reasoner found no repair set', async () => {
    const lib: RepairLibrary = {
      repair: async () => ({
        consistent: false, justifications: [], repairs: [], incomplete: true, reason: 'deadline',
      } as RepairResult),
      assessEdit: async () => { throw new Error('unused'); },
      weaken: async () => ({ weakenings: [], incomplete: false }),
    };
    const res = await suggestDeletionRepairs({ lib, reskolemize: identity });
    expect(res.incomplete).toBe(true);
    expect(res.reason).toBe('deadline');
    expect(res.repairs).toHaveLength(1);
    expect(res.repairs[0].needsManualReview).toBe(true);
    expect(res.repairs[0].rationale).toContain('deadline');
  });

  it('returns nothing for a consistent store', async () => {
    const res = await suggestDeletionRepairs({ lib: fakeRepairLibrary([]), reskolemize: identity });
    expect(res.consistent).toBe(true);
    expect(res.repairs).toEqual([]);
  });

  it('notes an axiom stored in several graphs', async () => {
    const q1 = tripleToQuad({ subject: `${EX}A`, predicate: OWL_DISJOINT, object: `${EX}B`, graph: 'urn:vg:data' });
    const q2 = tripleToQuad({ subject: `${EX}A`, predicate: OWL_DISJOINT, object: `${EX}B`, graph: 'urn:vg:ontologies' });
    const ax: Axiom = { principal: q1, quads: [q1, q2] };
    const lib: RepairLibrary = {
      repair: async () => ({ consistent: false, justifications: [{ axioms: [ax], context: [] }], repairs: [{ remove: [ax], covers: [0], verifiedConsistent: true, minimal: true }], incomplete: false } as RepairResult),
      assessEdit: async () => ({ consistent: true, lostDisjointPairs: [], pairsChecked: [], unmatchedRemovals: [], incomplete: false }),
      weaken: async () => ({ weakenings: [], incomplete: false }),
    };
    const res = await suggestDeletionRepairs({ lib, reskolemize: identity, weaken: false });
    expect(res.repairs[0].rationale).toContain('stored in 2 graphs');
  });
});

describe('suggestDeletionRepairs — seed justifications', () => {
  const seed = [{ axioms: clash.map((c) => { const q = tripleToQuad(c); return { principal: q, quads: [q] }; }), context: [] }];

  it('hands the known justifications to repair() so it can skip its first explanation round', async () => {
    const lib = fakeRepairLibrary([clash]);
    await suggestDeletionRepairs({ lib, reskolemize: identity, seed });
    expect((lib.calls.repair[0] as { justifications?: unknown }).justifications).toBe(seed);
  });

  it('omits the option without a seed, or with an empty one', async () => {
    const lib = fakeRepairLibrary([clash]);
    await suggestDeletionRepairs({ lib, reskolemize: identity });
    await suggestDeletionRepairs({ lib, reskolemize: identity, seed: [] });
    for (const call of lib.calls.repair) expect(call).not.toHaveProperty('justifications');
  });
});

describe('suggestDeletionRepairs — cost policy (decision D3: size dominates)', () => {
  it('passes the cost function and options to the reasoner', async () => {
    const lib = fakeRepairLibrary([clash]);
    await suggestDeletionRepairs({ lib, reskolemize: identity, maxJustifications: 5, timeoutMs: 1234 });
    expect(lib.calls.repair[0]).toMatchObject({ maxJustifications: 5, timeout: 1234 });
    expect(typeof lib.calls.repair[0].cost).toBe('function');
  });

  it('orders a smaller set before a larger one whatever the policy terms say', async () => {
    const lib = fakeRepairLibrary([clash]);
    await suggestDeletionRepairs({ lib, reskolemize: identity, unsatisfiableClasses: [`${EX}Unsat`] });
    const cost = lib.calls.repair[0].cost!;
    const ax = (s: string, p: string, o: string): Axiom => { const q = tripleToQuad({ subject: `${EX}${s}`, predicate: p, object: `${EX}${o}` }); return { principal: q, quads: [q] }; };
    const abox = cost(ax('i', RDF_TYPE, 'A'));
    const tbox = cost(ax('A', OWL_DISJOINT, 'B'));
    const decl = cost(ax('A', RDF_TYPE, 'Class') && { principal: quad(namedNode(`${EX}A`), namedNode(RDF_TYPE), namedNode(OWL_CLASS)), quads: [] });
    // among equal sizes: assertion < schema axiom < declaration
    expect(abox).toBeLessThan(tbox);
    expect(tbox).toBeLessThan(decl);
    // one schema axiom is cheaper than two assertions: size first
    expect(tbox).toBeLessThan(2 * abox);
    expect(abox).toBeGreaterThanOrEqual(SIZE_WEIGHT);
    // touching an unsatisfiable class breaks ties between same-kind axioms
    expect(cost(ax('Unsat', OWL_DISJOINT, 'B'))).toBeLessThan(cost(ax('A', OWL_DISJOINT, 'B')));
  });
});

describe('suggestDeletionRepairs — weakening', () => {
  const culpritQuad = tripleToQuad({ subject: `${EX}Penguin`, predicate: SUBCLASS, object: `${EX}Mammal` });
  const j = [
    t('tweety', RDF_TYPE, 'Penguin'),
    t('Penguin', SUBCLASS, 'Mammal'),
    t('Penguin', SUBCLASS, 'Bird'),
    { subject: `${EX}Mammal`, predicate: OWL_DISJOINT, object: `${EX}Bird` },
  ];
  const generalize = (culprit: Axiom) => ({
    strategy: 'generalize' as const,
    remove: culprit.quads,
    add: [tripleToQuad({ subject: `${EX}Penguin`, predicate: SUBCLASS, object: `${EX}Animal` })],
    verifiedConsistent: true,
    change: { from: `${EX}Mammal`, to: `${EX}Animal` },
  });

  it('maps a verified weakening onto the weaken fields and drops the delete strategy', async () => {
    const lib = fakeRepairLibrary([j], {
      weakenings: (c) => c.principal.object.value === `${EX}Mammal`
        ? [generalize(c), { strategy: 'delete', remove: c.quads, add: [], verifiedConsistent: true }]
        : [],
    });
    const res = await suggestDeletionRepairs({ lib, reskolemize: identity });
    const w = res.repairs.filter((r) => r.kind === 'weaken');
    expect(w).toHaveLength(1); // 'delete' dropped: the deletion repair is that
    expect(w[0].id).toBe('W1');
    expect(w[0].issue).toBe('inconsistency');
    expect(w[0].alternativeTo).toBe(res.repairs.find((r) => r.kind !== 'weaken')!.id);
    expect(w[0].batch).toEqual({
      removes: [{ subject: `${EX}Penguin`, predicate: SUBCLASS, object: `${EX}Mammal`, graph: 'urn:vg:data' }],
      adds: [{ subject: `${EX}Penguin`, predicate: SUBCLASS, object: `${EX}Animal`, graph: 'urn:vg:data' }],
    });
    expect(w[0].weakerThan).toBe('Penguin ⊑ Mammal');
    expect(w[0].rationale).toContain('Penguin ⊑ Mammal to Penguin ⊑ Animal');
    expect(w[0].rationale).toContain('logically weaker');
    // action removes the culprit, so an apply path that only knows `action` still removes it
    expect(w[0].action.args).toMatchObject({ subjectIri: `${EX}Penguin`, predicateIri: SUBCLASS, objectIri: `${EX}Mammal` });
    expect(w[0].weakeningVerified).toBe(true);
    expect(w[0].weakeningNote).toContain('Verified by the reasoner');
    expect(w[0].justificationsCovered).toBeDefined();
    expect(res.weakenIncomplete).toBe(false);
  });

  it('calls weaken once per distinct subClassOf culprit of the justifications', async () => {
    const lib = fakeRepairLibrary([j, j]);
    await suggestDeletionRepairs({ lib, reskolemize: identity });
    expect(lib.calls.weaken.map((a) => a.principal.object.value).sort()).toEqual([`${EX}Bird`, `${EX}Mammal`]);
  });

  it('puts weakenings after deletions and manual-review markers', async () => {
    const lib = fakeRepairLibrary([j, []], { weakenings: (c) => [generalize(c)] });
    const res = await suggestDeletionRepairs({ lib, reskolemize: identity });
    const kinds = res.repairs.map((r) => (r.kind === 'weaken' ? 'W' : r.needsManualReview ? 'M' : 'R'));
    expect(kinds.join('')).toMatch(/^R+M?W+$/);
  });

  it('offers no weakening when weaken is switched off', async () => {
    const lib = fakeRepairLibrary([j], { weakenings: (c) => [generalize(c)] });
    const res = await suggestDeletionRepairs({ lib, reskolemize: identity, weaken: false });
    expect(lib.calls.weaken).toHaveLength(0);
    expect(res.repairs.some((r) => r.kind === 'weaken')).toBe(false);
  });

  it('flags the result when a weakening search fails, keeping the deletions', async () => {
    const base = fakeRepairLibrary([j]);
    const lib: RepairLibrary = { ...base, weaken: async () => { throw new Error('down'); } };
    const res = await suggestDeletionRepairs({ lib, reskolemize: identity });
    expect(res.weakenIncomplete).toBe(true);
    expect(res.repairs.some((r) => r.kind !== 'weaken')).toBe(true);
  });

  it('quadToTriple keeps literal datatype and language', () => {
    const q = quad(namedNode(`${EX}s`), namedNode(`${EX}p`), literal('7', namedNode(XSD_INT)), namedNode('urn:vg:data'));
    expect(quadToTriple(q)).toEqual({ subject: `${EX}s`, predicate: `${EX}p`, object: '7', objectTermType: 'Literal', objectDatatype: XSD_INT, graph: 'urn:vg:data' });
    const l = quad(namedNode(`${EX}s`), namedNode(`${EX}p`), literal('x', 'en'));
    expect(quadToTriple(l)).toMatchObject({ objectLanguage: 'en' });
    expect(quadToTriple(l).graph).toBeUndefined();
  });
});
