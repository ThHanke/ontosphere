// classifyEntailment names which kind of answer an entailment check gave: a decided
// "entailed" or "not entailed", or an undetermined result (inconsistent ontology, vacuous
// entailment, or a reasoner that could not decide).
import { describe, it, expect } from 'vitest';
import { classifyEntailment, isDecided } from '../entailmentVerdict.ts';

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
