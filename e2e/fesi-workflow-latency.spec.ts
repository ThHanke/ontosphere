/**
 * The Fe-Si curation workflow as a user drives it, timed step by step in the browser.
 *
 * load ontology + record + shapes -> validate (asserted only) -> reason -> validate ->
 * correct the record -> reason -> validate -> export (TriG)
 *
 * Reports what a curator waits for between editing and seeing the report, not only the
 * reasoner's own time. Each session is a fresh browser context, so every run is cold.
 *
 * Fixtures are not in the repository. Serve them from public/ (the names below are
 * git-ignored) or point the VG_*_URL variables elsewhere; the spec skips when they are absent.
 *   VG_SESSIONS   cold sessions (default 3)
 *   VG_SHOTS_DIR  write screenshots of the first session there
 *   VG_OUT        write per-session timings as JSON there
 */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { gotoAndWaitForReady, callTool } from './e2e-helpers.js';

const BASE_URL = process.env.VG_URL ?? 'http://localhost:8080';
const ONT = process.env.VG_ONT_URL ?? `${BASE_URL}/pmdco-bench.ttl`;
const REC = process.env.VG_RECORD_URL ?? `${BASE_URL}/fesi-record.ttl`;
const SHAPES = process.env.VG_SHAPES_URL ?? `${BASE_URL}/bench-autoshapes-open.ttl`;
const SESSIONS = Number(process.env.VG_SESSIONS ?? 3);
const SHOTS = process.env.VG_SHOTS_DIR ?? '';
const OUT = process.env.VG_OUT ?? '';
const EX = 'http://www.example.org/#';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

// The correction as described in the submitted manuscript: a band-gap quality on the silicon.
const CORRECTION = `@prefix pmd: <https://w3id.org/pmd/co/> .
@prefix obo: <http://purl.obolibrary.org/obo/> .
<${EX}bandgap_silicon> a pmd:PMD_0090002 .
<${EX}some_silicon> obo:RO_0000086 <${EX}bandgap_silicon> .`;

async function totalQuads(page: Page): Promise<number> {
  const res = await callTool(page, 'queryGraph', { sparql: 'SELECT (COUNT(*) AS ?n) WHERE { ?s ?p ?o }', limit: 5 });
  return Number(res?.data?.rows?.[0]?.n ?? 0);
}

async function graphQuads(page: Page, graph: string): Promise<number> {
  const res = await callTool(page, 'queryGraph', {
    sparql: `SELECT (COUNT(*) AS ?n) WHERE { GRAPH <${graph}> { ?s ?p ?o } }`, limit: 5,
  });
  return Number(res?.data?.rows?.[0]?.n ?? 0);
}

async function ok(page: Page, tool: string, params: object) {
  const res = await callTool(page, tool, params, BASE_URL);
  if (!res?.success) throw new Error(`${tool} failed: ${res?.error ?? JSON.stringify(res).slice(0, 300)}`);
  if (tool === 'runReasoning' && (res.data?.errors ?? []).length) {
    throw new Error(`reasoner errors: ${JSON.stringify(res.data.errors).slice(0, 300)}`);
  }
  return res;
}

const recordViolations = (res: any) =>
  (res?.data?.violations ?? []).filter((v: any) => String(v.focusNode ?? '').startsWith(EX))
    .map((v: any) => `${v.focusNode.slice(EX.length)} ${String(v.path ?? '').split('/').pop()}`).sort();

