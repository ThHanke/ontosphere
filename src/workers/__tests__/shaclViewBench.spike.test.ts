// @vitest-environment node
// Spike benchmark: copied datasets (old runShaclValidation) vs ShaclStoreView on LUBM-1.
// Run each mode in its own process:  SHACL_BENCH=copy|view NODE_OPTIONS=--expose-gc npx vitest run <this file>
// Skipped unless SHACL_BENCH is set. Output: logs/shacl-view-bench-<mode>.log
import { it } from 'vitest';
import * as N3 from 'n3';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ShaclStoreView } from '../shaclStoreView.ts';

const MODE = process.env.SHACL_BENCH as 'copy' | 'view' | undefined;
const PUB = ['/home/hanke/ontosphere/public', resolve(__dirname, '../../../public')].find((d) => existsSync(`${d}/bench-lubm-abox.ttl`));
const { namedNode: nn, quad } = N3.DataFactory;
const UB = 'http://www.lehigh.edu/~zhp2/2004/0401/univ-bench.owl#';

const SHAPES = `
@prefix sh: <http://www.w3.org/ns/shacl#> . @prefix ub: <${UB}> .
<urn:b:Student> a sh:NodeShape ; sh:targetClass ub:Student ;
  sh:property [ sh:path ub:memberOf ; sh:minCount 1 ; sh:message "student without department" ] ;
  sh:property [ sh:path ub:nonexistent ; sh:minCount 1 ; sh:message "forced finding on every student" ] .
<urn:b:Person> a sh:NodeShape ; sh:targetClass ub:Person ;
  sh:property [ sh:path ub:name ; sh:minCount 1 ; sh:message "person without name" ] .
<urn:b:Pub> a sh:NodeShape ; sh:targetClass ub:Publication ;
  sh:property [ sh:path ub:publicationAuthor ; sh:minCount 1 ; sh:message "publication without author" ] .
<urn:b:Sparql> a sh:NodeShape ;
  sh:target [ a sh:SPARQLTarget ; sh:select "SELECT ?this WHERE { ?this a <${UB}FullProfessor> . FILTER(isIRI(?this)) }" ] ;
  sh:property [ sh:path ub:emailAddress ; sh:minCount 1 ; sh:message "professor without email" ] .
`;

it.skipIf(!MODE || !PUB)(`SHACL on LUBM-1: ${MODE}`, async () => {
  const store = new N3.Store();
  const load = (file: string, graph: string) => {
    for (const q of new N3.Parser({ format: file.endsWith('.nt') ? 'N-Triples' : 'Turtle' }).parse(readFileSync(`${PUB}/${file}`, 'utf-8')))
      store.addQuad(quad(q.subject as any, q.predicate, q.object as any, nn(graph)));
  };
  load('bench-lubm-abox.ttl', 'urn:vg:data');
  load('bench-lubm-tbox.nt', 'urn:vg:ontologies');
  for (const q of new N3.Parser().parse(SHAPES)) store.addQuad(quad(q.subject as any, q.predicate, q.object as any, nn('urn:vg:shapes')));

  const { Validator } = await import('shacl-engine') as any;
  const { targetResolvers, validations } = await import('shacl-engine/sparql.js') as any;
  const factory = ((await import('@rdfjs/data-model')) as any).default;
  const dataset = ((await import('@rdfjs/dataset')) as any).default.dataset;

  (globalThis as any).gc?.();
  const base = process.memoryUsage().heapUsed;
  const t0 = performance.now();

  let shapes: any, data: any;
  if (MODE === 'copy') {
    shapes = dataset(); data = dataset();
    for (const q of store.match(null, null, null, nn('urn:vg:shapes'))) shapes.add(factory.quad(q.subject, q.predicate, q.object));
    for (const g of ['urn:vg:data', 'urn:vg:ontologies', 'urn:vg:inferred'])
      for (const q of store.match(null, null, null, nn(g))) data.add(factory.quad(q.subject, q.predicate, q.object));
  } else {
    const v = new ShaclStoreView(store);
    if (process.env.SHACL_PROF) {
      const stats: Record<string, { n: number; ms: number; out: number }> = {};
      const orig = v.match.bind(v);
      v.match = (s?: any, p?: any, o?: any, g?: any) => {
        const k = `${s ? (s.termType === 'Variable' ? 'V' : 'S') : '-'}${p ? 'P' : '-'}${o ? 'O' : '-'}`;
        const t = performance.now(); const r = orig(s, p, o, g);
        const e = (stats[k] ??= { n: 0, ms: 0, out: 0 }); e.n++; e.ms += performance.now() - t; e.out += r.size;
        return r;
      };
      const start = performance.now();
      const inner = v.match;
      v.match = (...a: any[]) => { if (performance.now() - start > 25_000) { writeFileSync(resolve(__dirname, '../../../logs/shacl-view-prof.log'), JSON.stringify(stats, null, 1)); process.exit(0); } return (inner as any)(...a); };
    }
    shapes = data = v;
  }
  const report = await new Validator(shapes, { factory, targetResolvers, validations }).validate({ dataset: data });
  const ms = Math.round(performance.now() - t0);
  (globalThis as any).gc?.();
  const held = process.memoryUsage().heapUsed - base; // datasets + report still referenced below
  const line = `${MODE}: quads=${store.size} results=${report.results.length} time=${ms}ms heldAfterRunMB=${Math.round(held / 1e6)} (datasets+report) shapes=${shapes.size ?? '?'} data=${data.size ?? '?'} focusNodes=${new Set(report.results.map((r: any) => r.focusNode.value)).size}`;
  mkdirSync(resolve(__dirname, '../../../logs'), { recursive: true });
  writeFileSync(resolve(__dirname, `../../../logs/shacl-view-bench-${MODE}.log`), line + '\n');
}, 900_000);
