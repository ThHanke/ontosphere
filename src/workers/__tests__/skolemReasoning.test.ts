// @vitest-environment node
//
// The store keeps blank nodes skolemized as urn:vg:bnode:* IRIs. Class expressions built from
// blank nodes (restrictions, intersections, lists) must reach the reasoner as blank nodes, or
// nothing they define is inferred, and reasoner output must come back in the stored form.
//
// OntoAuthor-Mat T2: FiberReinforced ≡ Composite ⊓ ∃hasConstituent.Fiber, and CFRP is a
// Composite with a Fiber constituent. Skolemized, the reasoner derives no FiberReinforced.
import { describe, it, expect } from 'vitest';
import * as N3 from 'n3';
import fs from 'node:fs';
import path from 'node:path';
import { RdfReasoner } from 'rdf-reasoner-konclude';
import { reasoningBase, reskolemizeQuad } from '../rdfManager.runtime.ts';

const { namedNode: nn, blankNode: bn, quad } = N3.DataFactory;
const M = 'http://example.org/materials#';
const TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const SKOLEM = 'urn:vg:bnode:';

/** What the store does on load: every blank node becomes a urn:vg:bnode: IRI. */
function skolemized(quads: N3.Quad[]): N3.Store {
  const sk = (t: N3.Term) => (t.termType === 'BlankNode' ? nn(`${SKOLEM}${t.value}`) : t);
  return new N3.Store(quads.map((q) =>
    quad(sk(q.subject) as N3.Quad_Subject, q.predicate, sk(q.object) as N3.Quad_Object, nn('urn:vg:data'))));
}

describe('blank nodes around the reasoner', () => {
  it('reasoningBase restores skolem IRIs to blank nodes and leaves other terms alone', () => {
    const store = new N3.Store([
      quad(nn(`${SKOLEM}abc123`), nn(TYPE), nn('http://www.w3.org/2002/07/owl#Restriction'), nn('urn:vg:data')),
      quad(nn(`${M}A`), nn('http://www.w3.org/2002/07/owl#equivalentClass'), nn(`${SKOLEM}abc123`), nn('urn:vg:data')),
    ]);
    const base = reasoningBase(store).getQuads(null, null, null, null);
    expect(base.map((q) => q.subject.termType).sort()).toEqual(['BlankNode', 'NamedNode']);
    expect(base.find((q) => q.subject.termType === 'BlankNode')!.subject.value).toBe('abc123');
    expect(base.find((q) => q.subject.value === `${M}A`)!.object).toEqual(bn('abc123'));
  });

  it('reskolemizeQuad maps reasoner blank nodes back to the stored IRIs', () => {
    const back = reskolemizeQuad(quad(nn(`${M}A`), nn(TYPE), bn('abc123')));
    expect(back.object).toEqual(nn(`${SKOLEM}abc123`));
    const untouched = quad(nn(`${M}A`), nn(TYPE), nn(`${M}B`));
    expect(reskolemizeQuad(untouched)).toBe(untouched);
  });

  it('a class expression loaded through the store is reasoned over', async (ctx) => {
    let reasoner: RdfReasoner;
    try {
      reasoner = new RdfReasoner();
      await reasoner.ready;
    } catch (e) {
      if (process.env.REQUIRE_KONCLUDE) throw e;
      console.warn('[TEST][SKIP] Konclude unavailable:', String(e));
      return ctx.skip();
    }
    const ttl = fs.readFileSync(path.resolve(__dirname, '../../../benchmarks/ontoauthor-mat/t2-existential/reference.ttl'), 'utf8');
    const store = skolemized(new N3.Parser().parse(ttl));
    const hasType = (s: N3.Store) =>
      s.getQuads(nn(`${M}CFRP`), nn(TYPE), nn(`${M}FiberReinforced`), nn('urn:vg:inferred')).length > 0;

    const base = reasoningBase(store);
    await reasoner.materialize(base, { includeClassHierarchy: true, inferredGraph: 'urn:vg:inferred', returnDelta: true });
    expect(hasType(base), 'de-skolemized base infers CFRP a FiberReinforced').toBe(true);
    reasoner.terminate();
  }, 120_000);
});
