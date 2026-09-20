// Guard sets: which modelling errors an ontology can still reject.
// See guardSets.ts for the definition, the probe procedure and the vacuity condition.

import { describe, it, expect } from 'vitest';
import * as N3 from 'n3';
import {
  declaredDisjointPairs, deprecatedClasses, buildProbeTriples, interpretProbeResults,
  diffGuards, makePair, pairKey, PROBE_PREFIX, type GuardVerdict,
} from '../guardSets.ts';

const EX = 'http://example.org/#';
const parse = (ttl: string) => new N3.Parser().parse(`
  @prefix : <${EX}> .
  @prefix owl: <http://www.w3.org/2002/07/owl#> .
  @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
  @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
  ${ttl}`);
const keys = (ps: readonly { a: string; b: string }[]) => ps.map(pairKey).sort();

describe('declaredDisjointPairs', () => {
  it('reads binary owl:disjointWith', () => {
    const pairs = declaredDisjointPairs(parse(`:A a owl:Class . :B a owl:Class . :A owl:disjointWith :B .`));
    expect(keys(pairs)).toEqual([pairKey(makePair(`${EX}A`, `${EX}B`))]);
  });

  it('expands owl:AllDisjointClasses to its pairwise closure', () => {
    const pairs = declaredDisjointPairs(parse(`
      [] a owl:AllDisjointClasses ; owl:members ( :A :B :C ) .`));
    expect(pairs).toHaveLength(3); // C(3,2)
    expect(keys(pairs)).toEqual(keys([
      makePair(`${EX}A`, `${EX}B`), makePair(`${EX}A`, `${EX}C`), makePair(`${EX}B`, `${EX}C`),
    ]));
  });

  it('expands owl:disjointUnionOf members pairwise', () => {
    const pairs = declaredDisjointPairs(parse(`:Top owl:disjointUnionOf ( :A :B :C ) .`));
    expect(pairs).toHaveLength(3);
  });

  it('does NOT mistake owl:AllDifferent members for class pairs', () => {
    // owl:members is shared between AllDisjointClasses and AllDifferent; only the former
    // says anything about classes.
    const pairs = declaredDisjointPairs(parse(`
      [] a owl:AllDifferent ; owl:members ( :ind1 :ind2 :ind3 ) .`));
    expect(pairs).toEqual([]);
  });

  it('is order-independent and deduplicates {A,B} against {B,A}', () => {
    const pairs = declaredDisjointPairs(parse(`
      :A owl:disjointWith :B . :B owl:disjointWith :A .`));
    expect(pairs).toHaveLength(1);
  });

  it('ignores a class declared disjoint with itself', () => {
    expect(declaredDisjointPairs(parse(`:A owl:disjointWith :A .`))).toEqual([]);
  });
});

describe('buildProbeTriples', () => {
  it('emits one fresh probe per pair, subsumed by both endpoints', () => {
    const pairs = [makePair(`${EX}A`, `${EX}B`), makePair(`${EX}C`, `${EX}D`)];
    const triples = buildProbeTriples(pairs);
    expect(triples).toHaveLength(6); // 3 per pair
    const sub = triples.filter((t) => t[1].endsWith('subClassOf'));
    expect(sub.map((t) => t[2]).sort()).toEqual([`${EX}A`, `${EX}B`, `${EX}C`, `${EX}D`]);
    // probes must be distinct, or two pairs would share a verdict
    expect(new Set(triples.map((t) => t[0])).size).toBe(2);
  });
});

describe('interpretProbeResults', () => {
  const pairs = [makePair(`${EX}A`, `${EX}B`), makePair(`${EX}C`, `${EX}D`)];

  it('an unsatisfiable probe means the pair is enforced', () => {
    const v = interpretProbeResults(pairs, new Set([`${PROBE_PREFIX}0`]), new Set());
    expect(v[0].enforced).toBe(true);
    expect(v[1].enforced).toBe(false);
  });

  it('VACUITY: an unsatisfiable endpoint is not an enforced guard', () => {
    // A is broken on its own, so P ⊑ A ⊓ B is unsatisfiable for a reason that has nothing
    // to do with B. Counting it as a guard would report a destroyed guard as intact.
    const v = interpretProbeResults(pairs, new Set([`${PROBE_PREFIX}0`]), new Set([`${EX}A`]));
    expect(v[0].vacuous).toBe(true);
    expect(v[0].enforced, 'a vacuous pair rejects nothing and must not count').toBe(false);
  });

  it('a satisfiable probe is not enforced regardless of vacuity', () => {
    const v = interpretProbeResults(pairs, new Set(), new Set([`${EX}A`]));
    expect(v[0].enforced).toBe(false);
  });
});

describe('diffGuards', () => {
  const g = (a: string, b: string, enforced: boolean): GuardVerdict =>
    ({ pair: makePair(a, b), enforced, vacuous: false });

  it('reports guards lost, gained and retained between two versions', () => {
    const before = [g(`${EX}A`, `${EX}B`, true), g(`${EX}C`, `${EX}D`, true)];
    const after = [g(`${EX}A`, `${EX}B`, true), g(`${EX}C`, `${EX}D`, false), g(`${EX}E`, `${EX}F`, true)];
    const d = diffGuards(before, after);
    expect(keys(d.retained)).toEqual([pairKey(makePair(`${EX}A`, `${EX}B`))]);
    expect(keys(d.lost)).toEqual([pairKey(makePair(`${EX}C`, `${EX}D`))]);
    expect(keys(d.gained)).toEqual([pairKey(makePair(`${EX}E`, `${EX}F`))]);
  });

  it('separates losses with a deprecated endpoint from live/live losses', () => {
    const before = [g(`${EX}A`, `${EX}B`, true), g(`${EX}C`, `${EX}D`, true)];
    const after = [g(`${EX}A`, `${EX}B`, false), g(`${EX}C`, `${EX}D`, false)];
    const d = diffGuards(before, after, new Set([`${EX}A`]));
    expect(keys(d.lost)).toHaveLength(2);
    // only C/D is a live/live loss; A/B is explained by A being deprecated
    expect(keys(d.lostLiveLive)).toEqual([pairKey(makePair(`${EX}C`, `${EX}D`))]);
  });

  it('a pair absent from the comparison counts as lost', () => {
    const d = diffGuards([g(`${EX}A`, `${EX}B`, true)], []);
    expect(keys(d.lost)).toEqual([pairKey(makePair(`${EX}A`, `${EX}B`))]);
  });
});

describe('deprecatedClasses', () => {
  it('collects owl:deprecated true', () => {
    const dep = deprecatedClasses(parse(`:Old owl:deprecated true . :New a owl:Class .`));
    expect([...dep]).toEqual([`${EX}Old`]);
  });
});
