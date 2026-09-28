// Property guards: the second sentence form, beyond class disjointness.
// The probe encodings themselves are validated against the real reasoner by
// _diag/validate-property-probes.mjs (9 known-answer cases). These tests cover the pure
// logic: candidate extraction, probe structure, vacuity, undecidability and diffing.

import { describe, it, expect } from 'vitest';
import * as N3 from 'n3';
import {
  declaredPropertyGuards, buildPropertyProbeQuads, interpretPropertyProbes,
  diffPropertyGuards, candidateKey, PROPERTY_PROBE_PREFIX, UNDECIDABLE_BY_PROBE,
  type PropertyGuardCandidate, type PropertyGuardVerdict,
} from '../propertyGuards.ts';

const EX = 'http://example.org/#';
const parse = (ttl: string) => new N3.Parser().parse(`
  @prefix : <${EX}> .
  @prefix owl: <http://www.w3.org/2002/07/owl#> .
  @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
  @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
  ${ttl}`);
const kinds = (cs: readonly PropertyGuardCandidate[]) => cs.map((c) => c.kind).sort();

describe('declaredPropertyGuards', () => {
  it('finds domain, range, functional and irreflexive declarations', () => {
    const cs = declaredPropertyGuards(parse(`
      :R a owl:ObjectProperty , owl:FunctionalProperty , owl:IrreflexiveProperty ;
         rdfs:domain :D ; rdfs:range :G .`));
    expect(kinds(cs)).toEqual(['domain', 'functional', 'irreflexive', 'range']);
  });

  it('ignores domain/range of owl:Thing, which constrains nothing', () => {
    const cs = declaredPropertyGuards(parse(`
      :R a owl:ObjectProperty ; rdfs:domain owl:Thing ; rdfs:range owl:Thing .`));
    expect(cs).toEqual([]);
  });

  it('ignores declarations on things that are not object properties', () => {
    // a datatype property's range is not an object-property guard of this kind
    const cs = declaredPropertyGuards(parse(`:P a owl:DatatypeProperty ; rdfs:range :D .`));
    expect(cs).toEqual([]);
  });

  it('reads owl:propertyDisjointWith as a candidate even though it is undecidable here', () => {
    const cs = declaredPropertyGuards(parse(`
      :R a owl:ObjectProperty . :S a owl:ObjectProperty . :R owl:propertyDisjointWith :S .`));
    expect(kinds(cs)).toEqual(['disjointProperties']);
  });

  it('is deterministic and deduplicated', () => {
    const ttl = `:R a owl:ObjectProperty ; rdfs:domain :D ; rdfs:domain :D .`;
    expect(declaredPropertyGuards(parse(ttl))).toHaveLength(1);
    expect(declaredPropertyGuards(parse(ttl)).map(candidateKey))
      .toEqual(declaredPropertyGuards(parse(ttl)).map(candidateKey));
  });
});

describe('buildPropertyProbeQuads', () => {
  it('emits one probe class per candidate plus the two fresh disjoint classes', () => {
    const cs: PropertyGuardCandidate[] = [
      { kind: 'domain', property: `${EX}R`, target: `${EX}D` },
      { kind: 'functional', property: `${EX}R` },
    ];
    const quads = buildPropertyProbeQuads(cs);
    const probes = new Set(quads
      .map((q) => q.subject.value)
      .filter((v) => v.startsWith(PROPERTY_PROBE_PREFIX) && /:\d+$/.test(v)));
    expect(probes.size).toBe(2);
    // F1 and F2 must be declared disjoint, or the functional probe cannot bite
    const disjoint = quads.filter((q) => q.predicate.value === 'http://www.w3.org/2002/07/owl#disjointWith');
    expect(disjoint).toHaveLength(1);
  });

  it('uses owl:hasSelf for the irreflexive probe', () => {
    const quads = buildPropertyProbeQuads([{ kind: 'irreflexive', property: `${EX}R` }]);
    expect(quads.some((q) => q.predicate.value === 'http://www.w3.org/2002/07/owl#hasSelf')).toBe(true);
  });

  it('every added axiom mentions a fresh entity, so the extension stays conservative', () => {
    // Soundness rests on this: no probe may constrain a pre-existing name on its left side.
    const quads = buildPropertyProbeQuads([{ kind: 'range', property: `${EX}R`, target: `${EX}D` }]);
    for (const q of quads) {
      const s = q.subject;
      const fresh = s.termType === 'BlankNode' || s.value.startsWith(PROPERTY_PROBE_PREFIX);
      expect(fresh, `subject ${s.value} is not fresh`).toBe(true);
    }
  });
});

describe('interpretPropertyProbes', () => {
  const cs: PropertyGuardCandidate[] = [
    { kind: 'domain', property: `${EX}R`, target: `${EX}D` },
    { kind: 'range', property: `${EX}R`, target: `${EX}G` },
  ];

  it('an unsatisfiable probe means the guard is enforced', () => {
    const v = interpretPropertyProbes(cs, new Set([`${PROPERTY_PROBE_PREFIX}0`]), new Set());
    expect(v[0].enforced).toBe(true);
    expect(v[1].enforced).toBe(false);
  });

  it('VACUITY: an unsatisfiable target class is not an enforced guard', () => {
    const v = interpretPropertyProbes(cs, new Set([`${PROPERTY_PROBE_PREFIX}0`]), new Set([`${EX}D`]));
    expect(v[0].vacuous).toBe(true);
    expect(v[0].enforced).toBe(false);
  });

  it('an undecidable kind is marked, never reported as "not enforced"', () => {
    const [v] = interpretPropertyProbes(
      [{ kind: 'disjointProperties', property: `${EX}R`, target: `${EX}S` }], new Set(), new Set());
    expect(v.undecidable).toBe(true);
    expect(UNDECIDABLE_BY_PROBE.has('disjointProperties')).toBe(true);
  });
});

describe('diffPropertyGuards', () => {
  const v = (c: PropertyGuardCandidate, enforced: boolean, undecidable?: true): PropertyGuardVerdict =>
    ({ candidate: c, enforced, vacuous: false, ...(undecidable ? { undecidable } : {}) });
  const dom: PropertyGuardCandidate = { kind: 'domain', property: `${EX}R`, target: `${EX}D` };
  const rng: PropertyGuardCandidate = { kind: 'range', property: `${EX}R`, target: `${EX}G` };

  it('reports lost, gained and retained', () => {
    const d = diffPropertyGuards([v(dom, true), v(rng, true)], [v(dom, true), v(rng, false)]);
    expect(d.retained.map(candidateKey)).toEqual([candidateKey(dom)]);
    expect(d.lost.map(candidateKey)).toEqual([candidateKey(rng)]);
    expect(d.gained).toEqual([]);
  });

  it('an undecidable candidate is neither lost nor retained, because it was never measured', () => {
    const d = diffPropertyGuards(
      [v(dom, false, true)],
      [v(dom, false, true)],
    );
    expect(d.lost).toEqual([]);
    expect(d.retained).toEqual([]);
    expect(d.gained).toEqual([]);
  });
});
