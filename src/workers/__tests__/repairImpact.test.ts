// Repair verification currently asks one question: does removing these axioms restore
// consistency? That is necessary and not sufficient. The cheapest way to make an
// inconsistent ontology consistent is to delete the axiom that caught the problem, and a
// consistency-only check scores that a success while the ontology quietly loses the ability
// to reject that family of errors again.
//
// These tests pin the second axis: what a repair costs in guards.

import { describe, it, expect } from 'vitest';
import { applyEdit, assessRepairImpact, rankRepairs, type ProposedEdit } from '../repairImpact.ts';
import { makePair, pairKey, type GuardVerdict } from '../guardSets.ts';
import type { PropertyGuardVerdict, PropertyGuardCandidate } from '../propertyGuards.ts';

const EX = 'http://example.org/#';
const C = (n: string) => `${EX}${n}`;
const g = (a: string, b: string, enforced: boolean): GuardVerdict =>
  ({ pair: makePair(C(a), C(b)), enforced, vacuous: false });
const pg = (property: string, enforced: boolean): PropertyGuardVerdict =>
  ({ candidate: { kind: 'domain', property: C(property), target: C('D') } as PropertyGuardCandidate, enforced, vacuous: false });

const term = (v: string) => ({ termType: 'NamedNode', value: v });
const quad = (s: string, p: string, o: string) => ({ subject: term(s), predicate: term(p), object: term(o) });

describe('applyEdit', () => {
  it('removes the named triples and adds the replacements', () => {
    const base = [quad(C('A'), C('p'), C('B')), quad(C('C'), C('p'), C('D'))];
    const edit: ProposedEdit = {
      removals: [{ subject: C('A'), predicate: C('p'), object: C('B') }],
      additions: [{ subject: C('A'), predicate: C('p'), object: C('Weaker') }],
    };
    const out = applyEdit(base, edit);
    expect(out).toHaveLength(2);
    expect(out.some((q) => q.object.value === C('B'))).toBe(false);
    expect(out.some((q) => q.object.value === C('Weaker'))).toBe(true);
  });

  it('does not mutate the input', () => {
    const base = [quad(C('A'), C('p'), C('B'))];
    applyEdit(base, { removals: [{ subject: C('A'), predicate: C('p'), object: C('B') }] });
    expect(base).toHaveLength(1);
  });

  it('a removal that matches nothing is a no-op, not an error', () => {
    const base = [quad(C('A'), C('p'), C('B'))];
    expect(applyEdit(base, { removals: [{ subject: C('X'), predicate: C('y'), object: C('Z') }] })).toHaveLength(1);
  });
});

describe('assessRepairImpact', () => {
  it('a repair that restores consistency and keeps every guard is verified', () => {
    const guards = [g('A', 'B', true), g('C', 'D', true)];
    const r = assessRepairImpact({
      wasInconsistent: true, consistencyRestored: true,
      classGuardsBefore: guards, classGuardsAfter: guards,
    });
    expect(r.verdict).toBe('verified');
    expect(r.classGuardsDestroyed).toEqual([]);
    expect(r.summary).toMatch(/destroys no guard/i);
  });

  it('THE POINT: deleting the axiom that caught the problem restores consistency but is flagged', () => {
    const before = [g('A', 'B', true), g('C', 'D', true)];
    const after = [g('A', 'B', false), g('C', 'D', true)]; // the disjointness was deleted
    const r = assessRepairImpact({
      wasInconsistent: true, consistencyRestored: true,
      classGuardsBefore: before, classGuardsAfter: after,
    });
    expect(r.consistencyRestored).toBe(true);
    expect(r.verdict, 'a consistency-only check would have called this a success')
      .toBe('restores-consistency-with-collateral');
    expect(r.classGuardsDestroyed.map(pairKey)).toEqual([pairKey(makePair(C('A'), C('B')))]);
    expect(r.summary).toMatch(/can now accept 1 modelling error/i);
  });

  it('counts destroyed property guards as collateral too', () => {
    const r = assessRepairImpact({
      wasInconsistent: true, consistencyRestored: true,
      classGuardsBefore: [], classGuardsAfter: [],
      propertyGuardsBefore: [pg('R', true)], propertyGuardsAfter: [pg('R', false)],
    });
    expect(r.verdict).toBe('restores-consistency-with-collateral');
    expect(r.propertyGuardsDestroyed).toHaveLength(1);
  });

  it('a candidate that leaves the ontology inconsistent is not a repair', () => {
    const r = assessRepairImpact({
      wasInconsistent: true, consistencyRestored: false,
      classGuardsBefore: [g('A', 'B', true)], classGuardsAfter: [g('A', 'B', true)],
    });
    expect(r.verdict).toBe('does-not-restore-consistency');
  });

  it('a consistent ontology has nothing to repair', () => {
    const r = assessRepairImpact({
      wasInconsistent: false, consistencyRestored: true,
      classGuardsBefore: [], classGuardsAfter: [],
    });
    expect(r.verdict).toBe('nothing-to-repair');
  });

  it('reports guard totals before and after', () => {
    const r = assessRepairImpact({
      wasInconsistent: true, consistencyRestored: true,
      classGuardsBefore: [g('A', 'B', true), g('C', 'D', true)],
      classGuardsAfter: [g('A', 'B', true), g('C', 'D', false)],
    });
    expect(r.classGuardsBefore).toBe(2);
    expect(r.classGuardsAfter).toBe(1);
  });
});

describe('rankRepairs', () => {
  it('prefers verified, then least collateral, then fewest removals', () => {
    const mk = (verdictDestroyed: number, restores: boolean, removals: number) => ({ verdictDestroyed, restores, removals });
    const impact = (c: ReturnType<typeof mk>) => assessRepairImpact({
      wasInconsistent: true,
      consistencyRestored: c.restores,
      classGuardsBefore: Array.from({ length: 3 }, (_, i) => g(`A${i}`, `B${i}`, true)),
      classGuardsAfter: Array.from({ length: 3 }, (_, i) => g(`A${i}`, `B${i}`, i >= c.verdictDestroyed)),
    });

    const noisy = mk(2, true, 1);      // restores, destroys 2
    const clean = mk(0, true, 3);      // restores, destroys 0 -> should win despite more removals
    const broken = mk(0, false, 1);    // does not restore -> last
    const mild = mk(1, true, 1);       // restores, destroys 1

    const ranked = rankRepairs([noisy, broken, clean, mild], impact, (c) => c.removals);
    expect(ranked[0]).toBe(clean);
    expect(ranked[1]).toBe(mild);
    expect(ranked[2]).toBe(noisy);
    expect(ranked[3]).toBe(broken);
  });

  it('is stable for equal candidates', () => {
    const a = { id: 'a' }, b = { id: 'b' };
    const impact = () => assessRepairImpact({
      wasInconsistent: true, consistencyRestored: true, classGuardsBefore: [], classGuardsAfter: [],
    });
    expect(rankRepairs([a, b], impact, () => 1).map((x) => x.id)).toEqual(['a', 'b']);
  });
});
