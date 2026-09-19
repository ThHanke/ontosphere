// Dataset export formats keep the urn:vg:* partition. JSON-LD 1.1 expresses a dataset as node
// objects with @graph, so N-Quads, TriG and JSON-LD all round-trip the named graphs, while
// Turtle, a single-graph format, flattens them.

import { describe, it, expect } from 'vitest';
import * as N3 from 'n3';
import { createRdfWorkerRuntime } from '../rdfManager.runtime.ts';
import { serializeQuad } from '../../utils/rdfSerialization.ts';

const nn = N3.DataFactory.namedNode;
const EX = 'http://example.org/#';
const settle = async () => {
  for (let i = 0; i < 100; i++) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 10));
};

async function seededRuntime() {
  const messages: any[] = [];
  const runtime = createRdfWorkerRuntime((m) => messages.push(m));
  const seed = async (graphName: string, s: string, p: string, o: string) => {
    runtime.handleEvent({
      type: 'command',
      id: `seed-${graphName}-${s}`,
      command: 'syncBatch',
      payload: {
        graphName,
        adds: [serializeQuad(N3.DataFactory.quad(nn(s), nn(p), nn(o), nn(graphName)))],
        removes: [],
      },
    });
    await settle();
  };
  await seed('urn:vg:data', `${EX}specimen`, `${EX}hasPart`, `${EX}silicon`);
  await seed('urn:vg:inferred', `${EX}silicon`, `${EX}type`, `${EX}Semiconductor`);
  return { runtime, messages };
}

async function exportAs(runtime: any, messages: any[], format: string): Promise<string> {
  messages.length = 0;
  runtime.handleEvent({ type: 'command', id: `exp-${format}`, command: 'exportGraph', payload: { format } });
  await settle();
  const reply = messages.find((m) => m?.type === 'response' && m?.id === `exp-${format}`);
  const r = reply?.result;
  return typeof r === 'string' ? r : (r?.content ?? r?.data ?? r?.text ?? JSON.stringify(r));
}

describe('export preserves the named-graph partition', () => {
  it('JSON-LD emits the asserted and inferred graphs separately', async () => {
    const { runtime, messages } = await seededRuntime();
    const out = await exportAs(runtime, messages, 'jsonld');

    const parsed = JSON.parse(out);
    expect(Array.isArray(parsed)).toBe(true);

    const graphIds = parsed.filter((n: any) => n['@graph']).map((n: any) => n['@id']);
    expect(graphIds).toContain('urn:vg:data');
    expect(graphIds).toContain('urn:vg:inferred');

    const inferred = parsed.find((n: any) => n['@id'] === 'urn:vg:inferred');
    const inferredSubjects = inferred['@graph'].map((n: any) => n['@id']);
    expect(inferredSubjects).toContain(`${EX}silicon`);

    // the inferred type must NOT also appear as an asserted statement
    const data = parsed.find((n: any) => n['@id'] === 'urn:vg:data');
    const dataFlat = JSON.stringify(data['@graph']);
    expect(dataFlat).not.toContain('Semiconductor');

    runtime.terminate();
  });

  it('N-Quads and TriG keep both graph names', async () => {
    for (const fmt of ['nquads', 'trig']) {
      const { runtime, messages } = await seededRuntime();
      const out = await exportAs(runtime, messages, fmt);
      expect(out, `${fmt} should name urn:vg:data`).toContain('urn:vg:data');
      expect(out, `${fmt} should name urn:vg:inferred`).toContain('urn:vg:inferred');
      runtime.terminate();
    }
  });

  it('Turtle cannot carry graphs, so it flattens (documented limitation)', async () => {
    const { runtime, messages } = await seededRuntime();
    const out = await exportAs(runtime, messages, 'turtle');
    expect(out).not.toContain('urn:vg:inferred');
    runtime.terminate();
  });
});
