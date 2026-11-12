/**
 * The startup preset is applied once, untouched: MCP shape loads during startup are rejected.
 *
 * At startup the app loads the shapes URL from settings (after the ontology autoloads). That load
 * used to clear urn:vg:shapes before fetching, then add the preset. Depending on timing, shapes a
 * user or an agent had just loaded were either wiped or merged with the default preset.
 * The preset response is delayed here so the test shape is always loaded first.
 */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as N3 from 'n3';
import { gotoAndWaitForReady, callTool } from './e2e-helpers.js';

const BASE_URL = process.env.VG_URL ?? 'http://localhost:8080';
const PRESET = '**/shacl-shapes/ontology-quality.shacl.ttl';
const SHAPE = 'http://example.org/test#PersonShape';
// Size of the default preset: whatever the bundled file holds (the test does not hard-code it).
const PRESET_QUADS = new N3.Parser().parse(
  readFileSync(resolve(process.cwd(), 'public/shacl-shapes/ontology-quality.shacl.ttl'), 'utf-8'),
).length;

// Exactly two triples, so the expected graph size is unambiguous.
const shapesTurtle = `@prefix sh: <http://www.w3.org/ns/shacl#> .
<${SHAPE}> a sh:NodeShape ; sh:targetClass <http://example.org/test#Person> .`;

async function shapeQuads(page: Page): Promise<number> {
  const res = await callTool(page, 'queryGraph', {
    sparql: 'SELECT (COUNT(*) AS ?n) WHERE { GRAPH <urn:vg:shapes> { ?s ?p ?o } }', limit: 5,
  });
  return Number(res?.data?.rows?.[0]?.n ?? -1);
}

test('a shapes load during startup is rejected and the preset stays intact', async ({ page }) => {
  test.setTimeout(120_000);
  let presetServed = false;
  await page.route(PRESET, async (route) => {
    await new Promise((r) => setTimeout(r, 6_000));
    await route.continue();
    presetServed = true;
  });

  // MCP calls are rejected until startup loading is complete, so shapes cannot be loaded
  // into the window where the preset is still on its way.
  await gotoAndWaitForReady(page, BASE_URL, 'loadShacl', false);
  const early = await callTool(page, 'loadShacl', { turtle: shapesTurtle }, BASE_URL);
  expect(early?.success, 'loadShacl during startup').toBe(false);

  await expect.poll(() => presetServed, { timeout: 60_000 }).toBe(true);
  await expect.poll(() => shapeQuads(page), { timeout: 15_000 }).toBe(PRESET_QUADS);
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
  await expect.poll(() => shapeQuads(page), { timeout: 15_000 }).toBe(PRESET_QUADS);
});

// ---- Which shapes apply: ?shaclShapes= over settings over the built-in default ----
//
// The built-in ontology-quality shapes are a fallback only. Any shapes named by the URL or by the
// settings replace them (no mixing), and a URL parameter wins over the settings.

const QUALITY_PREFIX = 'urn:shacl:ontology-quality:';
const DEMO_SHAPE = 'urn:shacl:demo:ProjectDescription';

async function shapeSubjects(page: Page): Promise<string[]> {
  const res = await callTool(page, 'queryGraph', {
    sparql: 'SELECT DISTINCT ?s WHERE { GRAPH <urn:vg:shapes> { ?s a <http://www.w3.org/ns/shacl#NodeShape> } }', limit: 500,
  }, BASE_URL);
  return (res?.data?.rows ?? []).map((r: any) => String(r.s));
}

test('?shaclShapes= replaces the default: the ontology-quality shapes are not loaded', async ({ page }) => {
  test.setTimeout(120_000);
  const shapes = encodeURIComponent(`${BASE_URL}/shacl-shapes/reasoning-demo.shacl.ttl`);
  await gotoAndWaitForReady(page, `${BASE_URL}/?shaclShapes=${shapes}`, 'loadShacl');
  await expect.poll(() => shapeSubjects(page), { timeout: 30_000 }).toContain(DEMO_SHAPE);
  expect((await shapeSubjects(page)).filter((s) => s.startsWith(QUALITY_PREFIX))).toEqual([]);
});

test('the settings shapes URL replaces the default; ?shaclShapes= wins over the settings', async ({ page, context }) => {
  test.setTimeout(180_000);
  const settingsUrl = `${BASE_URL}/shacl-shapes/reasoning-demo.shacl.ttl`;
  await context.addInitScript((url) => {
    // zustand persist format of the settings store
    localStorage.setItem('ontology-painter-settings', JSON.stringify({ state: { settings: { shaclShapesUrl: url } }, version: 3 }));
  }, settingsUrl);

  await gotoAndWaitForReady(page, BASE_URL, 'loadShacl');
  await expect.poll(() => shapeSubjects(page), { timeout: 30_000 }).toContain(DEMO_SHAPE);
  expect((await shapeSubjects(page)).filter((s) => s.startsWith(QUALITY_PREFIX)), 'settings URL, no default').toEqual([]);

  // The URL parameter names the quality shapes: they load, the settings shapes do not.
  const param = encodeURIComponent(`${BASE_URL}/shacl-shapes/ontology-quality.shacl.ttl`);
  await gotoAndWaitForReady(page, `${BASE_URL}/?shaclShapes=${param}`, 'loadShacl');
  await expect.poll(async () => (await shapeSubjects(page)).some((s) => s.startsWith(QUALITY_PREFIX)), { timeout: 30_000 }).toBe(true);
  expect(await shapeSubjects(page), 'URL beats settings').not.toContain(DEMO_SHAPE);
});
