// src/workers/propertyGuards.ts
//
// PROPERTY GUARDS: the second sentence form.
//
// guardSets.ts decides one shape and no other, `A ⊓ B ⊑ ⊥` over class names. That is the
// right first target because DisjointClasses is what an ontology engineer reaches for when
// they want the reasoner to catch a modelling error. It is not the only way an ontology
// catches one. A release that widens a range to owl:Thing, drops a functional declaration,
// or removes a property disjointness has weakened its ability to reject errors just as
// surely, and no DisjointClasses axiom is involved, so guardSets sees none of it.
//
// Each guard below reduces to the same trick: a fresh probe class that is unsatisfiable
// exactly when the constraint bites, with the whole batch decided by ONE classification.
//
//   guard                      probe P is unsatisfiable iff ...
//   -------------------------  --------------------------------------------------
//   domain(R, D)               P ⊑ ∃R.⊤ ⊓ ¬D          the domain is entailed
//   range(R, D)                P ⊑ ∃R.¬D              the range is entailed
//   functional(R)              P ⊑ ∃R.F1 ⊓ ∃R.F2      R admits at most one successor
//   irreflexive(R)             P ⊑ ∃R.Self            no individual may R itself
//   disjointProperties(R, S)   P ⊑ ∃R.Self ⊓ ∃S.Self  (x,x) cannot be in both
//
// F1 and F2 are fresh classes asserted disjoint to each other and to nothing else.
// ∃R.Self is owl:hasSelf, which is SROIQ; Konclude is SROIQ(D).
//
// SOUNDNESS. Every axiom added here mentions a fresh entity on its left-hand side, or
// relates two fresh entities to each other. Any model of O therefore extends to a model of
// the probed ontology by interpreting every fresh name as the empty set. The extension is
// conservative over the signature of O, so no probe can make a pre-existing class
// unsatisfiable, and the classification's verdict about each P is a verdict about O alone.
//
// NO INDIVIDUALS. None of these probes asserts an individual. An individual that violates a
// constraint makes the whole knowledge base inconsistent, which would make every class
// unsatisfiable and destroy every other guard's answer in the same run.
//
// VACUITY, as in guardSets: a probe is also unsatisfiable when something it mentions is
// already unsatisfiable on its own, and then the guard rejects nothing. Callers pass the
// baseline unsatisfiable set and such verdicts are reported vacuous, never enforced.

import * as N3 from "n3";

const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const RDFS = "http://www.w3.org/2000/01/rdf-schema#";
const OWL = "http://www.w3.org/2002/07/owl#";
const XSD_BOOLEAN = "http://www.w3.org/2001/XMLSchema#boolean";

export type PropertyGuardKind = "domain" | "range" | "functional" | "irreflexive" | "disjointProperties";

export interface PropertyGuardCandidate {
  kind: PropertyGuardKind;
  /** The object property the guard is about. */
  property: string;
  /** Domain/range class, or the second property for disjointProperties. Absent otherwise. */
  target?: string;
}

export interface PropertyGuardVerdict {
  candidate: PropertyGuardCandidate;
  enforced: boolean;
  vacuous: boolean;
  /**
   * The probe form cannot decide this candidate on this engine, so `enforced: false` here
   * means "not measured", NOT "not enforced". Reporting an undecidable candidate as a lost
   * guard would be a fabricated finding.
   */
  undecidable?: true;
}

/**
 * Guard kinds this engine cannot decide by the probe method.
 *
 * `disjointProperties` uses `P ⊑ ∃R.Self ⊓ ∃S.Self`. Measured 2026-09-14 against
 * rdf-reasoner-konclude 0.6.9 (`_diag/probe-disjointprop2.mjs`): the engine does not derive
 * the clash from a Self restriction, even with the probe class populated by an individual
 * and even with an explicit owl:intersectionOf. It *does* catch the same clash from ordinary
 * role assertions between named individuals (`_diag/probe-disjointprop.mjs`), so the axiom
 * is understood and it is specifically the combination with owl:hasSelf that is not.
 *
 * Deciding these would need one consistency check per candidate with fresh individuals,
 * because an inconsistent knowledge base makes every class unsatisfiable and would destroy
 * every other guard's answer in the same batch. That is a different procedure with a
 * different cost and is deliberately not folded into the batch.
 */
export const UNDECIDABLE_BY_PROBE: ReadonlySet<PropertyGuardKind> = new Set(["disjointProperties"]);

export const PROPERTY_PROBE_PREFIX = "urn:vg:prop-guard-probe:";
const FRESH_A = `${PROPERTY_PROBE_PREFIX}freshA`;
const FRESH_B = `${PROPERTY_PROBE_PREFIX}freshB`;

