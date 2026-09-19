// importSerialized with onlyIfEmpty writes into an empty target graph only. All documents are
// parsed first and the emptiness check and the writes happen in one worker step, so nothing
// loaded by another command can end up mixed with them.
import { describe, it, expect } from 'vitest';
import * as N3 from 'n3';
import { createRdfWorkerRuntime } from '../rdfManager.runtime.ts';
import { serializeQuad } from '../../utils/rdfSerialization.ts';

const SHAPES = 'urn:vg:shapes';
const doc = (name: string) =>
  `@prefix sh: <http://www.w3.org/ns/shacl#> . <http://example.org/#${name}> a sh:NodeShape .`;

function makeRuntime() {
  const messages: any[] = [];
  const runtime = createRdfWorkerRuntime((m) => messages.push(m));
  const call = async (id: string, command: string, payload?: unknown) => {
    runtime.handleEvent({ type: 'command', id, command, ...(payload === undefined ? {} : { payload }) });
    const deadline = Date.now() + 20_000;
    for (;;) {
      const r = messages.find((m) => m?.type === 'response' && m?.id === id);
      if (r) return r;
      if (Date.now() > deadline) throw new Error(`${id} did not respond`);
      await new Promise((res) => setTimeout(res, 10));
    }
  };
  const shapeCount = async (id: string) =>
    ((await call(id, 'getGraphCounts')).result as Record<string, number>)[SHAPES] ?? 0;
  return { runtime, call, shapeCount };
}

describe('importSerialized with onlyIfEmpty', () => {
  it('writes every document into an empty graph', async () => {
    const { runtime, call, shapeCount } = makeRuntime();
    const r = await call('load', 'importSerialized', {
      content: doc('A'), additionalContents: [doc('B')], graphName: SHAPES, contentType: 'text/turtle', onlyIfEmpty: true,
    });
    expect(r.result.skipped).toBeUndefined();
    expect(r.result.added).toBe(2);
    expect(await shapeCount('count')).toBe(2);
    runtime.terminate();
  });

  it('writes nothing into a graph that already holds quads', async () => {
    const { runtime, call, shapeCount } = makeRuntime();
    const existing = N3.DataFactory.quad(
      N3.DataFactory.namedNode('http://example.org/#Mine'),
      N3.DataFactory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
      N3.DataFactory.namedNode('http://www.w3.org/ns/shacl#NodeShape'),
      N3.DataFactory.namedNode(SHAPES),
    );
    await call('seed', 'syncBatch', { graphName: SHAPES, adds: [serializeQuad(existing)], removes: [] });
    const r = await call('load', 'importSerialized', {
      content: doc('A'), additionalContents: [doc('B')], graphName: SHAPES, contentType: 'text/turtle', onlyIfEmpty: true,
    });
    expect(r.result.skipped).toBe(true);
    expect(await shapeCount('count')).toBe(1);
    runtime.terminate();
  });
});
