// @vitest-environment node
//
// Verdict spike for the no-copy reasoner chain (rdf-reasoner-konclude >= 0.9.2):
// the real skolemized store goes to the reasoner, `excludeGraphs` is set on the instance, and the
// reasoner itself writes the inferred graph and returns the delta. No reasoningBase copy.
import { describe, it, expect } from 'vitest';
import * as N3 from 'n3';
import fs from 'node:fs';
import path from 'node:path';
import { RdfReasoner } from 'rdf-reasoner-konclude';
import { reasoningBase } from '../rdfManager.runtime.ts';

const { namedNode: nn, quad } = N3.DataFactory;
const M = 'http://example.org/materials#';
const TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const SKOLEM = 'urn:vg:bnode:';
const INFERRED = 'urn:vg:inferred';
const DATA = nn('urn:vg:data');
const NON_AXIOM = ['urn:vg:shapes', 'urn:vg:provenance', 'urn:vg:workflows', 'urn:konclude:explanations'];

const sk = (t: N3.Term) => (t.termType === 'BlankNode' ? nn(`${SKOLEM}${t.value}`) : t);
function skolemStore(): N3.Store {
  const ttl = fs.readFileSync(path.resolve(__dirname, '../../../benchmarks/ontoauthor-mat/t2-existential/reference.ttl'), 'utf8');
  return new N3.Store(new N3.Parser().parse(ttl).map((q) =>
    quad(sk(q.subject) as N3.Quad_Subject, q.predicate, sk(q.object) as N3.Quad_Object, DATA)));
}
const keys = (s: N3.Store) => s.getQuads(null, null, null, nn(INFERRED))
  .map((q) => `${q.subject.value} ${q.predicate.value} ${q.object.value}`).sort();

async function mk(opts: object = {}): Promise<RdfReasoner | null> {
  try { const r = new RdfReasoner(opts as any); await r.ready; return r; } catch (e) {
    if (process.env.REQUIRE_KONCLUDE) throw e; return null;
  }
}

describe('no-copy reasoner chain', () => {
  it('real skolemized store, no copy: same inferences as the reasoningBase copy path', async (ctx) => {
    const r1 = await mk({ excludeGraphs: NON_AXIOM }); if (!r1) return ctx.skip();
    const direct = skolemStore();
    const res = await r1.materialize(direct, { includeClassHierarchy: true, inferredGraph: INFERRED, returnDelta: true }) as any;
    r1.terminate();

    const r2 = await mk(); const copy = reasoningBase(skolemStore());
    await r2!.materialize(copy, { includeClassHierarchy: true, inferredGraph: INFERRED, returnDelta: true });
    r2!.terminate();

    const a = keys(direct);
    expect(a).toContain(`${M}CFRP ${TYPE} ${M}FiberReinforced`);
    // blank-node subjects come back as the stored skolem IRIs, not as blank nodes
    expect(direct.getQuads(null, null, null, nn(INFERRED)).some((q) => q.subject.termType === 'BlankNode' || q.object.termType === 'BlankNode')).toBe(false);
    // delta carries the inferred quads the reasoner wrote
    expect(res.delta.added.length).toBe(a.length);
    // equal to the copy path, once the copy's blank labels are mapped to skolem form
    const norm = (k: string) => k.replace(/ sk_[0-9a-f]+/g, ' B').replace(/urn:vg:bnode:[^ ]+/g, 'B');
    expect(a.map(norm)).toEqual(keys(copy).map(norm));
  }, 120_000);

  it('excludeGraphs: shapes and workflow graphs never reach the reasoner', async (ctx) => {
    const withNoise = skolemStore();
    // an axiom hidden in an excluded graph that would change the result if it leaked
    withNoise.addQuad(nn(`${M}Leak`), nn('http://www.w3.org/2000/01/rdf-schema#subClassOf'), nn(`${M}Composite`), nn('urn:vg:shapes'));
    withNoise.addQuad(nn(`${M}leakInd`), nn(TYPE), nn(`${M}Leak`), nn('urn:vg:workflows'));
    withNoise.addQuad(nn(`${M}Leak`), nn(TYPE), nn('http://www.w3.org/2002/07/owl#Class'), nn('urn:vg:shapes'));
    withNoise.addQuad(nn(`${M}leakInd`), nn(TYPE), nn('http://www.w3.org/2002/07/owl#NamedIndividual'), nn('urn:vg:workflows'));
    const r = await mk({ excludeGraphs: NON_AXIOM }); if (!r) return ctx.skip();
    await r.materialize(withNoise, { includeClassHierarchy: true, inferredGraph: INFERRED, returnDelta: true });
    const leaked = keys(withNoise).some((k) => k.includes('leakInd'));
    r.terminate();
    expect(leaked, 'inference from excluded graphs').toBe(false);

    const r2 = await mk(); // control: without exclusion the leak is visible
    const control = skolemStore();
    control.addQuad(nn(`${M}Leak`), nn('http://www.w3.org/2000/01/rdf-schema#subClassOf'), nn(`${M}Composite`), nn('urn:vg:shapes'));
    control.addQuad(nn(`${M}leakInd`), nn(TYPE), nn(`${M}Leak`), nn('urn:vg:workflows'));
    control.addQuad(nn(`${M}Leak`), nn(TYPE), nn('http://www.w3.org/2002/07/owl#Class'), nn('urn:vg:shapes'));
    control.addQuad(nn(`${M}leakInd`), nn(TYPE), nn('http://www.w3.org/2002/07/owl#NamedIndividual'), nn('urn:vg:workflows'));
    await r2!.materialize(control, { includeClassHierarchy: true, inferredGraph: INFERRED, returnDelta: true });
    expect(keys(control).some((k) => k.includes('leakInd')), 'control sees the leak').toBe(true);
    r2!.terminate();
  }, 120_000);

  it('second run on unchanged input keeps the inferred graph; an edit produces a delta', async (ctx) => {
    const r = await mk({ excludeGraphs: NON_AXIOM }); if (!r) return ctx.skip();
    const s = skolemStore();
    const o = { includeClassHierarchy: true, inferredGraph: INFERRED, returnDelta: true } as const;
    await r.materialize(s, o);
    const first = keys(s);
    const again = await r.materialize(s, o) as any;
    expect(keys(s)).toEqual(first);
    expect(again.delta.added.length + again.delta.removed.length).toBe(0);
    // a second composite with a fibre constituent: realized as FiberReinforced via the blank-node class expression
    s.addQuad(nn(`${M}NewInd`), nn(TYPE), nn(`${M}Composite`), DATA);
    s.addQuad(nn(`${M}NewInd`), nn(`${M}hasConstituent`), nn(`${M}CarbonFiber`), DATA);
    const edited = await r.materialize(s, o) as any;
    expect(edited.delta.added.some((q: N3.Quad) => q.subject.value === `${M}NewInd` && q.object.value === `${M}FiberReinforced`)).toBe(true);
    expect(keys(s)).toContain(`${M}NewInd ${TYPE} ${M}FiberReinforced`);
    r.terminate();
  }, 120_000);
});
