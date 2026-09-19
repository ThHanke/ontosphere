// src/workers/repairImpact.ts
//
// WHAT A REPAIR COSTS, NOT JUST WHETHER IT WORKS.
//
// Repair verification today asks one question: does removing these axioms restore
// consistency? That is necessary and not sufficient. The cheapest way to make an
// inconsistent ontology consistent is to delete the axiom that detected the problem, and a
// consistency-only check rates that a success. Deleting a disjointness axiom always restores
// consistency, always scores `verifiedConsistent: true`, and removes the ontology's ability
// to reject that whole family of modelling errors ever again.
//
// Measured on PMDco, dropping one disjointness group moved the inferred-subsumption count by
// a handful while destroying dozens of guards. Nothing in a consistency check sees that.
//
// So a repair is assessed on two axes:
//   1. does it restore consistency (the existing question), and
//   2. what does it cost in guards -- the class pairs and property constraints the ontology
//      could previously use to reject an error (guardSets.ts, propertyGuards.ts).
//
// A repair that restores consistency while destroying guards is not wrong, and sometimes it
// is the only option. It must not be presented as equivalent to one that does not. The
// verdict names the difference so an expert, or an agent, chooses knowingly.

import { diffGuards, pairKey, type GuardPair, type GuardVerdict } from "./guardSets.ts";
import { diffPropertyGuards, candidateKey, type PropertyGuardCandidate, type PropertyGuardVerdict } from "./propertyGuards.ts";

export interface EditTriple {
  subject: string;
  predicate: string;
  object: string;
}

/** A proposed repair: axioms to remove, and any to add in their place (axiom weakening). */
export interface ProposedEdit {
  removals: readonly EditTriple[];
  additions?: readonly EditTriple[];
}

export type RepairVerdict =
  /** Restores consistency and destroys no guard. */
  | "verified"
  /** Restores consistency, but the ontology can now accept errors it used to reject. */
  | "restores-consistency-with-collateral"
  /** Does not restore consistency: not a repair at all. */
  | "does-not-restore-consistency"
  /** The ontology was already consistent, so there was nothing to repair. */
  | "nothing-to-repair";

export interface RepairImpact {
  verdict: RepairVerdict;
  consistencyRestored: boolean;
  /** Class-disjointness guards enforced before and after the edit. */
  classGuardsBefore: number;
  classGuardsAfter: number;
  /** Class guards the edit destroyed: modelling errors now accepted in silence. */
  classGuardsDestroyed: GuardPair[];
  /** Property guards enforced before and after. */
  propertyGuardsBefore: number;
  propertyGuardsAfter: number;
  propertyGuardsDestroyed: PropertyGuardCandidate[];
  /** One sentence a human can act on. */
  summary: string;
}

const tripleKey = (t: EditTriple) => `${t.subject}${t.predicate}${t.object}`;

interface TermLike { termType: string; value: string }
interface QuadLike { subject: TermLike; predicate: TermLike; object: TermLike }

/**
 * Apply a proposed edit to a quad list, returning a new list. Removal matches on
 * subject/predicate/object value; graph and term type are deliberately not part of the match
 * because the repair actions carry IRIs, and a caller that needs a narrower match should
 * filter before calling.
 */
export function applyEdit(quads: readonly QuadLike[], edit: ProposedEdit): QuadLike[] {
  const remove = new Set(edit.removals.map(tripleKey));
  const kept = quads.filter(
    (q) => !remove.has(`${q.subject.value}${q.predicate.value}${q.object.value}`),
  );
  const added: QuadLike[] = (edit.additions ?? []).map((t) => ({
    subject: { termType: "NamedNode", value: t.subject },
    predicate: { termType: "NamedNode", value: t.predicate },
    object: { termType: "NamedNode", value: t.object },
  }));
  return [...kept, ...added];
}

/**
 * Combine the two measurements into a verdict.
 *
 * Pure: the caller runs the reasoner (consistency plus one guard classification before and
 * one after) and hands the results in, so this is exhaustively testable without WASM.
 */
