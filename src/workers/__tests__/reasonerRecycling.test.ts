// Regression test for the reasoner memory fix (Reviewer 1: "Unmitigated Memory Leak …
// unpurged linear memory in the WASM C++ heap and V8 Web Worker").
//
// rdf-reasoner-konclude exposes only terminate() — no release/reset/dispose, and
// loadTripleBuffer has no matching unload. Every reasoning call therefore builds a new
// knowledge base in WASM linear memory, which grows but never shrinks. Measured on
// PMDco @3b98aad + the Fe-Si record with ONE reused worker: RSS 1368 MB -> 2811 MB over
// eight calls (+1443 MB, ~180 MB per call, no plateau). With a worker recycled per run the
// same sequence grew only 78 MB.
//
// The fix is to call resetDlReasoner() at the start of every full reasoning run. This test
// pins that behaviour: if the recycle is removed, the reasoner instance is reused across
// runs and the leak silently returns.

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
    async reason() {
      expect(alive, 'reason() called on a terminated reasoner').toBe(true);
      return { delta: { added: [], removed: [] } };
    },
    async validate() {
      expect(alive, 'validate() called on a terminated reasoner').toBe(true);
      return { consistent: true, violations: [] } as never;
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

    // The second run must NOT reuse the first run's instance: without recycling the
    // previous knowledge base stays resident in WASM linear memory for the whole session.
    expect(created, 'second run must instantiate a fresh reasoner (recycling)').toBeGreaterThan(afterFirst);
    expect(terminated, 'the previous reasoner must be terminated to release its WASM memory').toBeGreaterThanOrEqual(1);

    runtime.terminate();
  });
});
