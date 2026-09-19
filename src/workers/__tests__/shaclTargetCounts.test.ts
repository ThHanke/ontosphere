// validateGraph reports how many focus nodes each shape selected. `conforms: true` covers both
// "every selected focus node satisfied the shape" and "the shape selected nothing, so nothing
// was checked"; the counts tell the two apart. In the PMDco example the semiconductor shape
// selects no focus node before classification and one after it.

import { describe, it, expect } from 'vitest';
import * as N3 from 'n3';
import { createRdfWorkerRuntime } from '../rdfManager.runtime.ts';
import { serializeQuad } from '../../utils/rdfSerialization.ts';

const nn = N3.DataFactory.namedNode;
const lit = N3.DataFactory.literal;
const EX = 'http://example.org/#';
const SH = 'http://www.w3.org/ns/shacl#';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

const settle = async () => {
  for (let i = 0; i < 100; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 10));
};

function makeRuntime() {
  const messages: any[] = [];
  const runtime = createRdfWorkerRuntime((m) => messages.push(m));
  const seed = async (graphName: string, quads: N3.Quad[]) => {
    runtime.handleEvent({
      type: 'command',
      id: `seed-${graphName}-${Math.random()}`,
      command: 'syncBatch',
      payload: {
        graphName,
        adds: quads.map((q) => serializeQuad(N3.DataFactory.quad(q.subject, q.predicate, q.object, nn(graphName)))),
        removes: [],
      },
    });
    await settle();
  };
  const validate = async () => {
    messages.length = 0;
    runtime.handleEvent({ type: 'command', id: 'v', command: 'runShaclValidation' });
    // the first call dynamically imports shacl-engine, which can take seconds
    const deadline = Date.now() + 60_000;
    for (;;) {
      const reply = messages.find((m) => m?.type === 'response' && m?.id === 'v');
      if (reply) return reply.result;
      if (Date.now() > deadline) throw new Error('runShaclValidation did not respond');
      await new Promise((r) => setTimeout(r, 25));
    }
  };
  return { runtime, seed, validate };
}

// A shape targeting a class no asserted node has: the semiconductor case in miniature.
const shapeQuads = [
  N3.DataFactory.quad(nn(`${EX}SemiconductorShape`), nn(RDF_TYPE), nn(`${SH}NodeShape`)),
  N3.DataFactory.quad(nn(`${EX}SemiconductorShape`), nn(`${SH}targetClass`), nn(`${EX}Semiconductor`)),
];

