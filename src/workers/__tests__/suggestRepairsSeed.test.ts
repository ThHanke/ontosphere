// suggestRepairs seeds repair() with the justifications runReasoning already explained for the
// same input state (one explain per state), for a reasoner whose repair() accepts the option.
// The capability flag is forced on here; reasonerCapabilities.test.ts ties the real value to the
// installed library.
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../utils/reasonerCapabilities.ts', async (orig) => ({
  ...(await orig<typeof import('../../utils/reasonerCapabilities.ts')>()),
  REPAIR_ACCEPTS_JUSTIFICATIONS: true,
}));

import * as N3 from 'n3';
import { createRdfWorkerRuntime, setDlReasonerFactoryForTest, type DlReasonerLike } from '../rdfManager.runtime.ts';
import { serializeQuad } from '../../utils/rdfSerialization.ts';

const { namedNode: nn, quad } = N3.DataFactory;
const EX = 'http://example.org/#';
const TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const clash = quad(nn(`${EX}x`), nn(TYPE), nn(`${EX}A`), nn('urn:vg:data'));
const justification = { axioms: [{ principal: clash, quads: [clash] }], context: [] as N3.Quad[] };

function setup() {
  const repairOptions: any[] = [];
  const reasoner: DlReasonerLike = {
    ready: Promise.resolve(),
    async checkConsistency() { return false; },
    async reason() { return { delta: { added: [], removed: [] } }; },
    async validate() { return { consistent: false, errors: [], warnings: [] }; },
    async explainInconsistency() { return [[clash]]; },
    async explainInconsistencyAxioms() { return [justification]; },
    async explainEntailment() { return { isEntailed: null, justifications: [] }; },
    async repair(_store, opts) {
      repairOptions.push(opts);
      return { consistent: false, justifications: [justification], repairs: [], incomplete: false } as never;
    },
    async assessEdit() { return { consistent: true, lostDisjointPairs: [], pairsChecked: [], unmatchedRemovals: [], incomplete: false } as never; },
    async weaken() { return { weakenings: [], incomplete: false } as never; },
    terminate() { /* nothing to release */ },
  };
  setDlReasonerFactoryForTest(() => reasoner);
  const messages: any[] = [];
  const runtime = createRdfWorkerRuntime((m) => messages.push(m));
  let n = 0;
  const send = async (command: string, payload?: unknown) => {
    const id = `${command}-${++n}`;
    runtime.handleEvent({ type: 'command', id, command, ...(payload === undefined ? {} : { payload }) });
    const deadline = Date.now() + 10_000;
    while (!messages.some((m) => m?.type === 'response' && m?.id === id)) {
      if (Date.now() > deadline) throw new Error(`${command} did not respond`);
      await new Promise((r) => setTimeout(r, 5));
    }
    await new Promise((r) => setTimeout(r, 10));
  };
  const add = (q: N3.Quad) => send('syncBatch', { graphName: 'urn:vg:data', adds: [serializeQuad(q)], removes: [] });
  const reason = () => send('runReasoning', { reasoningId: `r${++n}`, shaclEnabled: false, emitSubjects: false });
  return { runtime, repairOptions, add, reason, send };
}

afterEach(() => setDlReasonerFactoryForTest(null));

describe('suggestRepairs seed', () => {
  it('passes the justifications runReasoning explained for this input state', async () => {
    const { runtime, repairOptions, add, reason, send } = setup();
    await add(clash);
    await reason();

    await send('suggestRepairs', { maxJustifications: 3 });

    expect(repairOptions).toHaveLength(1);
    expect(repairOptions[0].justifications).toEqual([justification]);
    runtime.terminate();
  });

  it('passes no seed after the graph changed', async () => {
    const { runtime, repairOptions, add, reason, send } = setup();
    await add(clash);
    await reason();
    await add(quad(nn(`${EX}y`), nn(TYPE), nn(`${EX}B`), nn('urn:vg:data')));

    await send('suggestRepairs', { maxJustifications: 3 });

    expect(repairOptions[0]).not.toHaveProperty('justifications');
    runtime.terminate();
  });

  it('passes no seed when nothing was explained yet', async () => {
    const { runtime, repairOptions, add, send } = setup();
    await add(clash);

    await send('suggestRepairs', { maxJustifications: 3 });

    expect(repairOptions[0]).not.toHaveProperty('justifications');
    runtime.terminate();
  });
});
