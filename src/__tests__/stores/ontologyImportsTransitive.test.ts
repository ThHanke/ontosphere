// owl:imports are followed transitively, each URL once, and a failed import does not stop the others.
import { describe, it, expect, afterEach, vi } from "vitest";
import { useOntologyStore } from "../../stores/ontologyStore";

const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const OWL_ONTOLOGY = "http://www.w3.org/2002/07/owl#Ontology";
const OWL_IMPORTS = "http://www.w3.org/2002/07/owl#imports";
const U = (n: string) => `https://example.org/${n}.ttl`;

describe("discoverReferencedOntologies follows owl:imports transitively", () => {
  const saved = { rdfManager: useOntologyStore.getState().rdfManager, loadOntology: useOntologyStore.getState().loadOntology };
  afterEach(() => {
    useOntologyStore.setState({ ...saved, loadedOntologies: [] } as any);
  });

  it("loads A -> {B (fails), C}, C -> D, D -> A (cycle) and reports the failure", async () => {
    // imports per ontology document; what the ontologies graph holds after each load
    const importsOf: Record<string, string[]> = { [U("a")]: [U("b"), U("c")], [U("c")]: [U("d")], [U("d")]: [U("a")] };
    const loaded = new Set<string>([U("a")]); // A is the explicitly loaded ontology
    const fetchQuadsPage = vi.fn(async (_graph: string, _offset: number, limit: number, opts: any) => {
      const pred = opts?.filter?.predicate;
      const items: any[] = [];
      for (const doc of loaded) {
        if (pred === RDF_TYPE) items.push({ subject: doc, predicate: RDF_TYPE, object: OWL_ONTOLOGY });
        if (pred === OWL_IMPORTS) for (const i of importsOf[doc] ?? []) items.push({ subject: doc, predicate: OWL_IMPORTS, object: i });
      }
      return { items, total: items.length, limit };
    });
    const loadOntology = vi.fn(async (url: string) => {
      if (url === U("b")) return { success: false, error: "404" };
      loaded.add(url);
      return { success: true, url };
    });
    useOntologyStore.setState({
      rdfManager: { fetchQuadsPage, emitAllSubjects: vi.fn(async () => {}) } as any,
      loadOntology: loadOntology as any,
      loadedOntologies: [{ url: U("a"), name: "A" }] as any,
    } as any);

    const res: any = await useOntologyStore.getState().discoverReferencedOntologies!({
      graphName: "urn:vg:ontologies", load: "async", unconditional: true,
    });

    expect(loadOntology.mock.calls.map((c) => c[0])).toEqual([U("b"), U("c"), U("d")]);
    expect(res.results).toEqual([
      { url: U("b"), status: "fail", error: "404" },
      { url: U("c"), status: "ok" },
      { url: U("d"), status: "ok" },
    ]);
  });
});
