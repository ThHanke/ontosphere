// @vitest-environment node
//
// rdf-reasoner-konclude 0.9.5: validate() clears the inferred graph it is given and fills it with the class hierarchy.
// With urn:vg:inferred that dropped the individual-level inferences of runReasoning (types, inverse links), so SHACL
// after explainDiagnostics reported violations that validateGraph did not (the PMDCO user story: 3 instead of 1).
// The worker gives validate() a scratch graph and empties it again.
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { RdfReasoner } from 'rdf-reasoner-konclude';
import {
  createRdfWorkerRuntime, setDlReasonerFactoryForTest, DlReasoner, NON_AXIOM_GRAPHS, VALIDATE_SCRATCH_GRAPH, type DlReasonerLike,
} from '../rdfManager.runtime.ts';

afterEach(() => setDlReasonerFactoryForTest(null));

describe('validate() does not rewrite the inferred graph', () => {
  it('urn:vg:inferred is the same after the validate command as after runReasoning', async (ctx) => {
    let real: RdfReasoner;
    try {
      real = new RdfReasoner({ excludeGraphs: NON_AXIOM_GRAPHS });
      await real.ready;
    } catch (e) {
      if (process.env.REQUIRE_KONCLUDE) throw e;
      return ctx.skip();
    }
    try {
      setDlReasonerFactoryForTest(() => new DlReasoner(real) as unknown as DlReasonerLike);
      const messages: any[] = [];
      const runtime = createRdfWorkerRuntime((m) => messages.push(m));
      let n = 0;
      const send = async (command: string, payload?: unknown) => {
        const id = `${command}-${++n}`;
        runtime.handleEvent({ type: 'command', id, command, ...(payload === undefined ? {} : { payload }) });
        const deadline = Date.now() + 120_000;
        while (!messages.some((m) => m?.type === 'response' && m?.id === id)) {
          if (Date.now() > deadline) throw new Error(`${command} did not respond`);
          await new Promise((r) => setTimeout(r, 20));
        }
        return messages.find((m) => m?.type === 'response' && m?.id === id);
      };
      const inferred = async (graphName: string) => {
        const quads: any[] = (await send('getQuads', { graphName })).result;
        return quads.map((q) => `${q.subject.value} ${q.predicate.value} ${q.object.value}`).sort();
      };

      await send('importSerialized', {
        content: fs.readFileSync(path.resolve(__dirname, '../../__tests__/fixtures/fesi-hermit-case.trig'), 'utf8'),
        graphName: 'urn:vg:ontologies', contentType: 'application/trig', filename: 'fesi.trig',
      });
      // the fixture carries its own inferred graph: start from the app's state, i.e. the last runReasoning's output
      await send('runReasoning', { reasoningId: 'r1', shaclEnabled: false, emitSubjects: false });
      const afterReasoning = await inferred('urn:vg:inferred');
      expect(afterReasoning.length).toBeGreaterThan(0);

      const v = await send('validate');
      expect(v.ok).toBe(true);

      expect(await inferred('urn:vg:inferred')).toEqual(afterReasoning);
      expect(await inferred(VALIDATE_SCRATCH_GRAPH)).toEqual([]);
    } finally {
      real.terminate();
    }
  }, 180_000);
});
