// @vitest-environment node
//
// Ontosphere hands the reasoner removals as exact quads and trusts the match to be exact:
// a literal differs by datatype and language, and a quad by its graph. This replaces the
// graph-scoping and typed-literal assertions of the retired verifyRepairMatch.test.ts, now
// against the reasoner that does the matching (assessEdit's unmatchedRemovals).
import { describe, it, expect } from 'vitest';
import { RdfReasoner } from 'rdf-reasoner-konclude';
import * as N3 from 'n3';

const { namedNode: nn, literal, quad } = N3.DataFactory;
const EX = 'http://example.org/#';
const XSD = 'http://www.w3.org/2001/XMLSchema#';
const OWL = 'http://www.w3.org/2002/07/owl#';
const TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const x = nn(`${EX}x`);
const p = nn(`${EX}label`);

const prefix = [
  quad(p, nn(TYPE), nn(`${OWL}DatatypeProperty`), nn('urn:vg:ontologies')),
  quad(x, nn(TYPE), nn(`${OWL}NamedIndividual`), nn('urn:vg:data')),
];
const integer42 = quad(x, p, literal('42', nn(`${XSD}integer`)), nn('urn:vg:data'));
const string42 = quad(x, p, literal('42'), nn('urn:vg:data'));
const english = quad(x, p, literal('chair', 'en'), nn('urn:vg:data'));
const ontologiesCopy = quad(x, p, literal('42'), nn('urn:vg:ontologies'));

async function unmatched(removal: N3.Quad): Promise<unknown[]> {
  let reasoner: RdfReasoner;
  try {
    reasoner = new RdfReasoner();
    await reasoner.ready;
  } catch (e) {
    if (process.env.REQUIRE_KONCLUDE) throw e;
    console.warn('[TEST][SKIP] Konclude unavailable:', String(e));
    return [];
  }
  try {
    const store = new N3.Store([...prefix, integer42, string42, english, ontologiesCopy]);
    return (await reasoner.assessEdit(store, { remove: [removal] })).unmatchedRemovals;
  } finally {
    reasoner.terminate();
  }
}

describe('removal by exact quad identity', () => {
  it('matches the typed literal that is in the store', async () => {
    expect(await unmatched(integer42)).toEqual([]);
  });

  it('does not match the same lexical form with another datatype', async () => {
    const wrong = quad(x, p, literal('42', nn(`${XSD}decimal`)), nn('urn:vg:data'));
    expect(await unmatched(wrong)).toEqual([wrong]);
  });

  it('does not match a language-tagged literal by its text alone, or another language', async () => {
    const german = quad(x, p, literal('chair', 'de'), nn('urn:vg:data'));
    const plain = quad(x, p, literal('chair'), nn('urn:vg:data'));
    expect(await unmatched(english)).toEqual([]);
    expect(await unmatched(german)).toEqual([german]);
    expect(await unmatched(plain)).toEqual([plain]);
  });

  it('pins a removal to its graph', async () => {
    const elsewhere = quad(x, p, literal('42'), nn('urn:vg:other'));
    expect(await unmatched(string42)).toEqual([]);
    expect(await unmatched(elsewhere)).toEqual([elsewhere]);
  });
});
