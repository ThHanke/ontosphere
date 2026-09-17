// @vitest-environment node
//
// explainEntailment's `causal` mode answers from a cache and reports `isEntailed: false` when
// the cache does not hold a statement, including statements that are entailed. `minimal` is
// exact. The wrapper keeps `causal` for positives and confirms every negative with `minimal`.
import { describe, it, expect } from 'vitest';
import * as N3 from 'n3';
import { RdfReasoner } from 'rdf-reasoner-konclude';
import { explainEntailmentConfirmed } from '../rdfManager.runtime.ts';

const EX = 'http://example.org/#';
const SUB = 'http://www.w3.org/2000/01/rdf-schema#subClassOf';
const ttl = `@prefix : <${EX}> . @prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
:A a owl:Class . :B a owl:Class . :C a owl:Class . :D a owl:Class .
:A rdfs:subClassOf :B . :B rdfs:subClassOf :C .`;
const store = () => new N3.Store(new N3.Parser().parse(ttl));

describe('entailment answers from the reasoner wrapper', () => {
  it('confirms negatives with the exact mode', async (ctx) => {
    let reasoner: RdfReasoner;
    try {
      reasoner = new RdfReasoner();
      await reasoner.ready;
    } catch (e) {
      if (process.env.REQUIRE_KONCLUDE) throw e;
      console.warn('[TEST][SKIP] Konclude unavailable:', String(e));
      return ctx.skip();
    }
    try {
      const causal = await reasoner.explainEntailment(store(), `${EX}A`, SUB, `${EX}C`, { justificationMode: 'causal' });
      expect(causal.isEntailed, 'causal alone answers false for the entailed A ⊑ C').toBe(false);

      const entailed = await explainEntailmentConfirmed(reasoner, store(), `${EX}A`, SUB, `${EX}C`);
      expect(entailed.isEntailed).toBe(true);
      expect(entailed.justifications.length).toBeGreaterThan(0);

      const notEntailed = await explainEntailmentConfirmed(reasoner, store(), `${EX}A`, SUB, `${EX}D`);
      expect(notEntailed.isEntailed).toBe(false);
    } finally {
      reasoner.terminate();
    }
  }, 120_000);
});
