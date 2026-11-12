/**
 * Blank-node identity at the store/UI boundary.
 *
 * The worker's N3 store holds real BlankNode terms, labelled with a deterministic hash (see
 * labelBlankNodes in the worker). The rdf-reasoner-konclude TypeScript readers (assessEdit,
 * axiom grouping, weaken, laconic justifications) only recognise termType "BlankNode", so a
 * skolem IRI in the store makes them skip every restriction and AllDisjointClasses group.
 *
 * The UI, the MCP tools and SPARQL clients address blank nodes as `urn:vg:bnode:<label>` named
 * nodes (canvas element ids, navigation, editing, removal identity). The mapping between the two
 * is a pure prefix toggle, applied only where terms cross the worker boundary.
 */
import type { DataFactory, Quad, Term } from "@rdfjs/types";
import {
  deserializeTerm,
  serializeTerm,
  type WorkerQuad,
  type WorkerTerm,
} from "./rdfSerialization.ts";

export const SKOLEM_PREFIX = "urn:vg:bnode:";

type Factory = Pick<DataFactory, "namedNode" | "blankNode" | "literal" | "defaultGraph" | "quad">;

export const isSkolemIri = (value: string): boolean => value.startsWith(SKOLEM_PREFIX);

/** The id the UI uses for a term: blank nodes become their skolem IRI, everything else keeps its value. */
export function termToId(term: { termType: string; value: string }): string {
  return term.termType === "BlankNode" ? `${SKOLEM_PREFIX}${term.value}` : term.value;
}

/**
 * The store term for an id string: `urn:vg:bnode:<label>` and `_:<label>` are blank nodes,
 * anything else a named node.
 */
export function idToTerm(factory: Pick<DataFactory, "namedNode" | "blankNode">, id: string): Term {
  if (id.startsWith(SKOLEM_PREFIX)) return factory.blankNode(id.slice(SKOLEM_PREFIX.length));
  if (id.startsWith("_:")) return factory.blankNode(id.slice(2));
  return factory.namedNode(id);
}

/** Store term to wire form: a blank node leaves the worker as its skolem IRI. */
export function serializeTermForUi(term: Term): WorkerTerm {
  if (term.termType === "BlankNode") return { termType: "NamedNode", value: `${SKOLEM_PREFIX}${term.value}` };
  return serializeTerm(term);
}

/** Wire form to store term: a skolem IRI entering the worker is the blank node it names. */
export function deserializeTermFromUi(term: WorkerTerm | Term | null | undefined, factory: Factory): Term {
  if (term && term.termType === "NamedNode" && isSkolemIri(term.value)) {
    return factory.blankNode(term.value.slice(SKOLEM_PREFIX.length));
  }
  return deserializeTerm(term, factory);
}

export function serializeQuadForUi(quad: Quad): WorkerQuad {
  const predicate = serializeTerm(quad.predicate);
  if (predicate.termType !== "NamedNode") throw new Error("worker-term-predicate-must-be-named-node");
  return {
    subject: serializeTermForUi(quad.subject),
    predicate,
    object: serializeTermForUi(quad.object),
    graph: serializeTerm(quad.graph),
  };
}

export function deserializeQuadFromUi(quad: WorkerQuad | Quad, factory: Factory): Quad {
  if ((quad as Quad).subject && typeof (quad as Quad).subject.equals === "function") return quad as Quad;
  const q = quad as WorkerQuad;
  if (!q.object) throw new Error("serialized-quad-missing-object");
  const predicate = deserializeTermFromUi(q.predicate, factory);
  if (predicate.termType !== "NamedNode") throw new Error("serialized-quad-invalid-predicate");
  return factory.quad(
    deserializeTermFromUi(q.subject, factory) as any,
    predicate,
    deserializeTermFromUi(q.object, factory) as any,
    deserializeTermFromUi(q.graph, factory) as any,
  );
}
