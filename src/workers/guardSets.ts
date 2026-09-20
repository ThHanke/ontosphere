// src/workers/guardSets.ts
//
// GUARD SETS: which modelling errors an ontology can still reject.
//
// Counting inferred subsumptions does not measure what a release change costs a curation
// workflow. Deleting one disjointness axiom can change the subsumption count by 1 while
// destroying every guard that axiom provided, i.e. silently removing the ontology's ability
// to reject a whole family of modelling errors. This module measures that directly.
//
// DEFINITION. A guard is an unordered pair of named classes {A, B} such that
//   O |= A ⊓ B ⊑ ⊥
// i.e. no consistent data can put one individual in both. If the pair is a guard, asserting
// an individual into both is rejected; if it is not, the error is accepted silently.
//
// DECISION PROCEDURE. Introduce a fresh class P with P ⊑ A and P ⊑ B. Then
//   O ∪ {P ⊑ A, P ⊑ B} |= P ⊑ ⊥   iff   O |= A ⊓ B ⊑ ⊥.
// (⇐) any model of the extension interprets P inside A ⊓ B = ∅. (⇒) if some model had
// x ∈ A ⊓ B we could interpret P as {x}, so P would be satisfiable. P is fresh, so adding
// it changes nothing else about O.
//
// COST. Every pair gets its own fresh probe, so n pairs are decided by ONE classification,
// not n satisfiability calls. That is what makes this affordable in a browser.
//
// VACUITY. P ⊑ A, P ⊑ B is also unsatisfiable when A alone is unsatisfiable, and then the
// pair guards nothing: no consistent data can enter A at all, so there is no error left to
// reject. Reporting that as an enforced guard is wrong in both directions - a destroyed
// guard reads as intact, and a release that breaks a class keeps all of its guards green.
// Pairs with an individually unsatisfiable endpoint are therefore reported as vacuous, never
// as enforced. This is the single most important correctness condition in the module.
//
// An inconsistent ontology makes every class unsatisfiable, so no guard claim can be made
// about one at all; callers must check consistency first and are given `ontologyConsistent`
// to record that they did.

export interface GuardPair {
  /** Lexicographically smaller class IRI. */
  a: string;
  /** Lexicographically larger class IRI. */
  b: string;
}

export interface GuardVerdict {
  pair: GuardPair;
  /** O |= A ⊓ B ⊑ ⊥, and neither endpoint is individually unsatisfiable. */
  enforced: boolean;
  /** At least one endpoint is unsatisfiable on its own, so the pair rejects nothing. */
  vacuous: boolean;
}

interface TermLike { termType: string; value: string }
interface QuadLike { subject: TermLike; predicate: TermLike; object: TermLike }

const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const RDFS = "http://www.w3.org/2000/01/rdf-schema#";
const OWL = "http://www.w3.org/2002/07/owl#";
const RDF_TYPE = `${RDF}type`;
const RDF_FIRST = `${RDF}first`;
const RDF_REST = `${RDF}rest`;
const RDF_NIL = `${RDF}nil`;

/** Canonical unordered pair: sorted, so {A,B} and {B,A} are the same guard. */
export function makePair(x: string, y: string): GuardPair {
  return x <= y ? { a: x, b: y } : { a: y, b: x };
}
export const pairKey = (p: GuardPair): string => `${p.a}|${p.b}`;

/** Walk an RDF list (rdf:first/rdf:rest) to its members. */
function readList(head: string, first: Map<string, string>, rest: Map<string, string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let cur: string | undefined = head;
  while (cur && cur !== RDF_NIL && !seen.has(cur)) {
    seen.add(cur);
    const f = first.get(cur);
    if (f) out.push(f);
    cur = rest.get(cur);
  }
  return out;
}

/**
 * Candidate pairs: every pair the ontology DECLARES disjoint, from all three syntactic
 * forms. These are the pairs a release can silently stop enforcing, so they are what a
 * version comparison must probe. Declared is not the same as entailed, which is exactly why
 * the result is then measured with the reasoner rather than read off the syntax.
 */
