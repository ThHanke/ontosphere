// @vitest-environment node
//
// verifyRepair with measureGuards: two repairs both restore consistency, and only the guard
// measurement tells them apart. Removing the wrong type assertion fixes the record; deleting
// the disjointness axiom silences the check. Driven through the worker runtime with the real
// Konclude reasoner.
//
// REQUIRE_KONCLUDE set: a reasoner init failure fails the test. Unset: it skips visibly.
import { describe, it, expect, afterEach } from 'vitest';
import * as N3 from 'n3';
import { RdfReasoner } from 'rdf-reasoner-konclude';
import {
  createRdfWorkerRuntime, setDlReasonerFactoryForTest, reasoningBase, type DlReasonerLike,
} from '../rdfManager.runtime.ts';
import { serializeQuad } from '../../utils/rdfSerialization.ts';

const nn = N3.DataFactory.namedNode;
const EX = 'http://example.org/#';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const OWL = 'http://www.w3.org/2002/07/owl#';

const settle = async () => {
  for (let i = 0; i < 100; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 10));
};

function adapter(r: RdfReasoner): DlReasonerLike {
  return {
    ready: r.ready,
    async reason() { return { delta: { added: [], removed: [] } } as never; },
    validate: (store) => r.validate(reasoningBase(store)) as never,
    async explainInconsistency() { return []; },
    async explainEntailment() { return { isEntailed: null, justifications: [] } as never; },
    terminate: () => r.terminate(),
  };
}

async function startReasoner(): Promise<RdfReasoner | undefined> {
  try {
    const r = new RdfReasoner();
    await r.ready;
    return r;
  } catch (e) {
    if (process.env.REQUIRE_KONCLUDE) throw e;
    console.warn('[TEST][SKIP] Konclude unavailable:', String(e));
    return undefined;
  }
}

// A ⊓ B ⊑ ⊥, and x asserted into both: inconsistent.
const DATA = [
  N3.DataFactory.quad(nn(`${EX}A`), nn(RDF_TYPE), nn(`${OWL}Class`)),
  N3.DataFactory.quad(nn(`${EX}B`), nn(RDF_TYPE), nn(`${OWL}Class`)),
  N3.DataFactory.quad(nn(`${EX}A`), nn(`${OWL}disjointWith`), nn(`${EX}B`)),
  N3.DataFactory.quad(nn(`${EX}x`), nn(RDF_TYPE), nn(`${EX}A`)),
  N3.DataFactory.quad(nn(`${EX}x`), nn(RDF_TYPE), nn(`${EX}B`)),
];

afterEach(() => setDlReasonerFactoryForTest(null));

describe('verifyRepair measures guard cost', () => {
  it('separates fixing the record from deleting the constraint', async (ctx) => {
    const reasoner = await startReasoner();
    if (!reasoner) return ctx.skip();
    setDlReasonerFactoryForTest(() => adapter(reasoner));

    const messages: any[] = [];
    const runtime = createRdfWorkerRuntime((m) => messages.push(m));
    runtime.handleEvent({
      type: 'command', id: 'seed', command: 'syncBatch',
      payload: {
        graphName: 'urn:vg:data', removes: [],
        adds: DATA.map((q) => serializeQuad(N3.DataFactory.quad(q.subject, q.predicate, q.object, nn('urn:vg:data')))),
      },
    });
    await settle();

    const verify = async (id: string, payload: object) => {
      runtime.handleEvent({ type: 'command', id, command: 'verifyRepair', payload });
      const deadline = Date.now() + 60_000;
      for (;;) {
        const reply = messages.find((m) => m?.type === 'response' && m?.id === id);
        if (reply) { expect(reply.ok, JSON.stringify(reply)).toBe(true); return reply.result; }
        if (Date.now() > deadline) throw new Error(`${id} did not respond`);
        await new Promise((r) => setTimeout(r, 25));
      }
    };

    const fixRecord = await verify('fix', {
      removals: [{ subject: `${EX}x`, predicate: RDF_TYPE, object: `${EX}B` }], measureGuards: true,
    });
    expect(fixRecord.verifiedConsistent).toBe(true);
    expect(fixRecord.guardImpact.verdict).toBe('verified');
    expect(fixRecord.guardImpact.classGuardsDestroyed).toEqual([]);

    const dropAxiom = await verify('drop', {
      removals: [{ subject: `${EX}A`, predicate: `${OWL}disjointWith`, object: `${EX}B` }], measureGuards: true,
    });
    expect(dropAxiom.verifiedConsistent, 'deleting the axiom also restores consistency').toBe(true);
    expect(dropAxiom.guardImpact.verdict).toBe('restores-consistency-with-collateral');
    expect(dropAxiom.guardImpact.classGuardsDestroyed).toEqual([{ a: `${EX}A`, b: `${EX}B` }]);

    const plain = await verify('plain', {
      removals: [{ subject: `${EX}x`, predicate: RDF_TYPE, object: `${EX}B` }],
    });
    expect(plain.guardImpact, 'no guard measurement unless asked').toBeUndefined();

    runtime.terminate();
  }, 180_000);
});
