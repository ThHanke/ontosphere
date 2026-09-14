// An explanation is only an explanation if the axioms it names actually entail the
// statement, and only a good one if every axiom is needed. Producing a justification checks
// neither. These tests pin both checks and the call cost of running them.
//
// The oracle is injected, so the logic is exercised exhaustively here without WASM; the
// experiment wires the same code to the real reasoner.

import { describe, it, expect, vi } from 'vitest';
import { assessJustification, summarise, type AxiomTriple, type ExplanationReport } from '../explanationQuality.ts';

const EX = 'http://example.org/#';
const ax = (s: string, p: string, o: string): AxiomTriple => ({ subject: EX + s, predicate: EX + p, object: EX + o });
const A = ax('A', 'subClassOf', 'B');
const B = ax('B', 'subClassOf', 'C');
const NOISE = ax('X', 'subClassOf', 'Y');

/** An oracle that entails the statement iff the given axioms include every required one. */
const oracleRequiring = (required: AxiomTriple[]) => {
  const need = required.map((a) => `${a.subject}|${a.predicate}|${a.object}`);
  return vi.fn(async (axioms: readonly AxiomTriple[]) => {
    const have = new Set(axioms.map((a) => `${a.subject}|${a.predicate}|${a.object}`));
    return need.every((k) => have.has(k));
  });
};

describe('assessJustification', () => {
  it('a justification whose axioms are all needed is sufficient and minimal', async () => {
    const oracle = oracleRequiring([A, B]);
    const r = await assessJustification([A, B], oracle);
    expect(r.sufficient).toBe(true);
    expect(r.minimal).toBe(true);
    expect(r.redundant).toEqual([]);
    expect(r.summary).toMatch(/sufficient and minimal/i);
  });

  it('spots a passenger axiom: sufficient but not minimal', async () => {
    const oracle = oracleRequiring([A, B]);
    const r = await assessJustification([A, B, NOISE], oracle);
    expect(r.sufficient).toBe(true);
    expect(r.minimal).toBe(false);
    expect(r.redundant).toHaveLength(1);
    expect(r.redundant[0].subject).toBe(`${EX}X`);
    expect(r.summary).toMatch(/1 of 3 axioms can be dropped/i);
  });

  it('a set that does not entail the statement is not an explanation', async () => {
    const oracle = oracleRequiring([A, B]);
    const r = await assessJustification([A], oracle);
    expect(r.sufficient).toBe(false);
    expect(r.minimal, 'minimality of a non-explanation says nothing').toBe(false);
    expect(r.summary).toMatch(/do not entail/i);
  });

  it('costs 1 + n oracle calls for an n-axiom justification', async () => {
    const oracle = oracleRequiring([A, B]);
    const r = await assessJustification([A, B, NOISE], oracle);
    expect(r.oracleCalls).toBe(4); // one sufficiency + one per axiom
    expect(oracle).toHaveBeenCalledTimes(4);
  });

  it('stops after the sufficiency call when the justification fails', async () => {
    const oracle = oracleRequiring([A, B]);
    const r = await assessJustification([NOISE], oracle);
    expect(r.oracleCalls).toBe(1);
  });

  it('handles the empty justification', async () => {
    const tautology = vi.fn(async () => true);
    const r = await assessJustification([], tautology);
    expect(r.sufficient).toBe(true);
    expect(r.minimal).toBe(true);
    expect(r.summary).toMatch(/without any axiom/i);

    const notTautology = vi.fn(async () => false);
    const r2 = await assessJustification([], notTautology);
    expect(r2.sufficient).toBe(false);
  });

  it('reports every droppable axiom, not just the first', async () => {
    const oracle = oracleRequiring([A]); // only A matters
    const r = await assessJustification([A, B, NOISE], oracle);
    expect(r.redundant).toHaveLength(2);
  });
});

describe('summarise', () => {
  const mk = (sufficient: boolean, minimal: boolean, axioms: number, verifyMs: number): ExplanationReport => ({
    statement: A,
    assessment: { sufficient, minimal, redundant: [], oracleCalls: axioms + 1, summary: '' },
    cost: { produceMs: 10, verifyMs, oracleCalls: axioms + 1, axiomCount: axioms },
  });

  it('counts sufficiency and minimality over a batch', () => {
    const s = summarise([mk(true, true, 2, 100), mk(true, false, 5, 300), mk(false, false, 1, 50)]);
    expect(s.total).toBe(3);
    expect(s.sufficient).toBe(2);
    expect(s.minimal).toBe(1);
  });

  it('reports medians, not means, so one slow case does not set the headline', () => {
    const s = summarise([mk(true, true, 1, 10), mk(true, true, 2, 20), mk(true, true, 3, 100000)]);
    expect(s.medianAxioms).toBe(2);
    expect(s.medianVerifyMs).toBe(20);
  });

  it('totals the oracle calls so the cost of verifying is visible', () => {
    const s = summarise([mk(true, true, 2, 1), mk(true, true, 3, 1)]);
    expect(s.totalOracleCalls).toBe(3 + 4);
  });

  it('handles an empty batch', () => {
    expect(summarise([])).toMatchObject({ total: 0, sufficient: 0, minimal: 0, medianAxioms: 0 });
  });
});
