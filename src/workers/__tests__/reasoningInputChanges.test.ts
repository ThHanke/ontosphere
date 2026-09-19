// A reasoning run publishes inferences only when the reasoning input is unchanged since the run
// started. Graph edits are not queued behind reasoning, so an edit can land while the reasoner
// is working; the run is then repeated over the current graph, up to 3 attempts. Graphs that are
// not reasoning input (SHACL shapes, provenance, workflow state) can change freely during a run.
import { describe, it, expect, afterEach } from 'vitest';
import * as N3 from 'n3';
import {
  createRdfWorkerRuntime, reasoningBase, setDlReasonerFactoryForTest, type DlReasonerLike,
} from '../rdfManager.runtime.ts';
import { serializeQuad } from '../../utils/rdfSerialization.ts';

const nn = N3.DataFactory.namedNode;
const EX = 'http://example.org/#';
const INFERRED = 'urn:vg:inferred';
const inferredQuad = N3.DataFactory.quad(nn(`${EX}a`), nn(`${EX}type`), nn(`${EX}Inferred`), nn(INFERRED));

/**
 * Calls take `ms`. reason() publishes one inferred quad, as DlReasoner does, only while the input
 * is current. `duringReason` runs at the start of every reason() call.
 */
function slowReasoner(ms: number, calls: { reason: number }, duringReason?: () => void): DlReasonerLike {
  const later = <T>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
  return {
    ready: Promise.resolve(),
    checkConsistency: () => later(true),
    async reason(store, isCurrent) {
      calls.reason += 1;
      duringReason?.();
      await later(null);
      if (isCurrent && !isCurrent()) return { delta: { added: [], removed: [] } };
      store.addQuad(inferredQuad);
      return { delta: { added: [inferredQuad], removed: [] } };
    },
    validate: () => later({ consistent: true, errors: [], warnings: [] } as never),
    explainInconsistency: () => later([]),
    explainEntailment: () => later({ isEntailed: null, justifications: [] } as never),
    terminate() { /* nothing to release */ },
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
  const add = (id: string, graphName: string, s: string) =>
    send(id, 'syncBatch', {
      graphName, removes: [],
      adds: [serializeQuad(N3.DataFactory.quad(nn(`${EX}${s}`), nn(`${EX}p`), nn(`${EX}b`), nn(graphName)))],
    });
  const inferredCount = async () => {
    send('counts', 'getGraphCounts');
    const counts = (await reply('counts')).result as Record<string, number>;
    messages.splice(messages.findIndex((m) => m?.id === 'counts'), 1);
    return counts[INFERRED] ?? 0;
  };
  return { runtime, send, reply, add, inferredCount };
}

const run = { reasoningId: 'run-1', shaclEnabled: false, emitSubjects: false };
const warningRules = (r: any) => ((r?.result?.warnings ?? []) as { rule?: string }[]).map((w) => w.rule);

afterEach(() => setDlReasonerFactoryForTest(null));

describe('reasoning input changes during a run', () => {
  it('an edit to the data during a run is followed by a run over the current graph', async () => {
    const calls = { reason: 0 };
    let edit: (() => void) | undefined;
    setDlReasonerFactoryForTest(() => slowReasoner(100, calls, () => { edit?.(); edit = undefined; }));
    const { runtime, send, reply, add, inferredCount } = makeRuntime();
    add('seed', 'urn:vg:data', 'a');
    await reply('seed');

    edit = () => add('edit', 'urn:vg:data', 'c');
    send('run-1', 'runReasoning', run);

    const result = await reply('run-1');
    expect(calls.reason, 'the first attempt is repeated').toBe(2);
    expect(warningRules(result)).not.toContain('reasoning-input-changed');
    expect(await inferredCount()).toBe(1);
    runtime.terminate();
  });

  it('when the data changes during every attempt, nothing is published and the run says so', async () => {
    const calls = { reason: 0 };
    let n = 0;
    let add: (id: string, graphName: string, s: string) => void = () => {};
    setDlReasonerFactoryForTest(() => slowReasoner(100, calls, () => { n += 1; add(`edit-${n}`, 'urn:vg:data', `e${n}`); }));
    const rt = makeRuntime();
    add = rt.add;
    rt.add('seed', 'urn:vg:data', 'a');
    await rt.reply('seed');

    rt.send('run-1', 'runReasoning', run);
    const result = await rt.reply('run-1');
    expect(calls.reason).toBe(3);
    expect(warningRules(result)).toContain('reasoning-input-changed');
    expect(await rt.inferredCount(), 'no inferences from earlier data').toBe(0);
    rt.runtime.terminate();
  });

  it('a change to the SHACL shapes during a run leaves the run current', async () => {
    const calls = { reason: 0 };
    let shape: (() => void) | undefined;
    setDlReasonerFactoryForTest(() => slowReasoner(100, calls, () => { shape?.(); shape = undefined; }));
    const { runtime, send, reply, add, inferredCount } = makeRuntime();
    add('seed', 'urn:vg:data', 'a');
    await reply('seed');

    shape = () => add('shape', 'urn:vg:shapes', 'Shape');
    send('run-1', 'runReasoning', run);

    const result = await reply('run-1');
    expect(calls.reason).toBe(1);
    expect(warningRules(result)).not.toContain('reasoning-input-changed');
    expect(await inferredCount()).toBe(1);
    runtime.terminate();
  });
});

describe('reasoningBase', () => {
  it('holds the data and ontology graphs and leaves out graphs that are not OWL axioms', () => {
    const q = (g: string) => N3.DataFactory.quad(nn(`${EX}A`), nn(`${EX}p`), nn(`${EX}B`), nn(g));
    const store = new N3.Store([
      q('urn:vg:data'), q('urn:vg:ontologies'),
      q(INFERRED), q('urn:konclude:explanations'), q('urn:vg:shapes'), q('urn:vg:provenance'), q('urn:vg:workflows'),
    ]);
    const graphs = reasoningBase(store).getQuads(null, null, null, null).map((x) => x.graph.value).sort();
    expect(graphs).toEqual(['urn:vg:data', 'urn:vg:ontologies']);
  });
});