test.describe('Fe-Si workflow latency', () => {
  test.describe.configure({ mode: 'serial', timeout: 900_000 });

  test('edit-to-report latency across cold sessions', async ({ browser, request }) => {
    for (const url of [ONT, REC, SHAPES]) {
      const head = await request.get(url);
      test.skip(!head.ok(), `fixture not served: ${url}`);
    }
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

    const sessions: any[] = [];
    for (let i = 0; i < SESSIONS; i++) {
      const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
      const page = await context.newPage();
      await gotoAndWaitForReady(page, BASE_URL, 'loadRdf');
      // Screenshots show the record, not the whole ontology: instance view, centred on the
      // silicon portion, after transient toasts have cleared. Not timed.
      const shot = async (name: string) => {
        if (!SHOTS || i !== 0) return;
        await callTool(page, 'setViewMode', { mode: 'abox' }, BASE_URL);
        await callTool(page, 'expandNode', {}, BASE_URL);
        await callTool(page, 'runLayout', { algorithm: 'dagre-lr' }, BASE_URL);
        await callTool(page, 'fitCanvas', {}, BASE_URL);
        await page.waitForTimeout(3_000);
        await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
      };
      const ms: Record<string, number> = {};
      const time = async <T>(k: string, fn: () => Promise<T>): Promise<T> => {
        const t0 = Date.now();
        try {
          const r = await fn();
          ms[k] = Date.now() - t0;
          return r;
        } catch (e) {
          throw new Error(`session ${i}, step ${k}: ${(e as Error).message}`);
        }
      };

      // The cross-origin-isolation service worker can reload a fresh context once and wipe what
      // was loaded, which then validates nothing and looks like a clean report. Confirm the
      // ontology, record and shapes all stuck before measuring anything that depends on them.
      let loaded = 0;
      for (let attempt = 0; ; attempt++) {
        const before = await totalQuads(page);
        // The ontology goes into urn:vg:ontologies, as a curator loads it; the canvas then
        // shows the record's individuals rather than the ontology's own terms.
        await time('loadOntology', () => ok(page, 'loadOntology', { url: ONT }));
        await time('loadRecord', () => ok(page, 'loadRdf', { url: REC }));
        await time('loadShapes', () => ok(page, 'loadShaclFromUrl', { url: SHAPES }));
        loaded = (await totalQuads(page)) - before;
        const shapeQuads = await graphQuads(page, 'urn:vg:shapes');
        if (loaded > 10_000 && shapeQuads > 1_000) break;
        if (attempt >= 2) throw new Error(`fixtures did not stick: +${loaded} quads, ${shapeQuads} shape quads`);
        await gotoAndWaitForReady(page, BASE_URL, 'loadRdf');
      }
      await shot('01-loaded');

      const v0 = await time('validateAsserted', () => ok(page, 'validateGraph', {}));
      await shot('02-validated-asserted');
      const r1 = await time('reason', () => ok(page, 'runReasoning', { reasonerBackend: 'konclude', shaclValidation: false }));
      await shot('03-reasoned');
      const v1 = await time('validateReasoned', () => ok(page, 'validateGraph', {}));
      await shot('04-validated-reasoned');

      // A user edit on the canvas is an addTriple; loading inline Turtle is timed separately
      // below because that path also rebuilds the canvas index and records provenance.
      await time('correct', async () => {
        await ok(page, 'addTriple', { subjectIri: `${EX}bandgap_silicon`, predicateIri: RDF_TYPE, objectIri: 'https://w3id.org/pmd/co/PMD_0090002' });
        await ok(page, 'addTriple', { subjectIri: `${EX}some_silicon`, predicateIri: 'http://purl.obolibrary.org/obo/RO_0000086', objectIri: `${EX}bandgap_silicon` });
      });
      await time('reasonAfterCorrection', () => ok(page, 'runReasoning', { reasonerBackend: 'konclude', shaclValidation: false }));
      const v2 = await time('validateAfterCorrection', () => ok(page, 'validateGraph', {}));
      await shot('05-corrected');
      const exp = await time('exportTrig', () => callTool(page, 'exportGraph', { format: 'trig' }, BASE_URL));
      await time('inlineTurtleLoad', () => ok(page, 'loadRdf', { turtle: CORRECTION }));

      const editToReport = ms.correct + ms.reasonAfterCorrection + ms.validateAfterCorrection;
      const s = {
        session: i, loadedQuads: loaded, ms, editToReportMs: editToReport,
        inferred: Number(r1.data?.inferredTriples ?? 0),
        asserted: recordViolations(v0), reasoned: recordViolations(v1), corrected: recordViolations(v2),
        exportOk: exp?.success === true,
      };
      console.log(`[fesi] session ${i}: ${JSON.stringify(s)}`);
      sessions.push(s);
      await context.close();
    }

    if (OUT) fs.writeFileSync(OUT, JSON.stringify(sessions, null, 2));
    // The reasoned report must contain the semiconductor violation and the correction must clear it.
    for (const s of sessions) {
      expect(s.reasoned.some((v: string) => v.startsWith('some_silicon')), 'semiconductor violation after reasoning').toBe(true);
      expect(s.corrected.some((v: string) => v.startsWith('some_silicon')), 'correction clears it').toBe(false);
    }
  });
});
