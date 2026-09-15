/**
 * Shapes loaded right after the app opens must not be replaced or mixed by the startup preset.
 *
 * At startup the app loads the shapes URL from settings (after the ontology autoloads). That load
 * used to clear urn:vg:shapes before fetching, then add the preset. Depending on timing, shapes a
 * user or an agent had just loaded were either wiped or merged with the 67-quad default preset.
 * The preset response is delayed here so the test shape is always loaded first.
 */
import { test, expect, type Page } from '@playwright/test';
import { gotoAndWaitForReady, callTool } from './e2e-helpers.js';

const BASE_URL = process.env.VG_URL ?? 'http://localhost:8080';
const PRESET = '**/shacl-shapes/ontology-quality.shacl.ttl';
const SHAPE = 'http://example.org/test#PersonShape';

// Exactly two triples, so the expected graph size is unambiguous.
const shapesTurtle = `@prefix sh: <http://www.w3.org/ns/shacl#> .
<${SHAPE}> a sh:NodeShape ; sh:targetClass <http://example.org/test#Person> .`;

async function shapeQuads(page: Page): Promise<number> {
  const res = await callTool(page, 'queryGraph', {
    sparql: 'SELECT (COUNT(*) AS ?n) WHERE { GRAPH <urn:vg:shapes> { ?s ?p ?o } }', limit: 5,
  });
  return Number(res?.data?.rows?.[0]?.n ?? -1);
}

test('shapes loaded after opening survive the startup preset unchanged', async ({ page }) => {
  test.setTimeout(120_000);
  let presetServed = false;
  await page.route(PRESET, async (route) => {
    await new Promise((r) => setTimeout(r, 6_000));
    await route.continue();
    presetServed = true;
  });

  await gotoAndWaitForReady(page, BASE_URL, 'loadShacl');
  const loaded = await callTool(page, 'loadShacl', { turtle: shapesTurtle }, BASE_URL);
  expect(loaded?.success, JSON.stringify(loaded)).toBe(true);

  await expect.poll(() => presetServed, { timeout: 60_000 }).toBe(true);
  await page.waitForTimeout(3_000); // let a preset load, if any, reach the store

  expect(await shapeQuads(page), 'only the shapes loaded after opening remain').toBe(2);
});

test('the startup preset still applies when nothing was loaded', async ({ page }) => {
  test.setTimeout(120_000);
  let presetServed = false;
  await page.route(PRESET, async (route) => {
    await new Promise((r) => setTimeout(r, 3_000));
    await route.continue();
    presetServed = true;
  });

  await gotoAndWaitForReady(page, BASE_URL, 'loadShacl');
  await expect.poll(() => presetServed, { timeout: 60_000 }).toBe(true);
  await expect.poll(() => shapeQuads(page), { timeout: 15_000 }).toBe(67);
});
