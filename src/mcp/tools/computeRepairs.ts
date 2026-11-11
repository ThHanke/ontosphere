// src/mcp/tools/computeRepairs.ts
//
// The shape of a repair suggestion (RepairSuggestion and friends), the small helpers the repair
// adapter ranks with, and the SHACL repair candidates.
//
// Inconsistency repairs and weakenings are computed by the reasoner (rdf-reasoner-konclude repair()
// and weaken()) and mapped onto RepairSuggestion by repairAdapter.ts. SHACL repairs restore shape
// conformance, not consistency, so they are not passed to the reasoner: buildShaclRepairs turns a
// violation into an executable `addTriple` candidate. Every emitted `action.tool` is a tool that is
// registered in ontosphereMcpServer.ts (guarded by shaclRepairs.test.ts).

import { abbreviateIri, type NamespaceMap } from '../../utils/iriAbbreviation';

import type { DiagnosticsData } from './diagnosticsBrief';

/** A single RDF triple (subject/predicate/object IRIs). */
export interface WeakeningTriple {
  subject: string;
  predicate: string;
  object: string;
  /** Optional source/target graph (threaded so apply hits the right graph). */
  graph?: string;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type RepairIssue = 'inconsistency' | 'shacl';

/**
 * How a repair changes the ontology:
 *  - 'delete'  — remove the culprit axiom outright (maximally destructive; the
 *                original, default behaviour).
 *  - 'weaken'  — replace the culprit `A ⊑ D` with a logically weaker axiom
 *                `A ⊑ D′` (D′ ⊒ D) or drop a conjunct — preserves more knowledge
 *                (Troquard et al. AAAI 2018; Li & Lambrix ISWC 2024).
 *
 * Repairs without an explicit kind are 'delete' (back-compat: existing tests and
 * callers that don't set it treat every repair as a deletion).
 */
export type RepairKind = 'delete' | 'weaken';

/**
 * A remove+add batch for a WEAKENING repair: remove the original culprit
 * axiom triple(s) AND add the weaker replacement triple(s). Adds may be empty
 * when the weakening degenerates to a deletion (A ⊑ owl:Thing, or dropping the
 * last conjunct). Mirrors rdfManager.applyBatch's { removes, adds } shape.
 */
export interface RepairBatch {
  removes: WeakeningTriple[];
  adds: WeakeningTriple[];
}

export interface RepairAction {
  /**
   * MCP tool the agent should call to apply this repair. Inconsistency repairs
   * always use `removeLink` — its handler removes ANY matching triple (it calls
   * rdfManager.removeTriple under the hood), so it works for IRI-object edges,
   * literal-object annotations, AND TBox schema axioms (disjointWith/subClassOf).
   * Only tools that are actually registered (see ontosphereMcpServer.ts) are emitted.
   */
  tool: 'removeLink' | 'addTriple' | 'updateNode';
  args: {
    subjectIri?: string;
    predicateIri?: string;
    /**
     * The triple object. For IRI-object axioms this is the object IRI. For
     * literal-object axioms (e.g. an annotation with a string/number literal)
     * this carries the literal's lexical value — `removeLink`'s handler coerces
     * a non-IRI object string to a Literal term and removes the matching triple,
     * so the same field works for both cases.
     */
    objectIri?: string;
    /**
     * For SHACL `addTriple`/`updateNode` candidates whose object value cannot be
     * inferred symbolically, this is left undefined and `needsValue` is set so
     * the agent knows it must supply a value.
     */
    objectValue?: string;
    /**
     * C1: the named graph the axiom physically resides in (e.g. 'urn:vg:data' or
     * 'urn:vg:ontologies' for an imported schema axiom). The apply path MUST
     * remove/add in THIS graph — hardcoding urn:vg:data silently no-ops when the
     * axiom lives in an imported ontology. Undefined ⇒ default data graph.
     */
    graph?: string;
    /**
     * H2: the object term's RDF kind ('NamedNode' | 'Literal' | 'BlankNode').
     * When 'Literal', `objectDatatype`/`objectLanguage` carry the exact type so
     * the apply path reconstructs the precise typed/lang literal instead of a
     * lossy lexical-only match that could remove a same-lexical sibling.
     */
    objectTermType?: string;
    /** H2: datatype IRI of a literal object (e.g. xsd:integer). */
    objectDatatype?: string;
    /** H2: language tag of a literal object (e.g. 'en'). */
    objectLanguage?: string;
  };
}

export interface RepairSuggestion {
  /** Stable, human-referenceable id, e.g. "R1", "R2", "S1", "W1". */
  id: string;
  issue: RepairIssue;
  action: RepairAction;
  /**
   * Repair kind. Absent ⇒ 'delete' (back-compat). 'weaken' repairs carry a
   * `batch` (remove original + add weaker) and a `weakerThan` description.
   */
  kind?: RepairKind;
  /**
   * For kind:'weaken' — the remove+add batch to apply (the deletion `action`
   * above still removes the culprit, so an apply path that only understands
   * `action` degrades gracefully to a deletion; a weakening-aware path applies
   * the full batch to also ADD the weaker axiom).
   */
  batch?: RepairBatch;
  /**
   * For kind:'weaken' — "A ⊑ D" (the original, stronger axiom) so the UI/agent
   * can show "A ⊑ D → A ⊑ D′".
   */
  weakerThan?: string;
  /**
   * For kind:'weaken' — the id of the deletion repair this weakening is an
   * alternative to (same culprit axiom). Lets the UI group "delete vs weaken".
   */
  alternativeTo?: string;
  /**
   * For kind:'weaken' — set by the caller after symbolic verification: true when
   * removing the original culprit axiom restores consistency. Because the added
   * weaker axiom `A ⊑ D′` is ENTAILED by the removed `A ⊑ D` (D ⊑ D′), the
   * removal verdict transfers to the weakening (re-adding an entailment of a
   * removed axiom cannot re-break a satisfied model). Undefined when not verified.
   */
  weakeningVerified?: boolean;
  /** For kind:'weaken' — human-readable verification note (honest about the add-side). */
  weakeningNote?: string;
  /** Plain-language explanation of why this repair was chosen. */
  rationale: string;
  /**
   * Indices (into `diagnostics.justifications`) of the inconsistency
   * justifications this repair resolves. Present for inconsistency repairs.
   */
  justificationsCovered?: number[];
  /**
   * Set by the caller after symbolic verification: true when re-running the
   * Konclude consistency oracle on a store copy WITHOUT this repair's *single*
   * axiom yields a consistent ontology. NOTE: with multiple disjoint
   * contradictions no single removal restores GLOBAL consistency, so this is
   * commonly `false` even for a correct repair — it means "does not ALONE
   * restore consistency; apply the full repair set" rather than "wrong repair".
   * Cross-reference `verifiedSet`. Undefined when not (yet) verified.
   */
  verifiedConsistent?: boolean;
  /**
   * Set from the reasoner's verification of the FULL repair set
   * (all inconsistency repairs removed together): true when removing every
   * inconsistency repair's axiom at once restores global consistency. This is
   * the paper-critical signal — the union of repairs IS the valid fix even when
   * each individual `verifiedConsistent` is false. Same value on every
   * inconsistency repair. Undefined when not (yet) verified.
   */
  verifiedSet?: boolean;
  /**
   * Set from the reasoner's Repair.minimal: true when the deletion repair set is a verified
   * minimal hitting set of the known justifications (removing any member leaves a known
   * justification intact). Same value on every deletion repair of the set. Undefined when the
   * reasoner did not verify. `minimalDeletionSet` on the returned summary is the set itself.
   */
  minimalityVerified?: boolean;
  /**
   * True when the action cannot be fully specified because a value must be
   * chosen by the agent (SHACL candidates with an unknown object).
   */
  needsValue?: boolean;
  /**
   * True for a marker suggestion that has NO executable action because the
   * reasoner reported a contradiction with no covering axiom (a degenerate /
   * empty MIPS). The agent must inspect the ontology manually. `action` is set
   * to a no-op shape and there is no `justificationsCovered`.
   */
  needsManualReview?: boolean;
}

// ---------------------------------------------------------------------------
// Axiom helpers
// ---------------------------------------------------------------------------

type Axiom = {
  subject: string;
  predicate: string;
  object: string;
  // C1 + H2: optional provenance/term metadata threaded from the MIPS so the
  // repair action can target the correct graph and reconstruct the exact object
  // term. Absent on synthetic/test axioms that only specify s/p/o.
  objectTermType?: string;
  objectDatatype?: string;
  objectLanguage?: string;
  graph?: string;
};

export type AxiomTriple = Axiom;

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const OWL = 'http://www.w3.org/2002/07/owl#';
const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';

/** Predicates that express TBox / structural schema axioms (least preferred to remove). */
const TBOX_PREDICATES = new Set<string>([
  `${OWL}disjointWith`,
  `${OWL}equivalentClass`,
  `${OWL}equivalentProperty`,
  `${OWL}complementOf`,
  `${OWL}unionOf`,
  `${OWL}intersectionOf`,
  `${OWL}oneOf`,
  `${OWL}onProperty`,
  `${OWL}someValuesFrom`,
  `${OWL}allValuesFrom`,
  `${OWL}hasValue`,
  `${OWL}cardinality`,
  `${OWL}minCardinality`,
  `${OWL}maxCardinality`,
  `${OWL}qualifiedCardinality`,
  `${OWL}minQualifiedCardinality`,
  `${OWL}maxQualifiedCardinality`,
  `${OWL}propertyDisjointWith`,
  `${OWL}disjointUnionOf`,
  `${OWL}inverseOf`,
  `${RDFS}subClassOf`,
  `${RDFS}subPropertyOf`,
  `${RDFS}domain`,
  `${RDFS}range`,
]);

/** Object values that, as rdf:type objects, denote a TBox structural assertion. */
const TBOX_TYPE_OBJECTS = new Set<string>([
  `${OWL}FunctionalProperty`,
  `${OWL}InverseFunctionalProperty`,
  `${OWL}TransitiveProperty`,
  `${OWL}SymmetricProperty`,
  `${OWL}AsymmetricProperty`,
  `${OWL}ReflexiveProperty`,
  `${OWL}IrreflexiveProperty`,
]);

export function axiomKey(a: Axiom): string {
  // Include graph + object term metadata so two axioms that share the same
  // s/p/o lexical form but differ in source graph (C1) or in literal
  // datatype/language (H2) are NOT merged into one hitting-set entry — they are
  // genuinely distinct RDF terms and may need distinct repairs.
  return [
    a.subject,
    a.predicate,
    a.object,
    a.objectTermType ?? '',
    a.objectDatatype ?? '',
    a.objectLanguage ?? '',
    a.graph ?? '',
  ].join('\u0000');
}

/**
 * Is this axiom a TBox / structural schema axiom? Such axioms are MORE
 * destructive to remove (they change the meaning of the ontology) so the
 * ranking prefers removing ABox / object-property assertions instead.
 */
export function isTBoxAxiom(a: Axiom): boolean {
  if (TBOX_PREDICATES.has(a.predicate)) return true;
  if (a.predicate === RDF_TYPE && TBOX_TYPE_OBJECTS.has(a.object)) return true;
  return false;
}

/**
 * An rdf:type assertion to an OWL meta-class (owl:Class, owl:ObjectProperty,
 * owl:NamedIndividual, …) is a *declaration*. Removing a declaration is
 * pointless as a repair (it does not relieve the logical clash) so we treat it
 * as maximally destructive when ranking, keeping it out of hitting sets unless
 * nothing else covers a justification.
 */
export function isDeclaration(a: Axiom): boolean {
  return (
    a.predicate === RDF_TYPE &&
    a.object.startsWith(OWL) &&
    /(Class|ObjectProperty|DatatypeProperty|AnnotationProperty|NamedIndividual|Ontology)$/.test(
      a.object,
    )
  );
}

/**
 * Does this axiom's object look like an absolute IRI (vs. a literal value)?
 * Used only for rationale wording — the emitted tool is always `removeLink`,
 * whose handler removes IRI-object AND literal-object triples alike.
 */
export function hasIriObject(a: Axiom): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(a.object);
}

