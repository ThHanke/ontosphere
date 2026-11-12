// @vitest-environment node
// Spike: PMDco loaded as data + the community auto-shapes, through the worker's runShaclValidation.
// Same file runs on the old code (copy approach) and the new one (store view): LABEL=old|new.
// Needs logs/pmdco-stack/{pmdco.ttl,auto-shapes-open.ttl,shape-data.ttl} (see the PMDco e2e story).
import { it } from 'vitest';
import * as N3 from 'n3';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRdfWorkerRuntime } from '../rdfManager.runtime.ts';
import { serializeQuad } from '../../utils/rdfSerialization.ts';

const { namedNode: nn, quad } = N3.DataFactory;
const LABEL = process.env.LABEL;
const STACK = [resolve(__dirname, '../../../logs/pmdco-stack')].find((d) => existsSync(`${d}/pmdco.ttl`));
const settle = (ms = 50) => new Promise((res) => setTimeout(res, ms));
const sk = (t: any) => (t.termType === 'BlankNode' ? nn('urn:vg:bnode:' + t.value) : t); // as the store keeps them

it.skipIf(!LABEL || !STACK)('pmdco as data + auto-shapes', async () => {
  const messages: any[] = [];
  const runtime = createRdfWorkerRuntime((m) => messages.push(m));
  const seedFile = async (graph: string, path: string) => {
    const parser = new N3.Parser({ baseIRI: 'http://example.org/base/' });
    const adds: any[] = [];
    for (const q of parser.parse(readFileSync(path, 'utf-8'))) adds.push(serializeQuad(quad(sk(q.subject) as any, q.predicate, sk(q.object) as any, nn(graph))));
    for (let i = 0; i < adds.length; i += 20000)
      runtime.handleEvent({ type: 'command', id: `s-${graph}-${i}`, command: 'syncBatch', payload: { graphName: graph, adds: adds.slice(i, i + 20000), removes: [] } });
    await settle(500);
    return adds.length;
  };
  const seed = (graph: string, file: string) => seedFile(graph, `${STACK}/${file}`);
  const nData = await seed('urn:vg:data', process.env.DATA_FILE ?? 'pmdco.ttl');
  if (existsSync(`${STACK}/shape-data.ttl`) && process.env.WITH_DATA) await seed('urn:vg:data', 'shape-data.ttl');
  let nShapes = process.env.NO_AUTO ? 0 : await seed('urn:vg:shapes', 'auto-shapes-open.ttl');
  if (process.env.EXTRA_SHAPES) nShapes += await seedFile('urn:vg:shapes', process.env.EXTRA_SHAPES);
  if (process.env.WITH_QUALITY) nShapes += await seedFile('urn:vg:shapes', resolve(__dirname, '../../../public/shacl-shapes/ontology-quality.shacl.ttl'));

  const t0 = performance.now();
  runtime.handleEvent({ type: 'command', id: 'v', command: 'runShaclValidation', payload: {} });
  let reply: any;
  const deadline = Date.now() + 600_000;
  while (!(reply = messages.find((m) => m?.type === 'response' && m?.id === 'v'))) {
    if (Date.now() > deadline) throw new Error('timeout');
    await settle(100);
  }
  const ms = Math.round(performance.now() - t0);
  const v = (reply.result.violations ?? []) as any[];
  const by = (k: (x: any) => string) => { const m: Record<string, number> = {}; for (const x of v) m[k(x)] = (m[k(x)] ?? 0) + 1; return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  const out = {
    label: LABEL, dataQuads: nData, shapeQuads: nShapes, ms, shapeCount: reply.result.shapeCount, conforms: reply.result.conforms, total: v.length,
    bySeverity: by((x) => String(x.severity)),
    byConstraint: by((x) => String(x.constraint).split('#').pop()!),
    topShapes: by((x) => String(x.sourceShape)).slice(0, 10),
    byMessage: by((x) => String(x.message).slice(0, 70)).slice(0, 25),
    uniqueFocus: new Set(v.map((x) => x.focusNode)).size,
    blankFocus: v.filter((x) => String(x.focusNode).startsWith('urn:vg:bnode:')).length,
  };
  mkdirSync(resolve(__dirname, '../../../logs'), { recursive: true });
  writeFileSync(resolve(__dirname, `../../../logs/pmdco-shacl-${process.env.DATA_FILE ? 'full-' : ''}${LABEL}${process.env.WITH_QUALITY ? '-q' : ''}.json`), JSON.stringify({ ...out, violations: v }, null, 1));
  writeFileSync(resolve(__dirname, `../../../logs/pmdco-shacl-${process.env.DATA_FILE ? 'full-' : ''}${LABEL}${process.env.WITH_QUALITY ? '-q' : ''}.summary.json`), JSON.stringify(out, null, 1));
  runtime.terminate();
}, 900_000);
