// @vitest-environment node
// SHACL focus-node counts, conforms from the reported list, per-shape isolation of engine errors,
// foreign named graphs on import, the loaded-from bookkeeping graph and the JSON-LD dataset export.
import { describe, it, expect } from 'vitest';
import * as N3 from 'n3';
import { createRdfWorkerRuntime } from '../rdfManager.runtime.ts';

const EX = 'http://example.org/';
const PREFIXES = `@prefix sh: <http://www.w3.org/ns/shacl#> . @prefix ex: <${EX}> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> . @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .`;

function makeRuntime() {
  const messages: any[] = [];
  const runtime = createRdfWorkerRuntime((m) => messages.push(m));
  let n = 0;
  const call = async (command: string, payload?: unknown) => {
    const id = `c${n++}`;
    runtime.handleEvent({ type: 'command', id, command, ...(payload === undefined ? {} : { payload }) });
    const deadline = Date.now() + 30_000;
    for (;;) {
      const r = messages.find((m) => m?.type === 'response' && m?.id === id);
      if (r) {
        if (r.error) throw new Error(String(r.error?.message ?? r.error));
        return r.result;
      }
      if (Date.now() > deadline) throw new Error(`${command} did not respond`);
      await new Promise((res) => setTimeout(res, 10));
    }
  };
  const load = (content: string, graphName: string, extra: Record<string, unknown> = {}) =>
    call('importSerialized', { content, graphName, contentType: 'text/turtle', ...extra });
  return { runtime, call, load };
}

describe('runShaclValidation focus counts', () => {
  it('counts node shapes that select focus nodes in the record, asserted vs after reasoning', async () => {
    const { runtime, call, load } = makeRuntime();
    await load(`${PREFIXES}
      ex:AShape a sh:NodeShape ; sh:targetClass ex:A .
      ex:B a sh:NodeShape, rdfs:Class .
      ex:UnusedShape a sh:NodeShape ; sh:targetClass ex:Nothing .
      ex:PropOnly a sh:PropertyShape ; sh:path ex:p ; sh:targetClass ex:A .`, 'urn:vg:shapes');
    await load(`${PREFIXES} ex:Sub rdfs:subClassOf ex:A . ex:onto a ex:A .`, 'urn:vg:ontologies');
    await load(`${PREFIXES} ex:a a ex:A . ex:b a ex:Sub .`, 'urn:vg:data');

    const asserted = await call('runShaclValidation');
    expect(asserted.focus).toMatchObject({ nodeShapes: 3, shapesWithFocus: 1, afterReasoning: false });
    // ex:onto is a focus node too, but not a subject in urn:vg:data
    expect(asserted.focus.perShape).toEqual({ [`${EX}AShape`]: 2 });
    expect(asserted.focusComparison).toBeUndefined();

    await load(`${PREFIXES} ex:a a ex:B .`, 'urn:vg:inferred');
    const reasoned = await call('runShaclValidation');
    expect(reasoned.focus).toMatchObject({ shapesWithFocus: 2, afterReasoning: true });
    expect(reasoned.focusComparison).toEqual({ nodeShapes: 3, asserted: 1, reasoned: 2, newlyActive: [`${EX}B`] });
    runtime.terminate();
  });

  it('sets conforms from the reported (filtered) violations', async () => {
    const { runtime, call, load } = makeRuntime();
    await load(`${PREFIXES} ex:S a sh:NodeShape ; sh:targetClass ex:A ; sh:property [ sh:path ex:p ; sh:minCount 1 ] .`, 'urn:vg:shapes');
    // the only node violating the shape is an ontology entity, which is not reported
    await load(`${PREFIXES} ex:onto a ex:A .`, 'urn:vg:ontologies');
    await load(`${PREFIXES} ex:a a ex:A ; ex:p 1 .`, 'urn:vg:data');
    const r = await call('runShaclValidation');
    expect(r.violations).toEqual([]);
    expect(r.conforms).toBe(true);
    runtime.terminate();
  });

  it('isolates a shape whose validation throws; the other shapes still report', async () => {
    const { runtime, call, load } = makeRuntime();
    await load(`${PREFIXES}
      ex:Good a sh:NodeShape ; sh:targetClass ex:A ; sh:property [ sh:path ex:p ; sh:minCount 1 ] .
      ex:Bad a sh:NodeShape ; sh:targetClass ex:A ;
        sh:sparql [ sh:select "PREFIX x: <#> SELECT $this WHERE { $this x:q ?v }" ] .`, 'urn:vg:shapes');
    await load(`${PREFIXES} ex:a a ex:A .`, 'urn:vg:data');
    const r = await call('runShaclValidation');
    expect(r.conforms).toBe(false);
    const good = r.violations.filter((v: any) => v.sourceShape === `${EX}Good`);
    expect(good).toHaveLength(1);
    expect(good[0].focusNode).toBe(`${EX}a`);
    const bad = r.violations.filter((v: any) => v.sourceShape === `${EX}Bad`);
    expect(bad).toHaveLength(1);
    expect(bad[0].message).toMatch(/^Validation engine error in shape http:\/\/example.org\/Bad: /);
    runtime.terminate();
  });
});

