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

  // ── Gate suite for dropping the copy (plan Unit 2) ────────────────────────────────────────────
  const ROOT = path.resolve(__dirname, '../../..');
  const OWL = 'http://www.w3.org/2002/07/owl#';
  const norm = (t: N3.Term) => (t.termType === 'BlankNode' || t.value.startsWith(SKOLEM) || /^sk_/.test(t.value) ? 'B'
    : t.termType === 'Literal' ? `"${t.value}"` : t.value);
  const normKeys = (s: N3.Store) => s.getQuads(null, null, null, nn(INFERRED))
    .map((q) => `${norm(q.subject)} ${q.predicate.value} ${norm(q.object)}`).sort();
  const skolemize = (quads: N3.Quad[]) => new N3.Store(quads.map((q) =>
    quad(sk(q.subject) as N3.Quad_Subject, q.predicate, sk(q.object) as N3.Quad_Object, DATA)));
  const opts = { includeClassHierarchy: true, inferredGraph: INFERRED, returnDelta: true } as const;

  async function sameAsCopy(ctx: any, build: () => N3.Store) {
    const r1 = await mk({ excludeGraphs: NON_AXIOM }); if (!r1) return ctx.skip();
    const direct = build();
    await r1.materialize(direct, opts); r1.terminate();
    const r2 = await mk(); const copy = reasoningBase(build());
    await r2!.materialize(copy, opts); r2!.terminate();
    expect(normKeys(direct)).toEqual(normKeys(copy));
    const out = direct.getQuads(null, null, null, nn(INFERRED));
    expect(out.some((q) => q.subject.termType === 'BlankNode' || q.object.termType === 'BlankNode'), 'blank term in output').toBe(false);
    return normKeys(direct);
  }

  it('oneOf and unionOf: same as the copy path, expected types inferred', async (ctx) => {
    const ttl = `@prefix : <http://e/> . @prefix owl: <${OWL}> .
      :Color a owl:Class ; owl:equivalentClass [ a owl:Class ; owl:oneOf (:red :green) ] . :red a owl:NamedIndividual . :green a owl:NamedIndividual .
      :A a owl:Class . :B a owl:Class . :AorB a owl:Class ; owl:equivalentClass [ a owl:Class ; owl:unionOf (:A :B) ] .
      :x a owl:NamedIndividual, :A . :y a owl:NamedIndividual, :B .`;
    const parsed = new N3.Parser().parse(ttl);
    const keys = await sameAsCopy(ctx, () => skolemize(parsed));
    expect(keys).toContain('http://e/red ' + TYPE + ' http://e/Color');
    expect(keys).toContain('http://e/x ' + TYPE + ' http://e/AorB');
  }, 120_000);

  it('blank-node individual and restriction-defined class: inference lands on the stored skolem IRI', async (ctx) => {
    const r = await mk({ excludeGraphs: NON_AXIOM }); if (!r) return ctx.skip();
    const ttl = `@prefix : <http://e/> . @prefix owl: <${OWL}> . @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
      :SubC a owl:Class ; rdfs:subClassOf :C . :C a owl:Class . :p a owl:ObjectProperty .
      :a a owl:NamedIndividual ; :p [ a :SubC ] .
      :D a owl:Class ; owl:equivalentClass [ a owl:Restriction ; owl:onProperty :p ; owl:someValuesFrom :SubC ] .`;
    const s = skolemize(new N3.Parser().parse(ttl));
    const stored = new Set(s.getQuads(null, null, null, null).flatMap((q) => [q.subject, q.object]).filter((t) => t.value.startsWith(SKOLEM)).map((t) => t.value));
    await r.materialize(s, opts); r.terminate();
    const inf = s.getQuads(null, null, null, nn(INFERRED));
    expect(inf.some((q) => q.subject.value === 'http://e/a' && q.object.value === 'http://e/D')).toBe(true);
    const bn = inf.find((q) => q.subject.value.startsWith(SKOLEM) && q.object.value === 'http://e/C');
    expect(bn, 'blank individual typed C').toBeTruthy();
    expect(stored.has(bn!.subject.value), 'returned skolem IRI is the stored one').toBe(true);
    for (const q of inf) for (const t of [q.subject, q.object]) {
      expect(t.termType === 'BlankNode' || /^sk_/.test(t.value)).toBe(false);
      if (t.value.startsWith(SKOLEM)) expect(stored.has(t.value)).toBe(true);
    }
  }, 120_000);

  it('pizza (RDF/XML): same as the copy path', async (ctx) => {
    const { RdfXmlParser } = await import('rdfxml-streaming-parser');
    const parsed: N3.Quad[] = await new Promise((resolve, reject) => {
      const out: N3.Quad[] = []; const p = new RdfXmlParser();
      p.on('data', (q: N3.Quad) => out.push(q)); p.on('error', reject); p.on('end', () => resolve(out));
      p.write(fs.readFileSync(path.join(ROOT, 'public/bench-pizza.owl'), 'utf8')); p.end();
    });
    expect(parsed.length).toBeGreaterThan(1000);
    await sameAsCopy(ctx, () => skolemize(parsed));
  }, 120_000);

  it('PMDco (unionOf, intersectionOf, restrictions): same as the copy path; blank labels map to distinct skolem IRIs', async (ctx) => {
    const parsed = new N3.Parser().parse(fs.readFileSync(path.join(ROOT, 'public/bench-pmdco.ttl'), 'utf8'));
    const labels = new Set(parsed.flatMap((q) => [q.subject, q.object]).filter((t) => t.termType === 'BlankNode').map((t) => t.value));
    expect(labels.size).toBeGreaterThan(500);
    // the worker skolemizes by fnv1a32(label) (rdfManager.runtime.ts); copied here, keep in sync
    const fnv = (str: string) => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };
    expect(new Set([...labels].map(fnv)).size, 'fnv1a32 collision among PMDco blank-node labels').toBe(labels.size);
    const keys = await sameAsCopy(ctx, () => skolemize(parsed));
    expect(keys.length).toBeGreaterThan(0);
  }, 240_000);

  it('explain, repair and weaken outputs carry no blank nodes and no unknown skolem IRIs', async (ctx) => {
    const r = await mk({ excludeGraphs: NON_AXIOM }); if (!r) return ctx.skip();
    // x is typed A; A ⊑ ∀p.B (blank restriction); x p y; y is a C; B and C disjoint: inconsistent through the restriction
    const ttl = `@prefix : <http://e/> . @prefix owl: <${OWL}> . @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
      :A a owl:Class ; rdfs:subClassOf [ a owl:Restriction ; owl:onProperty :p ; owl:allValuesFrom :B ] .
      :B a owl:Class ; owl:disjointWith :C . :C a owl:Class . :p a owl:ObjectProperty .
      :x a owl:NamedIndividual, :A ; :p :y . :y a owl:NamedIndividual, :C .`;
    const s = skolemize(new N3.Parser().parse(ttl));
    const stored = new Set(s.getQuads(null, null, null, null).flatMap((q) => [q.subject, q.object]).filter((t) => t.value.startsWith(SKOLEM)).map((t) => t.value));
    expect(stored.size).toBeGreaterThan(0);
    const check = (what: string, quads: N3.Quad[]) => {
      for (const q of quads) for (const t of [q.subject, q.object]) {
        expect(t.termType === 'BlankNode', `${what}: blank node ${t.value}`).toBe(false);
        expect(/^sk_/.test(t.value), `${what}: leaked label ${t.value}`).toBe(false);
        if (t.value.startsWith(SKOLEM)) expect(stored.has(t.value), `${what}: unknown skolem ${t.value}`).toBe(true);
      }
    };
    try {
      expect(await r.checkConsistency(s)).toBe(false);
      const mips = await r.explainInconsistency(s);
      expect(mips.length).toBeGreaterThan(0);
      check('explainInconsistency', mips.flat());
      const axioms = await r.explainInconsistencyAxioms(s);
      expect(axioms.length).toBeGreaterThan(0);
      check('explainInconsistencyAxioms', axioms.flatMap((j: any) => j.axioms.flatMap((a: any) => a.quads)));
      const rep: any = await r.repair(s);
      const repQuads: N3.Quad[] = [];
      const walk = (o: any) => { if (!o) return; if (Array.isArray(o)) return o.forEach(walk); if (typeof o === 'object') { if (o.termType && o.subject === undefined) return; if (o.subject && o.predicate && o.object) { repQuads.push(o); return; } Object.values(o).forEach(walk); } };
      walk(rep);
      check('repair', repQuads);
    } finally { r.terminate(); }
  }, 120_000);
});
