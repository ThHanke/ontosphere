// @vitest-environment node
//
// The reasoner writes the inferred graph straight into the store's indexes, past the counting
// wrappers. graphCounts for the reasoner-managed graphs must still equal a full recount.
import { describe, it, expect, afterEach } from 'vitest';
import * as N3 from 'n3';
import { RdfReasoner } from 'rdf-reasoner-konclude';
import { createRdfWorkerRuntime, setDlReasonerFactoryForTest, NON_AXIOM_GRAPHS, type DlReasonerLike } from '../rdfManager.runtime.ts';
import { serializeQuad } from '../../utils/rdfSerialization.ts';

const { namedNode: nn, quad } = N3.DataFactory;
const INFERRED = 'urn:vg:inferred';

function nodeReasoner(r: RdfReasoner): DlReasonerLike {
  return {
    ready: r.ready,
    async checkConsistency(store: N3.Store) { return r.checkConsistency(store); },
    async reason(store: N3.Store) {
      const res = (await r.materialize(store, { includeClassHierarchy: true, inferredGraph: INFERRED, returnDelta: true })) as { delta: unknown };
      return { delta: res.delta as never };
    },
    async validate() { return { consistent: true, errors: [], warnings: [] } as never; },
    async explainInconsistency() { return []; },
    async explainEntailment() { return { isEntailed: null, justifications: [] } as never; },
    terminate() { r.terminate(); },
  };
}

afterEach(() => setDlReasonerFactoryForTest(null));

describe('graph counts after the reasoner writes the inferred graph itself', () => {
  it('urn:vg:inferred count equals the number of inferred quads', async (ctx) => {
    let reasoner: RdfReasoner;
    try { reasoner = new RdfReasoner({ excludeGraphs: NON_AXIOM_GRAPHS }); await reasoner.ready; } catch (e) {
      if (process.env.REQUIRE_KONCLUDE) throw e; return ctx.skip();
    }
    setDlReasonerFactoryForTest(() => nodeReasoner(reasoner));
    const messages: any[] = [];
    const runtime = createRdfWorkerRuntime((m) => messages.push(m));
    const call = async (id: string, command: string, payload: unknown) => {
      runtime.handleEvent({ type: 'command', id, command, payload } as never);
      const deadline = Date.now() + 60_000;
      let reply: any;
      while (!(reply = messages.find((m) => m?.type === 'response' && m?.id === id))) {
        if (Date.now() > deadline) throw new Error(`${command} did not respond`);
        await new Promise((res) => setTimeout(res, 20));
      }
      return reply.result;
    };
    const ttl = `@prefix ex: <http://e/> . @prefix owl: <http://www.w3.org/2002/07/owl#> . @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
      ex:Sub a owl:Class ; rdfs:subClassOf ex:Top . ex:Top a owl:Class . ex:i a owl:NamedIndividual, ex:Sub .`;
    const adds = new N3.Parser().parse(ttl).map((q) => serializeQuad(quad(q.subject, q.predicate, q.object, nn('urn:vg:data'))));
    await call('seed', 'syncBatch', { graphName: 'urn:vg:data', adds, removes: [] });

    await call('r1', 'runReasoning', { reasoningId: 'r1', shaclEnabled: false, emitSubjects: false });
    const inferredQuads = await call('q1', 'getQuads', { graphName: INFERRED });
    const counts = await call('c1', 'getGraphCounts', undefined);
    expect(inferredQuads.length).toBeGreaterThan(0);
    expect(counts[INFERRED]).toBe(inferredQuads.length);

    // an edit makes the package clear its inferred graph (raw, uncounted) and write it again
    const more = new N3.Parser().parse('@prefix ex: <http://e/> . @prefix owl: <http://www.w3.org/2002/07/owl#> . ex:j a owl:NamedIndividual, ex:Sub .')
      .map((q) => serializeQuad(quad(q.subject, q.predicate, q.object, nn('urn:vg:data'))));
    await call('seed2', 'syncBatch', { graphName: 'urn:vg:data', adds: more, removes: [] });
    await call('r2', 'runReasoning', { reasoningId: 'r2', shaclEnabled: false, emitSubjects: false });
    const counts2 = await call('c2', 'getGraphCounts', undefined);
    const inferred2 = await call('q2', 'getQuads', { graphName: INFERRED });
    expect(counts2[INFERRED]).toBe(inferred2.length);
    runtime.terminate();
    reasoner.terminate();
  }, 120_000);
});
