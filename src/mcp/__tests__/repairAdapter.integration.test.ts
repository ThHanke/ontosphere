// src/mcp/__tests__/repairAdapter.integration.test.ts
// @vitest-environment node
//
// The repair adapter against the REAL Konclude reasoner: repair() and weaken() of
// rdf-reasoner-konclude (>= 0.9.0) mapped onto RepairSuggestion by suggestDeletionRepairs.
// These carry the assertions of computeRepairs.integration and explainDiagnostics.integration
// over to the path the app now uses (the reasoner finds, verifies and weakens; the adapter maps).
//
// REQUIRE_KONCLUDE gating: with the env var set a reasoner init failure FAILS the test; without it
// the failure is logged and the reasoner assertions are skipped (never a silent green).
import { describe, it, expect } from 'vitest';
import { RdfReasoner } from 'rdf-reasoner-konclude';
import * as N3 from 'n3';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { suggestDeletionRepairs, type RepairLibrary, type SuggestRepairsResult } from '../tools/repairAdapter';
import { buildRepairBrief, type DiagnosticsData } from '../tools/diagnosticsBrief';
import { reskolemizeQuad } from '../../workers/rdfManager.runtime';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REQUIRE_KONCLUDE = !!process.env.REQUIRE_KONCLUDE;

async function initReasonerOrSkip(): Promise<RdfReasoner | undefined> {
  try {
    const r = new RdfReasoner();
    await r.ready;
    return r;
  } catch (e) {
    if (REQUIRE_KONCLUDE) {
      throw new Error(`REQUIRE_KONCLUDE is set but the Konclude reasoner failed to initialise: ${String(e)}`);
    }
    console.warn('[TEST][SKIP] Konclude WASM unavailable and REQUIRE_KONCLUDE not set — skipping:', String(e));
    return undefined;
  }
}

function parseTtl(ttl: string): N3.Store {
  const store = new N3.Store();
  store.addQuads(new N3.Parser({ format: 'text/turtle' }).parse(ttl));
  return store;
}

const loadPublic = (file: string) => parseTtl(fs.readFileSync(path.resolve(__dirname, '../../../public', file), 'utf-8'));

/** The reasoner calls of the adapter, over a store whose terms need no skolem translation. */
const realLib = (r: RdfReasoner, store: N3.Store): RepairLibrary => ({
  repair: (o) => r.repair(store, o),
  assessEdit: (e, o) => r.assessEdit(store, e, o),
  weaken: (c, o) => r.weaken(store, c, o),
});

const quadKey = (s: string, p: string, o: string) => `${s} ${p} ${o}`;
const identity = (q: N3.Quad) => q;

const FIXTURE_SINGLE = `
@prefix ex:   <http://example.org/> .
@prefix owl:  <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

ex:Animal  a owl:Class .
ex:Mammal  a owl:Class .
ex:Bird    a owl:Class .
ex:Penguin a owl:Class .

ex:Mammal  rdfs:subClassOf ex:Animal .
ex:Bird    rdfs:subClassOf ex:Animal .
ex:Penguin rdfs:subClassOf ex:Bird .

ex:Mammal  owl:disjointWith ex:Bird .
ex:Penguin rdfs:subClassOf ex:Mammal .

ex:tweety a ex:Penguin .
`;

// A weakening that keeps something: x is an A and a D, A ⊑ B, B disjoint D. Weakening A ⊑ B to
// A ⊑ C (B ⊑ C) leaves the ontology consistent and no other axiom already gives A ⊑ C.
const FIXTURE_WEAKEN = `
@prefix ex:   <http://example.org/> .
@prefix owl:  <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

ex:A a owl:Class . ex:B a owl:Class . ex:C a owl:Class . ex:D a owl:Class .
ex:A rdfs:subClassOf ex:B .
ex:B rdfs:subClassOf ex:C .
ex:B owl:disjointWith ex:D .
ex:x a ex:A , ex:D .
`;

const FIXTURE_TWO_CLASHES = `
@prefix ex:  <http://example.org/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .

ex:A a owl:Class . ex:B a owl:Class . ex:P a owl:Class . ex:Q a owl:Class .
ex:A owl:disjointWith ex:B .
ex:P owl:disjointWith ex:Q .
ex:frank a ex:A , ex:B .
ex:gina  a ex:P , ex:Q .
`;

