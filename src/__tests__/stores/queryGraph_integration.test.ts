// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { initRdfManagerWorker } from "../utils/initRdfManagerWorker";
import { rdfManager } from "../../utils/rdfManager";

const GRAPH = "urn:vg:data";

const TURTLE_FIXTURE = `
@prefix ex: <http://example.org/sparql-test/> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

ex:Alice a ex:Person ;
    rdfs:label "Alice" ;
    ex:knows ex:Bob .

ex:Bob a ex:Person ;
    rdfs:label "Bob" .

ex:Charlie a ex:Robot ;
    rdfs:label "Charlie" .
`.trim();

describe("sparqlQuery worker command (Comunica integration)", () => {
  beforeEach(async () => {
    await initRdfManagerWorker();
    rdfManager.clear();
    await new Promise((r) => setTimeout(r, 100));
  });

  it("SELECT returns correct bindings", async () => {
    await rdfManager.loadRDFIntoGraph(TURTLE_FIXTURE, GRAPH, "text/turtle");
    await new Promise((r) => setTimeout(r, 300));

    const result = await rdfManager.sparqlQuery(
      `SELECT ?s ?label WHERE {
         ?s a <http://example.org/sparql-test/Person> .
         ?s <http://www.w3.org/2000/01/rdf-schema#label> ?label .
       } ORDER BY ?label`,
      { limit: 50 }
    );

    expect(result.type).toBe("select");
    expect(Array.isArray(result.rows)).toBe(true);
    expect(result.rows.length).toBe(2);
    const labels = result.rows.map((r: Record<string, string>) => r.label);
    expect(labels).toEqual(["Alice", "Bob"]);
  }, 30000);

  it("CONSTRUCT returns correct triples", async () => {
    await rdfManager.loadRDFIntoGraph(TURTLE_FIXTURE, GRAPH, "text/turtle");
    await new Promise((r) => setTimeout(r, 300));

    const result = await rdfManager.sparqlQuery(
      `CONSTRUCT { ?s <http://example.org/sparql-test/knows> ?o }
       WHERE    { ?s <http://example.org/sparql-test/knows> ?o }`,
      { limit: 50 }
    );

    expect(result.type).toBe("construct");
    expect(Array.isArray(result.triples)).toBe(true);
    expect(result.triples.length).toBe(1);
    expect(result.triples[0]).toMatchObject({
      s: "http://example.org/sparql-test/Alice",
      p: "http://example.org/sparql-test/knows",
      o: "http://example.org/sparql-test/Bob",
    });
  }, 30000);

  it("LIMIT is respected", async () => {
    await rdfManager.loadRDFIntoGraph(TURTLE_FIXTURE, GRAPH, "text/turtle");
    await new Promise((r) => setTimeout(r, 300));

    const result = await rdfManager.sparqlQuery(
      `SELECT ?s WHERE { ?s a <http://example.org/sparql-test/Person> }`,
      { limit: 1 }
    );

    expect(result.type).toBe("select");
    expect(result.rows.length).toBeLessThanOrEqual(1);
  }, 30000);

  it("PREFIX declarations in query string are resolved correctly", async () => {
    await rdfManager.loadRDFIntoGraph(TURTLE_FIXTURE, GRAPH, "text/turtle");
    await new Promise((r) => setTimeout(r, 300));

    const result = await rdfManager.sparqlQuery(
      `PREFIX ex: <http://example.org/sparql-test/>
       PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
       SELECT ?s ?label WHERE {
         ?s a ex:Person .
         ?s rdfs:label ?label .
       } ORDER BY ?label`,
      { limit: 50 }
    );

    expect(result.type).toBe("select");
    expect(result.rows.length).toBe(2);
    const labels = result.rows.map((r: Record<string, string>) => r.label);
    expect(labels).toEqual(["Alice", "Bob"]);
  }, 30000);

  it("auto-injected prefixes from loaded Turtle resolve in query", async () => {
    await rdfManager.loadRDFIntoGraph(TURTLE_FIXTURE, GRAPH, "text/turtle");
    await new Promise((r) => setTimeout(r, 300));

    // Mimic what injectPrefixes() does in the MCP queryGraph tool:
    // pull registered namespaces and prepend PREFIX lines.
    const namespaces = rdfManager.getNamespaces();
    const prefixLines = namespaces
      .filter(ns => ns.prefix && ns.uri)
      .map(ns => `PREFIX ${ns.prefix}: <${ns.uri}>`)
      .join("\n");
    const sparql = `${prefixLines}\nSELECT ?s WHERE { ?s a ex:Person }`;

    const result = await rdfManager.sparqlQuery(sparql, { limit: 50 });

    expect(result.type).toBe("select");
    expect(result.rows.length).toBe(2);
  }, 30000);

  it("INSERT → SELECT → CONSTRUCT → UPDATE → DELETE lifecycle", async () => {
    await rdfManager.loadRDFIntoGraph(TURTLE_FIXTURE, GRAPH, "text/turtle");
    await new Promise((r) => setTimeout(r, 300));

    const EX = "http://example.org/sparql-test/";
    const RDFS_LABEL = "http://www.w3.org/2000/01/rdf-schema#label";
    const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

    // 1. INSERT Dave
    const ins = await rdfManager.sparqlQuery(
      `INSERT DATA { GRAPH <${GRAPH}> {
         <${EX}Dave> a <${EX}Person> .
         <${EX}Dave> <${RDFS_LABEL}> "Dave" .
       } }`
    );
    expect(ins.type).toBe("update");

    // 2. SELECT — Dave must appear alongside Alice and Bob
    const sel1 = await rdfManager.sparqlQuery(
      `SELECT ?s ?label WHERE {
         ?s a <${EX}Person> .
         ?s <${RDFS_LABEL}> ?label .
       } ORDER BY ?label`,
      { limit: 10 }
    );
    expect(sel1.type).toBe("select");
    expect(sel1.rows.length).toBe(3);
    expect(sel1.rows.map((r: Record<string,string>) => r.label)).toEqual(["Alice", "Bob", "Dave"]);

    // 3. CONSTRUCT — pull Dave's two triples
    const con = await rdfManager.sparqlQuery(
      `CONSTRUCT { <${EX}Dave> ?p ?o }
       WHERE    { <${EX}Dave> ?p ?o }`,
      { limit: 10 }
    );
    expect(con.type).toBe("construct");
    expect(con.triples.length).toBe(2);
    const preds = con.triples.map((t: { p: string }) => t.p).sort();
    expect(preds).toEqual([RDF_TYPE, RDFS_LABEL].sort());

    // 4. UPDATE — rename Dave → David
    const upd = await rdfManager.sparqlQuery(
      `DELETE { GRAPH <${GRAPH}> { <${EX}Dave> <${RDFS_LABEL}> ?old } }
       INSERT { GRAPH <${GRAPH}> { <${EX}Dave> <${RDFS_LABEL}> "David" } }
       WHERE  { GRAPH <${GRAPH}> { <${EX}Dave> <${RDFS_LABEL}> ?old } }`
    );
    expect(upd.type).toBe("update");

    const sel2 = await rdfManager.sparqlQuery(
      `SELECT ?label WHERE { <${EX}Dave> <${RDFS_LABEL}> ?label }`
    );
    expect(sel2.type).toBe("select");
    expect(sel2.rows[0]?.label).toBe("David");

    // 5. DELETE — remove Dave entirely
    const del = await rdfManager.sparqlQuery(
      `DELETE WHERE { GRAPH <${GRAPH}> { <${EX}Dave> ?p ?o } }`
    );
    expect(del.type).toBe("update");

    const sel3 = await rdfManager.sparqlQuery(
      `SELECT ?s WHERE { ?s a <${EX}Person> }`, { limit: 10 }
    );
    expect(sel3.type).toBe("select");
    expect(sel3.rows.length).toBe(2);
    expect(sel3.rows.map((r: Record<string,string>) => r.s).sort())
      .toEqual([`${EX}Alice`, `${EX}Bob`].sort());
  }, 60000);

  it("no test data present before loading returns zero rows", async () => {
    const result = await rdfManager.sparqlQuery(
      `SELECT ?s WHERE { ?s a <http://example.org/sparql-test/Person> }`
    );

    expect(result.type).toBe("select");
    expect(result.rows.length).toBe(0);
  }, 30000);
});
