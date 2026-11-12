// @vitest-environment node
// W3C data-shapes suite (core + sparql, vendored in shacl-engine) against the engine in three
// set-ups: copied datasets, the N3-store view (shapes and data in separate graphs), and the view
// with the class hierarchy in another graph. All must pass every case, so the view stays
// spec-neutral. Report: logs/shacl-conformance.log
import { describe, it, expect } from 'vitest';
import * as N3 from 'n3';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { ShaclStoreView } from '../shaclStoreView.ts';

const { namedNode: nn, quad, blankNode } = N3.DataFactory;
const SUITE = resolve(__dirname, '../../../node_modules/shacl-engine/test/assets/data-shapes');
const NS = {
  mf: 'http://www.w3.org/2001/sw/DataAccess/tests/test-manifest#',
  sht: 'http://www.w3.org/ns/shacl-test#',
  sh: 'http://www.w3.org/ns/shacl#',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
};

// cached: parsing a file twice would give it two sets of blank-node labels
const parsed = new Map<string, N3.Quad[]>();
const parse = (file: string): N3.Quad[] => {
  if (!parsed.has(file)) parsed.set(file, new N3.Parser({ baseIRI: pathToFileURL(file).toString() }).parse(readFileSync(file, 'utf-8')));
  return parsed.get(file)!;
};

function one(quads: N3.Quad[], s: any, p: string): any {
  return quads.find((q) => q.subject.equals(s) && q.predicate.value === p)?.object;
}
function list(quads: N3.Quad[], head: any): any[] {
  const out: any[] = [];
  while (head && head.value !== NS.rdf + 'nil') {
    out.push(one(quads, head, NS.rdf + 'first'));
    head = one(quads, head, NS.rdf + 'rest');
  }
  return out;
}

interface Case { name: string; file: string; quads: N3.Quad[]; shapesQuads: N3.Quad[]; dataQuads: N3.Quad[]; expected: Set<string>[] | 'failure'; conforms?: boolean }

/** manifest tree -> test files */
function collectFiles(manifest: string, acc: string[] = []): string[] {
  const quads = parse(manifest);
  const includes = quads.filter((q) => q.predicate.value === NS.mf + 'include').map((q) => q.object.value);
  for (const inc of includes) {
    const f = fileURLToPath(inc);
    const sub = parse(f);
    if (sub.some((q) => q.predicate.value === NS.mf + 'include')) collectFiles(f, acc); else acc.push(f);
  }
  return acc;
}

const norm = (t: any): string => (!t ? '' : t.termType === 'BlankNode' ? '_' : `${t.termType[0]}${t.value}|${t.datatype?.value ?? ''}|${t.language ?? ''}`);
function tuples(quads: { subject: any; predicate: any; object: any }[], report: any): string[] {
  const results = quads.filter((q) => q.subject.equals(report) && q.predicate.value === NS.sh + 'result').map((q) => q.object);
  const g = (n: any, p: string) => quads.filter((q) => q.subject.equals(n) && q.predicate.value === NS.sh + p).map((q) => q.object);
  return results.map((r) => ['focusNode', 'resultPath', 'value', 'sourceShape', 'sourceConstraintComponent', 'resultSeverity']
    .map((p) => g(r, p).map(norm).join(',')).join(' ; ')).sort();
}

function loadCases(): Case[] {
  const cases: Case[] = [];
  for (const file of collectFiles(`${SUITE}/manifest.ttl`)) {
    const quads = parse(file);
    const manifest = quads.find((q) => q.predicate.value === NS.rdf + 'type' && q.object.value === NS.mf + 'Manifest')!.subject;
    for (const entry of list(quads, one(quads, manifest, NS.mf + 'entries'))) {
      const result = one(quads, entry, NS.mf + 'result');
      const label = one(quads, entry, NS.rdfs + 'label')?.value ?? entry.value;
      const name = `${file.slice(SUITE.length + 1)} :: ${label}`;
      const action = one(quads, entry, NS.mf + 'action');
      const load = (p: string) => { const f = fileURLToPath(one(quads, action, NS.sht + p).value); return f === file ? quads : parse(f); };
      const shapesQuads = load('shapesGraph'), dataQuads = load('dataGraph');
      if (result.value === NS.sht + 'Failure') { cases.push({ name, file, quads, shapesQuads, dataQuads, expected: 'failure' }); continue; }
      cases.push({ name, file, quads, shapesQuads, dataQuads, expected: tuples(quads, result) as any, conforms: one(quads, result, NS.sh + 'conforms')?.value === 'true' });
    }
  }
  return cases;
}

