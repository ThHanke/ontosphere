// @vitest-environment node
import { describe, it, expect } from "vitest";
import { Readable } from "node:stream";
import { Parser as N3Parser } from "n3";
import { WELL_KNOWN_PREFIXES, resolveOntologyLoadUrl } from "../../utils/wellKnownOntologies";

async function fetchAndParse(url: string): Promise<number> {
  const resp = await fetch(url, {
    headers: { Accept: "text/turtle, application/rdf+xml, application/n-triples, text/n3, */*;q=0.1" },
    redirect: "follow",
  });

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} from ${url}`);
  }

  const body = await resp.text();
  const contentType = (resp.headers.get("content-type") || "").toLowerCase();

  const isRdfXml =
    contentType.includes("application/rdf+xml") ||
    contentType.includes("text/xml") ||
    contentType.includes("application/xml") ||
    url.endsWith(".rdf") ||
    url.endsWith(".owl") ||
    body.trimStart().startsWith("<?xml") ||
    body.trimStart().startsWith("<rdf:");

  if (isRdfXml) {
    const { RdfXmlParser } = await import("rdfxml-streaming-parser");
    return new Promise<number>((resolve, reject) => {
      const parser = new RdfXmlParser();
      let count = 0;
      parser.on("data", () => { count++; });
      parser.on("end", () => resolve(count));
      parser.on("error", (err: Error) => reject(new Error(`RDF/XML parse error from ${url}: ${err.message}`)));
      const readable = Readable.from([body]);
      readable.pipe(parser);
    });
  }

  // Try N3 (Turtle / N-Triples / N3 / TriG)
  try {
    const parser = new N3Parser();
    const quads = parser.parse(body);
    return quads.length;
  } catch (n3Err: any) {
    throw new Error(
      `Unknown RDF format from ${url} (content-type: ${contentType}): ${n3Err.message}`,
    );
  }
}

describe("well-known ontology reachability", () => {
  for (const entry of WELL_KNOWN_PREFIXES) {
    const loadUrl = resolveOntologyLoadUrl(entry.prefix);

    it(
      `${entry.prefix} — ${loadUrl} resolves and parses as RDF`,
      { timeout: 30000 },
      async () => {
        const count = await fetchAndParse(loadUrl);
        expect(count).toBeGreaterThan(0);
      },
    );
  }
});
