// @vitest-environment node
//
// An asymmetric property related from an individual to itself has no model: asymmetry at
// x = y gives not p(x, x). rdf-reasoner-konclude 0.7.1 reports that graph consistent, so the
// reasoner wrapper detects the self-loop and reports it with its declaration.
import { describe, it, expect } from 'vitest';
import * as N3 from 'n3';
import { RdfReasoner } from 'rdf-reasoner-konclude';
import { DlReasoner } from '../rdfManager.runtime.ts';

const EX = 'http://example.org/#';
const parse = (body: string) => new N3.Store(new N3.Parser().parse(`@prefix : <${EX}> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
${body}`));
const selfLoop = () => parse(':p a owl:ObjectProperty, owl:AsymmetricProperty . :a :p :a .');
const oneWay = () => parse(':p a owl:ObjectProperty, owl:AsymmetricProperty . :a :p :b .');
const triple = (q: N3.Quad) => `${q.subject.value} ${q.predicate.value} ${q.object.value}`;

describe('asymmetric self-loops in the reasoner wrapper', () => {
  it('reports the graph inconsistent and explains it with the loop and its declaration', async (ctx) => {
    let engine: RdfReasoner;
    try {
      engine = new RdfReasoner();
      await engine.ready;
    } catch (e) {
      if (process.env.REQUIRE_KONCLUDE) throw e;
      console.warn('[TEST][SKIP] Konclude unavailable:', String(e));
      return ctx.skip();
    }
    const wrapper = new DlReasoner(engine);
    try {
      expect(await engine.checkConsistency(selfLoop()), 'the engine alone answers consistent').toBe(true);

      expect(await wrapper.checkConsistency(selfLoop())).toBe(false);
      const [justification] = await wrapper.explainInconsistency(selfLoop());
      expect(justification.map(triple).sort()).toEqual([
        `${EX}a ${EX}p ${EX}a`,
        `${EX}p http://www.w3.org/1999/02/22-rdf-syntax-ns#type http://www.w3.org/2002/07/owl#AsymmetricProperty`,
      ]);
      const validation = await wrapper.validate(selfLoop());
      expect(validation.consistent).toBe(false);
      expect(validation.errors).toHaveLength(1);

      expect(await wrapper.checkConsistency(oneWay())).toBe(true);
    } finally {
      wrapper.terminate();
    }
  }, 120_000);
});
