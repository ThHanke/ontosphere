// @vitest-environment node
//
// P1-6: `x p [ a SubOfTarget ]` with a shape `sh:path p ; sh:class Target` must conform once
// reasoning has inferred `[] a Target`. The store keeps the blank node as a urn:vg:bnode:* IRI;
// the inferred type has to come back under that same IRI, or SHACL reads a node with no type.
import { describe, it, expect, afterEach } from 'vitest';
import * as N3 from 'n3';
import { RdfReasoner } from 'rdf-reasoner-konclude';
import {
  createRdfWorkerRuntime, setDlReasonerFactoryForTest, reasoningBase, reskolemizeQuad,
  type DlReasonerLike,
} from '../rdfManager.runtime.ts';
import { serializeQuad } from '../../utils/rdfSerialization.ts';

const { namedNode: nn, quad } = N3.DataFactory;
const EX = 'http://example.org/#';
const INFERRED = 'urn:vg:inferred';
const BNODE = 'urn:vg:bnode:b1';

/** DlReasoner without the browser worker: same blank-node round trip, real Konclude. */
function nodeReasoner(r: RdfReasoner): DlReasonerLike {
  return {
    ready: r.ready,
    async checkConsistency(store: N3.Store) { return r.checkConsistency(reasoningBase(store)); },
    async reason(store: N3.Store) {
      const base = reasoningBase(store);
      const result = (await r.materialize(base, {
        includeClassHierarchy: true, inferredGraph: INFERRED, returnDelta: true,
      })) as { delta: { added: N3.Quad[]; removed: N3.Quad[] } };
      store.removeQuads(store.getQuads(null, null, null, nn(INFERRED)));
      store.addQuads(base.getQuads(null, null, null, nn(INFERRED)).map(reskolemizeQuad));
      return { delta: { added: result.delta.added.map(reskolemizeQuad), removed: result.delta.removed.map(reskolemizeQuad) } as never };
    },
    async validate() { return { consistent: true, errors: [], warnings: [] } as never; },
    async explainInconsistency() { return []; },
    async explainEntailment() { return { isEntailed: null, justifications: [] } as never; },
    terminate() { r.terminate(); },
  };
}

const settle = () => new Promise((res) => setTimeout(res, 50));

afterEach(() => setDlReasonerFactoryForTest(null));

describe('sh:class on a blank-node value after reasoning', () => {
  // rdf-reasoner-konclude 0.9.0 returned inferred blank nodes as `_::b1` (value ":b1"), so the
  // inferred type landed on urn:vg:bnode::b1 instead of the stored urn:vg:bnode:b1. Fixed in 0.9.1.
  it('conforms when the blank node is typed by a subclass of the target', async (ctx) => {
    let reasoner: RdfReasoner;
    try {
      reasoner = new RdfReasoner();
      await reasoner.ready;
    } catch (e) {
      if (process.env.REQUIRE_KONCLUDE) throw e;
      return ctx.skip();
    }
    setDlReasonerFactoryForTest(() => nodeReasoner(reasoner));
    const messages: any[] = [];
    const runtime = createRdfWorkerRuntime((m) => messages.push(m));
    const seed = async (graphName: string, ttl: string) => {
      const adds = new N3.Parser().parse(ttl).map((q) => serializeQuad(quad(q.subject, q.predicate, q.object, nn(graphName))));
      runtime.handleEvent({ type: 'command', id: `seed-${graphName}`, command: 'syncBatch', payload: { graphName, adds, removes: [] } });
      await settle();
    };

    await seed('urn:vg:data', `
      @prefix ex: <${EX}> . @prefix owl: <http://www.w3.org/2002/07/owl#> .
      ex:Target a owl:Class . ex:Sub a owl:Class ; <http://www.w3.org/2000/01/rdf-schema#subClassOf> ex:Target .
      ex:p a owl:ObjectProperty .
      ex:x ex:p <${BNODE}> .
      <${BNODE}> a ex:Sub .`);
    await seed('urn:vg:shapes', `
      @prefix ex: <${EX}> . @prefix sh: <http://www.w3.org/ns/shacl#> .
      ex:S a sh:NodeShape ; sh:targetNode ex:x ;
        sh:property [ sh:path ex:p ; sh:class ex:Target ] .`);

    runtime.handleEvent({ type: 'command', id: 'r', command: 'runReasoning', payload: { reasoningId: 'r', shaclEnabled: true, emitSubjects: false } });
    const deadline = Date.now() + 60_000;
    let reply: any;
    while (!(reply = messages.find((m) => m?.type === 'response' && m?.id === 'r'))) {
      if (Date.now() > deadline) throw new Error('runReasoning did not respond');
      await new Promise((res) => setTimeout(res, 20));
    }

    const classViolations = (reply.result.errors as any[]).filter((e) => String(e.rule).includes('ClassConstraint'));
    expect(reply.result.isConsistent).toBe(true);
    expect(classViolations, JSON.stringify(classViolations)).toEqual([]);
    runtime.terminate();
    reasoner.terminate();
  }, 120_000);
});
