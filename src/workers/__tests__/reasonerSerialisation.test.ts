// Reasoner calls run one at a time.
//
// rdf-reasoner-konclude's terminate() rejects every pending call with "Worker terminated".
// Removing a graph resets the reasoner, so a removal that lands during a reasoning run must
// wait for the run instead of ending it.
//
// The fake reasoner below reproduces the package's terminate() semantics with timed calls.
import { describe, it, expect, afterEach } from 'vitest';
import * as N3 from 'n3';
import { createRdfWorkerRuntime, setDlReasonerFactoryForTest, type DlReasonerLike } from '../rdfManager.runtime.ts';
import { serializeQuad } from '../../utils/rdfSerialization.ts';

const nn = N3.DataFactory.namedNode;
const EX = 'http://example.org/#';
const settle = async () => {
  for (let i = 0; i < 100; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 10));
};

/** Calls take `ms`; terminate() rejects whatever is still pending, as the real package does. */
function slowReasoner(ms: number): DlReasonerLike {
  const pending = new Set<(e: Error) => void>();
  const call = <T>(value: T) => new Promise<T>((resolve, reject) => {
    pending.add(reject);
    setTimeout(() => { if (pending.delete(reject)) resolve(value); }, ms);
  });
  return {
    ready: Promise.resolve(),
    reason: () => call({ delta: { added: [], removed: [] } } as never),
    checkConsistency: () => call(true),
    validate: () => call({ consistent: true, errors: [], warnings: [] } as never),
    explainInconsistency: () => call([]),
    explainEntailment: () => call({ isEntailed: null, justifications: [] } as never),
    terminate() {
      const err = new Error('Worker terminated');
      for (const reject of pending) reject(err);
      pending.clear();
    },
  };
}

function makeRuntime() {
  const messages: any[] = [];
  const runtime = createRdfWorkerRuntime((m) => messages.push(m));
  const send = (id: string, command: string, payload?: unknown) =>
    runtime.handleEvent({ type: 'command', id, command, ...(payload === undefined ? {} : { payload }) });
  const reply = async (id: string) => {
    const deadline = Date.now() + 20_000;
    for (;;) {
      const r = messages.find((m) => m?.type === 'response' && m?.id === id);
      if (r) return r;
      if (Date.now() > deadline) throw new Error(`${id} did not respond`);
      await new Promise((res) => setTimeout(res, 10));
    }
  };
  const seed = async (graphName: string) => {
    runtime.handleEvent({
      type: 'command', id: `seed-${graphName}`, command: 'syncBatch',
      payload: {
        graphName, removes: [],
        adds: [serializeQuad(N3.DataFactory.quad(nn(`${EX}a`), nn(`${EX}p`), nn(`${EX}b`), nn(graphName)))],
      },
    });
    await settle();
  };
  return { runtime, send, reply, seed };
}

const reasonerErrors = (r: any) =>
  ((r?.result?.errors ?? []) as { rule?: string; message?: string }[]).filter((e) => e.rule === 'reasoner-error');
const run = (id: string) => ({ reasoningId: id, shaclEnabled: false, emitSubjects: false });

afterEach(() => setDlReasonerFactoryForTest(null));

describe('reasoner calls are serialised', () => {
  it('two overlapping reasoning runs both complete', async () => {
    setDlReasonerFactoryForTest(() => slowReasoner(150));
    const { runtime, send, reply, seed } = makeRuntime();
    await seed('urn:vg:data');

    send('run-1', 'runReasoning', run('run-1'));
    // start the second once the first has a reasoner call in flight
    await new Promise((r) => setTimeout(r, 30));
    send('run-2', 'runReasoning', run('run-2'));
    const [first, second] = await Promise.all([reply('run-1'), reply('run-2')]);

    expect(reasonerErrors(first), 'the first run must not be terminated by the second').toEqual([]);
    expect(reasonerErrors(second)).toEqual([]);
    runtime.terminate();
  });

  it('a graph removal during a run does not terminate it', async () => {
    setDlReasonerFactoryForTest(() => slowReasoner(150));
    const { runtime, send, reply, seed } = makeRuntime();
    await seed('urn:vg:data');
    await seed('urn:vg:scratch');

    send('run-1', 'runReasoning', run('run-1'));
    await new Promise((r) => setTimeout(r, 30));
    send('remove', 'syncRemoveGraph', { graphName: 'urn:vg:scratch' });

    expect(reasonerErrors(await reply('run-1')), 'removing a graph must wait for the run').toEqual([]);
    expect((await reply('remove')).ok).toBe(true);
    runtime.terminate();
  });
});
