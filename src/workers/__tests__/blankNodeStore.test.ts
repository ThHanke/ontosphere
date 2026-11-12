// @vitest-environment node
//
// B-lite: the worker's N3 store holds real BlankNode terms, so the reasoner library's TypeScript
// readers (assessEdit, axiom grouping) see restrictions and owl:AllDisjointClasses groups. The UI
// and MCP side still address blank nodes as urn:vg:bnode:<label>.
//
// Before B-lite the store held skolem IRIs: assessEdit skipped every AllDisjointClasses group
// (PMDco: 21 pairs instead of 169) and axiom grouping split a restriction into one-triple units.
import { describe, it, expect, afterEach } from 'vitest';
import * as N3 from 'n3';
import fs from 'node:fs';
import path from 'node:path';
import { RdfReasoner } from 'rdf-reasoner-konclude';
import { createRdfWorkerRuntime, setDlReasonerFactoryForTest, type DlReasonerLike } from '../rdfManager.runtime.ts';

const SKOLEM = 'urn:vg:bnode:';
const OWL = 'http://www.w3.org/2002/07/owl#';

afterEach(() => setDlReasonerFactoryForTest(null));

/** A worker runtime whose reasoner records the store it is handed (the real shared store). */
function harness() {
  let captured: N3.Store | null = null;
  const reasoner: DlReasonerLike = {
    ready: Promise.resolve(),
    async checkConsistency(store) { captured = store; return true; },
    async reason(store) { captured = store; return { delta: { added: [], removed: [] } }; },
    async validate() { return { consistent: true, errors: [], warnings: [] }; },
    async explainInconsistency() { return []; },
    async explainEntailment() { return { isEntailed: null, justifications: [] }; },
    terminate() { /* nothing */ },
  } as unknown as DlReasonerLike;
  setDlReasonerFactoryForTest(() => reasoner);
  const messages: any[] = [];
  const runtime = createRdfWorkerRuntime((m) => messages.push(m));
  let n = 0;
  const send = async (command: string, payload?: unknown) => {
    const id = `${command}-${++n}`;
    runtime.handleEvent({ type: 'command', id, command, ...(payload === undefined ? {} : { payload }) });
    const deadline = Date.now() + 120_000;
    while (!messages.some((m) => m?.type === 'response' && m?.id === id)) {
      if (Date.now() > deadline) throw new Error(`${command} did not respond`);
      await new Promise((r) => setTimeout(r, 10));
    }
    await new Promise((r) => setTimeout(r, 20));
    return messages.find((m) => m?.type === 'response' && m?.id === id);
  };
  return {
    send,
    async load(ttl: string, graphName = 'urn:vg:data') {
      await send('importSerialized', { content: ttl, graphName, contentType: 'text/turtle', filename: 'src.ttl' });
      await send('runReasoning', { reasoningId: `r${++n}`, shaclEnabled: false, emitSubjects: false });
      if (!captured) throw new Error('the reasoner was never handed the store');
      return captured as N3.Store;
    },
  };
}

async function realReasoner(ctx: { skip: () => void }): Promise<RdfReasoner | null> {
  try { const r = new RdfReasoner(); await r.ready; return r; } catch (e) {
    if (process.env.REQUIRE_KONCLUDE) throw e;
    ctx.skip();
    return null;
  }
}

