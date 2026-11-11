/**
 * User story (ISWC 2026 demo, docs/mcp-demo/seeds/iswc2026-comprehensive.md), as an assertion test:
 * open PMDCO chemical-composition data with the PMD Core ontology and the community auto-shapes
 * through URL parameters, reason, find the SHACL violation on some_silicon (a semiconductor without
 * a band-gap quality), fix it with BandGap class + individual + has-quality edge, reason again.
 *
 * Upstream PMD Core changed in October 2026 (auto-shapes 270 -> 399, new pmdco.ttl), after which the
 * some_silicon violation no longer appears. The story is pinned to the June 2026 versions: the shapes
 * come from a pinned commit URL, and the ontology request is rerouted to a pinned commit.
 */
import { test, expect } from '@playwright/test';
import { gotoAndWaitForReady, callTool } from './e2e-helpers.js';

const BASE_URL = process.env.VG_URL ?? 'http://localhost:8080';
const CORE = 'https://raw.githubusercontent.com/materialdigital/core-ontology';
const DATA_URL = `${CORE}/refs/heads/main/patterns/chemical%20composition/shape-data.ttl`;
const SHAPES_URL = `${CORE}/56137eb627a187b5ae60b488e1589d78c322081c/patterns/autoshape/auto-shapes-open.ttl`;
const PINNED_ONTOLOGY_REF = '03b4e8ac4e62937a4cf1bd03908de1d7d3e3c189';

test('PMDCO chemical composition: load, reason, find the some_silicon violation, fix it', async ({ page }) => {
  test.setTimeout(600_000);
  await page.route(/^https:\/\/raw\.githubusercontent\.com\/materialdigital\/core-ontology\/main\/pmdco\.ttl$/, async (route) => {
    const response = await route.fetch({ url: `${CORE}/${PINNED_ONTOLOGY_REF}/pmdco.ttl` });
    await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': '*' } });
  });

  const url = `${BASE_URL}/?rdfUrl=${encodeURIComponent(DATA_URL)}&ontology=pmdco&shaclShapes=${encodeURIComponent(SHAPES_URL)}`;
  await gotoAndWaitForReady(page, url, 'runReasoning');

  const count = async (graph: string, where = '?s ?p ?o') => Number((await callTool(page, 'queryGraph', {
    sparql: `SELECT (COUNT(*) AS ?n) WHERE { GRAPH <${graph}> { ${where} } }`, limit: 5,
  }, BASE_URL))?.data?.rows?.[0]?.n ?? -1);

  // 1. Everything the URL names is loaded: data, the PMD Core ontology, the pinned auto-shapes.
  expect(await count('urn:vg:data'), 'chemical composition data').toBeGreaterThan(0);
  expect(await count('urn:vg:ontologies'), 'PMD Core ontology').toBeGreaterThan(1000);
  expect(await count('urn:vg:shapes', '?s a <http://www.w3.org/ns/shacl#NodeShape>'), 'pinned auto-shapes').toBe(270);

  // 2. Reasoning: consistent, with inferences, and the one violation of the story.
  const t0 = Date.now();
  const run = await callTool(page, 'runReasoning', {}, BASE_URL) as any;
  const seconds = (Date.now() - t0) / 1000;
  console.log(`[STORY] runReasoning ${seconds.toFixed(1)} s`);
  expect(run?.success, JSON.stringify(run)).toBe(true);
  expect(run.data.isConsistent).toBe(true);
  expect(run.data.inferredTriples).toBeGreaterThan(0);
  expect(seconds, 'reasoning on PMD Core plus the data').toBeLessThan(180);

  const SILICON = 'http://www.example.org/#some_silicon';
  const HAS_QUALITY = 'http://purl.obolibrary.org/obo/RO_0000086';
  const before = await callTool(page, 'validateGraph', {}, BASE_URL) as any;
  expect(before.data.conforms).toBe(false);
  expect(before.data.violations).toHaveLength(1);
  // The reasoning error text names the path as a prefixed name or the full IRI, never a bare local name.
  const shaclError = run.data.errors.find((e: any) => String(e.rule).startsWith('shacl:'));
  expect(shaclError.message).toMatch(/path: (obo:RO_0000086|http:\/\/purl\.obolibrary\.org\/obo\/RO_0000086)/);
  expect(before.data.violations[0]).toMatchObject({
    focusNode: SILICON, path: HAS_QUALITY, severity: 'sh:Violation',
    constraint: 'http://www.w3.org/ns/shacl#MinCountConstraintComponent',
  });

  // 3. Diagnostics agree and offer the matching SHACL repair (a value for has quality is needed).
  const diag = await callTool(page, 'explainDiagnostics', {}, BASE_URL) as any;
  expect(diag.data.isConsistent).toBe(true);
  expect(diag.data.shaclViolations).toHaveLength(1);
  const suggestion = diag.data.suggestedRepairs.find((r: any) => r.id === 'S1');
  expect(suggestion.action).toMatchObject({ tool: 'addTriple', args: { subjectIri: SILICON, predicateIri: HAS_QUALITY } });
  expect(suggestion.needsValue).toBe(true);

  // 4. Fix as in the story: a BandGap class, a BandGap individual, and the has-quality edge.
  const OWL_CLASS = 'http://www.w3.org/2002/07/owl#Class';
  const BAND_GAP = 'http://www.example.org/#BandGap';
  const BAND_GAP_SILICON = 'http://www.example.org/#bandgap_silicon';
  for (const [tool, args] of [
    ['addNode', { iri: BAND_GAP, typeIri: OWL_CLASS, label: 'BandGap' }],
    ['addNode', { iri: BAND_GAP_SILICON, typeIri: BAND_GAP, label: 'bandgap_silicon' }],
    ['addTriple', { subjectIri: SILICON, predicateIri: HAS_QUALITY, objectIri: BAND_GAP_SILICON }],
  ] as const) {
    const res = await callTool(page, tool, args, BASE_URL) as any;
    expect(res?.success, `${tool} ${JSON.stringify(args)}: ${JSON.stringify(res)}`).toBe(true);
  }

  // 5. Reason and validate again: still consistent, and the violation is gone.
  const rerun = await callTool(page, 'runReasoning', {}, BASE_URL) as any;
  expect(rerun.data.isConsistent).toBe(true);
  const after = await callTool(page, 'validateGraph', {}, BASE_URL) as any;
  expect(after.data.violations, JSON.stringify(after.data.violations)).toEqual([]);
  expect(after.data.conforms).toBe(true);
});