const FIXTURE_CONSISTENT = `
@prefix ex:   <http://example.org/> .
@prefix owl:  <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

ex:Animal a owl:Class .
ex:Bird   a owl:Class .
ex:Bird   rdfs:subClassOf ex:Animal .
ex:tweety a ex:Bird .
`;

/** Removing `triples` from the store: is the rest consistent? (an independent oracle for the assertions) */
async function consistentWithout(r: RdfReasoner, store: N3.Store, keys: Set<string>): Promise<boolean> {
  const copy = new N3.Store();
  for (const q of store.getQuads(null, null, null, null)) {
    if (keys.has(quadKey(q.subject.value, q.predicate.value, q.object.value))) continue;
    copy.addQuad(q);
  }
  return r.checkConsistency(copy);
}

const deletions = (res: SuggestRepairsResult) =>
  res.repairs.filter((x) => x.issue === 'inconsistency' && x.kind !== 'weaken' && !x.needsManualReview);
const weakenings = (res: SuggestRepairsResult) => res.repairs.filter((x) => x.kind === 'weaken');
const keyOf = (rep: SuggestRepairsResult['repairs'][number]) =>
  quadKey(rep.action.args.subjectIri!, rep.action.args.predicateIri!, rep.action.args.objectIri!);

describe('repair adapter — real Konclude integration', () => {
  it('top repair targets a justification axiom and is verified consistent (reasoning-demo-inconsistent.ttl)', async () => {
    const r = await initReasonerOrSkip();
    if (!r) return;
    try {
      const store = loadPublic('reasoning-demo-inconsistent.ttl');
      const res = await suggestDeletionRepairs({ lib: realLib(r, store), reskolemize: identity });
      expect(res.consistent).toBe(false);
      const reps = deletions(res);
      expect(reps.length).toBeGreaterThanOrEqual(1);
      expect(res.justifications.length).toBeGreaterThanOrEqual(1);

      // The repair set covers every justification.
      const covered = new Set<number>();
      reps.forEach((rep) => rep.justificationsCovered?.forEach((j) => covered.add(j)));
      res.justifications.forEach((_, i) => expect(covered.has(i)).toBe(true));

      // Every repair targets an axiom that appears in a justification.
      const inJustification = new Set(res.justifications.flat().map((a) => quadKey(a.subject, a.predicate, a.object)));
      for (const rep of reps) expect(inJustification.has(keyOf(rep))).toBe(true);

      // The reasoner's verdict, and an independent check: the store without the whole set is consistent.
      expect(res.repairSetVerifiedConsistent).toBe(true);
      expect(await consistentWithout(r, store, new Set(reps.map(keyOf)))).toBe(true);
    } finally {
      r.terminate();
    }
  }, 120000);

  it('consistent fixture yields no repairs', async () => {
    const r = await initReasonerOrSkip();
    if (!r) return;
    try {
      const res = await suggestDeletionRepairs({ lib: realLib(r, parseTtl(FIXTURE_CONSISTENT)), reskolemize: identity });
      expect(res.consistent).toBe(true);
      expect(res.repairs).toEqual([]);
      expect(res.repairSetVerifiedConsistent).toBeNull();
    } finally {
      r.terminate();
    }
  }, 60000);

  it('two disjoint contradictions: per-axiom verification is false but the full repair set verifies true', async () => {
    const r = await initReasonerOrSkip();
    if (!r) return;
    try {
      const store = parseTtl(FIXTURE_TWO_CLASHES);
      const res = await suggestDeletionRepairs({ lib: realLib(r, store), reskolemize: identity, maxJustifications: 5 });
      const reps = deletions(res);
      expect(reps.length).toBeGreaterThanOrEqual(2);

      // Each alone leaves the other clash in place.
      for (const rep of reps) {
        expect(rep.verifiedConsistent).toBe(false);
        expect(await consistentWithout(r, store, new Set([keyOf(rep)]))).toBe(false);
      }
      // Together they restore consistency; the reasoner says so and so does the independent check.
      expect(res.repairSetVerifiedConsistent).toBe(true);
      for (const rep of reps) expect(rep.verifiedSet).toBe(true);
      expect(await consistentWithout(r, store, new Set(reps.map(keyOf)))).toBe(true);
      // A weakening is offered only when removing the culprit alone restores consistency.
      expect(weakenings(res)).toHaveLength(0);
    } finally {
      r.terminate();
    }
  }, 120000);

  it('full pipeline: repairs, weakenings, set verification, minimality and brief', async () => {
    const r = await initReasonerOrSkip();
    if (!r) return;
    try {
      const store = parseTtl(FIXTURE_WEAKEN);
      const res = await suggestDeletionRepairs({ lib: realLib(r, store), reskolemize: identity, namespaces: { ex: 'http://example.org/' }, maxJustifications: 5 });
      const dels = deletions(res);
      expect(dels.length).toBeGreaterThanOrEqual(1);

      // Weakenings: the reasoner's verified replacements for subClassOf culprits.
      const weak = weakenings(res);
      expect(weak.length).toBeGreaterThanOrEqual(1);
      for (const w of weak) {
        expect(w.alternativeTo).toBeTruthy();
        expect(w.batch?.removes.length).toBeGreaterThanOrEqual(1);
        expect(w.weakerThan).toBeTruthy();
        expect(w.weakeningVerified).toBe(true);
        expect(w.weakeningNote).toContain('Verified by the reasoner');
        // never the 'delete' strategy: a weakening keeps something
        expect(w.batch!.adds.length).toBeGreaterThanOrEqual(1);
      }
      // The generalisation A ⊑ B -> A ⊑ C is among them.
      expect(weak.some((w) => w.rationale.includes('ex:A ⊑ ex:B to ex:A ⊑ ex:C') && w.rationale.includes('logically weaker'))).toBe(true);
      // Each weakening is tied to a deletion repair that exists.
      for (const w of weak) expect(res.repairs.some((d) => d.id === w.alternativeTo && d.kind !== 'weaken')).toBe(true);

      // Set verification and minimality come from the reasoner.
      expect(res.repairSetVerifiedConsistent).toBe(true);
      expect(res.minimal).toBe(true);
      for (const d of dels) expect(d.minimalityVerified).toBe(true);

      // The weakening's batch applied to a copy leaves the store consistent (independent oracle).
      const w0 = weak[0];
      const copy = new N3.Store();
      const removeKeys = new Set(w0.batch!.removes.map((t) => quadKey(t.subject, t.predicate, t.object)));
      for (const q of store.getQuads(null, null, null, null)) {
        if (!removeKeys.has(quadKey(q.subject.value, q.predicate.value, q.object.value))) copy.addQuad(q);
      }
      for (const t of w0.batch!.adds) {
        copy.addQuad(N3.DataFactory.quad(N3.DataFactory.namedNode(t.subject), N3.DataFactory.namedNode(t.predicate), N3.DataFactory.namedNode(t.object), N3.DataFactory.namedNode('urn:vg:data')));
      }
      expect(await r.checkConsistency(copy)).toBe(true);

      // Every deletion targets a justification axiom, and the brief is produced.
      const inJustification = new Set(res.justifications.flat().map((a) => quadKey(a.subject, a.predicate, a.object)));
      for (const d of dels) expect(inJustification.has(keyOf(d))).toBe(true);
      const diagnostics: DiagnosticsData = {
        isConsistent: false, justifications: res.justifications, unsatisfiableClasses: [],
        profile: { owl2dl: true, violations: [] }, shaclViolations: [],
      };
      const brief = buildRepairBrief(diagnostics, res.repairs, { repairSetVerifiedConsistent: res.repairSetVerifiedConsistent });
      expect(brief).toContain('inconsisten');
      expect(brief).toContain('[weaken]');
    } finally {
      r.terminate();
    }
  }, 120000);

  it('a generalisation that other axioms already entail is not offered (Penguin ⊑ Mammal -> Penguin ⊑ Animal)', async () => {
    // Penguin ⊑ Bird ⊑ Animal already holds, so the reasoner's only weakening of Penguin ⊑ Mammal is
    // deleting it, which the deletion repair already is: no W repair, and 'delete' never leaks out.
    const r = await initReasonerOrSkip();
    if (!r) return;
    try {
      const res = await suggestDeletionRepairs({ lib: realLib(r, parseTtl(FIXTURE_SINGLE)), reskolemize: identity, maxJustifications: 5 });
      expect(deletions(res).length).toBeGreaterThanOrEqual(1);
      for (const w of weakenings(res)) expect(w.batch!.adds.length).toBeGreaterThanOrEqual(1);
      expect(weakenings(res)).toHaveLength(0);
      expect(res.repairSetVerifiedConsistent).toBe(true);
    } finally {
      r.terminate();
    }
  }, 120000);

  it('degrades: the weakening search failing leaves the deletion repairs, flagged incomplete', async () => {
    const r = await initReasonerOrSkip();
    if (!r) return;
    try {
      const store = parseTtl(FIXTURE_WEAKEN);
      const lib: RepairLibrary = { ...realLib(r, store), weaken: async () => { throw new Error('oracle down'); } };
      const res = await suggestDeletionRepairs({ lib, reskolemize: identity });
      expect(weakenings(res)).toHaveLength(0);
      expect(res.weakenIncomplete).toBe(true);
      expect(deletions(res).length).toBeGreaterThanOrEqual(1);
      expect(res.repairSetVerifiedConsistent).toBe(true);
    } finally {
      r.terminate();
    }
  }, 120000);

  it('degrades: the per-axiom check failing leaves verifiedConsistent undefined, the set verdict stands', async () => {
    const r = await initReasonerOrSkip();
    if (!r) return;
    try {
      const store = parseTtl(FIXTURE_TWO_CLASHES);
      const lib: RepairLibrary = { ...realLib(r, store), assessEdit: async () => { throw new Error('oracle down'); } };
      const res = await suggestDeletionRepairs({ lib, reskolemize: identity, maxJustifications: 5 });
      const reps = deletions(res);
      expect(reps.length).toBeGreaterThanOrEqual(2);
      for (const rep of reps) expect(rep.verifiedConsistent).toBeUndefined();
      expect(res.repairSetVerifiedConsistent).toBe(true);
    } finally {
      r.terminate();
    }
  }, 120000);

  it('blank nodes: justifications come back in the store form (urn:vg:bnode:*), the reasoner saw blank nodes', async () => {
    const r = await initReasonerOrSkip();
    if (!r) return;
    try {
      // The store keeps blank nodes as skolem IRIs. A restriction is several triples; the
      // reasoner must see it with blank nodes, the suggestions must show it with skolem IRIs.
      const SK = 'urn:vg:bnode:';
      const ttl = `
@prefix ex:  <http://example.org/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
ex:A a owl:Class . ex:B a owl:Class . ex:p a owl:ObjectProperty .
ex:B owl:disjointWith ex:B .
ex:A rdfs:subClassOf <${SK}r1> .
<${SK}r1> a owl:Restriction ; owl:onProperty ex:p ; owl:someValuesFrom ex:B .
ex:x a ex:A .
`;
      const store = parseTtl(ttl);
      const base = () => store;
      const lib: RepairLibrary = {
        repair: (o) => r.repair(base(), o),
        assessEdit: (e, o) => r.assessEdit(base(), e, o),
        weaken: (c, o) => r.weaken(base(), c, o),
      };
      const res = await suggestDeletionRepairs({ lib, reskolemize: reskolemizeQuad });
      expect(res.consistent).toBe(false);
      const all = res.justifications.flat();
      // restriction triples appear under the stored skolem IRI, never as blank nodes
      expect(all.some((t) => t.subject === `${SK}r1` || t.object === `${SK}r1`)).toBe(true);
      expect(all.every((t) => !t.subject.startsWith('_:') && !t.object.startsWith('_:'))).toBe(true);
      expect(all.every((t) => t.objectTermType !== 'BlankNode')).toBe(true);
      expect(res.repairSetVerifiedConsistent).toBe(true);
    } finally {
      r.terminate();
    }
  }, 120000);
});
