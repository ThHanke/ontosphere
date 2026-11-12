/**
 * Startup from URL parameters: ?rdfUrl= data, ?ontologies= vocabularies and ?shaclShapes= shapes
 * load together, and the startup-ready promise resolves only after all three are in the store.
 *
 * Tools that read the graph (validateGraph, runReasoning) wait on that promise, so a call issued
 * while startup is still loading must see the finished graph. The ontology response is delayed to
 * make "called too early" the normal case.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as N3 from 'n3';
import { test, expect, type Page } from '@playwright/test';
import { gotoAndWaitForReady, callTool } from './e2e-helpers.js';

// Size of the default preset: whatever the bundled file holds.
const PRESET_QUADS = new N3.Parser().parse(
  readFileSync(resolve(process.cwd(), 'public/shacl-shapes/ontology-quality.shacl.ttl'), 'utf-8'),
).length;
const BASE_URL = process.env.VG_URL ?? 'http://localhost:8080';
const ONTOLOGY_URL = 'https://startup-test.example.org/vocab.ttl';
const ONTOLOGY_TTL = `@prefix owl: <http://www.w3.org/2002/07/owl#> .
<https://startup-test.example.org/vocab#Thing> a owl:Class .`;

async function graphCount(page: Page, graph: string): Promise<number> {
  const res = await callTool(page, 'queryGraph', {
    sparql: `SELECT (COUNT(*) AS ?n) WHERE { GRAPH <${graph}> { ?s ?p ?o } }`, limit: 5,
  });
  return Number(res?.data?.rows?.[0]?.n ?? -1);
}

const startupComplete = (page: Page) =>
  page.evaluate(() => (window as any).__startupComplete?.() === true);

test.describe('startup from URL parameters', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(ONTOLOGY_URL, async (route) => {
      await new Promise((r) => setTimeout(r, 3_000));
      await route.fulfill({
        status: 200, contentType: 'text/turtle',
        headers: { 'access-control-allow-origin': '*' }, body: ONTOLOGY_TTL,
      });
    });
  });

  test('rdfUrl + ontologies + shaclShapes all load before startup is complete', async ({ page }) => {
    test.setTimeout(120_000);
    const params = new URLSearchParams({
      rdfUrl: `${BASE_URL}/reasoning-demo.ttl`,
      ontologies: ONTOLOGY_URL,
      shaclShapes: `${BASE_URL}/shacl-shapes/reasoning-demo.shacl.ttl`,
    });
    await gotoAndWaitForReady(page, `${BASE_URL}/?${params}`, 'validateGraph');

    await expect.poll(() => startupComplete(page), { timeout: 60_000 }).toBe(true);
    expect(await graphCount(page, 'urn:vg:data'), 'rdfUrl data').toBeGreaterThan(0);
    expect(await graphCount(page, 'urn:vg:ontologies'), 'ontologies').toBeGreaterThan(0);
    expect(await graphCount(page, 'urn:vg:shapes'), 'shapes').toBeGreaterThan(0);
  });

  test('MCP calls are rejected during startup and accepted once it is complete', async ({ page }) => {
    test.setTimeout(120_000);
    const params = new URLSearchParams({
      rdfUrl: `${BASE_URL}/reasoning-demo.ttl`,
      ontologies: ONTOLOGY_URL,
      shaclShapes: `${BASE_URL}/shacl-shapes/reasoning-demo.shacl.ttl`,
    });
    await gotoAndWaitForReady(page, `${BASE_URL}/?${params}`, 'validateGraph', false);

    // The ontology response is held for 3 s, so startup is still running here.
    expect(await startupComplete(page), 'test setup: startup still running').toBe(false);
    for (const tool of ['validateGraph', 'runReasoning', 'loadShacl']) {
      const res = await callTool(page, tool, tool === 'loadShacl' ? { turtle: '' } : {}, BASE_URL);
      expect(res?.success, `${tool} during startup`).toBe(false);
      expect(String(res?.error), tool).toMatch(/still loading/i);
    }

    await expect.poll(() => startupComplete(page), { timeout: 60_000 }).toBe(true);
    const after = await callTool(page, 'validateGraph', {}, BASE_URL);
    expect(after?.success, JSON.stringify(after)).toBe(true);
    expect(await graphCount(page, 'urn:vg:shapes')).toBeGreaterThan(0);
  });

  test('ontologies alone: startup completes with the vocabulary loaded', async ({ page }) => {
    test.setTimeout(120_000);
    await gotoAndWaitForReady(page, `${BASE_URL}/?ontologies=${encodeURIComponent(ONTOLOGY_URL)}`, 'validateGraph');
    await expect.poll(() => startupComplete(page), { timeout: 60_000 }).toBe(true);
    expect(await graphCount(page, 'urn:vg:ontologies')).toBeGreaterThan(0);
  });

  test('no parameters: startup completes and the default shapes apply', async ({ page }) => {
    test.setTimeout(120_000);
    await gotoAndWaitForReady(page, `${BASE_URL}/`, 'validateGraph');
    await expect.poll(() => startupComplete(page), { timeout: 60_000 }).toBe(true);
    expect(await graphCount(page, 'urn:vg:shapes')).toBe(PRESET_QUADS);
  });
});
