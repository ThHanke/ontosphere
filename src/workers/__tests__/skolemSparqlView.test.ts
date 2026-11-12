// @vitest-environment node
import { describe, it, expect } from "vitest";
import { Store, DataFactory } from "n3";
import { QueryEngine } from "@comunica/query-sparql-rdfjs";
import { skolemView } from "../skolemSparqlView";

const { namedNode: nn, blankNode: bn, quad, literal } = DataFactory;
const OWL = "http://www.w3.org/2002/07/owl#";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

function setup() {
  const store = new Store();
  const g = nn("urn:vg:data");
  store.addQuad(quad(nn("http://x/A"), nn(`${OWL}equivalentClass`), bn("h0000001"), g));
  store.addQuad(quad(bn("h0000001"), nn(RDF_TYPE), nn(`${OWL}Restriction`), g));
  store.addQuad(quad(bn("h0000001"), nn(`${OWL}onProperty`), nn("http://x/p"), g));
  return { store, view: skolemView(store, DataFactory), engine: new QueryEngine() };
}
const rows = async (engine: QueryEngine, view: unknown, q: string) => {
  const res: any = await engine.query(q, { sources: [view as any], unionDefaultGraph: true });
  const out: Record<string, string>[] = [];
  for await (const b of await res.execute()) { const r: Record<string, string> = {}; for (const [v, t] of b) r[v.value] = t.value; out.push(r); }
  return out;
};

describe("SPARQL over the store with real blank nodes, addressed by skolem IRI", () => {
  it("returns a blank node as its skolem IRI", async () => {
    const { view, engine } = setup();
    const r = await rows(engine, view, `SELECT ?r WHERE { <http://x/A> <${OWL}equivalentClass> ?r }`);
    expect(r).toEqual([{ r: "urn:vg:bnode:h0000001" }]);
  });

  it("a skolem IRI in a pattern matches the blank node, not a variable", async () => {
    const { view, engine } = setup();
    const r = await rows(engine, view, `SELECT ?p ?o WHERE { <urn:vg:bnode:h0000001> ?p ?o }`);
    expect(r.map((x) => x.p).sort()).toEqual([RDF_TYPE, `${OWL}onProperty`].sort());
  });

  it("DELETE DATA with a skolem IRI removes the quad about the blank node", async () => {
    const { store, view, engine } = setup();
    await (await engine.query(`DELETE DATA { GRAPH <urn:vg:data> { <urn:vg:bnode:h0000001> <${OWL}onProperty> <http://x/p> } }`, { sources: [view as any], destination: view as any } as any) as any).execute();
    expect(store.countQuads(bn("h0000001"), nn(`${OWL}onProperty`), null, null)).toBe(0);
    expect(store.countQuads(bn("h0000001"), nn(RDF_TYPE), null, null)).toBe(1);
  });

  it("INSERT DATA with a skolem IRI adds a real blank node to the store", async () => {
    const { store, view, engine } = setup();
    await (await engine.query(`INSERT DATA { GRAPH <urn:vg:data> { <urn:vg:bnode:h0000002> <http://x/label> "r2" } }`, { sources: [view as any], destination: view as any } as any) as any).execute();
    const added = store.getQuads(null, nn("http://x/label"), null, null);
    expect(added).toHaveLength(1);
    expect(added[0].subject.termType).toBe("BlankNode");
    expect(added[0].subject.value).toBe("h0000002");
  });

  it("plain IRIs and literals are untouched", async () => {
    const { store, view, engine } = setup();
    store.addQuad(quad(nn("http://x/a"), nn("http://x/p"), literal("v"), nn("urn:vg:data")));
    const r = await rows(engine, view, `SELECT ?o WHERE { <http://x/a> <http://x/p> ?o }`);
    expect(r).toEqual([{ o: "v" }]);
  });
});
