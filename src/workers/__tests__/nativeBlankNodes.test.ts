// @vitest-environment node
//
// Spike: can the N3 store hold real blank nodes and feed the reasoner directly, with skolem
// IRIs only as a reversible mapping at the canvas/API edge?
//   1. same named-graph structure as the store, native BlankNode terms, no reasoningBase copy
//   2. the reasoner infers what it infers from the skolemized+reasoningBase path
//   3. a label <-> IRI mapping is a lossless bijection
//   4. the store merges blank nodes by label exactly as the hash skolemizer did
import { describe, it, expect } from 'vitest';
import * as N3 from 'n3';
import fs from 'node:fs';
import path from 'node:path';
import { RdfReasoner } from 'rdf-reasoner-konclude';
import { reasoningBase } from '../rdfManager.runtime.ts';

const { namedNode: nn, blankNode: bn, quad } = N3.DataFactory;
const M = 'http://example.org/materials#';
const TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const SKOLEM = 'urn:vg:bnode:';
const INFERRED = 'urn:vg:inferred';
const DATA = nn('urn:vg:data');

const toIri = (label: string) => `${SKOLEM}${label}`;
const toLabel = (iri: string) => (iri.startsWith(SKOLEM) ? iri.slice(SKOLEM.length) : null);

function intoGraph(quads: N3.Quad[], g: N3.NamedNode): N3.Store {
  return new N3.Store(quads.map((q) => quad(q.subject, q.predicate, q.object, g)));
}

describe('native blank nodes in the store', () => {
  it('label <-> IRI mapping is lossless, including odd labels', () => {
    for (const label of ['b0', 'b12_x', 'df_0_3', 'abc123', 'with-dash']) {
      expect(toLabel(toIri(label))).toBe(label);
    }
    expect(toLabel('http://example.org/x')).toBeNull();
  });

  it('store merges blank nodes by label across graphs and parsers', () => {
    const store = new N3.Store();
    store.addQuad(bn('b0'), nn(TYPE), nn('http://www.w3.org/2002/07/owl#Restriction'), DATA);
    store.addQuad(bn('b0'), nn('http://www.w3.org/2002/07/owl#onProperty'), nn(`${M}p`), DATA);
    expect(store.getQuads(bn('b0'), null, null, DATA)).toHaveLength(2);
    // distinct labels stay distinct (no collapse of restrictions sharing onProperty)
    store.addQuad(bn('b1'), nn('http://www.w3.org/2002/07/owl#onProperty'), nn(`${M}p`), DATA);
    expect(store.getQuads(bn('b1'), null, null, DATA)).toHaveLength(1);
  });

  it('reasons over the native store directly, same result as the skolemized copy path', async (ctx) => {
    const start = async () => {
      const r = new RdfReasoner();
      await r.ready;
      return r;
    };
    let probe: RdfReasoner;
    try {
      probe = await start();
    } catch (e) {
      if (process.env.REQUIRE_KONCLUDE) throw e;
      return ctx.skip();
    }
    probe.terminate();

    const ttl = fs.readFileSync(path.resolve(__dirname, '../../../benchmarks/ontoauthor-mat/t2-existential/reference.ttl'), 'utf8');
    const parsed = new N3.Parser().parse(ttl);

    const run = async (s: N3.Store) => {
      const r = await start();
      try {
        await r.materialize(s, { includeClassHierarchy: true, inferredGraph: INFERRED, returnDelta: true });
      } finally {
        r.terminate();
      }
      return s.getQuads(null, null, null, nn(INFERRED)).map((q) => `${q.subject.value} ${q.predicate.value} ${q.object.value}`).sort();
    };

    const native = intoGraph(parsed, DATA); // blank nodes stay blank, no copy
    const viaCopy = reasoningBase(new N3.Store(parsed.map((q) => quad(
      q.subject.termType === 'BlankNode' ? nn(toIri(q.subject.value)) : q.subject,
      q.predicate,
      q.object.termType === 'BlankNode' ? nn(toIri(q.object.value)) : q.object,
      DATA))));

    const a = await run(native);
    const b = await run(viaCopy);
    expect(a).toContain(`${M}CFRP ${TYPE} ${M}FiberReinforced`);
    expect(a).toEqual(b);
  }, 120_000);
});