export function declaredDisjointPairs(quads: readonly QuadLike[]): GuardPair[] {
  const first = new Map<string, string>();
  const rest = new Map<string, string>();
  const allDisjointClasses = new Set<string>();
  const pairs = new Map<string, GuardPair>();
  const add = (x: string, y: string) => {
    if (x === y) return;
    const p = makePair(x, y);
    pairs.set(pairKey(p), p);
  };

  for (const q of quads) {
    if (q.predicate.value === RDF_FIRST) first.set(q.subject.value, q.object.value);
    else if (q.predicate.value === RDF_REST) rest.set(q.subject.value, q.object.value);
    else if (q.predicate.value === RDF_TYPE && q.object.value === `${OWL}AllDisjointClasses`) {
      allDisjointClasses.add(q.subject.value);
    }
  }

  for (const q of quads) {
    const p = q.predicate.value;
    // binary: A owl:disjointWith B
    if (p === `${OWL}disjointWith` && q.subject.termType === "NamedNode" && q.object.termType === "NamedNode") {
      add(q.subject.value, q.object.value);
    }
    // n-ary: _:g rdf:type owl:AllDisjointClasses ; owl:members ( A B C ).
    // owl:members is also used by owl:AllDifferent for individuals, so the subject must
    // actually be an AllDisjointClasses node or this would invent class pairs from
    // individual-difference axioms.
    else if (p === `${OWL}members` && allDisjointClasses.has(q.subject.value)) {
      const members = readList(q.object.value, first, rest).filter((m) => !m.startsWith("_:"));
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) add(members[i], members[j]);
      }
    }
    // owl:disjointUnionOf: the members are pairwise disjoint
    else if (p === `${OWL}disjointUnionOf`) {
      const members = readList(q.object.value, first, rest).filter((m) => !m.startsWith("_:"));
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) add(members[i], members[j]);
      }
    }
  }
  return [...pairs.values()].sort((x, y) => pairKey(x).localeCompare(pairKey(y)));
}

/** Classes marked owl:deprecated true. A pair losing a deprecated endpoint is expected. */
export function deprecatedClasses(quads: readonly QuadLike[]): Set<string> {
  const out = new Set<string>();
  for (const q of quads) {
    if (q.predicate.value === `${OWL}deprecated` && q.object.value === "true") out.add(q.subject.value);
  }
  return out;
}

export const PROBE_PREFIX = "urn:vg:guard-probe:";

/**
 * Probe axioms for a batch of pairs: one fresh class per pair, subsumed by both endpoints.
 * Returned as plain triples so the caller can add them with its own data factory.
 */
export function buildProbeTriples(pairs: readonly GuardPair[]): Array<[string, string, string]> {
  const triples: Array<[string, string, string]> = [];
  pairs.forEach((pair, i) => {
    const probe = `${PROBE_PREFIX}${i}`;
    triples.push([probe, RDF_TYPE, `${OWL}Class`]);
    triples.push([probe, `${RDFS}subClassOf`, pair.a]);
    triples.push([probe, `${RDFS}subClassOf`, pair.b]);
  });
  return triples;
}

/**
 * Turn one classification's unsatisfiable-class set into guard verdicts.
 *
 * @param pairs            the probed pairs, in the order given to buildProbeTriples
 * @param unsatisfiable    unsatisfiable classes of ontology + probes
 * @param baselineUnsat    unsatisfiable classes of the ontology ALONE, for the vacuity test
 */
export function interpretProbeResults(
  pairs: readonly GuardPair[],
  unsatisfiable: ReadonlySet<string>,
  baselineUnsat: ReadonlySet<string>,
): GuardVerdict[] {
  return pairs.map((pair, i) => {
    const probeUnsat = unsatisfiable.has(`${PROBE_PREFIX}${i}`);
    const vacuous = baselineUnsat.has(pair.a) || baselineUnsat.has(pair.b);
    return { pair, enforced: probeUnsat && !vacuous, vacuous };
  });
}

export interface GuardDiff {
  /** Enforced in the baseline, not enforced in the comparison: a lost guard. */
  lost: GuardPair[];
  /** Not enforced in the baseline, enforced in the comparison. */
  gained: GuardPair[];
  /** Enforced in both. */
  retained: GuardPair[];
  /** Lost, and BOTH endpoints are still live (not deprecated) in the comparison. */
  lostLiveLive: GuardPair[];
}

/**
 * Compare two guard measurements. `lostLiveLive` is the subset that matters most: a guard
 * whose endpoints both still exist as usable classes, so the loss is not explained by either
 * endpoint having been deprecated.
 */
export function diffGuards(
  baseline: readonly GuardVerdict[],
  comparison: readonly GuardVerdict[],
  deprecatedInComparison: ReadonlySet<string> = new Set(),
): GuardDiff {
  const cmp = new Map(comparison.map((v) => [pairKey(v.pair), v]));
  const lost: GuardPair[] = [];
  const gained: GuardPair[] = [];
  const retained: GuardPair[] = [];
  const lostLiveLive: GuardPair[] = [];

  for (const b of baseline) {
    const c = cmp.get(pairKey(b.pair));
    const after = c?.enforced ?? false;
    if (b.enforced && !after) {
      lost.push(b.pair);
      if (!deprecatedInComparison.has(b.pair.a) && !deprecatedInComparison.has(b.pair.b)) {
        lostLiveLive.push(b.pair);
      }
    } else if (b.enforced && after) {
      retained.push(b.pair);
    }
  }
  const base = new Map(baseline.map((v) => [pairKey(v.pair), v]));
  for (const c of comparison) {
    if (c.enforced && !(base.get(pairKey(c.pair))?.enforced ?? false)) gained.push(c.pair);
  }
  return { lost, gained, retained, lostLiveLive };
}
