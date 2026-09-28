// SHACL validation runs over urn:vg:data + urn:vg:inferred. A reasoning run that produces
// no inferences (the ontology is inconsistent, or the reasoner could not finish) must not
// leave the previous run's inferred graph behind for validation to read.

import { describe, it, expect, afterEach } from 'vitest';
import * as N3 from 'n3';
import { createRdfWorkerRuntime, setDlReasonerFactoryForTest, type DlReasonerLike } from '../rdfManager.runtime.ts';
import { serializeQuad } from '../../utils/rdfSerialization.ts';

const nn = N3.DataFactory.namedNode;
const EX = 'http://example.org/#';

function reasonerReporting(consistent: boolean): DlReasonerLike {
  return {
    ready: Promise.resolve(),
    async checkConsistency() { return consistent; },
    async reason() { return { delta: { added: [], removed: [] } }; },
    async validate() { return { consistent, errors: [], warnings: [] }; },
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

async function graphCounts(runtime: { handleEvent: (m: unknown) => void }, messages: unknown[]) {
  messages.length = 0;
  runtime.handleEvent({ type: 'command', id: 'counts', command: 'getGraphCounts' });
  await settle();
  const reply = messages.find((m: any) => m?.type === 'response' && m?.id === 'counts') as any;
  return (reply?.result ?? {}) as Record<string, number>;
}

async function inferredCount(runtime: { handleEvent: (m: unknown) => void }, messages: unknown[]) {
  return (await graphCounts(runtime, messages))['urn:vg:inferred'] ?? 0;
}

/** Quads actually present in a graph, read back through SPARQL rather than the counters. */
async function quadsIn(runtime: { handleEvent: (m: unknown) => void }, messages: unknown[], graph: string) {
  messages.length = 0;
  runtime.handleEvent({ type: 'command', id: 'q', command: 'fetchQuadsPage', payload: { graphName: graph, offset: 0, limit: 0 } });
  await settle();
  const reply = messages.find((m: any) => m?.type === 'response' && m?.id === 'q') as any;
  return (reply?.result?.items ?? []).length as number;
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
      'an inconsistent run leaves no inferred graph for SHACL to read',
    ).toBe(0);
    expect(await quadsIn(runtime, messages, 'urn:vg:inferred')).toBe(0);
    expect(await quadsIn(runtime, messages, 'urn:vg:data'), 'the asserted graph is untouched').toBe(1);
    expect((await graphCounts(runtime, messages))['urn:vg:data']).toBe(1);
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
      'a consistent run keeps its inferred graph',
    ).toBeGreaterThan(0);
    runtime.terminate();
  });
});
