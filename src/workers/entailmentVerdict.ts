// src/workers/entailmentVerdict.ts
//
// Which kind of "no" a "no" is.
//
// `explainEntailment` returns `isEntailed: boolean | null`, and that `null` collapses two
// situations that need opposite responses:
//
//   1. THE REASONER DECIDED, AND THE ANSWER IS "NOT ENTAILED". Under the open world
//      assumption this is a genuine, final answer: nothing in this ontology settles the
//      question. It is not "false". The right response is to find more axioms, ask a person,
//      or record that the ontology does not say.
//
//   2. THE REASONER DID NOT, OR COULD NOT, DECIDE. The ontology was inconsistent, the call
//      failed or timed out, or the entailment holds only vacuously. Here the thing to fix is
//      the pipeline, not the ontology, and any conclusion drawn from the answer rests on a
//      check that did not complete.
//
// An agent driving the MCP tools cannot tell those apart from a bare null, and neither can a
// reader of a validation report. This module names the distinction so both can.

export type EntailmentVerdict =
  | "entailed"
  /** Decided: the ontology does not entail it. A sound answer, not a failure. */
  | "not-entailed"
  /** Undecided: see `undeterminedKind` for why. */
  | "undetermined";

export type UndeterminedKind =
  /** The ontology has no model, so it entails everything; no useful answer exists. */
  | "ontology-inconsistent"
  /** True only because the subject class is unsatisfiable: holds of nothing. */
  | "vacuous"
  /** The reasoner errored, timed out, or refused the input. */
  | "reasoner-unavailable";

export interface EntailmentAnswer {
  verdict: EntailmentVerdict;
  /** Present exactly when verdict is "undetermined". */
  undeterminedKind?: UndeterminedKind;
  /** Why, in one sentence. Always present for "undetermined". */
  reason?: string;
}

export interface RawEntailmentResult {
  isEntailed: boolean | null;
  ontologyInconsistent?: boolean;
  vacuous?: boolean;
  reason?: string;
}

/**
 * Classify a raw reasoner result.
 *
 * Order matters: an inconsistent ontology entails everything, so its `isEntailed: true` is
 * not an answer about the statement and must be caught before the boolean is read. A vacuous
 * entailment is likewise true of nothing and must not be reported as a finding.
 */
export function classifyEntailment(raw: RawEntailmentResult): EntailmentAnswer {
  if (raw.ontologyInconsistent) {
    return {
      verdict: "undetermined",
      undeterminedKind: "ontology-inconsistent",
      reason:
        "The ontology has no model, so it entails every statement. Resolve the inconsistency " +
        "before reading any entailment result.",
    };
  }
  if (raw.vacuous) {
    return {
      verdict: "undetermined",
      undeterminedKind: "vacuous",
      reason:
        "The entailment holds only because the subject class is unsatisfiable, so it is true " +
        "of no individual and says nothing about the data.",
    };
  }
  if (raw.isEntailed === null || raw.isEntailed === undefined) {
    return {
      verdict: "undetermined",
      undeterminedKind: "reasoner-unavailable",
      reason: raw.reason ?? "The reasoner did not return a decision for this statement.",
    };
  }
  if (raw.isEntailed) return { verdict: "entailed" };
  return {
    verdict: "not-entailed",
    reason:
      "Decided: the ontology does not entail this statement. Under the open world assumption " +
      "that means it is unsettled, not false.",
  };
}

/** True when the answer is safe to act on as a statement about the data. */
export function isDecided(answer: EntailmentAnswer): boolean {
  return answer.verdict !== "undetermined";
}
