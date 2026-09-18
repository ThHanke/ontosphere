// @vitest-environment node
/**
 * Konclude DL reasoning: someValuesFrom restrictions + ABox realization.
 *
 * Mirrors the pizza demo ontology: three named pizza classes each defined by
 * owl:equivalentClass (owl:Restriction owl:onProperty ex:hasPart
 *                       owl:someValuesFrom ex:<Topping>).
 * Three individuals each with a hasPart link to a topping individual.
 * Expected inferences: pizza1 rdf:type SalamiPizza, etc.
 *
 * Key finding (discovered via bisection, 2026-05):
 *   Konclude requires `a owl:Class` on classes that carry owl:equivalentClass
 *   restrictions. Without it, realization fires TBox hierarchy but skips ABox
 *   individual classification. All three blank-node forms work once this is
 *   present: genuine blank nodes, urn:vg:bnode:* NamedNodes, and named IRIs.
 *
 * Variants test different blank-node representations used in the rdfManager
 * skolemization pipeline:
 *
 *  1. CLEAN TURTLE   — inline blank-node syntax, no skolemization.
 *  2. SKOLEM ONLY    — urn:vg:bnode:* NamedNodes passed directly to Konclude
 *                      (no deskolemization). Tests that the npm package handles
 *                      them as NamedNodes (not as blank nodes).
 *  3. NAMED NODES    — restriction nodes as ex:R1/R2/R3. Control.
 *
 * Uses RdfReasoner.materialize() directly (no rdfManager worker) so it runs in
 * Node.js without browser Worker / SharedArrayBuffer setup.
 */
import { describe, it, expect } from "vitest";
import { RdfReasoner, INFERRED_GRAPH_IRI } from "rdf-reasoner-konclude";
import * as N3 from "n3";

const EX = "http://example.org/pizza-konclude-test#";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const OWL_EQUIVALENT_CLASS = "http://www.w3.org/2002/07/owl#equivalentClass";
const OWL_RESTRICTION = "http://www.w3.org/2002/07/owl#Restriction";
const OWL_ON_PROPERTY = "http://www.w3.org/2002/07/owl#onProperty";
const OWL_SOME_VALUES_FROM = "http://www.w3.org/2002/07/owl#someValuesFrom";
const OWL_OBJECT_PROPERTY = "http://www.w3.org/2002/07/owl#ObjectProperty";
const OWL_CLASS = "http://www.w3.org/2002/07/owl#Class";
const OWL_NAMED_INDIVIDUAL = "http://www.w3.org/2002/07/owl#NamedIndividual";
const RDFS_SUB_CLASS_OF = "http://www.w3.org/2000/01/rdf-schema#subClassOf";
const RDFS_DOMAIN = "http://www.w3.org/2000/01/rdf-schema#domain";

const PIZZA_TURTLE = `
@prefix ex: <${EX}> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

# TBox
ex:Pizza            a owl:Class .
ex:PizzaTopping     a owl:Class .
ex:SalamiTopping    a owl:Class ; rdfs:subClassOf ex:PizzaTopping .
ex:PineappleTopping a owl:Class ; rdfs:subClassOf ex:PizzaTopping .
ex:TomatoTopping    a owl:Class ; rdfs:subClassOf ex:PizzaTopping .

ex:hasPart a owl:ObjectProperty ; rdfs:domain ex:Pizza .

ex:SalamiPizza    a owl:Class ; rdfs:subClassOf ex:Pizza ;
                  owl:equivalentClass [ a owl:Restriction ; owl:onProperty ex:hasPart ; owl:someValuesFrom ex:SalamiTopping ] .
ex:HawaiianPizza  a owl:Class ; rdfs:subClassOf ex:Pizza ;
                  owl:equivalentClass [ a owl:Restriction ; owl:onProperty ex:hasPart ; owl:someValuesFrom ex:PineappleTopping ] .
ex:MargheritaPizza a owl:Class ; rdfs:subClassOf ex:Pizza ;
                  owl:equivalentClass [ a owl:Restriction ; owl:onProperty ex:hasPart ; owl:someValuesFrom ex:TomatoTopping ] .

# ABox
ex:pizza1   a owl:NamedIndividual ; ex:hasPart ex:salami1 .
ex:salami1  a owl:NamedIndividual, ex:SalamiTopping .

ex:pizza2      a owl:NamedIndividual ; ex:hasPart ex:pineapple1 .
ex:pineapple1  a owl:NamedIndividual, ex:PineappleTopping .

ex:pizza3  a owl:NamedIndividual ; ex:hasPart ex:tom1 .
ex:tom1    a owl:NamedIndividual, ex:TomatoTopping .
`;

