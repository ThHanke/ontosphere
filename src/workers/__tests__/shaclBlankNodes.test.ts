// @vitest-environment node
//
// The store keeps blank nodes skolemized (urn:vg:bnode:*). SHACL must still see them as blank
// nodes: isIRI() is false, so shapes that opt out (SPARQL target with FILTER(isIRI(?this)), like
// the owl:Class shapes in ontology-quality) skip them; plain sh:targetClass still targets them.
// Results on blank nodes come back under the store's IRI form.
import { describe, it, expect } from 'vitest';
import * as N3 from 'n3';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRdfWorkerRuntime } from '../rdfManager.runtime.ts';
import { serializeQuad } from '../../utils/rdfSerialization.ts';

const { namedNode: nn, quad } = N3.DataFactory;
const settle = () => new Promise((res) => setTimeout(res, 50));

async function run(shapesTtl: string, dataTtl: string, ontologyTtl?: string) {
  const messages: any[] = [];
  const runtime = createRdfWorkerRuntime((m) => messages.push(m));
  const seed = async (graphName: string, ttl: string) => {
    const adds = new N3.Parser().parse(ttl).map((q) => serializeQuad(quad(q.subject, q.predicate, q.object, nn(graphName))));
    runtime.handleEvent({ type: 'command', id: `seed-${graphName}`, command: 'syncBatch', payload: { graphName, adds, removes: [] } });
    await settle();
  };
  await seed('urn:vg:data', dataTtl);
  if (ontologyTtl) await seed('urn:vg:ontologies', ontologyTtl);
  await seed('urn:vg:shapes', shapesTtl);
  runtime.handleEvent({ type: 'command', id: 'v', command: 'runShaclValidation', payload: {} });
  const deadline = Date.now() + 20_000;
  let reply: any;
  while (!(reply = messages.find((m) => m?.type === 'response' && m?.id === 'v'))) {
    if (Date.now() > deadline) throw new Error('runShaclValidation did not respond');
    await settle();
  }
  runtime.terminate();
  return reply.result as { violations: { focusNode: string | null; sourceShape: string | null }[] };
}

describe('SHACL sees skolemized nodes as blank nodes', () => {
  it('ontology-quality: anonymous owl:Class is skipped, named class still checked', async () => {
    const { violations } = await run(
      readFileSync(resolve(__dirname, '../../../public/shacl-shapes/ontology-quality.shacl.ttl'), 'utf-8'),
      `@prefix owl: <http://www.w3.org/2002/07/owl#> .
       <urn:vg:bnode:c1> a owl:Class .
       <http://example.org/NamedClass> a owl:Class .`,
    );
    const focus = new Set(violations.map((v) => v.focusNode));
    expect(focus).toEqual(new Set(['http://example.org/NamedClass']));
  });

  it('plain sh:targetClass still targets blank nodes', async () => {
    const { violations } = await run(
      readFileSync(resolve(__dirname, '../../../public/shacl-shapes/reasoning-demo.shacl.ttl'), 'utf-8'),
      `@prefix ex: <http://example.com/reasoning-demo#> . <urn:vg:bnode:i1> a ex:Project .`,
    );
    expect(violations.map((v) => v.focusNode)).toContain('urn:vg:bnode:i1');
  });

  it('shapes see a real blank node (nodeKind), result keeps the store IRI', async () => {
    const { violations } = await run(`
      @prefix sh: <http://www.w3.org/ns/shacl#> . @prefix owl: <http://www.w3.org/2002/07/owl#> .
      <urn:s:BNodeOnly> a sh:NodeShape ; sh:targetClass owl:Class ; sh:nodeKind sh:IRI .`,
    `@prefix owl: <http://www.w3.org/2002/07/owl#> . <urn:vg:bnode:c1> a owl:Class . <http://example.org/N> a owl:Class .`);
    expect(violations.map((v) => v.focusNode)).toEqual(['urn:vg:bnode:c1']);
  });

  it('triples from the ontology graph are visible; findings only for data nodes', async () => {
    const shapes = `@prefix sh: <http://www.w3.org/ns/shacl#> . @prefix ex: <http://example.org/> .
      <urn:s:Thing> a sh:NodeShape ; sh:targetClass ex:Thing ;
        sh:property [ sh:path ex:name ; sh:minCount 1 ] .
      <urn:s:Link> a sh:NodeShape ; sh:targetNode ex:x ;
        sh:property [ sh:path ex:p ; sh:class ex:Animal ] .`;
    const data = `@prefix ex: <http://example.org/> . ex:x ex:p ex:y . ex:rex a ex:Thing .`;
    // ex:y is typed only in the ontology graph; ex:ImportedThing lives only there
    const ont = `@prefix ex: <http://example.org/> . ex:y a ex:Animal . ex:ImportedThing a ex:Thing .`;
    const without = await run(shapes, data);
    expect(without.violations.map((v) => v.sourceShape)).toContain('urn:s:Link');
    const withOnt = await run(shapes, data, ont);
    expect(withOnt.violations.map((v) => v.sourceShape)).not.toContain('urn:s:Link');
    expect(withOnt.violations.map((v) => v.focusNode)).toEqual(['http://example.org/rex']);
  });
});
