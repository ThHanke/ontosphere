// src/workers/explanationQuality.ts
//
// Is an explanation actually an explanation?
//
// explainEntailment returns a justification: a set of axioms offered as the reason a
// statement holds. Two properties make that set worth showing to a person, and neither is
// checked by producing it:
//
//   SUFFICIENCY  the axioms alone entail the statement. A set that does not is not an
//                explanation of anything, however plausible it reads.
//   MINIMALITY   no proper subset entails it. Every axiom in the set is load-bearing.
//                A set carrying passengers sends the reader to inspect axioms that had
//                nothing to do with the conclusion.
//
// Both are decided with the entailment oracle the caller already has, by asking it about
// subsets of the justification. Sufficiency is one call. Minimality is one call per axiom:
// drop the axiom, and the statement must stop following. Together that is 1 + n calls for an
// n-axiom justification, which is the cost this module also reports, because a check nobody
// can afford to run is not a check.
//
// The oracle is injected, so the logic here is exhaustively testable without WASM and the
// same code serves the real reasoner and a test double.

export interface AxiomTriple {
  subject: string;
  predicate: string;
  object: string;
}

/** Decides whether a set of axioms entails the statement under test. */
export type EntailmentOracle = (axioms: readonly AxiomTriple[]) => Promise<boolean>;

export interface JustificationAssessment {
  /** The justification alone entails the statement. */
  sufficient: boolean;
  /**
   * No proper subset entails it: every axiom is needed. Only meaningful when sufficient;
   * reported false for an insufficient justification, since minimality of a non-explanation
   * says nothing.
   */
  minimal: boolean;
  /** Axioms that can be dropped with the entailment still holding. */
  redundant: AxiomTriple[];
  /** Oracle calls spent deciding both properties. */
  oracleCalls: number;
  /** A one-line verdict for a person reading the explanation. */
  summary: string;
}

const key = (a: AxiomTriple) => `${a.subject}|${a.predicate}|${a.object}`;

/**
 * Assess one justification.
 *
 * Minimality here is the standard subset-minimality of a justification: removing any single
 * axiom must break the entailment. That is the right check because a justification is
 * minimal exactly when no single axiom is removable -- if some larger subset were removable,
 * each of its members would be individually removable too.
 */
export async function assessJustification(
  justification: readonly AxiomTriple[],
  entails: EntailmentOracle,
): Promise<JustificationAssessment> {
  let oracleCalls = 0;

  if (justification.length === 0) {
    // The empty set entails the statement only if it is a tautology of the vocabulary.
    const sufficient = await entails([]);
    oracleCalls++;
    return {
      sufficient,
      minimal: sufficient,
      redundant: [],
      oracleCalls,
      summary: sufficient
        ? "The statement holds without any axiom from the ontology."
        : "Empty justification: it does not entail the statement.",
    };
  }

  const sufficient = await entails(justification);
  oracleCalls++;
  if (!sufficient) {
    return {
      sufficient: false,
      minimal: false,
      redundant: [],
      oracleCalls,
      summary: `The ${justification.length} axioms offered do not entail the statement, so they do not explain it.`,
    };
  }

  const redundant: AxiomTriple[] = [];
  for (const axiom of justification) {
    const without = justification.filter((a) => key(a) !== key(axiom));
    const stillHolds = await entails(without);
    oracleCalls++;
    if (stillHolds) redundant.push(axiom);
  }

  const minimal = redundant.length === 0;
  return {
    sufficient: true,
    minimal,
    redundant,
    oracleCalls,
    summary: minimal
      ? `Sufficient and minimal: all ${justification.length} axioms are needed.`
      : `Sufficient but not minimal: ${redundant.length} of ${justification.length} axioms can be dropped and the statement still follows.`,
  };
}

export interface ExplanationCost {
  /** Wall clock for producing the explanation. */
  produceMs: number;
  /** Wall clock for checking sufficiency and minimality. */
  verifyMs: number;
  oracleCalls: number;
  axiomCount: number;
}

export interface ExplanationReport {
  statement: AxiomTriple;
  assessment: JustificationAssessment;
  cost: ExplanationCost;
}

/** Aggregate over a batch, for reporting a distribution rather than one anecdote. */
export function summarise(reports: readonly ExplanationReport[]): {
  total: number;
  sufficient: number;
  minimal: number;
  medianAxioms: number;
  medianVerifyMs: number;
  totalOracleCalls: number;
} {
  const median = (xs: number[]) => {
    if (xs.length === 0) return 0;
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  return {
    total: reports.length,
    sufficient: reports.filter((r) => r.assessment.sufficient).length,
    minimal: reports.filter((r) => r.assessment.minimal).length,
    medianAxioms: median(reports.map((r) => r.cost.axiomCount)),
    medianVerifyMs: median(reports.map((r) => r.cost.verifyMs)),
    totalOracleCalls: reports.reduce((n, r) => n + r.cost.oracleCalls, 0),
  };
}