function parseTurtle(turtle: string): N3.Store {
  const store = new N3.Store();
  store.addQuads(new N3.Parser({ format: "text/turtle" }).parse(turtle));
  return store;
}

/** Skolemize blank nodes to urn:vg:bnode:* named nodes, exactly as rdfManager.impl.ts does. */
function skolemize(store: N3.Store): N3.Store {
  const BNODE_PREFIX = "urn:vg:bnode:";
  const out = new N3.Store();
  for (const q of store.getQuads(null, null, null, null)) {
    const subj = q.subject.termType === "BlankNode"
      ? N3.DataFactory.namedNode(BNODE_PREFIX + q.subject.value)
      : q.subject;
    const obj = q.object.termType === "BlankNode"
      ? N3.DataFactory.namedNode(BNODE_PREFIX + q.object.value)
      : q.object;
    out.addQuad(N3.DataFactory.quad(subj, q.predicate, obj, q.graph));
  }
  return out;
}


function logInferred(store: N3.Store, label: string): N3.Quad[] {
  const inferredGraph = N3.DataFactory.namedNode(INFERRED_GRAPH_IRI);
  const quads = store.getQuads(null, null, null, inferredGraph);
  console.log(`\n[TEST] ${label} — inferred count: ${quads.length}`);
  for (const q of quads) {
    const fmt = (t: N3.Term) =>
      t.termType === "BlankNode" ? `_:${t.value}` :
      t.termType === "NamedNode" ? t.value.replace(EX, "ex:").replace("http://www.w3.org/2002/07/owl#", "owl:").replace("http://www.w3.org/1999/02/22-rdf-syntax-ns#", "rdf:").replace("http://www.w3.org/2000/01/rdf-schema#", "rdfs:") :
      `"${t.value}"`;
    console.log(`  ${fmt(q.subject)} ${fmt(q.predicate)} ${fmt(q.object)}`);
  }
  return quads;
}

function expectPizzaClassification(quads: N3.Quad[], label: string) {
  const has = (s: string, p: string, o: string) =>
    quads.some(q => q.subject.value === s && q.predicate.value === p && q.object.value === o);

  expect(has(`${EX}pizza1`, RDF_TYPE, `${EX}SalamiPizza`),
    `${label}: pizza1 rdf:type SalamiPizza`).toBe(true);
  expect(has(`${EX}pizza2`, RDF_TYPE, `${EX}HawaiianPizza`),
    `${label}: pizza2 rdf:type HawaiianPizza`).toBe(true);
  expect(has(`${EX}pizza3`, RDF_TYPE, `${EX}MargheritaPizza`),
    `${label}: pizza3 rdf:type MargheritaPizza`).toBe(true);
}

