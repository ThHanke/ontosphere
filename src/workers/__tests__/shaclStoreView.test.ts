// @vitest-environment node
// shacl-engine over ShaclStoreView (no copy of the N3 store) vs. the engine on copied datasets.
import { describe, it, expect } from 'vitest';
import * as N3 from 'n3';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ShaclStoreView } from '../shaclStoreView.ts';

const { namedNode: nn, quad } = N3.DataFactory;
const root = resolve(__dirname, '../../..');
const read = (f: string) => readFileSync(resolve(root, f), 'utf-8');

function fill(store: N3.Store, ttl: string, graph: string, only?: (q: N3.Quad) => boolean) {
  for (const q of new N3.Parser().parse(ttl)) {
    if (only && !only(q)) continue;
    store.addQuad(quad(q.subject as any, q.predicate, q.object as any, nn(graph)));
  }
}

async function engine() {
  const { Validator } = await import('shacl-engine') as any;
  const { targetResolvers, validations } = await import('shacl-engine/sparql.js') as any;
  const factory = ((await import('@rdfjs/data-model')) as any).default;
  return { Validator, targetResolvers, validations, factory };
}

const key = (r: any) => `${r.focusNode.value}|${r.shape?.ptr?.term?.value ?? ''}`;

const EX = 'http://example.com/reasoning-demo#';
const SUBCLASS = 'http://www.w3.org/2000/01/rdf-schema#subClassOf';
// zed is typed only as Executive; Executive ⊑ Manager ⊑ Employee is declared in the demo TBox.
const EXTRA = `@prefix ex: <${EX}> . ex:zed a ex:Executive .`;

describe('shacl-engine over ShaclStoreView (reasoning demo)', () => {
  it('view: same results as copied datasets when everything is one graph', async () => {
    const { Validator, targetResolvers, validations, factory } = await engine();
    const dataset = ((await import('@rdfjs/dataset')) as any).default.dataset;
    const store = new N3.Store();
    fill(store, read('public/reasoning-demo.ttl'), 'urn:vg:data');
    fill(store, read('public/shacl-shapes/reasoning-demo.shacl.ttl'), 'urn:vg:shapes');
    const view = new ShaclStoreView(store);
    const viaView = await new Validator(view, { factory, targetResolvers, validations }).validate({ dataset: view });

    const shapes = dataset(), data = dataset();
    for (const q of store.match(null, null, null, nn('urn:vg:shapes'))) shapes.add(factory.quad(q.subject, q.predicate, q.object));
    for (const q of store.match(null, null, null, nn('urn:vg:data'))) data.add(factory.quad(q.subject, q.predicate, q.object));
    const viaCopy = await new Validator(shapes, { factory, targetResolvers, validations }).validate({ dataset: data });

    expect(viaView.results.map(key).sort()).toEqual(viaCopy.results.map(key).sort());
    expect(viaView.results.length).toBeGreaterThan(0);
  });

  it('view: sh:targetClass follows a hierarchy that lives in the ontology graph', async () => {
    const { Validator, targetResolvers, validations, factory } = await engine();
    const store = new N3.Store();
    const demo = read('public/reasoning-demo.ttl');
    fill(store, demo, 'urn:vg:ontologies', (q) => q.predicate.value === SUBCLASS);
    fill(store, demo, 'urn:vg:data', (q) => q.predicate.value !== SUBCLASS);
    fill(store, EXTRA, 'urn:vg:data');
    fill(store, read('public/shacl-shapes/reasoning-demo.shacl.ttl'), 'urn:vg:shapes');
    const view = new ShaclStoreView(store);
    const report = await new Validator(view, { factory, targetResolvers, validations }).validate({ dataset: view });
    const jobTitle = report.results.filter((r: any) => JSON.stringify(r.message).includes('ex:jobTitle')).map((r: any) => r.focusNode.value);
    expect(jobTitle).toContain(`${EX}zed`);
  });

  it('copied datasets (current worker approach) miss the same subclass instance', async () => {
    const { Validator, targetResolvers, validations, factory } = await engine();
    const dataset = ((await import('@rdfjs/dataset')) as any).default.dataset;
    const shapes = dataset(), data = dataset();
    for (const q of new N3.Parser().parse(read('public/shacl-shapes/reasoning-demo.shacl.ttl'))) shapes.add(factory.quad(q.subject, q.predicate, q.object));
    for (const q of new N3.Parser().parse(read('public/reasoning-demo.ttl') + EXTRA)) data.add(factory.quad(q.subject, q.predicate, q.object));
    const report = await new Validator(shapes, { factory, targetResolvers, validations }).validate({ dataset: data });
    const jobTitle = report.results.filter((r: any) => JSON.stringify(r.message).includes('ex:jobTitle')).map((r: any) => r.focusNode.value);
    expect(jobTitle).toContain(`${EX}bob`); // direct Employee: found
    expect(jobTitle).not.toContain(`${EX}zed`);
  });
});