// ---------------------------------------------------------------------------
// SHACL repair candidates
// ---------------------------------------------------------------------------

export function buildShaclRepairs(
  violations: DiagnosticsData['shaclViolations'],
  namespaces: NamespaceMap = {},
): RepairSuggestion[] {
  const name = (iri: string): string => abbreviateIri(iri, namespaces);
  const out: RepairSuggestion[] = [];
  let n = 0;
  for (const v of violations) {
    if (!v.focusNode || !v.path) continue; // can't form an actionable triple
    n += 1;
    const constraintName = v.constraint ? name(v.constraint) : 'shape constraint';
    // We cannot symbolically infer the value the shape expects, so the agent
    // must supply it. We use addTriple with needsValue:true.
    const rationale =
      `SHACL ${v.severity ?? 'violation'} on ${name(v.focusNode)} via ` +
      `${name(v.path)} (${constraintName})` +
      (v.message ? `: ${v.message}` : '') +
      `. Add a value for ${name(v.path)} on ${name(v.focusNode)} to satisfy the shape.`;
    out.push({
      id: `S${n}`,
      issue: 'shacl',
      action: {
        tool: 'addTriple',
        args: {
          subjectIri: v.focusNode,
          predicateIri: v.path,
          // objectValue intentionally omitted — see needsValue.
        },
      },
      rationale,
      needsValue: true,
    });
  }
  return out;
}