export function assessRepairImpact(
  args: {
    wasInconsistent: boolean;
    consistencyRestored: boolean;
    classGuardsBefore: readonly GuardVerdict[];
    classGuardsAfter: readonly GuardVerdict[];
    propertyGuardsBefore?: readonly PropertyGuardVerdict[];
    propertyGuardsAfter?: readonly PropertyGuardVerdict[];
  },
): RepairImpact {
  const classDiff = diffGuards(args.classGuardsBefore, args.classGuardsAfter);
  const propDiff = diffPropertyGuards(args.propertyGuardsBefore ?? [], args.propertyGuardsAfter ?? []);

  const classBefore = args.classGuardsBefore.filter((g) => g.enforced).length;
  const classAfter = args.classGuardsAfter.filter((g) => g.enforced).length;
  const propBefore = (args.propertyGuardsBefore ?? []).filter((g) => g.enforced).length;
  const propAfter = (args.propertyGuardsAfter ?? []).filter((g) => g.enforced).length;
  const destroyed = classDiff.lost.length + propDiff.lost.length;

  let verdict: RepairVerdict;
  if (!args.wasInconsistent) verdict = "nothing-to-repair";
  else if (!args.consistencyRestored) verdict = "does-not-restore-consistency";
  else if (destroyed > 0) verdict = "restores-consistency-with-collateral";
  else verdict = "verified";

  const summary =
    verdict === "verified"
      ? `Restores consistency and destroys no guard (${classAfter} class, ${propAfter} property guards intact).`
      : verdict === "restores-consistency-with-collateral"
        ? `Restores consistency but the ontology can now accept ${destroyed} modelling error${destroyed === 1 ? "" : "s"} it previously rejected ` +
          `(${classDiff.lost.length} class, ${propDiff.lost.length} property). Choose it knowingly.`
        : verdict === "does-not-restore-consistency"
          ? "Does not restore consistency: this is not a repair for the current contradiction."
          : "The ontology was already consistent; there is nothing to repair.";

  return {
    verdict,
    consistencyRestored: args.consistencyRestored,
    classGuardsBefore: classBefore,
    classGuardsAfter: classAfter,
    classGuardsDestroyed: classDiff.lost,
    propertyGuardsBefore: propBefore,
    propertyGuardsAfter: propAfter,
    propertyGuardsDestroyed: propDiff.lost,
    summary,
  };
}

/**
 * Rank repairs: verified first, then by how little collateral damage they do, then by how
 * few axioms they remove. Stable, so equal candidates keep their input order.
 */
export function rankRepairs<T>(
  candidates: readonly T[],
  impactOf: (candidate: T) => RepairImpact,
  removalCountOf: (candidate: T) => number,
): T[] {
  const order: Record<RepairVerdict, number> = {
    verified: 0,
    "restores-consistency-with-collateral": 1,
    "nothing-to-repair": 2,
    "does-not-restore-consistency": 3,
  };
  return candidates
    .map((c, i) => ({ c, i, impact: impactOf(c), removals: removalCountOf(c) }))
    .sort((a, b) => {
      const byVerdict = order[a.impact.verdict] - order[b.impact.verdict];
      if (byVerdict !== 0) return byVerdict;
      const aDamage = a.impact.classGuardsDestroyed.length + a.impact.propertyGuardsDestroyed.length;
      const bDamage = b.impact.classGuardsDestroyed.length + b.impact.propertyGuardsDestroyed.length;
      if (aDamage !== bDamage) return aDamage - bDamage;
      if (a.removals !== b.removals) return a.removals - b.removals;
      return a.i - b.i;
    })
    .map((x) => x.c);
}

/** Stable identity for a destroyed guard, for reporting and de-duplication. */
export const destroyedGuardKey = (g: GuardPair | PropertyGuardCandidate): string =>
  "a" in g && "b" in g ? pairKey(g as GuardPair) : candidateKey(g as PropertyGuardCandidate);
