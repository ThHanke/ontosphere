/**
 * A SPARQL-facing view of the worker's N3 store.
 *
 * The store holds real BlankNode terms (see utils/blankNodeIds.ts). SPARQL clients cannot address a
 * blank node in a query pattern (it would be a variable) nor in DELETE DATA, and they identify blank
 * nodes by their skolem IRI everywhere else (canvas ids, MCP tools). This view presents each stored
 * blank node as `urn:vg:bnode:<label>` and maps skolem IRIs in patterns and updates back to the
 * blank nodes they name, so queries behave as they did when the store held skolem IRIs.
 *
 * It implements the RDF/JS Store interface that comunica's rdfjs source and update destination need:
 * match, countQuads, import, remove, removeMatches, deleteGraph.
 */
import { Readable } from "readable-stream";
import type { Quad, Term } from "@rdfjs/types";
import { SKOLEM_PREFIX, idToTerm, isSkolemIri } from "../utils/blankNodeIds.ts";

type Factory = {
  namedNode(v: string): any;
  blankNode(v: string): any;
  quad(s: any, p: any, o: any, g: any): any;
};

export function skolemView(store: any, factory: Factory) {
  const inTerm = (t: Term | null | undefined) =>
    t && t.termType === "NamedNode" && isSkolemIri(t.value) ? idToTerm(factory, t.value) : (t ?? null);
  const outTerm = (t: Term) => (t.termType === "BlankNode" ? factory.namedNode(`${SKOLEM_PREFIX}${t.value}`) : t);
  const outQuad = (q: Quad): Quad =>
    q.subject.termType === "BlankNode" || q.object.termType === "BlankNode"
      ? factory.quad(outTerm(q.subject), q.predicate, outTerm(q.object), q.graph)
      : q;
  const inQuad = (q: Quad): Quad =>
    factory.quad(inTerm(q.subject), q.predicate, inTerm(q.object), q.graph);

  return {
    match(s?: Term | null, p?: Term | null, o?: Term | null, g?: Term | null) {
      const quads: Quad[] = store.getQuads(inTerm(s), inTerm(p), inTerm(o), inTerm(g));
      let i = 0;
      return new Readable({
        objectMode: true,
        read() {
          // push in slices so a large match does not block the event loop in one go
          const end = Math.min(i + 512, quads.length);
          while (i < end) this.push(outQuad(quads[i++]));
          if (i >= quads.length) this.push(null);
        },
      });
    },
    countQuads(s?: Term | null, p?: Term | null, o?: Term | null, g?: Term | null): number {
      return store.countQuads(inTerm(s), inTerm(p), inTerm(o), inTerm(g));
    },
    import(stream: any) {
      stream.on("data", (q: Quad) => store.addQuad(inQuad(q)));
      return stream;
    },
    remove(stream: any) {
      stream.on("data", (q: Quad) => store.removeQuad(inQuad(q)));
      return stream;
    },
    removeMatches(s?: Term | null, p?: Term | null, o?: Term | null, g?: Term | null) {
      return store.removeMatches(inTerm(s), inTerm(p), inTerm(o), inTerm(g));
    },
    deleteGraph(g: Term | string) {
      return store.deleteGraph(g);
    },
  };
}
