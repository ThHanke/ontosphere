// @vitest-environment node
//
// Fe-Si case from the reviewer's comparison with HermiT: `some_silicon rdf:type semiconductor`. HermiT's
// justifications are two three-axiom sets (J1 with `silicon SubClassOf (has disposition some semiconductivity)`,
// J2 with the long `silicon EquivalentTo (...)` definition), both with the semiconductor definition.
//
// The app's procedure is: runReasoning (checkConsistency, materialize), then "why?". After a materialize the
// reasoner's cached shortcut answered with an inferred class-hierarchy edge or an unrelated axiom (reasoner
// 0.9.4); 0.9.5 fixes it, and the worker asks for the exact search by default.
// Fixture: copied from the rdf-reasoner-konclude repository (tests/fixtures/fesi-hermit-case.trig): a
// PMDco-based ontology as Ontosphere stores it (data, inferred, shapes and ontology named graphs).
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { RdfReasoner } from 'rdf-reasoner-konclude';
import {
  createRdfWorkerRuntime, setDlReasonerFactoryForTest, DlReasoner, NON_AXIOM_GRAPHS, type DlReasonerLike,
} from '../rdfManager.runtime.ts';

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const SUBCLASS = 'http://www.w3.org/2000/01/rdf-schema#subClassOf';
const EQUIV = 'http://www.w3.org/2002/07/owl#equivalentClass';
const PMD = 'https://w3id.org/pmd/co/PMD_';
const SILICON = 'http://www.example.org/#some_silicon';
const SKOLEM = 'urn:vg:bnode:';

afterEach(() => setDlReasonerFactoryForTest(null));

async function reasonerOrSkip(ctx: { skip: () => void }): Promise<RdfReasoner | null> {
  try {
    const r = new RdfReasoner({ excludeGraphs: NON_AXIOM_GRAPHS });
    await r.ready;
    return r;
  } catch (e) {
    if (process.env.REQUIRE_KONCLUDE) throw e;
    ctx.skip();
    return null;
  }
}

describe('Fe-Si explanation through the worker (reasoning run first, as in the app)', () => {
  it('exact (default): HermiT\'s two justifications, no inferred edge, after runReasoning', async (ctx) => {
    const real = await reasonerOrSkip(ctx); if (!real) return;
    try {
      setDlReasonerFactoryForTest(() => new DlReasoner(real) as unknown as DlReasonerLike);
      const messages: any[] = [];
      const runtime = createRdfWorkerRuntime((m) => messages.push(m));
      let n = 0;
      const send = async (command: string, payload?: unknown) => {
        const id = `${command}-${++n}`;
        runtime.handleEvent({ type: 'command', id, command, ...(payload === undefined ? {} : { payload }) });
        const deadline = Date.now() + 170_000;
        while (!messages.some((m) => m?.type === 'response' && m?.id === id)) {
          if (Date.now() > deadline) throw new Error(`${command} did not respond`);
          await new Promise((r) => setTimeout(r, 20));
        }
        return messages.find((m) => m?.type === 'response' && m?.id === id);
      };

      await send('importSerialized', {
        content: fs.readFileSync(path.resolve(__dirname, '../../__tests__/fixtures/fesi-hermit-case.trig'), 'utf8'),
        graphName: 'urn:vg:ontologies', contentType: 'application/trig', filename: 'fesi.trig',
      });
      const reasoning = await send('runReasoning', { reasoningId: 'r1', shaclEnabled: false, emitSubjects: false });
      expect(reasoning.ok).toBe(true);

      const res = await send('explainEntailment', {
        subjectIri: SILICON, predicateIri: RDF_TYPE, objectIri: `${PMD}0090000`, maxJustifications: 5,
      });
      const out = res.result;
      expect(out.isEntailed).toBe(true);
      expect(out.justificationMode).toBe('exact');
      expect(out.justificationUnavailable).toBeUndefined();
      expect(out.justifications).toHaveLength(2);

      const triples = (j: any[]) => j.map((q) => ({ s: q.subject as string, p: q.predicate as string, o: q.object as string }));
      for (const j of out.justifications) {
        const t = triples(j);
        // every HermiT justification starts from the asserted type and ends at the semiconductor definition
        expect(t).toContainEqual({ s: SILICON, p: RDF_TYPE, o: `${PMD}0020050` });
        expect(t.some((x) => x.s === `${PMD}0090000` && x.p === EQUIV && x.o.startsWith(SKOLEM))).toBe(true);
        // the inferred class-hierarchy edge is a conclusion, never part of a justification
        expect(t).not.toContainEqual({ s: `${PMD}0020050`, p: SUBCLASS, o: `${PMD}0090000` });
      }
      // J1 uses `silicon SubClassOf (restriction)`, J2 uses `silicon EquivalentTo (intersection)`
      const viaSub = out.justifications.filter((j: any[]) => triples(j).some((x) => x.s === `${PMD}0020050` && x.p === SUBCLASS && x.o.startsWith(SKOLEM)));
      const viaEquiv = out.justifications.filter((j: any[]) => triples(j).some((x) => x.s === `${PMD}0020050` && x.p === EQUIV && x.o.startsWith(SKOLEM)));
      expect(viaSub).toHaveLength(1);
      expect(viaEquiv).toHaveLength(1);
    } finally {
      real.terminate();
    }
  }, 240_000);
});
