// @vitest-environment node
//
// SHACL repair candidates (they restore conformance, not consistency, and stay in Ontosphere) and
// the H1 guard that every action.tool a repair emits is a registered MCP tool. These assertions
// lived in computeRepairs.test.ts, whose hitting-set and ranking half moved to the reasoner's
// repair() (covered by the library's tests and by repairAdapter.test.ts).
import { describe, it, expect } from 'vitest';
import { buildShaclRepairs } from '../tools/computeRepairs';
import { suggestDeletionRepairs } from '../tools/repairAdapter';
import { fakeRepairLibrary } from './helpers/fakeRepairLibrary';
import { mcpManifest } from '../manifest';

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const OWL_DISJOINT = 'http://www.w3.org/2002/07/owl#disjointWith';
const OWL_FUNCTIONAL = 'http://www.w3.org/2002/07/owl#FunctionalProperty';
const EX = 'http://ex/';
const ax = (s: string, p: string, o: string) => ({ subject: s, predicate: p, object: o });
const identity = <T>(q: T) => q;
const violation = (focusNode: string | null, path: string | null) =>
  ({ focusNode, path, severity: 'sh:Violation', message: null, sourceShape: null, constraint: null });

describe('buildShaclRepairs', () => {
  it('emits an addTriple candidate with needsValue for an actionable violation', () => {
    const shacl = buildShaclRepairs([{
      focusNode: `${EX}projectAlpha`,
      path: 'http://www.w3.org/2000/01/rdf-schema#comment',
      severity: 'sh:Violation',
      message: 'missing rdfs:comment',
      sourceShape: `${EX}S`,
      constraint: 'http://www.w3.org/ns/shacl#MinCountConstraintComponent',
    }]);
    expect(shacl).toHaveLength(1);
    expect(shacl[0].issue).toBe('shacl');
    expect(shacl[0].action.tool).toBe('addTriple');
    expect(shacl[0].action.args.subjectIri).toBe(`${EX}projectAlpha`);
    expect(shacl[0].action.args.predicateIri).toBe('http://www.w3.org/2000/01/rdf-schema#comment');
    expect(shacl[0].action.args.objectValue).toBeUndefined();
    expect(shacl[0].needsValue).toBe(true);
  });

  it('skips violations without a focusNode or path (not actionable)', () => {
    expect(buildShaclRepairs([violation(null, 'http://ex/p'), violation(`${EX}n`, null)])).toHaveLength(0);
  });

  it('assigns sequential S-prefixed ids', () => {
    const repairs = buildShaclRepairs([violation(`${EX}a`, `${EX}p`), violation(`${EX}b`, `${EX}q`)]);
    expect(repairs.map((r) => r.id)).toEqual(['S1', 'S2']);
  });
});

describe('H1: every emitted action.tool is a registered MCP tool', () => {
  // The manifest is CI-enforced (scripts/check-mcp-json.mjs) to match the handler registry.
  const REGISTERED_TOOLS = new Set(mcpManifest.map((t) => t.name));

  it('manifest contains removeLink and addTriple but NOT removeTriple (guards the H1 regression)', () => {
    expect(REGISTERED_TOOLS.has('removeLink')).toBe(true);
    expect(REGISTERED_TOOLS.has('addTriple')).toBe(true);
    expect(REGISTERED_TOOLS.has('removeTriple')).toBe(false);
  });

  it('IRI-object and literal-object deletion repairs use removeLink, which is registered', async () => {
    const iri = [
      ax(`${EX}frank`, RDF_TYPE, `${EX}Employee`),
      ax(`${EX}frank`, RDF_TYPE, `${EX}Contractor`),
      ax(`${EX}Employee`, OWL_DISJOINT, `${EX}Contractor`),
    ];
    const literal = [
      ax(`${EX}age`, RDF_TYPE, OWL_FUNCTIONAL),
      { subject: `${EX}bob`, predicate: `${EX}age`, object: '30', objectTermType: 'Literal' },
      { subject: `${EX}bob`, predicate: `${EX}age`, object: '40', objectTermType: 'Literal' },
    ];
    const res = await suggestDeletionRepairs({ lib: fakeRepairLibrary([iri, literal]), reskolemize: identity });
    expect(res.repairs.length).toBeGreaterThanOrEqual(2);
    for (const r of res.repairs) {
      expect(r.action.tool).toBe('removeLink');
      expect(REGISTERED_TOOLS.has(r.action.tool)).toBe(true);
    }
  });

  it('all emitted tools (deletion, manual-review marker, SHACL) are members of the registered tool set', async () => {
    const res = await suggestDeletionRepairs({
      lib: fakeRepairLibrary([[ax(`${EX}a`, RDF_TYPE, `${EX}X`), ax(`${EX}a`, RDF_TYPE, `${EX}Y`)], []]),
      reskolemize: identity,
    });
    const all = [...res.repairs, ...buildShaclRepairs([violation(`${EX}n`, `${EX}p`)])];
    expect(all.length).toBeGreaterThan(2);
    for (const r of all) expect(REGISTERED_TOOLS.has(r.action.tool)).toBe(true);
  });
});
