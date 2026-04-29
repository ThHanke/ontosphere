/**
 * Centralized well-known ontology and prefix mappings.
 *
 * New canonical structure:
 *  - WELL_KNOWN_PREFIXES: Array of { prefix, url, name, description }
 *  - WELL_KNOWN_BY_PREFIX: Record<prefix, record>
 *  - WELL_KNOWN_BY_URL: Map<url, prefixes[]>
 *
 * For backwards compatibility we also export a derived WELL_KNOWN object
 * with `prefixes` and `ontologies` keys to minimize churn in the codebase.
 *
 * When adding entries prefer the simple WELL_KNOWN_PREFIXES array.
 */

export const WELL_KNOWN_PREFIXES = [
  {
    prefix: "rdf",
    url: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    name: "RDF - The RDF Concepts Vocabulary",
    description: "Fundamental RDF concepts: resources, properties, literals and statements",
    isCore: true,
    ontologyUrl: "https://www.w3.org/1999/02/22-rdf-syntax-ns",
  },
  {
    prefix: "rdfs",
    url: "http://www.w3.org/2000/01/rdf-schema#",
    name: "RDFS - The RDF Schema Vocabulary",
    description: "RDF Schema: classes, properties, subclass and subproperty hierarchies",
    isCore: true,
    ontologyUrl: "https://www.w3.org/2000/01/rdf-schema",
  },
  {
    prefix: "owl",
    url: "http://www.w3.org/2002/07/owl#",
    name: "OWL",
    description: "Web Ontology Language: expressive class and property axioms, reasoning",
    isCore: true,
    ontologyUrl: "https://www.w3.org/2002/07/owl",
  },
  {
    prefix: "xsd",
    url: "http://www.w3.org/2001/XMLSchema#",
    name: "XSD",
    description: "XML Schema Datatypes: string, integer, date, boolean and other primitives",
    isCore: true,
  },
  {
    prefix: "skos",
    url: "http://www.w3.org/2004/02/skos/core#",
    name: "SKOS",
    description: "Simple Knowledge Organization System: thesauri, taxonomies and classification schemes",
    ontologyUrl: "https://www.w3.org/2009/08/skos-reference/skos.rdf",
  },
  {
    prefix: "prov",
    url: "http://www.w3.org/ns/prov#",
    name: "PROV-O - The PROV Ontology",
    description: "Provenance: entities, activities, agents and their causal relationships",
    ontologyUrl: "https://www.w3.org/ns/prov-o",
  },
  {
    prefix: "p-plan",
    url: "http://purl.org/net/p-plan#",
    name: "P-Plan - The P-Plan Ontology",
    description: "Scientific workflow provenance: plans, steps and entities extending PROV-O",
    ontologyUrl: "https://lov.linkeddata.es/dataset/lov/vocabs/p-plan/versions/2014-03-12.n3",
  },
  {
    prefix: "bfo",
    url: "http://purl.obolibrary.org/obo/BFO_",
    name: "BFO 2 - Basic Formal Ontology 2.0",
    description: "Upper-level foundational ontology for biomedical and scientific domains",
    ontologyUrl: "https://raw.githubusercontent.com/BFO-ontology/BFO/master/releases/2.0/bfo.owl",
  },
  {
    prefix: "bfo2020",
    url: "https://basic-formal-ontology.org/2020/formulas/owl/",
    name: "BFO 2020 - Basic Formal Ontology 2020",
    description: "ISO/IEC 21838-compliant update of Basic Formal Ontology",
    ontologyUrl: "https://raw.githubusercontent.com/BFO-ontology/BFO-2020/master/21838-2/owl/bfo-core.owl",
  },
  {
    prefix: "dcat",
    url: "http://www.w3.org/ns/dcat#",
    name: "DCAT - Data Catalog Vocabulary",
    description: "Data catalogs: datasets, distributions, data services and catalog records",
    ontologyUrl: "https://www.w3.org/ns/dcat2",
  },
  {
    prefix: "qudt",
    url: "http://qudt.org/schema/qudt/",
    name: "QUDT - Quantities, Units, Dimensions and Types",
    description: "Measurement schema: quantity kinds, units, dimensions and numeric values",
    ontologyUrl: "https://qudt.org/2.1/schema/qudt.ttl",
  },
  {
    prefix: "unit",
    url: "http://qudt.org/vocab/unit/",
    name: "QUDT Units Vocabulary",
    description: "Concrete SI and non-SI units of measure (metre, kilogram, second, …)",
    ontologyUrl: "https://qudt.org/2.1/vocab/unit",
  },
  {
    prefix: "dcterms",
    url: "http://purl.org/dc/terms/",
    name: "Dublin Core Terms",
    description: "General metadata: titles, creators, dates, subjects and descriptions",
    ontologyUrl: "https://www.dublincore.org/specifications/dublin-core/dcmi-terms/dublin_core_terms.ttl",
  },
  {
    prefix: "dc",
    url: "http://purl.org/dc/elements/1.1/",
    name: "Dublin Core",
    description: "Legacy Dublin Core metadata elements (title, creator, date, format, …)",
    ontologyUrl: "https://www.dublincore.org/specifications/dublin-core/dcmi-terms/dublin_core_elements.ttl",
  },
  {
    prefix: "foaf",
    url: "http://xmlns.com/foaf/0.1/",
    name: "FOAF",
    description: "Friend of a Friend: people, organizations, social networks and accounts",
    ontologyUrl: "https://lov.linkeddata.es/dataset/lov/vocabs/foaf/versions/2014-01-14.n3",
  },
  {
    prefix: "org",
    url: "http://www.w3.org/ns/org#",
    name: "Organization",
    description: "Formal organizations, membership, roles, sites and organizational units",
    ontologyUrl: "https://www.w3.org/ns/org",
  },
  {
    prefix: "pmdco",
    url: "https://w3id.org/pmd/co/",
    name: "PMD Core",
    description: "Materials science and engineering: processes, specimens and characteristics",
    ontologyUrl: "https://raw.githubusercontent.com/materialdigital/core-ontology/main/pmdco.ttl",
  },
  {
    prefix: "tto",
    url: "https://w3id.org/pmd/ao/tto/",
    name: "PMD Tensile Test",
    description: "Mechanical tensile testing: specimens, force, elongation and test procedures",
    ontologyUrl: "https://raw.githubusercontent.com/materialdigital/tensile-test-ontology/main/tto.ttl",
  },
  {
    prefix: "iof-core",
    url: "https://spec.industrialontologies.org/ontology/core/Core/",
    name: "IOF Core",
    description: "Industrial ontology: processes, equipment, capabilities and maintenance",
    ontologyUrl: "https://raw.githubusercontent.com/iofoundry/Core/main/Core.rdf",
  },
  {
    prefix: "ro",
    url: "http://purl.obolibrary.org/obo/RO_",
    name: "RO - Relations Ontology",
    description: "Biological and biomedical relation types: part-of, has-role, regulates, …",
    ontologyUrl: "https://raw.githubusercontent.com/oborel/obo-relations/master/ro.owl",
  },
  {
    prefix: "iao",
    url: "http://purl.obolibrary.org/obo/IAO_",
    name: "IAO - Information Artifact Ontology",
    description: "Information entities: documents, data items, measurement data and identifiers",
    ontologyUrl: "https://raw.githubusercontent.com/information-artifact-ontology/IAO/master/iao.owl",
  },
  {
    prefix: "log",
    url: "https://w3id.org/pmd/log/",
    name: "PMD LOG - PMD Laboratory Operations Graph",
    description: "Laboratory workflows: instruments, measurements, samples and operations",
    ontologyUrl: "https://w3id.org/pmd/log",
  },
  {
    prefix: "emmo",
    url: "https://w3id.org/emmo#",
    name: "EMMO - European Materials Modelling Ontology",
    description: "Physics, chemistry and materials modelling: properties, models and simulations",
    ontologyUrl: "https://raw.githubusercontent.com/emmo-repo/EMMO/master/emmo.ttl",
  },
  {
    prefix: "sosa",
    url: "http://www.w3.org/ns/sosa/",
    name: "SOSA - Sensor, Observation, Sample and Actuator",
    description: "IoT observation framework: sensors, actuators, samples and observations",
    ontologyUrl: "https://www.w3.org/ns/sosa/",
  },
  {
    prefix: "ssn",
    url: "http://www.w3.org/ns/ssn/",
    name: "SSN - Semantic Sensor Network Ontology",
    description: "Semantic sensor networks: systems, platforms, capabilities and deployments",
    ontologyUrl: "https://www.w3.org/ns/ssn/",
  },
  {
    prefix: "schema",
    url: "https://schema.org/",
    name: "Schema.org",
    description: "Events, people, places, products, organizations and web content markup",
    ontologyUrl: "https://schema.org/version/latest/schemaorg-current-https.ttl",
  },
  {
    prefix: "sh",
    url: "http://www.w3.org/ns/shacl#",
    name: "SHACL - Shapes Constraint Language",
    description: "Shapes and constraints for RDF graph validation and conformance testing",
    ontologyUrl: "https://www.w3.org/ns/shacl",
  },
  {
    prefix: "time",
    url: "http://www.w3.org/2006/time#",
    name: "OWL-Time - Time Ontology in OWL",
    description: "Temporal entities: instants, intervals, durations, time positions and zones",
    ontologyUrl: "https://www.w3.org/2006/time",
  },
  {
    prefix: "vcard",
    url: "http://www.w3.org/2006/vcard/ns#",
    name: "vCard Ontology",
    description: "Electronic business cards: contact details, addresses, telephones and emails",
    ontologyUrl: "https://www.w3.org/2006/vcard/ns",
  },
  {
    prefix: "ldp",
    url: "http://www.w3.org/ns/ldp#",
    name: "LDP - Linked Data Platform",
    description: "RESTful Linked Data containers, resources and interactions over HTTP",
    ontologyUrl: "https://www.w3.org/ns/ldp",
  },
  {
    prefix: "oa",
    url: "http://www.w3.org/ns/oa#",
    name: "OA - Web Annotation Vocabulary",
    description: "Web annotations: bodies, targets, selectors and annotation motivations",
    ontologyUrl: "https://www.w3.org/ns/oa",
  },
  {
    prefix: "odrl",
    url: "http://www.w3.org/ns/odrl/2/",
    name: "ODRL - Open Digital Rights Language",
    description: "Rights management: policies, permissions, prohibitions and obligations",
    ontologyUrl: "https://www.w3.org/ns/odrl/2/",
  },
  {
    prefix: "as",
    url: "https://www.w3.org/ns/activitystreams#",
    name: "Activity Streams 2.0",
    description: "Social activities: actors, objects, likes, follows and activity feeds",
    ontologyUrl: "https://www.w3.org/ns/activitystreams-owl.ttl",
  },
  {
    prefix: "csvw",
    url: "http://www.w3.org/ns/csvw#",
    name: "CSVW - CSV on the Web",
    description: "Tabular data: CSV file metadata, column definitions and data types",
    ontologyUrl: "https://www.w3.org/ns/csvw",
  },
  {
    prefix: "locn",
    url: "http://www.w3.org/ns/locn#",
    name: "LOCN - Core Location Vocabulary",
    description: "Addresses, postal codes and geographic locations for government data",
    ontologyUrl: "https://raw.githubusercontent.com/SEMICeu/Core-Location-Vocabulary/master/releases/w3c/locn.ttl",
  },
  {
    prefix: "wgs84",
    url: "http://www.w3.org/2003/01/geo/wgs84_pos#",
    name: "WGS84 - Basic Geo Vocabulary",
    description: "Geographic coordinates: latitude, longitude and altitude in WGS84",
    ontologyUrl: "https://www.w3.org/2003/01/geo/wgs84_pos.rdf",
  },
  {
    prefix: "qb",
    url: "http://purl.org/linked-data/cube#",
    name: "RDF Data Cube Vocabulary",
    description: "Statistical data: observations, measures, dimensions and attributes",
    ontologyUrl: "https://raw.githubusercontent.com/UKGovLD/publishing-statistical-data/master/specs/src/main/vocab/cube.ttl",
  },

  // Calendar & events
  {
    prefix: "ical",
    url: "http://www.w3.org/2002/12/cal/ical#",
    name: "iCal - iCalendar Vocabulary",
    description: "Calendar events: meetings, recurring schedules, alarms and calendar components",
    ontologyUrl: "https://www.w3.org/2002/12/cal/ical",
  },

  // Bibliographic & scholarly
  {
    prefix: "bibo",
    url: "http://purl.org/ontology/bibo/",
    name: "BIBO - Bibliographic Ontology",
    description: "Bibliographic metadata: books, articles, theses, reports and academic works",
    ontologyUrl: "https://raw.githubusercontent.com/structureddynamics/Bibliographic-Ontology-BIBO/master/bibo.owl",
  },
  {
    prefix: "fabio",
    url: "http://purl.org/spar/fabio/",
    name: "FABIO - FRBR-aligned Bibliographic Ontology",
    description: "Publishing works: journal articles, conference papers, datasets and expressions",
    ontologyUrl: "https://raw.githubusercontent.com/SPAROntologies/fabio/master/docs/current/fabio.owl",
  },
  {
    prefix: "cito",
    url: "http://purl.org/spar/cito/",
    name: "CiTO - Citation Typing Ontology",
    description: "Scholarly citation types: supports, disputes, extends, documents and cites",
    ontologyUrl: "https://raw.githubusercontent.com/SPAROntologies/cito/master/docs/current/cito.owl",
  },
  {
    prefix: "vann",
    url: "http://purl.org/vocab/vann/",
    name: "VANN - Vocabulary for Annotating Vocabulary Descriptions",
    description: "Vocabulary metadata: preferred namespace prefixes and example usage",
    ontologyUrl: "https://lov.linkeddata.es/dataset/lov/vocabs/vann/versions/2010-06-07.n3",
  },

  // Music
  {
    prefix: "mo",
    url: "http://purl.org/ontology/mo/",
    name: "MO - Music Ontology",
    description: "Music metadata: tracks, albums, artists, performances and recordings",
    ontologyUrl: "https://raw.githubusercontent.com/motools/musicontology/master/rdf/musicontology.n3",
  },

  // Media & images
  {
    prefix: "exif",
    url: "http://www.w3.org/2003/12/exif/ns#",
    name: "EXIF - Exif Vocabulary",
    description: "Image metadata: camera settings, GPS coordinates, exposure and orientation",
    ontologyUrl: "https://www.w3.org/2003/12/exif/ns#",
  },

  // E-commerce & products
  {
    prefix: "gr",
    url: "http://purl.org/goodrelations/v1#",
    name: "GoodRelations - E-commerce Ontology",
    description: "E-commerce: products, offerings, prices, businesses and delivery options",
    ontologyUrl: "https://www.heppnetz.de/ontologies/goodrelations/v1.owl",
  },

  // Licensing
  {
    prefix: "cc",
    url: "http://creativecommons.org/ns#",
    name: "CC - Creative Commons Vocabulary",
    description: "Creative Commons licensing: permissions, prohibitions and attribution requirements",
    ontologyUrl: "https://creativecommons.org/schema.rdf",
  },

  // Social web & discussions
  {
    prefix: "sioc",
    url: "http://rdfs.org/sioc/ns#",
    name: "SIOC - Semantically Interlinked Online Communities",
    description: "Online communities: blog posts, forum threads, replies and user accounts",
    ontologyUrl: "https://raw.githubusercontent.com/openlink/rdf-editor/develop/app/data/sioc.ttl",
  },

  // IoT / smart home
  {
    prefix: "saref",
    url: "https://saref.etsi.org/core/",
    name: "SAREF - Smart Appliances REFerence Ontology",
    description: "Smart home and IoT: devices, functions, commands, measurements and states",
    ontologyUrl: "https://saref.etsi.org/core/v3.1.1/saref.ttl",
  },

  // Buildings & architecture
  {
    prefix: "bot",
    url: "https://w3id.org/bot#",
    name: "BOT - Building Topology Ontology",
    description: "Buildings: sites, buildings, storeys, spaces, zones and construction elements",
    ontologyUrl: "https://raw.githubusercontent.com/w3c-lbd-cg/bot/master/bot.ttl",
  },

  // Geospatial
  {
    prefix: "geo",
    url: "http://www.opengis.net/ont/geosparql#",
    name: "GeoSPARQL - OGC Geographic Query Language",
    description: "Spatial features: geometries, WKT literals, topological relations and GIS queries",
    ontologyUrl: "https://opengeospatial.github.io/ogc-geosparql/geosparql11/geo.ttl",
  },

  // Provenance extensions
  {
    prefix: "pav",
    url: "http://purl.org/pav/",
    name: "PAV - Provenance, Authoring and Versioning",
    description: "Lightweight provenance: authors, curators, versions and source attribution",
    ontologyUrl: "https://raw.githubusercontent.com/pav-ontology/pav/master/pav.rdf",
  },

  // Open government data
  {
    prefix: "adms",
    url: "http://www.w3.org/ns/adms#",
    name: "ADMS - Asset Description Metadata Schema",
    description: "Semantic assets and interoperability resources: specifications, schemas and vocabularies",
    ontologyUrl: "https://lov.linkeddata.es/dataset/lov/vocabs/adms/versions/2013-05-24.n3",
  },
  {
    prefix: "regorg",
    url: "http://www.w3.org/ns/regorg#",
    name: "RegOrg - Registered Organization Vocabulary",
    description: "Legal entities and registered organizations: registration numbers and identifiers",
    ontologyUrl: "https://www.w3.org/ns/regorg",
  },

  // Project metadata & vocabulary annotation
  {
    prefix: "doap",
    url: "http://usefulinc.com/ns/doap#",
    name: "DOAP - Description of a Project",
    description: "Open-source projects: repositories, releases, maintainers and programming languages",
    ontologyUrl: "https://raw.githubusercontent.com/ewilderj/doap/master/schema/doap.rdf",
  },

  // Dublin Core type vocabulary
  {
    prefix: "dcmitype",
    url: "http://purl.org/dc/dcmitype/",
    name: "DCMIType - DCMI Type Vocabulary",
    description: "Content types: Dataset, Image, Software, Text, Sound, MovingImage and more",
    ontologyUrl: "https://lov.linkeddata.es/dataset/lov/vocabs/dctype/versions/2012-06-14.n3",
  },
] as const;

