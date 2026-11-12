// Read-only RDF/JS DatasetCore over the shared N3 store, for the SHACL engine. Nothing is copied:
// every match() is a store.match() per visible graph, the results are one triple set (default
// graph), and urn:vg:bnode:* IRIs are presented as real blank nodes (and mapped back on input).
// Shapes, data, imported ontologies and inferred triples being one set is what SHACL expects:
// the class hierarchy (sh:targetClass, sh:class) is read from the same graph as the data.
import * as N3 from "n3";

const { DataFactory } = N3;
const SKOLEM_PREFIX = "urn:vg:bnode:";

/** Graphs SHACL sees: not provenance, workflows or explanations. */
export const SHACL_VIEW_GRAPHS: readonly string[] = [
  "urn:vg:data", "urn:vg:ontologies", "urn:vg:inferred", "urn:vg:shapes",
];

const out = (t: any): any =>
  t.termType === "NamedNode" && t.value.startsWith(SKOLEM_PREFIX)
    ? DataFactory.blankNode(t.value.slice(SKOLEM_PREFIX.length)) : t;

/** Store forms of a pattern term: a blank node may be stored as itself or as its skolem IRI. */
const variants = (t: any): any[] =>
  !t || t.termType === "Variable" ? [null]
    : t.termType === "BlankNode" ? [t, DataFactory.namedNode(SKOLEM_PREFIX + t.value)] : [t];

/** Result of match(): a small materialised dataset. */
class QuadList {
  constructor(private readonly quads: any[]) {}
  get size() { return this.quads.length; }
  has(q: any) { return this.quads.some((x) => x.equals(q)); }
  match(s?: any, p?: any, o?: any, g?: any) {
    return new QuadList(this.quads.filter((q) =>
      (!s || q.subject.equals(s)) && (!p || q.predicate.equals(p)) &&
      (!o || q.object.equals(o)) && (!g || q.graph.equals(g))));
  }
  [Symbol.iterator]() { return this.quads[Symbol.iterator](); }
  add() { throw new Error("read-only"); }
  delete() { throw new Error("read-only"); }
}

export class ShaclStoreView {
  private readonly graphs: any[];
  constructor(private readonly store: N3.Store, graphs: readonly string[] = SHACL_VIEW_GRAPHS) {
    this.graphs = graphs.map((g) => DataFactory.namedNode(g));
  }

  // The engine reads size per focus node and countQuads(graph) walks the index, so cache the
  // count; it can only change when the store's own size does (the store is not edited mid-run).
  private sizeAt = -1;
  private sizeCached = 0;
  get size(): number {
    const at = this.store.size;
    if (at !== this.sizeAt) {
      let n = 0;
      for (const g of this.graphs) n += this.store.countQuads(null, null, null, g);
      this.sizeAt = at; this.sizeCached = n;
    }
    return this.sizeCached;
  }

  has(q: any): boolean { return this.match(q.subject, q.predicate, q.object).size > 0; }

  match(s?: any, p?: any, o?: any, g?: any): QuadList {
    // a concrete non-default graph is not part of the view's vocabulary
    if (g && g.termType !== "DefaultGraph" && g.termType !== "Variable") return new QuadList([]);
    const pi = p?.termType === "Variable" ? null : p ?? null;
    const seen = new Set<string>();
    const res: any[] = [];
    const sub = variants(s), obj = variants(o);
    for (const gr of this.graphs) for (const si of sub) for (const oi of obj) {
      for (const q of this.store.match(si, pi, oi, gr)) {
        // the same triple in several graphs (data + inferred) counts once, as in a merged graph
        const k = `${q.subject.termType[0]}${q.subject.value}\n${q.predicate.value}\n${q.object.termType[0]}${q.object.value}\n${(q.object as any).datatype?.value ?? ""}\n${(q.object as any).language ?? ""}`;
        if (seen.has(k)) continue;
        seen.add(k);
        res.push(DataFactory.quad(out(q.subject), q.predicate, out(q.object), DataFactory.defaultGraph()));
      }
    }
    return new QuadList(res);
  }

  [Symbol.iterator]() { return this.match()[Symbol.iterator](); }
  add() { throw new Error("read-only"); }
  delete() { throw new Error("read-only"); }
}
