// @vitest-environment node
//
// P1-4: the coworker saw 7 PMDco triples missing from urn:vg:ontologies after load, among them the
// plain label "supervised machine learning" of PMD_0000964 (next to a "@de" label). Round trip:
// every triple of the source file must be in the store after importSerialized.
import { describe, it, expect } from 'vitest';
import * as N3 from 'n3';
import fs from 'node:fs';
import { createRdfWorkerRuntime } from '../rdfManager.runtime.ts';

const settle = () => new Promise((r) => setTimeout(r, 100));

async function importAndRead(ttl: string, viaExport?: string): Promise<{ stored: Set<string>; source: Set<string> }> {
  const messages: any[] = [];
  const runtime = createRdfWorkerRuntime((m) => messages.push(m));
  runtime.handleEvent({
    type: 'command', id: 'imp', command: 'importSerialized',
    payload: { content: ttl, graphName: 'urn:vg:ontologies', contentType: 'text/turtle', filename: 'src.ttl' },
  });
  const deadline = Date.now() + 120_000;
  while (!messages.find((m) => m?.type === 'response' && m?.id === 'imp')) {
    if (Date.now() > deadline) throw new Error('import did not respond');
    await settle();
  }
  runtime.handleEvent({ type: 'command', id: 'get', command: 'getQuads', payload: { graphName: 'urn:vg:ontologies' } });
  while (!messages.find((m) => m?.type === 'response' && m?.id === 'get')) await settle();
  let reply = messages.find((m) => m?.type === 'response' && m?.id === 'get');
  if (viaExport) {
    // Read back through the export path instead: serialise, then parse the text again.
    runtime.handleEvent({ type: 'command', id: 'exp', command: 'exportGraph', payload: { graphName: 'urn:vg:ontologies', format: viaExport } });
    while (!messages.find((m) => m?.type === 'response' && m?.id === 'exp')) await settle();
    const exp = messages.find((m) => m?.type === 'response' && m?.id === 'exp');
    const text: string = typeof exp?.result === 'string' ? exp.result : (exp?.result?.content ?? exp?.result?.data ?? '');
    const parsed = new N3.Parser({ format: viaExport === 'trig' ? 'application/trig' : 'text/turtle' }).parse(text);
    reply = { result: parsed.map((q) => ({
      subject: { termType: q.subject.termType, value: q.subject.value },
      predicate: { termType: 'NamedNode', value: q.predicate.value },
      object: q.object.termType === 'Literal'
        ? { termType: 'Literal', value: q.object.value, language: q.object.language, datatype: q.object.datatype.value }
        : { termType: q.object.termType, value: q.object.value },
    })) };
  }
  runtime.terminate();

  const XSD_STRING = 'http://www.w3.org/2001/XMLSchema#string';
  const LANG_STRING = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString';
  const lit = (value: string, language: string, datatype: string) =>
    `L ${JSON.stringify(value)}@${language || ''}^^${language ? LANG_STRING : (datatype || XSD_STRING)}`;
  const key = (s: string, p: string, o: string) => `${s} ${p} ${o}`;
  const source = new Set(new N3.Parser().parse(ttl).filter((q) => q.subject.termType !== 'BlankNode' && q.object.termType !== 'BlankNode')
    .map((q) => key(q.subject.value, q.predicate.value,
      q.object.termType === 'Literal' ? lit(q.object.value, q.object.language, q.object.datatype.value) : q.object.value)));
  const quads: any[] = reply?.result ?? [];
  const stored = new Set(quads.filter((q) => q.subject.termType !== 'BlankNode' && q.object.termType !== 'BlankNode')
    .map((q) => key(q.subject.value, q.predicate.value,
      q.object.termType === 'Literal' ? lit(q.object.value, q.object.language ?? '', typeof q.object.datatype === 'string' ? q.object.datatype : (q.object.datatype?.value ?? '')) : q.object.value)));
  return { stored, source };
}

describe('importSerialized keeps every triple of the source', () => {
  it('keeps a plain literal next to a language-tagged one on the same predicate', async () => {
    const ttl = `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> . @prefix ex: <http://example.org/#> .
      ex:A rdfs:label "supervised learning"@de , "supervised machine learning" .`;
    const { stored, source } = await importAndRead(ttl);
    const missing = [...source].filter((t) => !stored.has(t));
    expect(missing).toEqual([]);
  });

  it.each(['trig', 'turtle'])('keeps literals that differ only by language or datatype through a %s export', async (format) => {
    const ttl = `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> . @prefix xsd: <http://www.w3.org/2001/XMLSchema#> . @prefix ex: <http://example.org/#> .
      ex:A rdfs:label "chair" , "chair"@en , "chair"@de , "chair"^^xsd:token .`;
    const { stored, source } = await importAndRead(ttl, format);
    expect(source.size).toBe(4);
    expect([...source].filter((t) => !stored.has(t))).toEqual([]);
  });

  it('PMDco (bench-pmdco.ttl): nothing missing', async () => {
    const { stored, source } = await importAndRead(fs.readFileSync('public/bench-pmdco.ttl', 'utf8'));
    const missing = [...source].filter((t) => !stored.has(t));
    console.log(`[P1-4] source ${source.size}, stored ${stored.size}, missing ${missing.length}`);
    expect(missing.slice(0, 10)).toEqual([]);
  }, 180_000);

  // Manual: P14_FILE=logs/pmdco-3b98aad/pmdco.ttl, the version the coworker evaluated.
  it.skipIf(!process.env.P14_FILE)('the file named by P14_FILE: nothing missing', async () => {
    const { stored, source } = await importAndRead(fs.readFileSync(process.env.P14_FILE!, 'utf8'));
    const missing = [...source].filter((t) => !stored.has(t));
    fs.writeFileSync('logs/p14-missing.txt', missing.join('\n'));
    console.log(`[P1-4] ${process.env.P14_FILE}: source ${source.size}, stored ${stored.size}, missing ${missing.length}`);
    expect(missing.slice(0, 10)).toEqual([]);
  }, 180_000);

  it.skipIf(!process.env.P14_FILE)('the file named by P14_FILE survives a TriG export and re-parse', async () => {
    const { stored, source } = await importAndRead(fs.readFileSync(process.env.P14_FILE!, 'utf8'), 'trig');
    const missing = [...source].filter((t) => !stored.has(t));
    fs.writeFileSync('logs/p14-missing-trig.txt', missing.join('\n'));
    console.log(`[P1-4] via TriG export: source ${source.size}, stored ${stored.size}, missing ${missing.length}`);
    expect(missing.slice(0, 10)).toEqual([]);
  }, 180_000);
});