describe('the worker store holds real blank nodes', () => {
  it('no stored term is a skolem IRI; blank nodes are BlankNode terms', async () => {
    const h = harness();
    const store = await h.load(`@prefix owl: <${OWL}> . @prefix : <http://x/> .
      :A owl:equivalentClass [ a owl:Restriction ; owl:onProperty :p ; owl:someValuesFrom :C ] .`);
    const quads = store.getQuads(null, null, null, null);
    expect(quads.some((q) => q.subject.termType === 'BlankNode' || q.object.termType === 'BlankNode')).toBe(true);
    expect(quads.some((q) => q.subject.value.startsWith(SKOLEM) || q.object.value.startsWith(SKOLEM))).toBe(false);
  });

  it('the UI sees skolem IRIs, never BlankNode terms, and can remove by skolem IRI', async () => {
    const h = harness();
    const store = await h.load(`@prefix owl: <${OWL}> . @prefix : <http://x/> .
      :A owl:equivalentClass [ a owl:Restriction ; owl:onProperty :p ; owl:someValuesFrom :C ] .`);
    const reply = await h.send('getQuads', { graphName: 'urn:vg:data' });
    const wire: any[] = reply.result;
    const restriction = wire.find((q) => q.predicate.value === `${OWL}equivalentClass`).object;
    expect(restriction).toMatchObject({ termType: 'NamedNode' });
    expect(restriction.value.startsWith(SKOLEM)).toBe(true);
    expect(wire.some((q) => q.subject.termType === 'BlankNode' || q.object.termType === 'BlankNode')).toBe(false);

    // the UI removes the restriction's onProperty triple by the skolem IRI it was given
    const before = store.countQuads(null, N3.DataFactory.namedNode(`${OWL}onProperty`), null, null);
    await h.send('syncBatch', {
      graphName: 'urn:vg:data', adds: [],
      removes: [{ subject: restriction, predicate: { termType: 'NamedNode', value: `${OWL}onProperty` }, object: { termType: 'NamedNode', value: 'http://x/p' }, graph: { termType: 'NamedNode', value: 'urn:vg:data' } }],
    });
    expect(before).toBe(1);
    expect(store.countQuads(null, N3.DataFactory.namedNode(`${OWL}onProperty`), null, null)).toBe(0);
  });

  it('assessEdit through the app store checks every asserted disjointness pair (PMDco)', async (ctx) => {
    const real = await realReasoner(ctx); if (!real) return;
    try {
      const ttl = fs.readFileSync(path.resolve(__dirname, '../../__tests__/fixtures/pmdco.ttl'), 'utf8');
      const h = harness();
      const store = await h.load(ttl, 'urn:vg:ontologies');
      const viaApp = await real.assessEdit(store, { remove: [] }, { timeout: 120_000 });

      const plain = new N3.Store(new N3.Parser({ format: 'Turtle' }).parse(ttl));
      const viaPlain = await real.assessEdit(plain, { remove: [] }, { timeout: 120_000 });

      expect(viaPlain.pairsChecked.length).toBeGreaterThan(100);        // 169 on the PMDco fixture
      expect(viaApp.pairsChecked.length).toBe(viaPlain.pairsChecked.length);
      expect(viaApp.pairsChecked.length).toBeGreaterThan(21);           // 21 = what skolem IRIs allowed
    } finally { real.terminate(); }
  }, 240_000);

  it('axiom-level explanations keep a restriction as one axiom', async (ctx) => {
    const real = await realReasoner(ctx); if (!real) return;
    try {
      const h = harness();
      const store = await h.load(`@prefix owl: <${OWL}> . @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> . @prefix : <http://x/> .
        :C a owl:Class . :D a owl:Class . :E a owl:Class . :p a owl:ObjectProperty .
        :D owl:equivalentClass [ a owl:Restriction ; owl:onProperty :p ; owl:someValuesFrom :C ] .
        :D owl:disjointWith :E .
        :y a :C . :x :p :y . :x a :E .`);
      const justs = await real.explainInconsistencyAxioms(store, { maxJustifications: 1 });
      const sizes = justs.flatMap((j: any) => j.axioms.map((a: any) => a.quads.length));
      expect(sizes.length).toBeGreaterThan(0);
      // the restriction (type, onProperty, someValuesFrom + the equivalentClass triple) is one unit,
      // not four one-triple "axioms"
      expect(Math.max(...sizes)).toBeGreaterThanOrEqual(3);
    } finally { real.terminate(); }
  }, 120_000);
});
