// Regression tests for the fix to the materialisation discrepancy reported in the
// Advanced Engineering Materials review (Reviewer 1 "non-deterministic inference outputs";
// Reviewer 4 comment 22 "reads like a fault in the reasoning system").
//
// Measured cause: Konclude reports a NON-CANONICAL transitive reduction of the inferred
// named-class hierarchy. Ten cold sessions on a byte-identical base (PMDco @3b98aad +
// Fe-Si record) returned 380-389 inferred triples; all 59 differing statements were
// rdfs:subClassOf between named classes, while the transitive closure was identical
// (8246 statements) every time.
//
// The contract these tests pin down:
//   1. the output depends only on the edge SET, never on order or on which redundant
//      subset the reasoner reported  -> determinism;
//   2. closure(asserted + output) === closure(asserted + reported)  -> no entailment
//      is gained or lost by canonicalising.

import { describe, it, expect } from 'vitest';
import { canonicalInferredHierarchy, transitiveClosure, type Edge } from '../canonicalHierarchy.ts';

const C = (n: string) => `http://example.org/#${n}`;
const e = (a: string, b: string): Edge => [C(a), C(b)];
const shuffle = <T,>(xs: readonly T[], seed: number): T[] => {
  const out = [...xs];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
const norm = (edges: readonly Edge[]) => edges.map(([a, b]) => `${a} ${b}`).sort();

describe('canonicalInferredHierarchy', () => {
  it('drops edges that are implied by the others', () => {
    // A < B < C reported together with the redundant A < C
    const asserted: Edge[] = [];
    const reported: Edge[] = [e('A', 'B'), e('B', 'C'), e('A', 'C')];
    const out = canonicalInferredHierarchy(asserted, reported);
    expect(norm(out)).toEqual(norm([e('A', 'B'), e('B', 'C')]));
  });

  it('is invariant to input order', () => {
    const asserted: Edge[] = [e('D', 'E')];
    const reported: Edge[] = [e('A', 'B'), e('B', 'C'), e('A', 'C'), e('C', 'D'), e('A', 'D')];
    const base = norm(canonicalInferredHierarchy(asserted, reported));
    for (let seed = 1; seed <= 20; seed++) {
      const out = canonicalInferredHierarchy(shuffle(asserted, seed), shuffle(reported, seed));
      expect(norm(out)).toEqual(base);
    }
  });

  it('THE REGRESSION: two sessions reporting different redundant subsets canonicalise identically', () => {
    const asserted: Edge[] = [e('Leaf', 'Mid')];
    // Same entailed hierarchy; session 1 volunteers two redundant edges, session 2 one.
    const session1: Edge[] = [e('Mid', 'Upper'), e('Upper', 'Top'), e('Mid', 'Top'), e('Leaf', 'Top')];
    const session2: Edge[] = [e('Mid', 'Upper'), e('Upper', 'Top'), e('Leaf', 'Upper')];
    const a = canonicalInferredHierarchy(asserted, session1);
    const b = canonicalInferredHierarchy(asserted, session2);
    expect(norm(a)).toEqual(norm(b));
    // and the closure is the one both sessions entailed
    const closureOf = (inf: readonly Edge[]) => [...transitiveClosure([...asserted, ...inf])].sort();
    expect(closureOf(a)).toEqual(closureOf(session1));
    expect(closureOf(b)).toEqual(closureOf(session2));
  });

  it('preserves the transitive closure exactly', () => {
    const asserted: Edge[] = [e('A', 'B')];
    const reported: Edge[] = [e('B', 'C'), e('C', 'D'), e('A', 'C'), e('A', 'D'), e('B', 'D')];
    const out = canonicalInferredHierarchy(asserted, reported);
    const before = [...transitiveClosure([...asserted, ...reported])].sort();
    const after = [...transitiveClosure([...asserted, ...out])].sort();
    expect(after).toEqual(before);
  });

  it('handles equivalent classes (cycles) without losing entailments', () => {
    // X and Y mutually subsume (owl:equivalentClass materialised as two subClassOf edges)
    const asserted: Edge[] = [];
    const reported: Edge[] = [e('X', 'Y'), e('Y', 'X'), e('X', 'Z'), e('Y', 'Z')];
    const out = canonicalInferredHierarchy(asserted, reported);
    const before = [...transitiveClosure(reported)].sort();
    const after = [...transitiveClosure(out)].sort();
    expect(after).toEqual(before);
    // still order-invariant with a cycle present
    for (let seed = 1; seed <= 10; seed++) {
      expect(norm(canonicalInferredHierarchy(asserted, shuffle(reported, seed)))).toEqual(norm(out));
    }
  });

  it('never re-emits an asserted edge, a self-loop, or a duplicate', () => {
    const asserted: Edge[] = [e('A', 'B'), e('B', 'C')];
    const reported: Edge[] = [e('A', 'B'), e('A', 'A'), e('B', 'C'), e('B', 'C'), e('C', 'D')];
    const out = canonicalInferredHierarchy(asserted, reported);
    const keys = out.map(([a, b]) => `${a} ${b}`);
    expect(new Set(keys).size).toBe(keys.length);              // no duplicates
    expect(keys).not.toContain(`${C('A')} ${C('A')}`);          // no self-loop
    expect(keys).not.toContain(`${C('A')} ${C('B')}`);          // no asserted edge
    expect(keys).toContain(`${C('C')} ${C('D')}`);              // genuine inference kept
  });

  it('returns nothing for an empty hierarchy', () => {
    expect(canonicalInferredHierarchy([], [])).toEqual([]);
  });
});