interface TermLike { termType: string; value: string }
interface QuadLike { subject: TermLike; predicate: TermLike; object: TermLike }

export function candidateKey(c: PropertyGuardCandidate): string {
  return `${c.kind}|${c.property}|${c.target ?? ""}`;
}

/**
 * Candidates declared by the ontology. As in guardSets, declared is not the same as
 * entailed; these are the constructs a release can silently stop enforcing, and the verdict
 * is then measured with the reasoner.
 */
export function declaredPropertyGuards(quads: readonly QuadLike[]): PropertyGuardCandidate[] {
  const objectProperties = new Set<string>();
  const out = new Map<string, PropertyGuardCandidate>();
  const add = (c: PropertyGuardCandidate) => out.set(candidateKey(c), c);

  for (const q of quads) {
    if (q.predicate.value === `${RDF}type` && q.object.value === `${OWL}ObjectProperty`) {
      objectProperties.add(q.subject.value);
    }
  }
  const named = (t: TermLike) => t.termType === "NamedNode";

  for (const q of quads) {
    const p = q.predicate.value;
    const s = q.subject.value;
    if (!named(q.subject)) continue;

    if (p === `${RDFS}domain` && objectProperties.has(s) && named(q.object) && q.object.value !== `${OWL}Thing`) {
      add({ kind: "domain", property: s, target: q.object.value });
    } else if (p === `${RDFS}range` && objectProperties.has(s) && named(q.object) && q.object.value !== `${OWL}Thing`) {
      add({ kind: "range", property: s, target: q.object.value });
    } else if (p === `${RDF}type` && q.object.value === `${OWL}FunctionalProperty` && objectProperties.has(s)) {
      add({ kind: "functional", property: s });
    } else if (p === `${RDF}type` && q.object.value === `${OWL}IrreflexiveProperty` && objectProperties.has(s)) {
      add({ kind: "irreflexive", property: s });
    } else if (p === `${OWL}propertyDisjointWith` && objectProperties.has(s) && named(q.object)) {
      add({ kind: "disjointProperties", property: s, target: q.object.value });
    }
  }
  return [...out.values()].sort((a, b) => candidateKey(a).localeCompare(candidateKey(b)));
}

const nn = N3.DataFactory.namedNode;
const bn = N3.DataFactory.blankNode;
const lit = N3.DataFactory.literal;
const q4 = (s: N3.Quad_Subject, p: N3.Quad_Predicate, o: N3.Quad_Object) => N3.DataFactory.quad(s, p, o);

/** `[ owl:onProperty R ; owl:someValuesFrom X ]` as quads; returns the restriction node. */
function someValuesFrom(property: string, filler: N3.Quad_Object, id: string, out: N3.Quad[]): N3.BlankNode {
  const r = bn(id);
  out.push(q4(r, nn(`${RDF}type`), nn(`${OWL}Restriction`)));
  out.push(q4(r, nn(`${OWL}onProperty`), nn(property)));
  out.push(q4(r, nn(`${OWL}someValuesFrom`), filler));
  return r;
}

/** `[ owl:onProperty R ; owl:hasSelf true ]`, i.e. ∃R.Self. */
function hasSelf(property: string, id: string, out: N3.Quad[]): N3.BlankNode {
  const r = bn(id);
  out.push(q4(r, nn(`${RDF}type`), nn(`${OWL}Restriction`)));
  out.push(q4(r, nn(`${OWL}onProperty`), nn(property)));
  out.push(q4(r, nn(`${OWL}hasSelf`), lit("true", nn(XSD_BOOLEAN))));
  return r;
}

/** `[ owl:complementOf X ]`, i.e. ¬X. */
function complementOf(cls: string, id: string, out: N3.Quad[]): N3.BlankNode {
  const c = bn(id);
  out.push(q4(c, nn(`${RDF}type`), nn(`${OWL}Class`)));
  out.push(q4(c, nn(`${OWL}complementOf`), nn(cls)));
  return c;
}

/** An RDF list of the given nodes; returns the head. */
function rdfList(items: N3.Quad_Object[], id: string, out: N3.Quad[]): N3.Quad_Object {
  let head: N3.Quad_Object = nn(`${RDF}nil`);
  for (let i = items.length - 1; i >= 0; i--) {
    const cell = bn(`${id}-cell${i}`);
    out.push(q4(cell, nn(`${RDF}first`), items[i]));
    out.push(q4(cell, nn(`${RDF}rest`), head));
    head = cell;
  }
  return head;
}

/** `[ owl:intersectionOf ( … ) ]`. */
function intersectionOf(items: N3.Quad_Object[], id: string, out: N3.Quad[]): N3.BlankNode {
  const c = bn(id);
  out.push(q4(c, nn(`${RDF}type`), nn(`${OWL}Class`)));
  out.push(q4(c, nn(`${OWL}intersectionOf`), rdfList(items, `${id}-l`, out)));
  return c;
}

