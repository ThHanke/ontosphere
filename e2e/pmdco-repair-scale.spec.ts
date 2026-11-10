/**
 * Browser check at PMDco scale (about 10k lines): explainDiagnostics on an inconsistent PMDco.
 * The reasoner library measures repair in node only; this runs the whole path in the app
 * (worker, WASM, adapter). Manual: PMDCO_SCALE=1 npx playwright test e2e/pmdco-repair-scale.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test';
import { gotoAndWaitForReady, callTool } from './e2e-helpers.js';

const BASE_URL = process.env.VG_URL ?? 'http://localhost:8080';
const BFO = 'http://purl.obolibrary.org/obo/';

test.skip(!process.env.PMDCO_SCALE, 'manual scale check: set PMDCO_SCALE=1');

test('explainDiagnostics on an inconsistent PMDco returns repairs in the browser', async ({ page }) => {
  test.setTimeout(600_000);
  await gotoAndWaitForReady(page, `${BASE_URL}/?rdfUrl=${encodeURIComponent(`${BASE_URL}/bench-pmdco.ttl`)}`, 'explainDiagnostics');

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
});
