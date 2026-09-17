// rdf-reasoner-konclude releases a loaded knowledge base only through terminate(). Measured
// with rdf-reasoner-konclude 0.7.2 on PMDco + the Fe-Si record, adding one triple before each
// of 8 calls: RSS grew by 1,528 MiB with one reused reasoner and stayed flat (-71 MiB) with a
// fresh reasoner per call. Each full reasoning run therefore starts a fresh reasoner.

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

describe('reasoner worker recycling', () => {
  it('creates a fresh reasoner for each full reasoning run, and terminates the previous one', async () => {
    const messages: unknown[] = [];
    setDlReasonerFactoryForTest(makeCountingReasoner);
    const runtime = createRdfWorkerRuntime((m) => messages.push(m));

    await runReasoningOnce(runtime, 'run-1');
    const afterFirst = created;
    expect(afterFirst, 'first run should instantiate a reasoner').toBeGreaterThanOrEqual(1);

    await runReasoningOnce(runtime, 'run-2');

    expect(created, 'second run must instantiate a fresh reasoner (recycling)').toBeGreaterThan(afterFirst);
    expect(terminated, 'the previous reasoner must be terminated to release its WASM memory').toBeGreaterThanOrEqual(1);

    runtime.terminate();
  });
});
