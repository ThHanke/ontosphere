// src/workers/reasonerCapabilities.ts
//
// What the reasoner Ontosphere ships can actually be asked, and how we know.
//
// A declarative table. No I/O, no probing at query time: every lookup is a scan of the
// literal list below, so it can be consulted on any request without caching. The cost of
// that is staleness, which is why the table carries TABLE_UPDATED and why every date here
// is a date rather than prose. A stale table that says when it was written is a fact; one
// that does not is a rumour.
//
// EVERY FACT IS TAGGED `declared` OR `observed`.
//   declared - from vendor documentation, a specification, or the package's own types, and
//              NOT exercised here.
//   observed - this environment ran it and this is what happened, with a reproducer named.
//
// The distinction is the whole point. A capability table that cannot tell "the docs say so"
// from "we tried it" is exactly the unaudited claim it exists to prevent. It also gives the
// tool an honest answer to "is the symbolic layer an absolute filter?" -- it is not, and the
// specific holes are enumerated here rather than left to prose.

export type Provenance = "declared" | "observed";

export interface CapabilityFact {
  /** The construct, behaviour or guarantee this fact is about. */
  subject: string;
  /** Whether the engine supports / enforces / guarantees it. */
  supported: boolean;
  provenance: Provenance;
  /** ISO date this fact was established. */
  established: string;
  /** What was run, or which document says so. A reproducer path for every observed fact. */
  evidence: string;
  /** What it means for a caller who relies on this. */
  consequence: string;
}

/** When this table was last checked. Every staleness judgement is relative to this date. */
export const TABLE_UPDATED = "2026-09-14";

/** The reasoner build these facts are about. */
export const REASONER = "rdf-reasoner-konclude@0.6.9 (Konclude compiled to WebAssembly)";

export const CAPABILITIES: readonly CapabilityFact[] = [
  {
    subject: "owl:AsymmetricProperty with a self-assertion",
    supported: false,
    provenance: "observed",
    established: "2026-09-14",
    evidence: "_diag/soundness-check.mjs: AsymmetricProperty(:T) with :x :T :x is reported CONSISTENT",
    consequence:
      "Asymmetry entails irreflexivity, so that graph has no model and the reasoner misses it. " +
      "Ontosphere checks this syntactically before consulting the reasoner (propertyCharacteristicGuard.ts).",
  },
  {
    subject: "owl:IrreflexiveProperty with a self-assertion",
    supported: true,
    provenance: "observed",
    established: "2026-09-14",
    evidence: "_diag/soundness-check.mjs: IrreflexiveProperty(:P) with :x :P :x is reported inconsistent",
    consequence:
      "Enforced by this WebAssembly build, unlike native Konclude v0.7.0-1138 which pykonclude " +
      "found accepting it (KONCLUDE_ISSUES.md, 2026-08-24). The two builds differ here.",
  },
  {
    subject: "Inconsistency patterns 1-6 (disjoint individual, domain/range, allValuesFrom, max-qualified-cardinality, asymmetric 2-cycle, irreflexive self-loop)",
    supported: true,
    provenance: "observed",
    established: "2026-09-14",
    evidence: "src/__tests__/fixtures/inconsistency/*.ttl via _diag/soundness-check.mjs: all six detected",
    consequence: "These specific clash shapes are caught. This is a spot check, not a conformance result.",
  },
  {
    subject: "Canonical inferred class hierarchy",
    supported: false,
    provenance: "observed",
    established: "2026-09-14",
    evidence:
      "_diag/closure-test.mjs: across cold runs on a byte-identical base the reported inferred " +
      "rdfs:subClassOf edges vary (46-58) while the transitive closure is identical (8246)",
    consequence:
      "The engine emits a non-canonical transitive reduction, so materialised triple counts are not " +
      "reproducible run to run. No entailment varies. Ontosphere canonicalises before write-back " +
      "(canonicalHierarchy.ts).",
  },
  {
    subject: "Releasing a loaded knowledge base without terminating the worker",
    supported: false,
    provenance: "observed",
    established: "2026-09-14",
    evidence:
      "package exposes only terminate(); _diag/repeat-memory.mjs measured RSS 1368 -> 2811 MB over " +
      "eight sequential runs with one reused worker",
    consequence:
      "Each run builds a knowledge base in WASM linear memory, which grows and never shrinks. " +
      "Ontosphere recycles the worker at the start of every run to bound residency.",
  },
  {
    subject: "materialize() repopulating the inferred graph on a cache hit",
    supported: false,
    provenance: "observed",
    established: "2026-09-14",
    evidence:
      "rdf-reasoner-konclude dist/index.js: on a store-fingerprint cache hit materialize returns " +
      "early without writing the inferred graph (the package notes this is acceptable for its use-cases)",
    consequence:
      "Reasoning twice over an unchanged base yields an empty inferred graph unless the caller " +
      "handles it. DlReasoner keeps the existing graph in that case.",
  },
  {
    subject: "owl:hasSelf combined with owl:propertyDisjointWith",
    supported: false,
    provenance: "observed",
    established: "2026-09-14",
    evidence:
      "_diag/probe-disjointprop2.mjs: P ⊑ ∃R.Self ⊓ ∃S.Self with R propertyDisjointWith S is " +
      "reported satisfiable, and populating P with an individual still leaves the ontology " +
      "consistent. _diag/probe-disjointprop.mjs shows the same clash IS caught from ordinary " +
      "role assertions, so the axiom is understood and it is the combination that is not.",
    consequence:
      "Property-disjointness guards cannot be decided by the Self probe on this engine. " +
      "propertyGuards.ts marks them undecidable rather than reporting them as not enforced, " +
      "which would be a fabricated finding.",
  },
  {
    subject: "W3C OWL 2 conformance suite",
    supported: false,
    provenance: "declared",
    established: "2026-09-14",
    evidence: "Not run against this build. The submitted manuscript states the same in its evidence boundaries.",
    consequence:
      "No general soundness or completeness claim is available for this engine. Every positive " +
      "statement above is a spot check over named constructs.",
  },
  {
    subject: "Deterministic entailed closure under a fixed reasoning base",
    supported: true,
    provenance: "observed",
    established: "2026-09-14",
    evidence:
      "_diag/diag-materialization.mjs (10 cold runs, bit-identical output) and _diag/closure-test.mjs " +
      "(closure identical across runs)",
    consequence:
      "Given the same base the entailed closure does not vary, which is what a reproducible " +
      "validation report depends on.",
  },
];

/** Facts about constructs the engine does NOT handle correctly: the honest gap list. */
export function knownGaps(): CapabilityFact[] {
  return CAPABILITIES.filter((c) => !c.supported);
}

/** Facts actually exercised in this environment, as opposed to read from documentation. */
export function observedFacts(): CapabilityFact[] {
  return CAPABILITIES.filter((c) => c.provenance === "observed");
}

/** Look up what is known about a construct. Substring match, case-insensitive. */
export function capabilityFor(subject: string): CapabilityFact[] {
  const needle = subject.toLowerCase();
  return CAPABILITIES.filter((c) => c.subject.toLowerCase().includes(needle));
}

/**
 * Days since the table was last checked, relative to `now`. A caller that reports
 * capabilities should surface this rather than presenting the table as current.
 */
export function tableAgeDays(now: Date = new Date()): number {
  const then = Date.parse(`${TABLE_UPDATED}T00:00:00Z`);
  return Math.floor((now.getTime() - then) / 86_400_000);
}
