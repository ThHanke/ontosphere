// @vitest-environment node
// Shape files are parsed with their URL as base IRI, and a file that fails is logged and reported.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { loadRDFIntoGraph, loadRDFIntoGraphIfEmpty } = vi.hoisted(() => ({
  loadRDFIntoGraph: vi.fn(),
  loadRDFIntoGraphIfEmpty: vi.fn().mockResolvedValue(true),
}));
vi.mock('../rdfManager', () => ({
  rdfManager: {
    loadRDFIntoGraph,
    loadRDFIntoGraphIfEmpty,
    removeGraphAsync: vi.fn().mockResolvedValue(undefined),
    fetchQuadsPage: vi.fn().mockResolvedValue({ items: [] }),
  },
}));

import { loadShaclShapes, loadShaclTurtle } from '../shaclShapeLoader';
import { useShaclResultStore } from '../../stores/shaclResultStore';

const GOOD = '@prefix sh: <http://www.w3.org/ns/shacl#> . <#S> a sh:NodeShape .';
const BAD = '@prefix : shape: . :S a :T .';
const files: Record<string, string> = { 'https://ex.org/good.ttl': GOOD, 'https://ex.org/bad.ttl': BAD };

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, text: async () => files[url] })));
  loadRDFIntoGraph.mockReset().mockImplementation(async (text: string) => {
    if (text === BAD) throw new Error('Unexpected "shape:" on line 1.');
  });
  loadRDFIntoGraphIfEmpty.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

describe('loadShaclShapes', () => {
  it('passes each file URL as base IRI and reports and logs the file that does not parse', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const m = await loadShaclShapes('https://ex.org/good.ttl, https://ex.org/bad.ttl');
    expect(loadRDFIntoGraph).toHaveBeenCalledWith(GOOD, 'urn:vg:shapes', 'text/turtle', undefined, undefined, 'https://ex.org/good.ttl');
    expect(m.loaded.map((l) => l.url)).toEqual(['https://ex.org/good.ttl']);
    expect(m.errors).toHaveLength(1);
    expect(m.errors[0].url).toBe('https://ex.org/bad.ttl');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('https://ex.org/bad.ttl'));
    warn.mockRestore();
  });

  it('startup load: invalid Turtle stays a parse error, valid files load with their own base IRI', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const m = await loadShaclShapes('https://ex.org/bad.ttl,https://ex.org/good.ttl', { onlyIfEmpty: true });
    expect(m.errors.map((e) => e.url)).toEqual(['https://ex.org/bad.ttl']);
    expect(loadRDFIntoGraphIfEmpty).toHaveBeenCalledWith([GOOD], 'urn:vg:shapes', 'text/turtle', ['https://ex.org/good.ttl']);
    warn.mockRestore();
  });

  it('keeps the failed files in the store for the panel badge, and clears them after a clean load', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await loadShaclShapes('https://ex.org/good.ttl, https://ex.org/bad.ttl');
    expect(useShaclResultStore.getState().shapeLoadErrors.map((e) => e.url)).toEqual(['https://ex.org/bad.ttl']);
    await loadShaclShapes('https://ex.org/good.ttl');
    expect(useShaclResultStore.getState().shapeLoadErrors).toEqual([]);
    warn.mockRestore();
  });

  it('inline Turtle (loadShacl) goes through the same track: a parse failure is kept for the badge and rethrown', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    useShaclResultStore.getState().setShapeLoadErrors([]);
    await expect(loadShaclTurtle(BAD)).rejects.toThrow('Unexpected');
    expect(useShaclResultStore.getState().shapeLoadErrors).toEqual([{ url: 'inline Turtle', error: expect.stringContaining('Unexpected') }]);
    await loadShaclTurtle(GOOD, 'https://ex.org/x.ttl');
    warn.mockRestore();
  });
});
