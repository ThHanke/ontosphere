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
    description: "Mind maps, concept hierarchies and topic trees — organize any domain of knowledge with broader/narrower/related links",
    ontologyUrl: "https://www.w3.org/2009/08/skos-reference/skos.rdf",
    packs: ["pkm", "general-kg"],
  },
  {
    prefix: "prov",
    url: "http://www.w3.org/ns/prov#",
    name: "PROV-O - The PROV Ontology",
    description: "Track the history of anything: who created it, what process produced it, and what it was derived from",
    ontologyUrl: "https://www.w3.org/ns/prov-o",
    packs: ["general-kg", "research", "data-catalog", "engineering"],
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
    packs: ["engineering"],
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
    packs: ["data-catalog"],
  },
  {
    prefix: "qudt",
    url: "http://qudt.org/schema/qudt/",
    name: "QUDT - Quantities, Units, Dimensions and Types",
    description: "Measurement schema: quantity kinds, units, dimensions and numeric values",
    ontologyUrl: "https://qudt.org/2.1/schema/qudt.ttl",
    packs: ["engineering"],
  },
  {
    prefix: "unit",
    url: "http://qudt.org/vocab/unit/",
    name: "QUDT Units Vocabulary",
    description: "Concrete SI and non-SI units of measure (metre, kilogram, second, …)",
    ontologyUrl: "https://qudt.org/2.1/vocab/unit",
    packs: ["iot", "engineering"],
  },
  {
    prefix: "dcterms",
    url: "http://purl.org/dc/terms/",
    name: "Dublin Core Terms",
    description: "General metadata: titles, creators, dates, subjects and descriptions",
    ontologyUrl: "https://www.dublincore.org/specifications/dublin-core/dcmi-terms/dublin_core_terms.ttl",
    packs: ["pkm", "general-kg", "research", "data-catalog", "annotations"],
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
    description: "People and their connections: name, email, knows-relationships and social accounts — foundation for any person-centric knowledge graph",
    ontologyUrl: "https://lov.linkeddata.es/dataset/lov/vocabs/foaf/versions/2014-01-14.n3",
    packs: ["people", "events", "annotations"],
  },
  {
    prefix: "org",
    url: "http://www.w3.org/ns/org#",
    name: "Organization",
    description: "Formal organizations, membership, roles, sites and organizational units",
    ontologyUrl: "https://www.w3.org/ns/org",
    packs: ["people"],
  },
  {
    prefix: "rel",
    url: "http://purl.org/vocab/relationship/",
    name: "REL - Relationship Vocabulary",
    description: "Typed person-to-person relationships: siblingOf, parentOf, colleagueOf, friendOf — extends FOAF for richer social graphs",
    ontologyUrl: "https://vocab.org/relationship/rel-vocab-20100607.rdf",
    packs: ["people"],
  },
  {
    prefix: "bio",
    url: "http://purl.org/vocab/bio/0.1/",
    name: "BIO - Biographical Vocabulary",
    description: "Life events for biographical knowledge graphs: Birth, Death, Marriage, Graduation and their dates and places",
    ontologyUrl: "https://vocab.org/bio/bio-vocab-20100101.rdf",
    packs: ["people"],
  },
  {
    prefix: "pmdco",
    url: "https://w3id.org/pmd/co/",
    name: "PMD Core",
    description: "Materials science and engineering: processes, specimens and characteristics",
    ontologyUrl: "https://raw.githubusercontent.com/materialdigital/core-ontology/main/pmdco.ttl",
    packs: ["engineering"],
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
    packs: ["iot"],
  },
  {
    prefix: "ssn",
    url: "http://www.w3.org/ns/ssn/",
    name: "SSN - Semantic Sensor Network Ontology",
    description: "Semantic sensor networks: systems, platforms, capabilities and deployments",
    ontologyUrl: "https://www.w3.org/ns/ssn/",
    packs: ["iot"],
  },
  {
    prefix: "schema",
    url: "https://schema.org/",
    name: "Schema.org",
    description: "Universal knowledge graph vocabulary: people, places, events, organizations, products and creative works — best starting point for any general-purpose graph",
    ontologyUrl: "https://schema.org/version/latest/schemaorg-current-https.ttl",
    packs: ["events", "general-kg"],
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
    description: "Model time: when things happen, how long they last, and temporal order between events — works with any domain",
    ontologyUrl: "https://www.w3.org/2006/time",
    packs: ["pkm", "events", "iot"],
  },
  {
    prefix: "vcard",
    url: "http://www.w3.org/2006/vcard/ns#",
    name: "vCard Ontology",
    description: "Electronic business cards: contact details, addresses, telephones and emails",
    ontologyUrl: "https://www.w3.org/2006/vcard/ns",
    packs: ["people"],
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
    description: "Attach notes, comments or tags to any resource — web pages, document sections, image regions or graph nodes",
    ontologyUrl: "https://www.w3.org/ns/oa",
    packs: ["pkm", "annotations"],
  },
  {
    prefix: "odrl",
    url: "http://www.w3.org/ns/odrl/2/",
    name: "ODRL - Open Digital Rights Language",
    description: "Rights management: policies, permissions, prohibitions and obligations",
    ontologyUrl: "https://www.w3.org/ns/odrl/2/",
    packs: ["legal"],
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
    packs: ["data-catalog"],
  },

  // Calendar & events
  {
    prefix: "ical",
    url: "http://www.w3.org/2002/12/cal/ical#",
    name: "iCal - iCalendar Vocabulary",
    description: "Calendar events: meetings, recurring schedules, alarms and calendar components",
    ontologyUrl: "https://www.w3.org/2002/12/cal/ical",
    packs: ["events"],
  },

  // Bibliographic & scholarly
  {
    prefix: "bibo",
    url: "http://purl.org/ontology/bibo/",
    name: "BIBO - Bibliographic Ontology",
    description: "Bibliographic metadata: books, articles, theses, reports and academic works",
    ontologyUrl: "https://raw.githubusercontent.com/structureddynamics/Bibliographic-Ontology-BIBO/master/bibo.owl",
    packs: ["research"],
  },
  {
    prefix: "fabio",
    url: "http://purl.org/spar/fabio/",
    name: "FABIO - FRBR-aligned Bibliographic Ontology",
    description: "Publishing works: journal articles, conference papers, datasets and expressions",
    ontologyUrl: "https://raw.githubusercontent.com/SPAROntologies/fabio/master/docs/current/fabio.owl",
    packs: ["research"],
  },
  {
    prefix: "cito",
    url: "http://purl.org/spar/cito/",
    name: "CiTO - Citation Typing Ontology",
    description: "Scholarly citation types: supports, disputes, extends, documents and cites",
    ontologyUrl: "https://raw.githubusercontent.com/SPAROntologies/cito/master/docs/current/cito.owl",
    packs: ["research"],
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
    packs: ["legal"],
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
    packs: ["iot"],
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

export const ONTOLOGY_PACKS = [
  {
    id: "pkm",
    name: "Personal Knowledge Management / Mind Mapping",
    description: "Structure notes, make mind maps, organize topics and concept hierarchies",
    examplePhrases: ["mind map", "organize topics", "structure notes", "concept hierarchy", "taking notes"],
  },
  {
    id: "people",
    name: "People & Social Relationships",
    description: "Connect people, model social networks, family trees and biographical data",
    examplePhrases: ["people I know", "social network", "family tree", "contacts", "relationships", "connect people"],
  },
  {
    id: "events",
    name: "Events & Scheduling",
    description: "Track meetings, model calendars and schedule projects",
    examplePhrases: ["calendar", "meetings", "schedule", "events", "appointments", "time management"],
  },
  {
    id: "general-kg",
    name: "General Knowledge Graph",
    description: "Build a knowledge graph about any topic — general linked data for any domain",
    examplePhrases: ["knowledge graph", "linked data", "model anything", "general purpose", "build a graph"],
  },
  {
    id: "research",
    name: "Research & Academic Work",
    description: "Track citations, model bibliography and link papers to datasets",
    examplePhrases: ["citations", "bibliography", "papers", "academic", "research", "references"],
  },
  {
    id: "data-catalog",
    name: "Data Catalog & Open Data",
    description: "Inventory datasets, describe APIs and publish open data",
    examplePhrases: ["dataset", "data catalog", "open data", "API", "inventory", "data portal"],
  },
  {
    id: "iot",
    name: "IoT & Sensor Data",
    description: "Log sensor readings, model smart homes and track observations",
    examplePhrases: ["sensor", "IoT", "smart home", "observations", "measurements", "device"],
  },
  {
    id: "engineering",
    name: "Engineering & Scientific Measurement",
    description: "Model material properties, record test results and describe physical processes",
    examplePhrases: ["material", "measurement", "units", "scientific", "engineering", "physical process"],
  },
  {
    id: "legal",
    name: "Legal & Rights Management",
    description: "Describe licensing, model permissions and attach rights to content",
    examplePhrases: ["license", "rights", "permissions", "legal", "Creative Commons", "copyright"],
  },
  {
    id: "annotations",
    name: "Document Annotation",
    description: "Annotate web pages, attach notes to PDF sections and comment on image regions",
    examplePhrases: ["annotate", "annotation", "comments", "notes on document", "highlight", "markup"],
  },
] as const;

export type OntologyPackId = typeof ONTOLOGY_PACKS[number]["id"];

export type OntologyPackSummary = { packId: string; packName: string; description: string };
export type OntologyPackDetail = OntologyPackSummary & {
  ontologies: Array<{ prefix: string; namespace: string; reason: string }>;
};

const PACK_REASONS: Record<string, string> = {
  "pkm:skos": "Concept hierarchy, broader/narrower, topic trees",
  "pkm:dcterms": "Title, description, date metadata on nodes",
  "pkm:oa": "Annotate nodes with external references or comments",
  "pkm:time": "Temporal tagging of concepts",
  "people:foaf": "Person nodes, knows-relationships, social accounts",
  "people:vcard": "Contact details: email, phone, address",
  "people:org": "Organizations and membership roles",
  "people:rel": "Typed relationships: siblingOf, colleagueOf, parentOf",
  "people:bio": "Life events: birth, graduation, marriage, death",
  "events:ical": "Calendar events, recurrence, alarms",
  "events:time": "Durations, intervals, time zones",
  "events:schema": "schema:Event with location, organizer",
  "events:foaf": "Organizer / attendee persons",
  "general-kg:schema": "Universal typed entities: Person, Place, Event, Organization, Product",
  "general-kg:skos": "Classification, tagging, concept schemes",
  "general-kg:dcterms": "Metadata: title, creator, date, source",
  "general-kg:prov": "Provenance: where did this data come from",
  "research:bibo": "Books, articles, theses, reports",
  "research:cito": "Citation types: supports, disputes, extends",
  "research:fabio": "Publishing works: journal papers, conference proceedings",
  "research:prov": "Dataset and result provenance",
  "research:dcterms": "Standard bibliographic metadata",
  "data-catalog:dcat": "Datasets, distributions, data services",
  "data-catalog:qb": "Statistical observations and dimensions",
  "data-catalog:dcterms": "Dataset metadata",
  "data-catalog:prov": "Dataset lineage",
  "iot:sosa": "Sensors, actuators, observations, samples",
  "iot:ssn": "Sensor networks, platforms, deployments",
  "iot:saref": "Smart home devices, commands, states",
  "iot:unit": "Units of measure for sensor values",
  "iot:time": "Observation timestamps",
  "engineering:qudt": "Quantity kinds, units, numeric values",
  "engineering:unit": "Concrete SI units",
  "engineering:prov": "Process provenance",
  "engineering:bfo": "Upper-level foundational classes",
  "engineering:pmdco": "Materials science processes and specimens",
  "legal:odrl": "Policies, permissions, prohibitions, obligations",
  "legal:cc": "Creative Commons license terms",
  "legal:dcterms": "Rights-holder metadata",
  "annotations:oa": "Annotation body, target, selector, motivation",
  "annotations:dcterms": "Annotation metadata",
  "annotations:foaf": "Annotator identity",
};

/** Search ontology packs by plain-language task description.
 *  Returns matching packs with full ontology details when task matches, or all pack summaries when empty/no match. */
export function searchOntologyPacks(task: string): Array<OntologyPackSummary | OntologyPackDetail> {
  const tokens = task.trim().toLowerCase().split(/\s+/).filter(Boolean);

  const scored = ONTOLOGY_PACKS.map(pack => {
    const haystack = [pack.name, pack.description, ...pack.examplePhrases].join(" ").toLowerCase();
    const score = tokens.length === 0 ? 0 : tokens.filter(t => haystack.includes(t)).length;
    return { pack, score };
  });

  const hasMatches = scored.some(s => s.score > 0);

  if (!hasMatches) {
    return ONTOLOGY_PACKS.map(pack => ({
      packId: pack.id,
      packName: pack.name,
      description: pack.description,
    }));
  }

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ pack }) => {
      const ontologies = WELL_KNOWN_PREFIXES
        .filter(e => (e as any).packs?.includes(pack.id))
        .map(e => ({
          prefix: e.prefix,
          namespace: e.url,
          reason: PACK_REASONS[`${pack.id}:${e.prefix}`] ?? "",
        }));
      return {
        packId: pack.id,
        packName: pack.name,
        description: pack.description,
        ontologies,
      };
    });
}

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