describe("Konclude DL reasoning: someValuesFrom restrictions + ABox realization", () => {
  let reasoner: RdfReasoner;

  it("setup: init Konclude reasoner", async () => {
    try {
      reasoner = new RdfReasoner();
      await reasoner.ready;
    } catch (e) {
      console.warn("[TEST] Konclude WASM unavailable — skipping all:", String(e));
    }
  }, 30000);

  it(
    "VARIANT 1 — CLEAN TURTLE: inline blank nodes, no skolemization",
    async () => {
      if (!reasoner) return;
      const store = parseTurtle(PIZZA_TURTLE);
      const bnodes = store.getQuads(null, null, null, null).filter(q => q.subject.termType === "BlankNode");
      console.log(`[TEST] blank nodes in store: ${new Set(bnodes.map(q => q.subject.value)).size}`);

      const r = new RdfReasoner();
      await r.ready;
      try {
        await r.materialize(store, { includeClassHierarchy: true });
      } finally {
        r.terminate();
      }

      const inferred = logInferred(store, "CLEAN TURTLE");
      expectPizzaClassification(inferred, "CLEAN TURTLE");
    },
    30000,
  );

  it(
    "VARIANT 2 — SKOLEM ONLY (no deskolem): urn:vg:bnode:* as NamedNodes passed directly to Konclude",
    async () => {
      if (!reasoner) return;

      // Step 1: parse clean Turtle
      const clean = parseTurtle(PIZZA_TURTLE);
      // Step 2: skolemize (as rdfManager.impl.ts does at write time)
      const skolemized = skolemize(clean);
      const skolemSubjects = new Set(
        skolemized.getQuads(null, null, null, null)
          .map(q => q.subject.value)
          .filter(v => v.startsWith("urn:vg:bnode:"))
      );
      console.log(`[TEST] skolemized bnode IRIs: ${skolemSubjects.size}`, [...skolemSubjects]);
      // NO deskolemization — pass urn:vg:bnode:* as NamedNodes directly to Konclude

      const r = new RdfReasoner();
      await r.ready;
      try {
        await r.materialize(skolemized, { includeClassHierarchy: true });
      } finally {
        r.terminate();
      }

      const inferred = logInferred(skolemized, "SKOLEM ONLY");
      expectPizzaClassification(inferred, "SKOLEM ONLY");
    },
    30000,
  );

  it(
    "VARIANT 3 — NAMED NODES: restriction nodes as ex:R1/R2/R3 (no blank nodes, control)",
    async () => {
      if (!reasoner) return;
      const store = new N3.Store();
      const nn = N3.DataFactory.namedNode;
      const quad = N3.DataFactory.quad;
      const dg = N3.DataFactory.defaultGraph();

      const R1 = nn(`${EX}R1`), R2 = nn(`${EX}R2`), R3 = nn(`${EX}R3`);
      const triples: N3.Quad[] = [
        quad(nn(`${EX}Pizza`),            nn(RDF_TYPE),            nn(OWL_CLASS), dg),
        quad(nn(`${EX}PizzaTopping`),     nn(RDF_TYPE),            nn(OWL_CLASS), dg),
        quad(nn(`${EX}SalamiTopping`),    nn(RDF_TYPE),            nn(OWL_CLASS), dg),
        quad(nn(`${EX}SalamiTopping`),    nn(RDFS_SUB_CLASS_OF),   nn(`${EX}PizzaTopping`), dg),
        quad(nn(`${EX}PineappleTopping`), nn(RDF_TYPE),            nn(OWL_CLASS), dg),
        quad(nn(`${EX}PineappleTopping`), nn(RDFS_SUB_CLASS_OF),   nn(`${EX}PizzaTopping`), dg),
        quad(nn(`${EX}TomatoTopping`),    nn(RDF_TYPE),            nn(OWL_CLASS), dg),
        quad(nn(`${EX}TomatoTopping`),    nn(RDFS_SUB_CLASS_OF),   nn(`${EX}PizzaTopping`), dg),
        quad(nn(`${EX}hasPart`),          nn(RDF_TYPE),            nn(OWL_OBJECT_PROPERTY), dg),
        quad(nn(`${EX}hasPart`),          nn(RDFS_DOMAIN),         nn(`${EX}Pizza`), dg),
        // R1 = hasPart some SalamiTopping
        quad(R1, nn(RDF_TYPE),            nn(OWL_RESTRICTION), dg),
        quad(R1, nn(OWL_ON_PROPERTY),     nn(`${EX}hasPart`), dg),
        quad(R1, nn(OWL_SOME_VALUES_FROM),nn(`${EX}SalamiTopping`), dg),
        quad(nn(`${EX}SalamiPizza`),      nn(RDF_TYPE),            nn(OWL_CLASS), dg),
        quad(nn(`${EX}SalamiPizza`),      nn(RDFS_SUB_CLASS_OF),   nn(`${EX}Pizza`), dg),
        quad(nn(`${EX}SalamiPizza`),      nn(OWL_EQUIVALENT_CLASS),R1, dg),
        // R2 = hasPart some PineappleTopping
        quad(R2, nn(RDF_TYPE),            nn(OWL_RESTRICTION), dg),
        quad(R2, nn(OWL_ON_PROPERTY),     nn(`${EX}hasPart`), dg),
        quad(R2, nn(OWL_SOME_VALUES_FROM),nn(`${EX}PineappleTopping`), dg),
        quad(nn(`${EX}HawaiianPizza`),    nn(RDF_TYPE),            nn(OWL_CLASS), dg),
        quad(nn(`${EX}HawaiianPizza`),    nn(RDFS_SUB_CLASS_OF),   nn(`${EX}Pizza`), dg),
        quad(nn(`${EX}HawaiianPizza`),    nn(OWL_EQUIVALENT_CLASS),R2, dg),
        // R3 = hasPart some TomatoTopping
        quad(R3, nn(RDF_TYPE),            nn(OWL_RESTRICTION), dg),
        quad(R3, nn(OWL_ON_PROPERTY),     nn(`${EX}hasPart`), dg),
        quad(R3, nn(OWL_SOME_VALUES_FROM),nn(`${EX}TomatoTopping`), dg),
        quad(nn(`${EX}MargheritaPizza`),  nn(RDF_TYPE),            nn(OWL_CLASS), dg),
        quad(nn(`${EX}MargheritaPizza`),  nn(RDFS_SUB_CLASS_OF),   nn(`${EX}Pizza`), dg),
        quad(nn(`${EX}MargheritaPizza`),  nn(OWL_EQUIVALENT_CLASS),R3, dg),
        // ABox
        quad(nn(`${EX}pizza1`),    nn(RDF_TYPE),         nn(OWL_NAMED_INDIVIDUAL), dg),
        quad(nn(`${EX}pizza1`),    nn(`${EX}hasPart`),   nn(`${EX}salami1`), dg),
        quad(nn(`${EX}salami1`),   nn(RDF_TYPE),         nn(`${EX}SalamiTopping`), dg),
        quad(nn(`${EX}pizza2`),    nn(RDF_TYPE),         nn(OWL_NAMED_INDIVIDUAL), dg),
        quad(nn(`${EX}pizza2`),    nn(`${EX}hasPart`),   nn(`${EX}pineapple1`), dg),
        quad(nn(`${EX}pineapple1`),nn(RDF_TYPE),         nn(`${EX}PineappleTopping`), dg),
        quad(nn(`${EX}pizza3`),    nn(RDF_TYPE),         nn(OWL_NAMED_INDIVIDUAL), dg),
        quad(nn(`${EX}pizza3`),    nn(`${EX}hasPart`),   nn(`${EX}tom1`), dg),
        quad(nn(`${EX}tom1`),      nn(RDF_TYPE),         nn(`${EX}TomatoTopping`), dg),
      ];
      store.addQuads(triples);

      const r = new RdfReasoner();
      await r.ready;
      try {
        await r.materialize(store, { includeClassHierarchy: true });
      } finally {
        r.terminate();
      }

      const inferred = logInferred(store, "NAMED NODES");
      expectPizzaClassification(inferred, "NAMED NODES");
    },
    30000,
  );
});
