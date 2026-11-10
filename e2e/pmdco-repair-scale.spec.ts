/**
 * Browser check at PMDco scale (about 10k lines): explainDiagnostics on an inconsistent PMDco.
 * The reasoner library measures repair in node only; this runs the whole path in the app
 * (worker, WASM, adapter). Manual: PMDCO_SCALE=1 npx playwright test e2e/pmdco-repair-scale.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test';
import { gotoAndWaitForReady, callTool } from './e2e-helpers.js';

const BASE_URL = process.env.VG_URL ?? 'http://localhost:8080';
const BFO = 'http://purl.obolibrary.org/obo/';
// The ontology under test: the bundled PMDco by default; set PMDCO_URL to evaluate another file, for
// example the version the coworker used: https://raw.githubusercontent.com/materialdigital/core-ontology/3b98aad/pmdco.ttl
const PMDCO_URL = process.env.PMDCO_URL ?? `${BASE_URL}/bench-pmdco.ttl`;

test('explainDiagnostics on an inconsistent PMDco returns repairs in the browser', async ({ page }) => {
  test.setTimeout(600_000);
  await gotoAndWaitForReady(page, `${BASE_URL}/?rdfUrl=${encodeURIComponent(PMDCO_URL)}`, 'explainDiagnostics');

  // Startup is complete: the ontology must be in the store before the clash is added.
  const loaded = await callTool(page, 'queryGraph', {
    sparql: 'SELECT (COUNT(*) AS ?n) WHERE { GRAPH <urn:vg:data> { ?s ?p ?o } }', limit: 5,
  }, BASE_URL);
  const dataTriples = Number(loaded?.data?.rows?.[0]?.n ?? -1);
  console.log(`[PMDCO_SCALE] data triples at startup complete: ${dataTriples}`);
  expect(dataTriples, 'the ontology is loaded when startup is complete').toBeGreaterThan(5000);

  const clash = await callTool(page, 'loadRdf', {
    turtle: `<http://example.org/clash#x> a <${BFO}BFO_0000002>, <${BFO}BFO_0000003> .`,
  }, BASE_URL);
  expect(clash?.success, JSON.stringify(clash)).toBe(true);

  const t0 = Date.now();
  const res = await callTool(page, 'explainDiagnostics', { includeTimings: true }, BASE_URL);
  const seconds = (Date.now() - t0) / 1000;
  console.log(`[PMDCO_SCALE] explainDiagnostics ${seconds.toFixed(1)} s`);
  console.log(`[PMDCO_SCALE] ${JSON.stringify({
    success: res?.success, isConsistent: res?.data?.isConsistent,
    justifications: res?.data?.justifications?.length,
    repairs: res?.data?.suggestedRepairs?.map((r: any) => ({ id: r.id, kind: r.kind, verified: r.verifiedConsistent, set: r.verifiedSet })),
    repairSetVerifiedConsistent: res?.data?.repairSetVerifiedConsistent,
    error: res?.error,
  })}`);

  console.log(`[PMDCO_SCALE] timings ${JSON.stringify(res?.data?.timingsMs)}`);
  expect(res?.success, JSON.stringify(res)).toBe(true);
  expect(res.data.isConsistent).toBe(false);
  expect(res.data.suggestedRepairs.length).toBeGreaterThan(0);

  // Apply the suggested deletion repair and reason again: the ontology must be consistent.
  const repair = res.data.suggestedRepairs.find((r: any) => r.issue === 'inconsistency' && r.kind !== 'weaken');
  expect(repair?.action?.tool, 'a deletion repair is suggested').toBe('removeLink');
  expect(repair.verifiedConsistent).toBe(true);
  const applied = await callTool(page, repair.action.tool, repair.action.args, BASE_URL);
  expect(applied?.success, JSON.stringify(applied)).toBe(true);

  const t1 = Date.now();
  const run = await callTool(page, 'runReasoning', {}, BASE_URL);
  console.log(`[PMDCO_SCALE] runReasoning after repair ${((Date.now() - t1) / 1000).toFixed(1)} s, consistent=${run?.data?.isConsistent}, inferred=${run?.data?.inferredTriples}`);
  expect(run?.data?.isConsistent).toBe(true);
});
