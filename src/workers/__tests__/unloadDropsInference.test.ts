// Inferred quads are derived from the loaded axioms. Unloading an ontology (or removing a graph
// the reasoner read) must drop the inferred graph, or its orphaned subjects reappear on the canvas.

import { describe, it, expect } from 'vitest';
import * as N3 from 'n3';
import { createRdfWorkerRuntime } from '../rdfManager.runtime.ts';
import { serializeQuad } from '../../utils/rdfSerialization.ts';

const nn = N3.DataFactory.namedNode;
const EX = 'http://example.org/#';
const RDFS_SUBCLASS = 'http://www.w3.org/2000/01/rdf-schema#subClassOf';
const ONT = 'http://example.org/ont';

const settle = async () => {
  for (let i = 0; i < 100; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 10));
};

function setup() {
  const messages: any[] = [];
  const runtime = createRdfWorkerRuntime((m) => messages.push(m));
  const send = async (command: string, payload: unknown) => {
    messages.length = 0;
    runtime.handleEvent({ type: 'command', id: command, command, payload });
    await settle();
  };
  const add = (graphName: string, ...quads: N3.Quad[]) =>
    send('syncBatch', {
      graphName,
      adds: quads.map((q) => serializeQuad(N3.DataFactory.quad(q.subject, q.predicate, q.object, nn(graphName)))),
      removes: [],
    });
  const inferred = async () => {
    await send('getGraphCounts', undefined);
    return (messages.find((m) => m?.id === 'getGraphCounts')?.result?.['urn:vg:inferred'] as number) ?? 0;
  };
  return { runtime, messages, send, add, inferred };
}

const q = (s: string, p: string, o: string) => N3.DataFactory.quad(nn(s), nn(p), nn(o));

describe('inference after axioms are removed', () => {
  it('unloading an ontology empties the inferred graph', async () => {
    const { runtime, add, send, inferred } = setup();
    await add('urn:vg:ontologies',
      q(`${EX}A`, RDFS_SUBCLASS, `${EX}B`),
      q(`${EX}A`, 'urn:vg:loadedFrom', ONT));
    await add('urn:vg:inferred', q(`${EX}A`, RDFS_SUBCLASS, `${EX}Thing`));
    expect(await inferred()).toBe(1);

    await send('unloadOntologySubjects', { ontologyUrl: ONT });

    expect(await inferred()).toBe(0);
    runtime.terminate();
  });

  it('removing a data graph empties the inferred graph', async () => {
    const { runtime, add, send, inferred } = setup();
    await add('urn:vg:data', q(`${EX}a`, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', `${EX}A`));
    await add('urn:vg:inferred', q(`${EX}a`, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', `${EX}B`));

    await send('syncRemoveGraph', { graphName: 'urn:vg:data' });

    expect(await inferred()).toBe(0);
    runtime.terminate();
  });
});