/**
 * Probe axioms for a batch of candidates: one fresh probe class each, plus the two fresh
 * disjoint classes the functional probe needs.
 */
export function buildPropertyProbeQuads(candidates: readonly PropertyGuardCandidate[]): N3.Quad[] {
  const out: N3.Quad[] = [];
  // F1, F2: fresh, disjoint from each other and related to nothing else.
  out.push(q4(nn(FRESH_A), nn(`${RDF}type`), nn(`${OWL}Class`)));
  out.push(q4(nn(FRESH_B), nn(`${RDF}type`), nn(`${OWL}Class`)));
  out.push(q4(nn(FRESH_A), nn(`${OWL}disjointWith`), nn(FRESH_B)));

  candidates.forEach((c, i) => {
    const probe = `${PROPERTY_PROBE_PREFIX}${i}`;
    const id = `pg${i}`;
    out.push(q4(nn(probe), nn(`${RDF}type`), nn(`${OWL}Class`)));
    const sub = (o: N3.Quad_Object) => out.push(q4(nn(probe), nn(`${RDFS}subClassOf`), o));

    switch (c.kind) {
      case "domain": {
        // P ⊑ ∃R.⊤ ⊓ ¬D
        const ex = someValuesFrom(c.property, nn(`${OWL}Thing`), `${id}-ex`, out);
        const notD = complementOf(c.target!, `${id}-not`, out);
        sub(intersectionOf([ex, notD], `${id}-and`, out));
        break;
      }
      case "range": {
        // P ⊑ ∃R.¬D
        const notD = complementOf(c.target!, `${id}-not`, out);
        sub(someValuesFrom(c.property, notD, `${id}-ex`, out));
        break;
      }
      case "functional": {
        // P ⊑ ∃R.F1 ⊓ ∃R.F2, with F1, F2 disjoint
        sub(someValuesFrom(c.property, nn(FRESH_A), `${id}-ex1`, out));
        sub(someValuesFrom(c.property, nn(FRESH_B), `${id}-ex2`, out));
        break;
      }
      case "irreflexive": {
        // P ⊑ ∃R.Self
        sub(hasSelf(c.property, `${id}-self`, out));
        break;
      }
      case "disjointProperties": {
        // P ⊑ ∃R.Self ⊓ ∃S.Self
        sub(hasSelf(c.property, `${id}-self1`, out));
        sub(hasSelf(c.target!, `${id}-self2`, out));
        break;
      }
    }
  });
  return out;
}

/** Turn one classification's unsatisfiable set into verdicts. */
export function interpretPropertyProbes(
  candidates: readonly PropertyGuardCandidate[],
  unsatisfiable: ReadonlySet<string>,
  baselineUnsat: ReadonlySet<string>,
): PropertyGuardVerdict[] {
  return candidates.map((candidate, i) => {
    if (UNDECIDABLE_BY_PROBE.has(candidate.kind)) {
      return { candidate, enforced: false, vacuous: false, undecidable: true as const };
    }
    const probeUnsat = unsatisfiable.has(`${PROPERTY_PROBE_PREFIX}${i}`);
    // A guard whose target class is already unsatisfiable rejects nothing.
    const vacuous = candidate.target ? baselineUnsat.has(candidate.target) : false;
    return { candidate, enforced: probeUnsat && !vacuous, vacuous };
  });
}

export interface PropertyGuardDiff {
  lost: PropertyGuardCandidate[];
  gained: PropertyGuardCandidate[];
  retained: PropertyGuardCandidate[];
}

export function diffPropertyGuards(
  baseline: readonly PropertyGuardVerdict[],
  comparison: readonly PropertyGuardVerdict[],
): PropertyGuardDiff {
  const cmp = new Map(comparison.map((v) => [candidateKey(v.candidate), v]));
  const base = new Map(baseline.map((v) => [candidateKey(v.candidate), v]));
  const lost: PropertyGuardCandidate[] = [];
  const gained: PropertyGuardCandidate[] = [];
  const retained: PropertyGuardCandidate[] = [];
  for (const b of baseline) {
    // An undecidable candidate was never measured, so it can be neither retained nor lost.
    if (b.undecidable || !b.enforced) continue;
    const c = cmp.get(candidateKey(b.candidate));
    if (c?.undecidable) continue;
    if (c?.enforced) retained.push(b.candidate);
    else lost.push(b.candidate);
  }
  for (const c of comparison) {
    if (c.undecidable || !c.enforced) continue;
    const b = base.get(candidateKey(c.candidate));
    if (b?.undecidable) continue;
    if (!b?.enforced) gained.push(c.candidate);
  }
  return { lost, gained, retained };
}
