// @vitest-environment node
//
// The store keeps blank nodes skolemized as urn:vg:bnode:* IRIs. Class expressions built from
// blank nodes (restrictions, intersections, lists) reach the reasoner either as blank nodes
// (reasoningBase) or, since rdf-reasoner-konclude 0.9.2, directly as the stored skolem IRIs;
// reasoner output must come back in the stored form.
//
// OntoAuthor-Mat T2: FiberReinforced ≡ Composite ⊓ ∃hasConstituent.Fiber, and CFRP is a
// Composite with a Fiber constituent, so CFRP is a FiberReinforced.
import { describe, it, expect } from 'vitest';
import * as N3 from 'n3';
import fs from 'node:fs';
import path from 'node:path';
import { RdfReasoner } from 'rdf-reasoner-konclude';
import { reskolemizeQuad } from '../rdfManager.runtime.ts';

const { namedNode: nn, blankNode: bn, quad } = N3.DataFactory;
const M = 'http://example.org/materials#';
const TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const SKOLEM = 'urn:vg:bnode:';
const INFERRED = 'urn:vg:inferred';

/** What the store does on load: every blank node becomes a urn:vg:bnode: IRI. */
function skolemized(quads: N3.Quad[]): N3.Store {
  const sk = (t: N3.Term) => (t.termType === 'BlankNode' ? nn(`${SKOLEM}${t.value}`) : t);
  return new N3.Store(quads.map((q) =>
    quad(sk(q.subject) as N3.Quad_Subject, q.predicate, sk(q.object) as N3.Quad_Object, nn('urn:vg:data'))));
}

describe('blank nodes around the reasoner', () => {
  it('reskolemizeQuad maps reasoner blank nodes back to the stored IRIs', () => {
    const back = reskolemizeQuad(quad(nn(`${M}A`), nn(TYPE), bn('abc123')));
    expect(back.object).toEqual(nn(`${SKOLEM}abc123`));
    const untouched = quad(nn(`${M}A`), nn(TYPE), nn(`${M}B`));
    expect(reskolemizeQuad(untouched)).toBe(untouched);
  });

  it('a class expression loaded through the store is reasoned over', async (ctx) => {
    const start = async () => {
      const r = new RdfReasoner();
      await r.ready;
      return r;
    };
    let probe: RdfReasoner;
    try {
      probe = await start();
    } catch (e) {
      if (process.env.REQUIRE_KONCLUDE) throw e;
      console.warn('[TEST][SKIP] Konclude unavailable:', String(e));
      return ctx.skip();
    }
    probe.terminate();

    const ttl = fs.readFileSync(path.resolve(__dirname, '../../../benchmarks/ontoauthor-mat/t2-existential/reference.ttl'), 'utf8');
    const quads = new N3.Parser().parse(ttl);
    const infersFiberReinforced = async (s: N3.Store) => {
      const r = await start();
      try {
        await r.materialize(s, { includeClassHierarchy: true, inferredGraph: INFERRED, returnDelta: true });
      } finally {
        r.terminate();
      }
      return s.getQuads(nn(`${M}CFRP`), nn(TYPE), nn(`${M}FiberReinforced`), nn(INFERRED)).length > 0;
    };

    // rdf-reasoner-konclude >= 0.9.2 reads urn:vg:bnode:* IRIs as blank nodes itself, so the stored form
    // reasons correctly without the reasoningBase copy (plan: no-copy reasoner chain).
    expect(await infersFiberReinforced(skolemized(quads)), 'stored skolem form').toBe(true);
  }, 120_000);
});
