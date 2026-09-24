// src/workers/reasoningDiagnostics.ts
//
// Pure, dependency-light helpers that turn raw reasoner output into structured,
// explainable diagnostics. Extracted from rdfManager.runtime.ts so the logic is
// unit-testable in isolation (no Konclude WASM / worker harness required).
import type * as N3 from "n3";
import type { ReasoningError } from "@/utils/reasoningTypes";

const RDF_TYPE_P = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

const CLASH_PREDICATES = new Set([
  "http://www.w3.org/2002/07/owl#disjointWith",
  "http://www.w3.org/2002/07/owl#maxCardinality",
  "http://www.w3.org/2002/07/owl#maxQualifiedCardinality",
  "http://www.w3.org/2002/07/owl#complementOf",
  "http://www.w3.org/2002/07/owl#AsymmetricProperty",
]);

const KNOWN_PREFIXES: Record<string, string> = {
  "http://www.w3.org/1999/02/22-rdf-syntax-ns#": "rdf:",
  "http://www.w3.org/2000/01/rdf-schema#": "rdfs:",
  "http://www.w3.org/2002/07/owl#": "owl:",
};

/** Abbreviate an IRI to a prefixed or local name for human-readable messages. */
export function abbreviateIri(iri: string): string {
  for (const [ns, prefix] of Object.entries(KNOWN_PREFIXES)) {
    if (iri.startsWith(ns)) return prefix + iri.slice(ns.length);
  }
  return iri.split(/[#/]/).pop() ?? iri;
}

/**
 * Convert a Minimal Inconsistency-Preserving Sub-ontology (MIPS) — the minimal
 * set of axioms whose conjunction is contradictory — into a structured
 * {@link ReasoningError}.
 *
 * Unlike the previous inline implementation, this attaches the COMPLETE
 * justification axiom set (`justification`) instead of truncating the
 * human-readable summary to three axioms, so both the UI and MCP agents can
 * inspect every axiom involved in the clash.
 */
export function mipsToReasoningError(mips: N3.Quad[]): ReasoningError {
  // nodeId: prefer the clash individual (subject of rdf:type to a user-defined class),
  // falling back progressively so we always name something concrete.
  let nodeId: string | undefined;
  for (const q of mips) {
    if (
      q.predicate.value === RDF_TYPE_P &&
      q.object.termType === "NamedNode" &&
      !q.object.value.startsWith("http://www.w3.org/") &&
      q.subject.termType === "NamedNode"
    ) {
      nodeId = q.subject.value;
      break;
    }
  }
  if (!nodeId) {
    for (const q of mips) {
      if (
        q.predicate.value === RDF_TYPE_P &&
        q.subject.termType === "NamedNode" &&
        !q.subject.value.startsWith("http://www.w3.org/")
      ) {
        nodeId = q.subject.value;
        break;
      }
    }
  }
  if (!nodeId) {
    for (const q of mips) {
      if (q.subject.termType === "NamedNode" && !q.subject.value.startsWith("http://www.w3.org/")) {
        nodeId = q.subject.value;
        break;
      }
    }
  }

  let rule = "owl:inconsistency";
  for (const q of mips) {
    if (CLASH_PREDICATES.has(q.predicate.value)) {
      const local = q.predicate.value.split(/[#/]/).pop() ?? q.predicate.value;
      rule = `owl:${local}`;
      break;
    }
  }

  // Complete justification, serialised to plain strings for transport & display.
  const justification = mips.map((q) => ({
    subject: q.subject.value,
    predicate: q.predicate.value,
    object: q.object.value,
  }));

  const nodeLocalName = nodeId ? abbreviateIri(nodeId) : "unknown";
  const axiomSummary = mips
    .slice(0, 3)
    .map((q) => `${abbreviateIri(q.subject.value)} ${abbreviateIri(q.predicate.value)} ${abbreviateIri(q.object.value)}`)
    .join("; ");
  const message =
    `Clash on ${nodeLocalName} (${rule}). Involved axioms: ${axiomSummary}` +
    (mips.length > 3 ? ` (+${mips.length - 3} more — see justification)` : "");

  return { nodeId, rule, severity: "critical", message, justification };
}

// ---------------------------------------------------------------------------
// SHACL violation → reasoning entry
// ---------------------------------------------------------------------------

export interface ShaclViolationInput {
  focusNode?: string | null;
  path?: string | null;
  /** SHACL severity, e.g. "sh:Violation", "sh:Warning". */
  severity?: string | null;
  message?: string | null;
  sourceShape?: string | null;
  /** Constraint component IRI, e.g. .../shacl#MinCountConstraintComponent. */
  constraint?: string | null;
}

export interface ShaclEntry {
  nodeId?: string;
  message: string;
  rule: string;
  severity: "error" | "warning";
  sourceShape?: string;
  path?: string;
}

/** Single source of truth for SHACL severity → reasoning severity (was duplicated and inconsistent). */
export function mapShaclSeverity(severity: string | null | undefined): "error" | "warning" {
  return severity === "sh:Violation" ? "error" : "warning";
}

/**
 * Convert a SHACL violation into a reasoning entry with an explainable message.
 * Always includes shape and path context so the canvas badge tooltip identifies
 * which shape fired and which property was checked — not just the raw engine message.
 */
export function shaclViolationToEntry(v: ShaclViolationInput): ShaclEntry {
  const constraintLocal = v.constraint ? v.constraint.split(/[#/]/).pop() ?? "constraint" : null;
  const focusLocal = v.focusNode ? abbreviateIri(v.focusNode) : "node";
  const pathLabel = v.path ? abbreviateIri(v.path) : null;
  const shapeLabel = v.sourceShape ? abbreviateIri(v.sourceShape) : null;

  let message: string;
  if (v.message && v.message.trim().length > 0) {
    // Engine-provided message; append structural context for identification
    const context = [
      pathLabel && `path: ${pathLabel}`,
      shapeLabel && `shape: ${shapeLabel}`,
      constraintLocal && `(${constraintLocal})`,
    ].filter(Boolean).join("\n  ");
    message = context ? `${v.message.trim()}\n  ${context}` : v.message.trim();
  } else {
    const contextParts = [
      pathLabel && `path: ${pathLabel}`,
      shapeLabel && `shape: ${shapeLabel}`,
    ].filter(Boolean).join("\n  ");
    message =
      `${constraintLocal ?? "SHACL"} violated on ${focusLocal}` +
      (contextParts ? `\n  ${contextParts}` : "");
  }

  return {
    nodeId: v.focusNode ?? undefined,
    message,
    rule: `shacl:${constraintLocal ?? "constraint"}`,
    severity: mapShaclSeverity(v.severity),
    sourceShape: v.sourceShape ?? undefined,
    path: v.path ?? undefined,
  };
}
