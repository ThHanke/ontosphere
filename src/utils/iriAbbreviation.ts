// Human-readable IRIs for messages, rationales and briefs.
//
// A name in text is either a prefixed name (`inc:frank`, `rdf:type`) that the namespace map resolves,
// or the full IRI. Never a bare local name: it cannot be pasted back into a tool and it is ambiguous
// across namespaces. Prefixes come from the registered namespaces, with the common W3C ones as fallback.

/** prefix (without the colon) to namespace IRI, as the namespace registry and the worker hold it. */
export type NamespaceMap = Record<string, string>;

const BUILTIN_NAMESPACES: NamespaceMap = {
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  owl: 'http://www.w3.org/2002/07/owl#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  sh: 'http://www.w3.org/ns/shacl#',
  skos: 'http://www.w3.org/2004/02/skos/core#',
  dc: 'http://purl.org/dc/elements/1.1/',
  dcterms: 'http://purl.org/dc/terms/',
  prov: 'http://www.w3.org/ns/prov#',
};

const SKOLEM_PREFIX = 'urn:vg:bnode:';

/**
 * `prefix:local` when a namespace with a non-empty prefix matches (the longest namespace wins),
 * `_:label` for a skolemised blank node, otherwise the full IRI unchanged.
 */
export function abbreviateIri(iri: string, namespaces: NamespaceMap = {}): string {
  if (typeof iri !== 'string' || iri.length === 0) return iri;
  if (iri.startsWith(SKOLEM_PREFIX)) return `_:${iri.slice(SKOLEM_PREFIX.length)}`;
  let best: { prefix: string; uri: string } | null = null;
  for (const [prefix, uri] of Object.entries({ ...BUILTIN_NAMESPACES, ...namespaces })) {
    if (!prefix || !uri || !iri.startsWith(uri) || iri.length === uri.length) continue;
    if (!best || uri.length > best.uri.length) best = { prefix, uri };
  }
  return best ? `${best.prefix}:${iri.slice(best.uri.length)}` : iri;
}
