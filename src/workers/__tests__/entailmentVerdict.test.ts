// `isEntailed: boolean | null` collapses "the reasoner decided: not entailed" with "the
// reasoner could not decide". Those need opposite responses from an agent: the first says go
// find more axioms, the second says fix the pipeline. These tests pin the classification,
// and in particular the precedence, since an inconsistent ontology entails everything and a
// vacuous entailment holds of nothing.

import { describe, it, expect } from 'vitest';
import { classifyEntailment, isDecided } from '../entailmentVerdict.ts';
import { CAPABILITIES, knownGaps, observedFacts, capabilityFor, tableAgeDays, TABLE_UPDATED } from '../reasonerCapabilities.ts';

describe('classifyEntailment', () => {
  it('entailed is a decision', () => {
    const a = classifyEntailment({ isEntailed: true });
    expect(a.verdict).toBe('entailed');
    expect(isDecided(a)).toBe(true);
  });

  it('not-entailed is a DECISION, not a failure', () => {
    const a = classifyEntailment({ isEntailed: false });
    expect(a.verdict).toBe('not-entailed');
    expect(isDecided(a)).toBe(true);
    expect(a.reason).toMatch(/open world/i);
  });

  it('null means the reasoner could not decide', () => {
    const a = classifyEntailment({ isEntailed: null });
    expect(a.verdict).toBe('undetermined');
    expect(a.undeterminedKind).toBe('reasoner-unavailable');
    expect(a.reason).toBeTruthy();
  });

  it('carries the reasoner reason through when it has one', () => {
    const a = classifyEntailment({ isEntailed: null, reason: 'worker timed out after 30s' });
    expect(a.reason).toBe('worker timed out after 30s');
  });

  it('an inconsistent ontology outranks isEntailed:true', () => {
    // An inconsistent ontology entails everything, so `true` here is not an answer about
    // the statement. Reading the boolean first would report a finding that is not one.
    const a = classifyEntailment({ isEntailed: true, ontologyInconsistent: true });
    expect(a.verdict).toBe('undetermined');
    expect(a.undeterminedKind).toBe('ontology-inconsistent');
    expect(isDecided(a)).toBe(false);
  });

  it('a vacuous entailment is undetermined, not a finding', () => {
    const a = classifyEntailment({ isEntailed: true, vacuous: true });
    expect(a.verdict).toBe('undetermined');
    expect(a.undeterminedKind).toBe('vacuous');
  });

  it('inconsistency outranks vacuity', () => {
    const a = classifyEntailment({ isEntailed: true, ontologyInconsistent: true, vacuous: true });
    expect(a.undeterminedKind).toBe('ontology-inconsistent');
  });

  it('every undetermined answer explains itself', () => {
    for (const raw of [
      { isEntailed: null },
      { isEntailed: true, vacuous: true },
      { isEntailed: true, ontologyInconsistent: true },
    ]) {
      const a = classifyEntailment(raw);
      expect(a.verdict).toBe('undetermined');
      expect(a.reason, `missing reason for ${JSON.stringify(raw)}`).toBeTruthy();
    }
  });
});

describe('reasoner capability manifest', () => {
  it('every fact names its provenance, date and evidence', () => {
    for (const c of CAPABILITIES) {
      expect(['declared', 'observed']).toContain(c.provenance);
      expect(c.established, `${c.subject} has no date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.evidence.length, `${c.subject} has no evidence`).toBeGreaterThan(10);
      expect(c.consequence.length, `${c.subject} has no consequence`).toBeGreaterThan(10);
    }
  });

  it('every OBSERVED fact names a reproducer or a file, not just prose', () => {
    for (const c of observedFacts()) {
      expect(c.evidence, `${c.subject}: observed facts must cite something runnable`)
        .toMatch(/_diag\/|src\/|dist\/|package/);
    }
  });

  it('records the asymmetric-property gap the reasoner has', () => {
    const [gap] = capabilityFor('asymmetric');
    expect(gap).toBeDefined();
    expect(gap.supported).toBe(false);
    expect(gap.provenance).toBe('observed');
  });

  it('knownGaps is the honest list and is not empty', () => {
    const gaps = knownGaps();
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps.every((g) => !g.supported)).toBe(true);
  });

  it('reports its own age so the table is never presented as current', () => {
    expect(tableAgeDays(new Date(`${TABLE_UPDATED}T00:00:00Z`))).toBe(0);
    expect(tableAgeDays(new Date('2027-09-14T00:00:00Z'))).toBeGreaterThan(360);
  });
});
