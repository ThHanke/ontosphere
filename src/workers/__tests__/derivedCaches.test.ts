// Justifications and entailment explanations are derived from the reasoning input. One explain
// per input state: reused while nothing was written, dropped on EVERY path that changes the axioms
// (a plain write, unloading an ontology, removing a graph, clearing the store). Writes to
// non-axiom graphs (inferred, shapes) leave them alone. See also unloadDropsInference.test.ts.

import { describe, it, expect, afterEach } from 'vitest';
import * as N3 from 'n3';
import {
  createRdfWorkerRuntime, setDlReasonerFactoryForTest, type DlReasonerLike,
} from '../rdfManager.runtime.ts';
import { serializeQuad } from '../../utils/rdfSerialization.ts';

const { namedNode: nn, quad } = N3.DataFactory;
const EX = 'http://example.org/#';
const ONT = 'http://example.org/ont';
const TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const SUBCLASS = 'http://www.w3.org/2000/01/rdf-schema#subClassOf';

const settle = async () => {
  for (let i = 0; i < 100; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 10));
};

/** An inconsistent ontology whose explanations are counted. */
function countingReasoner() {
  const calls = { axioms: 0, entailment: 0 };
  const clash = quad(nn(`${EX}x`), nn(TYPE), nn(`${EX}A`), nn('urn:vg:data'));
  const reasoner: DlReasonerLike = {
    ready: Promise.resolve(),
    async checkConsistency() { return false; },
    async reason() { return { delta: { added: [], removed: [] } }; },
    async validate() { return { consistent: false, errors: [], warnings: [] }; },
    async explainInconsistency() { return [[clash]]; },
    async explainInconsistencyAxioms() {
      calls.axioms += 1;
      return [{ axioms: [{ principal: clash, quads: [clash] }], context: [] }];
    },
    async explainEntailment() {
      calls.entailment += 1;
      return { isEntailed: true, justifications: [[clash]] };
    },
    terminate() { /* nothing to release */ },
  };
  return { reasoner, calls };
}

function setup() {
  const { reasoner, calls } = countingReasoner();
  setDlReasonerFactoryForTest(() => reasoner);
  const messages: any[] = [];
  const runtime = createRdfWorkerRuntime((m) => messages.push(m));
  let n = 0;
  const send = async (command: string, payload?: unknown) => {
    const id = `${command}-${++n}`;
    runtime.handleEvent({ type: 'command', id, command, ...(payload === undefined ? {} : { payload }) });
    // wait for the answer: a reasoning run takes longer than a fixed pause
    const deadline = Date.now() + 10_000;
    let reply: any;
    while (!(reply = messages.find((m) => m?.type === 'response' && m?.id === id))) {
      if (Date.now() > deadline) throw new Error(`${command} did not respond`);
      await new Promise((r) => setTimeout(r, 5));
    }
    await settle();
    return reply;
  };
  const add = (graphName: string, ...quads: N3.Quad[]) =>
    send('syncBatch', {
      graphName,
      adds: quads.map((q) => serializeQuad(quad(q.subject, q.predicate, q.object, nn(graphName)))),
      removes: [],
    });
  const runReasoning = () => send('runReasoning', { reasoningId: `r${++n}`, shaclEnabled: false, emitSubjects: false });
  const entail = () => send('explainEntailment', {
    subjectIri: `${EX}x`, predicateIri: TYPE, objectIri: `${EX}A`, maxJustifications: 1,
  });
  return { runtime, calls, add, send, runReasoning, entail };
}

afterEach(() => setDlReasonerFactoryForTest(null));

const q = (s: string, p: string, o: string) => quad(nn(s), nn(p), nn(o));

describe('justification cache (one explain per input state)', () => {
  it('reuses the explanation while nothing was written', async () => {
    const { runtime, calls, add, runReasoning } = setup();
    await add('urn:vg:data', q(`${EX}x`, TYPE, `${EX}A`));

    await runReasoning();
    await runReasoning();

    expect(calls.axioms).toBe(1);
    runtime.terminate();
  });

  it('explains again after a write to an axiom graph', async () => {
    const { runtime, calls, add, runReasoning } = setup();
    await add('urn:vg:data', q(`${EX}x`, TYPE, `${EX}A`));
    await runReasoning();

    await add('urn:vg:data', q(`${EX}y`, TYPE, `${EX}B`));
    await runReasoning();

    expect(calls.axioms).toBe(2);
    runtime.terminate();
  });

  it('explains again after unloading an ontology', async () => {
    const { runtime, calls, add, send, runReasoning } = setup();
    await add('urn:vg:ontologies', q(`${EX}A`, SUBCLASS, `${EX}B`), q(`${EX}A`, 'urn:vg:loadedFrom', ONT));
    await runReasoning();

    await send('unloadOntologySubjects', { ontologyUrl: ONT });
    await runReasoning();

    expect(calls.axioms).toBe(2);
    runtime.terminate();
  });

  it('explains again after a graph was removed', async () => {
    const { runtime, calls, add, send, runReasoning } = setup();
    await add('urn:vg:data', q(`${EX}x`, TYPE, `${EX}A`));
    await runReasoning();

    await send('syncRemoveGraph', { graphName: 'urn:vg:data' });
    await runReasoning();

    expect(calls.axioms).toBe(2);
    runtime.terminate();
  });

  it('explains again after the store was cleared', async () => {
    const { runtime, calls, add, send, runReasoning } = setup();
    await add('urn:vg:data', q(`${EX}x`, TYPE, `${EX}A`));
    await runReasoning();

    await send('clear');
    await add('urn:vg:data', q(`${EX}x`, TYPE, `${EX}A`));
    await runReasoning();

    expect(calls.axioms).toBe(2);
    runtime.terminate();
  });

  it('keeps the explanation across writes to non-axiom graphs', async () => {
    const { runtime, calls, add, runReasoning } = setup();
    await add('urn:vg:data', q(`${EX}x`, TYPE, `${EX}A`));
    await runReasoning();

    await add('urn:vg:shapes', q(`${EX}S`, TYPE, 'http://www.w3.org/ns/shacl#NodeShape'));
    await add('urn:vg:inferred', q(`${EX}x`, TYPE, `${EX}Thing`));
    await runReasoning();

    expect(calls.axioms).toBe(1);
    runtime.terminate();
  });
});

describe('entailment explanation cache follows the same invalidation', () => {
  it('reuses an explanation until an axiom graph changes', async () => {
    const { runtime, calls, add, entail } = setup();
    await add('urn:vg:data', q(`${EX}x`, TYPE, `${EX}A`));

    await entail();
    await entail();
    expect(calls.entailment).toBe(1);

    await add('urn:vg:data', q(`${EX}y`, TYPE, `${EX}B`));
    await entail();
    expect(calls.entailment).toBe(2);
    runtime.terminate();
  });

  it('drops it on unload and on graph removal', async () => {
    const { runtime, calls, add, send, entail } = setup();
    await add('urn:vg:ontologies', q(`${EX}A`, SUBCLASS, `${EX}B`), q(`${EX}A`, 'urn:vg:loadedFrom', ONT));
    await add('urn:vg:data', q(`${EX}x`, TYPE, `${EX}A`));
    await entail();

    await send('unloadOntologySubjects', { ontologyUrl: ONT });
    await entail();
    expect(calls.entailment).toBe(2);

    await send('syncRemoveGraph', { graphName: 'urn:vg:data' });
    await entail();
    expect(calls.entailment).toBe(3);
    runtime.terminate();
  });
});