describe('import and bookkeeping graphs', () => {
  it('puts foreign named graphs of a TriG file into the target graph, keeps urn:vg:* graphs', async () => {
    const { runtime, call } = makeRuntime();
    await call('importSerialized', {
      content: `<${EX}a> <${EX}p> <${EX}b> .
        GRAPH <${EX}g> { <${EX}c> <${EX}p> <${EX}d> . }
        GRAPH <urn:vg:inferred> { <${EX}a> a <${EX}T> . }`,
      graphName: 'urn:vg:data', contentType: 'application/trig',
    });
    const counts = await call('getGraphCounts');
    expect(counts['urn:vg:data']).toBe(2);
    expect(counts['urn:vg:inferred']).toBe(1);
    expect(counts[`${EX}g`]).toBeUndefined();
    runtime.terminate();
  });

  it('writes urn:vg:loadedFrom into its own graph and unloads through it', async () => {
    const { runtime, call, load } = makeRuntime();
    const before = (await call('getGraphCounts'))['urn:vg:ontologies'] ?? 0;
    await load(`${PREFIXES} ex:A rdfs:subClassOf ex:B .`, 'urn:vg:ontologies', { ontologyUrl: `${EX}onto.ttl` });
    let counts = await call('getGraphCounts');
    expect(counts['urn:vg:ontologies']).toBe(before + 1);
    expect(counts['urn:vg:loaded-from']).toBe(1);
    const res = await call('unloadOntologySubjects', { ontologyUrl: `${EX}onto.ttl` });
    expect(res.removedSubjects).toEqual([`${EX}A`]);
    counts = await call('getGraphCounts');
    expect(counts['urn:vg:ontologies'] ?? 0).toBe(before);
    expect(counts['urn:vg:loaded-from'] ?? 0).toBe(0);
    runtime.terminate();
  });

  it('uses the base IRI given for each document', async () => {
    const { runtime, call } = makeRuntime();
    await call('importSerialized', {
      content: `<#S1> a <http://www.w3.org/ns/shacl#NodeShape> .`,
      additionalContents: [`<#S2> a <http://www.w3.org/ns/shacl#NodeShape> .`],
      baseIri: `${EX}one.ttl`, additionalBaseIris: [`${EX}two.ttl`],
      graphName: 'urn:vg:shapes', contentType: 'text/turtle', onlyIfEmpty: true,
    });
    const page = await call('fetchQuadsPage', { graphName: 'urn:vg:shapes', offset: 0, limit: 0, serialize: true });
    const subjects = (page.items as any[]).map((q) => q.subject.value ?? q.subject).sort();
    expect(subjects).toEqual([`${EX}one.ttl#S1`, `${EX}two.ttl#S2`]);
    runtime.terminate();
  });
});

describe('JSON-LD export', () => {
  it('a dataset export has one graph object per named graph; a single-graph export is flat', async () => {
    const { runtime, call, load } = makeRuntime();
    await load(`${PREFIXES} ex:a ex:p ex:b .`, 'urn:vg:data');
    await load(`${PREFIXES} ex:a a ex:T .`, 'urn:vg:inferred');

    const ds = JSON.parse((await call('exportGraph', { format: 'application/ld+json;dataset' })).content);
    const graphs = Object.fromEntries(ds.filter((g: any) => g['@graph']).map((g: any) => [g['@id'], g['@graph']]));
    expect(graphs['urn:vg:data']).toEqual([{ '@id': `${EX}a`, [`${EX}p`]: [{ '@id': `${EX}b` }] }]);
    expect(graphs['urn:vg:inferred']).toEqual([
      { '@id': `${EX}a`, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type': [{ '@id': `${EX}T` }] },
    ]);
    // round trip: a JSON-LD parser reads it back as the same quads
    const { JsonLdParser } = await import('jsonld-streaming-parser');
    const quads: any[] = await new Promise((resolve, reject) => {
      const out: any[] = [];
      const p = new JsonLdParser();
      p.on('data', (q: any) => out.push(q)).on('error', reject).on('end', () => resolve(out));
      p.write(JSON.stringify(ds)); p.end();
    });
    const keys = quads.map((q) => `${q.graph.value} ${q.subject.value} ${q.predicate.value} ${q.object.value}`);
    expect(keys).toContain(`urn:vg:inferred ${EX}a http://www.w3.org/1999/02/22-rdf-syntax-ns#type ${EX}T`);
    expect(keys).toContain(`urn:vg:data ${EX}a ${EX}p ${EX}b`);

    const flat = JSON.parse((await call('exportGraph', { format: 'jsonld', graphName: 'urn:vg:data' })).content);
    expect(flat.every((n: any) => !('@graph' in n))).toBe(true);
    expect(flat).toHaveLength(1);
    expect(Object.keys(flat[0]).sort()).toEqual(['@id', `${EX}p`, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'].sort());
    runtime.terminate();
  });
});

void N3;