export const WELL_KNOWN_BY_PREFIX: Record<
  string,
  { prefix: string; url: string; name: string; description?: string; ontologyUrl?: string }
> = Object.fromEntries(WELL_KNOWN_PREFIXES.map((p) => [p.prefix, p])) as any;

/**
 * Resolve a well-known prefix name or arbitrary URI to the URL that should be
 * fetched when loading the ontology.  For entries with an explicit `ontologyUrl`
 * (e.g. BFO, DCAT) that URL is returned; otherwise the namespace `url` is used.
 * Unrecognised strings are returned as-is so callers can pass raw URIs directly.
 */
/** Filter the registry by keyword or use-case phrase. Empty query returns all entries.
 *  Multi-word queries use OR logic — an entry matches if ANY word hits prefix, name, url or description. */
export function searchWellKnownOntologies(query: string): typeof WELL_KNOWN_PREFIXES[number][] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [...WELL_KNOWN_PREFIXES];
  return WELL_KNOWN_PREFIXES.filter(e => {
    const haystack = [
      e.prefix,
      e.name,
      e.url,
      (e as any).description ?? "",
    ].join(" ").toLowerCase();
    return tokens.some(t => haystack.includes(t));
  });
}

export function resolveOntologyLoadUrl(prefixOrUri: string): string {
  // Match by prefix name first
  const byPrefix = WELL_KNOWN_BY_PREFIX[prefixOrUri];
  if (byPrefix) return (byPrefix as any).ontologyUrl ?? byPrefix.url;
  // Match by namespace URL (e.g. full IRI passed instead of prefix)
  const byUrl = WELL_KNOWN_PREFIXES.find(p => p.url === prefixOrUri);
  if (byUrl) return (byUrl as any).ontologyUrl ?? byUrl.url;
  // Unknown — pass through as-is
  return prefixOrUri;
}

// Map from namespace URL -> array of prefixes that point to it
export const WELL_KNOWN_BY_URL: Map<string, string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const p of WELL_KNOWN_PREFIXES) {
    const arr = m.get(p.url) || [];
    arr.push(p.prefix);
    m.set(p.url, arr);
  }
  return m;
})();

// Backwards-compatible derived object
export const WELL_KNOWN = {
  prefixes: Object.fromEntries(
    WELL_KNOWN_PREFIXES.map((p) => [p.prefix, p.url]),
  ) as Record<string, string>,
  // ontologies: map known ontology URL -> metadata (name + namespaces)
  ontologies: (() => {
    const out: Record<
      string,
      { name: string; namespaces?: Record<string, string>; aliases?: string[] }
    > = {};
    for (const p of WELL_KNOWN_PREFIXES) {
      // If the prefix's url looks like an ontology URL (ends with / or #) we add an entry.
      // Use the namespace URI itself as the ontology key.
      if (!out[p.url]) {
        out[p.url] = { name: p.name, namespaces: {}, aliases: [p.url] };
      }
      out[p.url].namespaces = {
        ...(out[p.url].namespaces || {}),
        [p.prefix]: p.url,
      };
    }
    return out;
  })(),
} as const;
