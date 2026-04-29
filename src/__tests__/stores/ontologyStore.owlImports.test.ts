// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Parser as N3Parser } from "n3";
import { useOntologyStore } from "../../stores/ontologyStore";
import { rdfManager } from "../../utils/rdfManager";

const MAIN_URL = "https://test.example.org/main-ont.ttl";
const IMPORTED_URL = "https://test.example.org/imported-ont.ttl";

const mainTtl = readFileSync(resolve(__dirname, "../fixtures/ont-with-imports.ttl"), "utf-8");
const importedTtl = readFileSync(resolve(__dirname, "../fixtures/ont-imported.ttl"), "utf-8");

function makeTurtleResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/turtle" },
  });
}

/**
 * Minimal in-memory RDF manager mock. Parses Turtle on loadRDFIntoGraph/loadRDFFromUrl,
 * returns quads via positional fetchQuadsPage(graph, offset, limit, opts) that
 * ontologyStore.fetchSerializedQuads expects.
 */
function makeInMemoryRdfManager() {
  const store: Map<string, Array<{ subject: string; predicate: string; object: string; graph: string }>> = new Map();

  function addQuad(graph: string, s: string, p: string, o: string) {
    let quads = store.get(graph);
    if (!quads) { quads = []; store.set(graph, quads); }
    quads.push({ subject: s, predicate: p, object: o, graph });
  }

  function parseTurtle(text: string, graph: string) {
    const parser = new N3Parser({ format: "Turtle" });
    const quads = parser.parse(text);
    for (const q of quads) {
      addQuad(graph, q.subject.value, q.predicate.value, q.object.value);
    }
  }

  return {
    // loadRDFIntoGraph: parse turtle and store quads
    loadRDFIntoGraph: vi.fn().mockImplementation(async (text: string, graphName: string) => {
      parseTurtle(text, graphName);
    }),

    // loadRDFFromUrl: fetch url and delegate to loadRDFIntoGraph
    loadRDFFromUrl: vi.fn().mockImplementation(async (url: string, graphName: string) => {
      const resp = await fetch(url, { signal: new AbortController().signal, redirect: "follow", headers: {} });
      if (!resp.ok) throw new Error(`fetch failed: ${resp.status}`);
      const text = await resp.text();
      parseTurtle(text, graphName);
    }),

    // Positional fetchQuadsPage (matches RdfPageFetcher interface in ontologyStore)
    fetchQuadsPage: vi.fn().mockImplementation(
      async (graph: string, _offset: number, _limit: number, opts: any) => {
        const all = store.get(graph) || [];
        const predFilter = opts?.filter?.predicate;
        const items = predFilter ? all.filter((q) => q.predicate === predFilter) : all;
        return { items, total: items.length, limit: _limit };
      },
    ),

    emitAllSubjects: vi.fn().mockResolvedValue(undefined),

    clear: vi.fn().mockImplementation(() => { store.clear(); }),
  };
}

describe("loadOntology — owl:imports fire-and-forget discovery", () => {
  let savedRdfManager: any;

  beforeEach(() => {
    savedRdfManager = useOntologyStore.getState().rdfManager;
    useOntologyStore.getState().clearOntologies();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useOntologyStore.setState({ rdfManager: savedRdfManager } as any);
  });

  it("auto-loads owl:imports after explicit loadOntology, even when autoDiscoverOntologies is false", async () => {
    const mockMgr = makeInMemoryRdfManager();
    useOntologyStore.setState({ rdfManager: mockMgr as any } as any);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url === MAIN_URL) return Promise.resolve(makeTurtleResponse(mainTtl));
        if (url === IMPORTED_URL) return Promise.resolve(makeTurtleResponse(importedTtl));
        return Promise.reject(new TypeError(`Unexpected fetch: ${url}`));
      }),
    );

    // Disable autoDiscoverOntologies — fire-and-forget must still run (unconditional:true)
    const { useAppConfigStore } = await import("../../stores/appConfigStore");
    const prevConfig = useAppConfigStore.getState().config;
    useAppConfigStore.setState({
      config: { ...prevConfig, autoDiscoverOntologies: false },
    } as any);

    try {
      await useOntologyStore.getState().loadOntology(MAIN_URL);

      // Wait for fire-and-forget discovery + inner loadOntology to complete
      await vi.waitFor(
        () => {
          const loaded = useOntologyStore.getState().loadedOntologies;
          const urls = loaded.map((o: any) => String(o.url));
          if (!urls.some((u: string) => u.includes("imported-ont"))) {
            throw new Error(`imported-ont not yet in loadedOntologies: ${JSON.stringify(urls)}`);
          }
        },
        { timeout: 5000, interval: 50 },
      );

      const loaded = useOntologyStore.getState().loadedOntologies;
      const urls = loaded.map((o: any) => String(o.url));
      expect(urls.some((u: string) => u.includes("main-ont"))).toBe(true);
      expect(urls.some((u: string) => u.includes("imported-ont"))).toBe(true);
    } finally {
      useAppConfigStore.setState({ config: prevConfig } as any);
    }
  }, 10000);

  it("does not re-trigger discovery for inner loadOntology calls (discovered:true guard)", async () => {
    const mockMgr = makeInMemoryRdfManager();
    useOntologyStore.setState({ rdfManager: mockMgr as any } as any);

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === MAIN_URL) return Promise.resolve(makeTurtleResponse(mainTtl));
      if (url === IMPORTED_URL) return Promise.resolve(makeTurtleResponse(importedTtl));
      return Promise.reject(new TypeError(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    await useOntologyStore.getState().loadOntology(MAIN_URL);

    await vi.waitFor(
      () => {
        const loaded = useOntologyStore.getState().loadedOntologies;
        const urls = loaded.map((o: any) => String(o.url));
        if (!urls.some((u: string) => u.includes("imported-ont"))) {
          throw new Error("imported-ont not yet loaded");
        }
      },
      { timeout: 5000, interval: 50 },
    );

    // Each URL should be fetched exactly once — no infinite recursion
    const mainFetches = fetchMock.mock.calls.filter(([url]: [string]) => url === MAIN_URL).length;
    const importedFetches = fetchMock.mock.calls.filter(([url]: [string]) => url === IMPORTED_URL).length;
    expect(mainFetches).toBe(1);
    expect(importedFetches).toBe(1);
  }, 10000);
});
