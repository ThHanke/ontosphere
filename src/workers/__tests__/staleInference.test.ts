// Regression test for Reviewer 4 comment 9 ("I suppose this only happens upon encountering
// an inconsistency") and register item R4-11.
//
// SHACL validation runs over urn:vg:data + urn:vg:inferred. When a reasoning run does NOT
// produce inferences -- the ontology is inconsistent, or the reasoner errored or timed out
// -- urn:vg:inferred still held whatever the previous successful run materialised, and
// validation silently ran against entailments that no longer follow from the current graph.
//
// A conforming report could therefore be produced from stale inference. The run now drops
// the inferred graph in that case, reducing validation to the asserted graph.

import { describe, it, expect, afterEach } from 'vitest';
import * as N3 from 'n3';
import { createRdfWorkerRuntime, setDlReasonerFactoryForTest, type DlReasonerLike } from '../rdfManager.runtime.ts';
import { serializeQuad } from '../../utils/rdfSerialization.ts';

const nn = N3.DataFactory.namedNode;
const EX = 'http://example.org/#';

function reasonerReporting(consistent: boolean): DlReasonerLike {
  return {
    ready: Promise.resolve(),
    async reason() { return { delta: { added: [], removed: [] } }; },
    async validate() { return { consistent, violations: [] } as never; },
    async explainInconsistency() { return []; },
    async explainEntailment() { return { isEntailed: null, justifications: [] }; },
    terminate() { /* nothing to release */ },
  };
}

function makeRuntime() {
  const messages: unknown[] = [];
  const runtime = createRdfWorkerRuntime((m) => messages.push(m));
  return { runtime, messages };
}

const settle = async () => {
  for (let i = 0; i < 100; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 10));
};

/** Seed quads into a named graph of the shared store. */
async function seed(runtime: { handleEvent: (m: unknown) => void }, graphName: string, quads: N3.Quad[]) {
  runtime.handleEvent({
    type: 'command',
    id: `seed-${graphName}`,
    command: 'syncBatch',
    payload: {
      graphName,
      // the quad carries the target graph too: syncBatch writes quads where they say
      adds: quads.map((q) => serializeQuad(N3.DataFactory.quad(q.subject, q.predicate, q.object, nn(graphName)))),
      removes: [],
    },
  });
  await settle();
}

async function inferredCount(runtime: { handleEvent: (m: unknown) => void }, messages: unknown[]) {
  messages.length = 0;
  runtime.handleEvent({ type: 'command', id: 'counts', command: 'getGraphCounts' });
  await settle();
  const reply = messages.find((m: any) => m?.type === 'response' && m?.id === 'counts') as any;
  return (reply?.result?.['urn:vg:inferred'] as number) ?? 0;
}

async function runReasoning(runtime: { handleEvent: (m: unknown) => void }) {
  runtime.handleEvent({ type: 'command', id: 'reason-1', command: 'runReasoning', payload: { reasoningId: 'reason-1', shaclEnabled: false, emitSubjects: false } });
  await settle();
}

afterEach(() => setDlReasonerFactoryForTest(null));

describe('stale inference is not carried into validation', () => {
  it('drops the inferred graph when the ontology is inconsistent', async () => {
    setDlReasonerFactoryForTest(() => reasonerReporting(false));
    const { runtime, messages } = makeRuntime();

    await seed(runtime, 'urn:vg:data', [N3.DataFactory.quad(nn(`${EX}a`), nn(`${EX}p`), nn(`${EX}b`))]);
    // inference left over from an earlier, successful run
    await seed(runtime, 'urn:vg:inferred', [N3.DataFactory.quad(nn(`${EX}a`), nn(`${EX}type`), nn(`${EX}Stale`))]);
    expect(await inferredCount(runtime, messages)).toBeGreaterThan(0);

    await runReasoning(runtime);

    expect(
      await inferredCount(runtime, messages),
      'inconsistent run must not leave stale entailments for SHACL to validate against',
    ).toBe(0);
    runtime.terminate();
  });

  it('keeps the inferred graph when the run succeeds', async () => {
    setDlReasonerFactoryForTest(() => reasonerReporting(true));
    const { runtime, messages } = makeRuntime();

    await seed(runtime, 'urn:vg:data', [N3.DataFactory.quad(nn(`${EX}a`), nn(`${EX}p`), nn(`${EX}b`))]);
    await seed(runtime, 'urn:vg:inferred', [N3.DataFactory.quad(nn(`${EX}a`), nn(`${EX}type`), nn(`${EX}Fresh`))]);

    await runReasoning(runtime);

    expect(
      await inferredCount(runtime, messages),
      'a consistent run owns the inferred graph and must not have it cleared underneath it',
    ).toBeGreaterThan(0);
    runtime.terminate();
  });
});
