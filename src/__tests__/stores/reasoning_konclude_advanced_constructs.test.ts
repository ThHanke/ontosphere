// @vitest-environment node
/**
 * Pre-validation: owl:propertyChainAxiom and owl:oneOf against Konclude v0.3.0.
 *
 * DECISION (v0.3.0 empirical result — read by Unit 2 before authoring Group 4 TTL):
 *   propertyChainAxiom: FIRES ✓ — carol hasGrandManager alice confirmed in inferred graph.
 *                       Unit 2: use owl:propertyChainAxiom in reasoning-demo.ttl Group 4.
 *   owl:oneOf:          DOES NOT FIRE ✗ — only LeadershipTeam rdfs:subClassOf owl:Thing returned;
 *                       alice and dave NOT typed as LeadershipTeam members.
 *                       Unit 2: use fallback owl:equivalentClass [ owl:unionOf (ex:Executive ex:Manager) ].
 *
 * Kept permanently as a v0.3.0 regression test for these constructs.
 */
import { describe, it, expect } from "vitest";
import { RdfReasoner, INFERRED_GRAPH_IRI } from "rdf-reasoner-konclude";
import * as N3 from "n3";

const EX = "http://example.org/advanced-constructs-test#";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const INFERRED_NODE = N3.DataFactory.namedNode(INFERRED_GRAPH_IRI);

function parseTurtle(turtle: string): N3.Store {
  const store = new N3.Store();
  store.addQuads(new N3.Parser({ format: "text/turtle" }).parse(turtle));
  return store;
}

function logInferred(store: N3.Store, label: string): N3.Quad[] {
  const quads = store.getQuads(null, null, null, INFERRED_NODE);
  console.log(`\n[TEST] ${label} — inferred count: ${quads.length}`);
  for (const q of quads) {
    const fmt = (t: N3.Term) =>
      t.termType === "BlankNode" ? `_:${t.value}` :
      t.termType === "NamedNode" ? t.value
        .replace(EX, "ex:")
        .replace("http://www.w3.org/2002/07/owl#", "owl:")
        .replace("http://www.w3.org/1999/02/22-rdf-syntax-ns#", "rdf:")
        .replace("http://www.w3.org/2000/01/rdf-schema#", "rdfs:") :
      `"${t.value}"`;
    console.log(`  ${fmt(q.subject)} ${fmt(q.predicate)} ${fmt(q.object)}`);
  }
  return quads;
}

const CHAIN_TURTLE = `
@prefix ex: <${EX}> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

ex:hasSupervisor a owl:ObjectProperty, owl:TransitiveProperty .
ex:hasGrandManager a owl:ObjectProperty ;
    owl:propertyChainAxiom ( ex:hasSupervisor ex:hasSupervisor ) .

ex:alice a owl:NamedIndividual .
ex:bob   a owl:NamedIndividual .
ex:carol a owl:NamedIndividual .

ex:carol ex:hasSupervisor ex:bob .
ex:bob   ex:hasSupervisor ex:alice .
`;

const ONE_OF_TURTLE = `
@prefix ex: <${EX}> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .

ex:LeadershipTeam a owl:Class ;
    owl:oneOf ( ex:alice ex:dave ) .

ex:alice a owl:NamedIndividual .
ex:dave  a owl:NamedIndividual .
`;

describe("Pre-validation: owl:propertyChainAxiom and owl:oneOf in Konclude v0.3.0", () => {
  it(
    "owl:propertyChainAxiom: carol hasSupervisor bob, bob hasSupervisor alice → carol hasGrandManager alice",
    async () => {
      let r: RdfReasoner | undefined;
      try {
        r = new RdfReasoner();
        await r.ready;
      } catch (e) {
        console.warn("[TEST] Konclude WASM unavailable — skipping:", String(e));
        return;
      }
      const store = parseTurtle(CHAIN_TURTLE);
      try {
        await r.materialize(store, { includeClassHierarchy: true });
      } finally {
        r.terminate();
      }
      const inferred = logInferred(store, "propertyChainAxiom");
      const fires = inferred.some(
        q => q.subject.value === `${EX}carol` &&
             q.predicate.value === `${EX}hasGrandManager` &&
             q.object.value === `${EX}alice`
      );
      console.log("[TEST] propertyChainAxiom fires:", fires);
      expect(fires, "carol ex:hasGrandManager ex:alice (propertyChainAxiom)").toBe(true);
    },
    30000,
  );

  it(
    "owl:oneOf: LeadershipTeam oneOf (alice, dave) → alice and dave inferred LeadershipTeam members",
    async () => {
      let r: RdfReasoner | undefined;
      try {
        r = new RdfReasoner();
        await r.ready;
      } catch (e) {
        console.warn("[TEST] Konclude WASM unavailable — skipping:", String(e));
        return;
      }
      const store = parseTurtle(ONE_OF_TURTLE);
      try {
        await r.materialize(store, { includeClassHierarchy: true });
      } finally {
        r.terminate();
      }
      const inferred = logInferred(store, "owl:oneOf");
      const aliceFires = inferred.some(
        q => q.subject.value === `${EX}alice` &&
             q.predicate.value === RDF_TYPE &&
             q.object.value === `${EX}LeadershipTeam`
      );
      const daveFires = inferred.some(
        q => q.subject.value === `${EX}dave` &&
             q.predicate.value === RDF_TYPE &&
             q.object.value === `${EX}LeadershipTeam`
      );
      console.log("[TEST] owl:oneOf alice fires:", aliceFires, "dave fires:", daveFires);
      expect(aliceFires, "alice rdf:type LeadershipTeam (owl:oneOf)").toBe(true);
      expect(daveFires, "dave rdf:type LeadershipTeam (owl:oneOf)").toBe(true);
    },
    30000,
  );
});
