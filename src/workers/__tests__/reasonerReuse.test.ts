// rdf-reasoner-konclude >= 0.8.0 digests the store content on every call, rebuilds its knowledge
// base only when the content changed, and recycles its own Worker when the WASM heap grows. The
// runtime therefore keeps one reasoner across full reasoning runs instead of terminating it per run.

import { describe, it, expect, afterEach } from 'vitest';
import * as N3 from 'n3';
import { createRdfWorkerRuntime, setDlReasonerFactoryForTest, type DlReasonerLike } from '../rdfManager.runtime.ts';
import { serializeQuad } from '../../utils/rdfSerialization.ts';

let created = 0;
let terminated = 0;

function makeCountingReasoner(): DlReasonerLike {
  created++;
  let alive = true;
  return {
    ready: Promise.resolve(),
    async checkConsistency() {
      expect(alive, 'checkConsistency() called on a terminated reasoner').toBe(true);
      return true;
    },
    async reason() {
      expect(alive, 'reason() called on a terminated reasoner').toBe(true);
      return { delta: { added: [], removed: [] } };
    },
    async validate() {
      expect(alive, 'validate() called on a terminated reasoner').toBe(true);
      return { consistent: true, errors: [], warnings: [] };
    },
    async explainInconsistency() { return []; },
    async explainEntailment() { return { isEntailed: null, justifications: [] }; },
    terminate() { alive = false; terminated++; },
  };
}

async function runReasoningOnce(runtime: { handleEvent: (m: unknown) => void }, id: string) {
  const quad = N3.DataFactory.quad(
    N3.DataFactory.namedNode('http://example.org/#a'),
    N3.DataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
    N3.DataFactory.namedNode('http://example.org/#C'),
    N3.DataFactory.namedNode('urn:vg:data'),
  );
  // handleEvent takes the message itself, not a MessageEvent wrapper.
  runtime.handleEvent({
    type: 'runReasoning',
    id,
    quads: [serializeQuad(quad)],
    reasonerBackend: 'konclude',
  });
  // let the async reasoning path settle
  for (let i = 0; i < 100; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 10));
}

afterEach(() => {
  setDlReasonerFactoryForTest(null);
  created = 0;
  terminated = 0;
});

describe('reasoner reuse', () => {
  it('serves consecutive full reasoning runs from one reasoner', async () => {
    const messages: unknown[] = [];
    setDlReasonerFactoryForTest(makeCountingReasoner);
    const runtime = createRdfWorkerRuntime((m) => messages.push(m));

    await runReasoningOnce(runtime, 'run-1');
    await runReasoningOnce(runtime, 'run-2');

    expect(created, 'both runs must share one reasoner').toBe(1);
    expect(terminated, 'a reused reasoner must not be terminated between runs').toBe(0);

    runtime.terminate();
  });
});
