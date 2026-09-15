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
//      failed or timed out, the entailment holds only vacuously, or the construct is one the
//      engine does not enforce (see reasonerCapabilities.ts). Here the thing to fix is the
//      pipeline, not the ontology, and any conclusion drawn from the answer rests on a
//      measurement that did not happen.
//
// An agent driving the MCP tools cannot tell those apart from a bare null, and neither can a
// reader of a validation report. This module names the distinction so both can.
//
// This is a mechanism, not a priority claim: the underlying idea, that non-entailment under
// OWA differs in kind from a failed computation, is old and uncontroversial. What is added
// here is that Ontosphere carries the distinction through to its callers.

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
  | "reasoner-unavailable"
  /** The construct is one this engine is known not to enforce. */
  | "construct-not-enforced";

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

/**
 * Ask a fast, incomplete oracle first and confirm any negative with an exact one.
 *
 * `explainEntailment`'s `causal` mode reads a dep-chain cache and answers in tens of
 * milliseconds, but on a cache miss it reports `isEntailed: false` with no justifications --
 * the same answer it gives for a statement that genuinely does not follow. Measured on
 * A subClassOf B subClassOf C: the entailed A subClassOf C comes back false in 48 ms from
 * `causal` and true with a correct two-axiom justification in 1392 ms from `minimal`.
 *
 * A negative from the fast oracle is therefore not a decided non-entailment, and reporting
 * it as one is the worst available error: a caller cannot tell it from a real answer. Only
 * positives can be trusted from the fast path, so every negative is re-asked exactly.
 *
 * Both oracles are injected, which keeps the policy testable without a reasoner.
 */
export async function explainWithConfirmedNegative<T extends { isEntailed: boolean | null }>(
  fast: () => Promise<T>,
  exact: () => Promise<T>,
): Promise<T> {
  const quick = await fast();
  if (quick.isEntailed === true) return quick;
  return exact();
}
