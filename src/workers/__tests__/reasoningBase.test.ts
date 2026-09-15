// Regression test for the repeat-latency defect.
//
// v1.5.2 filtered the reasoning base at every Konclude entry point. When reasoning moved to
// the rdf-reasoner-konclude package API the filter was dropped and the whole shared store
// was passed straight through, so a second reasoning run saw its OWN previous output as
// input: urn:vg:inferred plus the urn:konclude:explanations graph the package writes.
//
// Measured on LUBM-1 (103 410 triples, 100 837 quads after de-duplication):
//   cold                                          7.9 s   base 100 837 quads
//   repeat with the reasoner's output retained   64.3 s   base 320 460 quads
//   repeat with those graphs removed first        7.5 s
// The materialised result was identical (68 363 triples) in all three, so the extra 56 s
// was spent re-deriving conclusions the reasoner had already drawn.
//
// SHACL shapes, the provenance journal and workflow state are excluded for a second
// reason: they are not OWL axioms and must not be classified as if they were.

import { describe, it, expect } from 'vitest';
import * as N3 from 'n3';
import { reasoningBase } from '../rdfManager.runtime.ts';

const nn = N3.DataFactory.namedNode;
const quad = (s: string, p: string, o: string, g?: string) =>
  g ? N3.DataFactory.quad(nn(s), nn(p), nn(o), nn(g)) : N3.DataFactory.quad(nn(s), nn(p), nn(o));

const A = 'http://example.org/#A';
const B = 'http://example.org/#B';
const SUB = 'http://www.w3.org/2000/01/rdf-schema#subClassOf';

describe('reasoningBase', () => {
  it('keeps asserted data and ontology graphs', () => {
    const store = new N3.Store([
      quad(A, SUB, B),                       // default graph
      quad(A, SUB, B, 'urn:vg:data'),
      quad(A, SUB, B, 'urn:vg:ontologies'),
    ]);
    expect(reasoningBase(store).size).toBe(3);
  });

  it('excludes the reasoner own output so a repeat run cannot re-reason over it', () => {
    const store = new N3.Store([
      quad(A, SUB, B, 'urn:vg:data'),
      quad(A, SUB, B, 'urn:vg:inferred'),
      quad(A, SUB, B, 'urn:konclude:explanations'),
    ]);
    const base = reasoningBase(store);
    expect(base.size).toBe(1);
    expect(base.getQuads(null, null, null, nn('urn:vg:inferred')).length).toBe(0);
    expect(base.getQuads(null, null, null, nn('urn:konclude:explanations')).length).toBe(0);
  });

  it('excludes shapes, provenance and workflow state, which are not OWL axioms', () => {
    const store = new N3.Store([
      quad(A, SUB, B, 'urn:vg:data'),
      quad(A, SUB, B, 'urn:vg:shapes'),
      quad(A, SUB, B, 'urn:vg:provenance'),
      quad(A, SUB, B, 'urn:vg:workflows'),
    ]);
    expect(reasoningBase(store).size).toBe(1);
  });

  it('is idempotent: filtering an already filtered base changes nothing', () => {
    const store = new N3.Store([
      quad(A, SUB, B, 'urn:vg:data'),
      quad(A, SUB, B, 'urn:vg:inferred'),
    ]);
    const once = reasoningBase(store);
    expect(reasoningBase(once).size).toBe(once.size);
  });

  it('does not mutate the store it is given', () => {
    const store = new N3.Store([
      quad(A, SUB, B, 'urn:vg:data'),
      quad(A, SUB, B, 'urn:vg:inferred'),
    ]);
    const before = store.size;
    reasoningBase(store);
    expect(store.size).toBe(before);
  });
});