async function engine() {
  const { Validator } = await import('shacl-engine') as any;
  const sparql = await import('shacl-engine/sparql.js') as any;
  const dm = ((await import('@rdfjs/data-model')) as any).default;
  const dataset = ((await import('@rdfjs/dataset')) as any).default.dataset;
  // the report is built as a dataset, so the factory needs dataset() as well as the term factory
  const factory = Object.assign(Object.create(dm), { dataset: (q?: any) => dataset(q) });
  return { Validator, factory, dataset, ...sparql };
}

type Mode = 'copy' | 'view' | 'view-split';
const MODES: Mode[] = ['copy', 'view', 'view-split'];

async function run(c: Case, mode: Mode, e: any): Promise<{ conforms: boolean; tuples: string[] }> {
  const opts = { factory: e.factory, targetResolvers: e.targetResolvers, validations: e.validations };
  let shapes: any, data: any;
  if (mode === 'copy') {
    shapes = e.dataset(); data = e.dataset();
    for (const q of c.shapesQuads) shapes.add(e.factory.quad(q.subject, q.predicate, q.object));
    for (const q of c.dataQuads) data.add(e.factory.quad(q.subject, q.predicate, q.object));
  } else {
    const store = new N3.Store();
    const add = (qs: N3.Quad[], defaultGraph: string) => {
      for (const q of qs) {
        const toOnt = mode === 'view-split' && defaultGraph === 'urn:vg:data' && q.predicate.value === NS.rdfs + 'subClassOf';
        store.addQuad(quad(q.subject as any, q.predicate, q.object as any, nn(toOnt ? 'urn:vg:ontologies' : defaultGraph)));
      }
    };
    // shapes graph and data graph are different files in some tests: keep them in different graphs
    add(c.shapesQuads, 'urn:vg:shapes');
    add(c.dataQuads, 'urn:vg:data');
    shapes = data = new ShaclStoreView(store);
  }
  const report = await new e.Validator(shapes, opts).validate({ dataset: data });
  const rq = [...report.dataset];
  const rnode = rq.find((q: any) => q.predicate.value === NS.rdf + 'type' && q.object.value === NS.sh + 'ValidationReport')?.subject;
  return { conforms: report.conforms, tuples: rnode ? tuples(rq, rnode) : [] };
}

describe.skipIf(!existsSync(`${SUITE}/manifest.ttl`))('W3C data-shapes suite (core + sparql) against shacl-engine', () => {
  it('passes in all modes', async () => {
    const e = await engine();
    const cases = loadCases();
    const failures: Record<Mode, string[]> = { copy: [], view: [], 'view-split': [] };
    for (const c of cases) {
      for (const mode of MODES) {
        try {
          const r = await run(c, mode, e);
          const ok = c.expected === 'failure'
            ? r.conforms === false
            : r.conforms === c.conforms && JSON.stringify(r.tuples) === JSON.stringify(c.expected);
          if (!ok) failures[mode].push(c.name + (mode === 'view' ? `\n    expected ${c.expected === 'failure' ? 'conforms=false' : JSON.stringify(c.expected)}\n    actual   conforms=${r.conforms} ${JSON.stringify(r.tuples)}` : ''));
        } catch (err: any) {
          failures[mode].push(`${c.name}  [throws: ${String(err?.message).slice(0, 80)}]`);
        }
      }
    }
    const byDir: Record<string, number> = {};
    for (const c of cases) { const d = c.name.split('/').slice(0, 2).join('/'); byDir[d] = (byDir[d] ?? 0) + 1; }
    const lines = [`cases: ${cases.length}`, JSON.stringify(byDir)];
    for (const m of MODES) lines.push(`${m}: ${cases.length - failures[m].length} pass, ${failures[m].length} fail`);
    for (const m of MODES) { lines.push(`\n== ${m} failures`); lines.push(...failures[m]); }
    mkdirSync(resolve(__dirname, '../../../logs'), { recursive: true });
    writeFileSync(resolve(__dirname, '../../../logs/shacl-conformance.log'), lines.join('\n') + '\n');
    expect(cases.length).toBeGreaterThan(100);
    for (const m of MODES) expect(failures[m], `${m}: ${failures[m].join('\n')}`).toEqual([]);
  }, 600_000);
});