describe('SHACL reports focus-node counts per shape', () => {
  it('a shape that selects nothing is reported as untargeted, not merely conforming', async () => {
    const { runtime, seed, validate } = makeRuntime();
    await seed('urn:vg:shapes', shapeQuads);
    // asserted data only: the silicon portion is NOT typed as a Semiconductor
    await seed('urn:vg:data', [
      N3.DataFactory.quad(nn(`${EX}some_silicon`), nn(RDF_TYPE), nn(`${EX}PortionOfSilicon`)),
    ]);

    const report = await validate();
    expect(report.conforms).toBe(true);
    const target = report.shapeTargets.find((t: any) => t.shape === `${EX}SemiconductorShape`);
    expect(target, 'the shape must appear in the report').toBeDefined();
    expect(target.targetCount, 'no focus node before classification').toBe(0);
    expect(report.untargetedShapeCount).toBe(1);
    runtime.terminate();
  });

  it('the same shape selects a focus node once the type is inferred', async () => {
    const { runtime, seed, validate } = makeRuntime();
    await seed('urn:vg:shapes', shapeQuads);
    await seed('urn:vg:data', [
      N3.DataFactory.quad(nn(`${EX}some_silicon`), nn(RDF_TYPE), nn(`${EX}PortionOfSilicon`)),
    ]);
    // what classification materialises
    await seed('urn:vg:inferred', [
      N3.DataFactory.quad(nn(`${EX}some_silicon`), nn(RDF_TYPE), nn(`${EX}Semiconductor`)),
    ]);

    const report = await validate();
    const target = report.shapeTargets.find((t: any) => t.shape === `${EX}SemiconductorShape`);
    expect(target.targetCount, 'one focus node after classification').toBe(1);
    expect(report.untargetedShapeCount).toBe(0);
    runtime.terminate();
  });

  it('sh:targetClass also matches instances of a subclass', async () => {
    const { runtime, seed, validate } = makeRuntime();
    await seed('urn:vg:shapes', shapeQuads);
    await seed('urn:vg:data', [
      N3.DataFactory.quad(nn(`${EX}DopedSilicon`), nn('http://www.w3.org/2000/01/rdf-schema#subClassOf'), nn(`${EX}Semiconductor`)),
      N3.DataFactory.quad(nn(`${EX}sample`), nn(RDF_TYPE), nn(`${EX}DopedSilicon`)),
    ]);

    const report = await validate();
    const target = report.shapeTargets.find((t: any) => t.shape === `${EX}SemiconductorShape`);
    expect(target.targetCount).toBe(1);
    runtime.terminate();
  });

  it('property shapes reached through sh:property are not reported as untargeted', async () => {
    const { runtime, seed, validate } = makeRuntime();
    // PMDco auto-shape style: the node shape is its own target class, the property shape is named
    await seed('urn:vg:shapes', [
      N3.DataFactory.quad(nn(`${EX}Semiconductor`), nn(RDF_TYPE), nn(`${SH}NodeShape`)),
      N3.DataFactory.quad(nn(`${EX}Semiconductor`), nn(RDF_TYPE), nn('http://www.w3.org/2000/01/rdf-schema#Class')),
      N3.DataFactory.quad(nn(`${EX}Semiconductor`), nn(`${SH}property`), nn(`${EX}Semiconductor-hasQuality`)),
      N3.DataFactory.quad(nn(`${EX}Semiconductor-hasQuality`), nn(RDF_TYPE), nn(`${SH}PropertyShape`)),
      N3.DataFactory.quad(nn(`${EX}Semiconductor-hasQuality`), nn(`${SH}path`), nn(`${EX}hasQuality`)),
      N3.DataFactory.quad(nn(`${EX}Orphan`), nn(RDF_TYPE), nn(`${SH}PropertyShape`)),
    ]);
    await seed('urn:vg:data', [
      N3.DataFactory.quad(nn(`${EX}some_silicon`), nn(RDF_TYPE), nn(`${EX}Semiconductor`)),
    ]);

    const report = await validate();
    const shapes = report.shapeTargets.map((t: any) => t.shape);
    expect(shapes).not.toContain(`${EX}Semiconductor-hasQuality`);
    expect(report.shapeTargets.find((t: any) => t.shape === `${EX}Semiconductor`).targetCount).toBe(1);
    expect(report.untargetedShapeCount, 'only the unreferenced, untargeted shape is inert').toBe(1);
    runtime.terminate();
  });

  it('counts sh:targetNode, sh:targetSubjectsOf and sh:targetObjectsOf', async () => {
    const { runtime, seed, validate } = makeRuntime();
    await seed('urn:vg:shapes', [
      N3.DataFactory.quad(nn(`${EX}NodeS`), nn(RDF_TYPE), nn(`${SH}NodeShape`)),
      N3.DataFactory.quad(nn(`${EX}NodeS`), nn(`${SH}targetNode`), nn(`${EX}pinned`)),
      N3.DataFactory.quad(nn(`${EX}SubjS`), nn(RDF_TYPE), nn(`${SH}NodeShape`)),
      N3.DataFactory.quad(nn(`${EX}SubjS`), nn(`${SH}targetSubjectsOf`), nn(`${EX}hasQuality`)),
      N3.DataFactory.quad(nn(`${EX}ObjS`), nn(RDF_TYPE), nn(`${SH}NodeShape`)),
      N3.DataFactory.quad(nn(`${EX}ObjS`), nn(`${SH}targetObjectsOf`), nn(`${EX}hasQuality`)),
    ]);
    await seed('urn:vg:data', [
      N3.DataFactory.quad(nn(`${EX}a`), nn(`${EX}hasQuality`), nn(`${EX}q1`)),
      N3.DataFactory.quad(nn(`${EX}b`), nn(`${EX}hasQuality`), nn(`${EX}q2`)),
      N3.DataFactory.quad(nn(`${EX}c`), nn(`${EX}label`), lit('no quality')),
    ]);

    const report = await validate();
    const by = (iri: string) => report.shapeTargets.find((t: any) => t.shape === iri).targetCount;
    expect(by(`${EX}NodeS`), 'targetNode always selects its node').toBe(1);
    expect(by(`${EX}SubjS`), 'two subjects carry hasQuality').toBe(2);
    expect(by(`${EX}ObjS`), 'two objects of hasQuality').toBe(2);
    runtime.terminate();
  });
});
