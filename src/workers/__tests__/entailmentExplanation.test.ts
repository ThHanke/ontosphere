// @vitest-environment node
//
// Entailment explanations through the reasoner wrapper. The package's fast (causal) mode
// answers from the knowledge base the reasoner last materialized, so the wrapper first makes
// sure that is the store's current reasoning input. A "not entailed" answer is then confirmed
// by the exact (minimal) mode on a separate reasoner, and an exact check that does not finish
// in time is reported as undetermined. A justification from the fast mode is returned only
// when its axioms on their own entail the statement.
import { describe, it, expect } from 'vitest';
import * as N3 from 'n3';
import { RdfReasoner } from 'rdf-reasoner-konclude';
import { DlReasoner } from '../rdfManager.runtime.ts';
import { classifyEntailment } from '../entailmentVerdict.ts';

const EX = 'http://example.org/#';
const SUB = 'http://www.w3.org/2000/01/rdf-schema#subClassOf';
const store = (body: string) => new N3.Store(new N3.Parser().parse(`@prefix : <${EX}> .
@prefix owl: <http://www.w3.org/2002/07/owl#> . @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
:A a owl:Class . :B a owl:Class . :C a owl:Class . :D a owl:Class .
${body}`).map((q) => N3.DataFactory.quad(q.subject, q.predicate, q.object, N3.DataFactory.namedNode('urn:vg:data'))));
const chain = () => store(':A rdfs:subClassOf :B . :B rdfs:subClassOf :C .');
const flat = () => store('');
const ask = (r: DlReasoner, s: N3.Store, o: string) => r.explainEntailment(s, `${EX}A`, SUB, `${EX}${o}`);

async function engineAvailable(ctx: { skip: () => void }): Promise<boolean> {
  try {
    const r = new RdfReasoner();
    await r.ready;
    r.terminate();
    return true;
  } catch (e) {
    if (process.env.REQUIRE_KONCLUDE) throw e;
    console.warn('[TEST][SKIP] Konclude unavailable:', String(e));
    ctx.skip();
    return false;
  }
}

describe('entailment explanations in the reasoner wrapper', () => {
  it('answers for the store it is given, whatever was reasoned over before', async (ctx) => {
    if (!(await engineAvailable(ctx))) return;
    const wrapper = new DlReasoner({ createReasoner: () => new RdfReasoner() });
    try {
      const fresh = await ask(wrapper, chain(), 'C');
      expect(fresh.isEntailed, 'fresh reasoner, entailed A ⊑ C').toBe(true);
      expect(fresh.justifications.length).toBeGreaterThan(0);

      await wrapper.reason(chain());
      expect((await ask(wrapper, flat(), 'C')).isEntailed, 'other data reasoned over before').toBe(false);
      expect((await ask(wrapper, chain(), 'C')).isEntailed).toBe(true);
    } finally {
      wrapper.terminate();
    }
  }, 180_000);

  it('confirms a negative with the exact mode', async (ctx) => {
    if (!(await engineAvailable(ctx))) return;
    const wrapper = new DlReasoner({ createReasoner: () => new RdfReasoner() });
    try {
      const answer = await ask(wrapper, chain(), 'D');
      expect(answer.isEntailed).toBe(false);
      expect(classifyEntailment(answer).verdict).toBe('not-entailed');
    } finally {
      wrapper.terminate();
    }
  }, 180_000);

  it('reports an exact check that does not finish in time as undetermined', async (ctx) => {
    if (!(await engineAvailable(ctx))) return;
    let created = 0;
    let stalledTerminated = false;
    // The first reasoner is real; the exact check gets one that never answers.
    const stalled = {
      ready: Promise.resolve(),
      explainEntailment: () => new Promise(() => {}),
      terminate: () => { stalledTerminated = true; },
    } as unknown as RdfReasoner;
    const wrapper = new DlReasoner({
      createReasoner: () => (created++ === 0 ? new RdfReasoner() : stalled),
      exactTimeoutMs: 500,
    });
    try {
      const answer = await ask(wrapper, chain(), 'D');
      expect(answer.isEntailed).toBeNull();
      expect(classifyEntailment(answer).verdict).toBe('undetermined');
      expect(stalledTerminated, 'the stalled reasoner is released').toBe(true);
    } finally {
      wrapper.terminate();
    }
  }, 180_000);
});

describe('justifications from the fast mode', () => {
  // Stand-in reasoners: the first plays the main reasoner, whose causal mode returns `bogus`;
  // the separate reasoners answer the sufficiency check with `sufficient` and never finish
  // the exact search.
  const bogus = N3.DataFactory.quad(
    N3.DataFactory.namedNode(`${EX}Other`), N3.DataFactory.namedNode(SUB), N3.DataFactory.namedNode(`${EX}C`),
  );
  const wrapperWith = (sufficient: boolean) => {
    let created = 0;
    const main = {
      ready: Promise.resolve(),
      materialize: async () => undefined,
      explainEntailment: async () => ({ isEntailed: true, justifications: [[bogus]] }),
      terminate: () => {},
    };
    const separate = () => ({
      ready: Promise.resolve(),
      explainEntailment: (_s: unknown, _a: string, _b: string, _c: string, o: { maxJustifications?: number }) =>
        o.maxJustifications === 0 ? Promise.resolve({ isEntailed: sufficient, justifications: [] }) : new Promise(() => {}),
      terminate: () => {},
    });
    return new DlReasoner({
      createReasoner: () => (created++ === 0 ? main : separate()) as unknown as RdfReasoner,
      exactTimeoutMs: 300,
    });
  };

  it('keeps a justification whose axioms entail the statement', async () => {
    const answer = await ask(wrapperWith(true), chain(), 'C');
    expect(answer.isEntailed).toBe(true);
    expect(answer.justifications).toHaveLength(1);
  });

  it('drops a justification whose axioms do not entail the statement', async () => {
    const answer = await ask(wrapperWith(false), chain(), 'C');
    expect(answer.isEntailed).toBe(true);
    expect(answer.justifications).toEqual([]);
    expect(answer.reason).toMatch(/No justification was verified/);
  });
});
