// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  ONTOLOGY_PACKS,
  WELL_KNOWN_BY_PREFIX,
  searchOntologyPacks,
} from "../../utils/wellKnownOntologies";

describe("ONTOLOGY_PACKS", () => {
  it("has exactly 10 packs", () => {
    expect(ONTOLOGY_PACKS).toHaveLength(10);
  });

  it("has unique ids", () => {
    const ids = ONTOLOGY_PACKS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rel and bio entries exist in WELL_KNOWN_BY_PREFIX", () => {
    expect(WELL_KNOWN_BY_PREFIX["rel"]).toBeDefined();
    expect(WELL_KNOWN_BY_PREFIX["bio"]).toBeDefined();
    expect(WELL_KNOWN_BY_PREFIX["rel"].url).toBe("http://purl.org/vocab/relationship/");
    expect(WELL_KNOWN_BY_PREFIX["bio"].url).toBe("http://purl.org/vocab/bio/0.1/");
  });
});

describe("searchOntologyPacks", () => {
  it("empty string returns all 10 packs as summary-only", () => {
    const result = searchOntologyPacks("");
    expect(result).toHaveLength(10);
    for (const pack of result) {
      expect(pack).toHaveProperty("packId");
      expect(pack).toHaveProperty("packName");
      expect(pack).toHaveProperty("description");
      expect(pack).not.toHaveProperty("ontologies");
    }
  });

  it("no-match returns all 10 packs summary-only", () => {
    const result = searchOntologyPacks("xyzzy-nonexistent-9999");
    expect(result).toHaveLength(10);
    expect(result[0]).not.toHaveProperty("ontologies");
  });

  it("'mind map' returns pkm pack with ontologies", () => {
    const result = searchOntologyPacks("mind map");
    const pkm = result.find(p => p.packId === "pkm");
    expect(pkm).toBeDefined();
    expect(pkm).toHaveProperty("ontologies");
    const prefixes = (pkm as any).ontologies.map((o: any) => o.prefix);
    expect(prefixes).toContain("skos");
    expect(prefixes).toContain("dcterms");
  });

  it("'family tree' returns people pack with foaf, rel, bio", () => {
    const result = searchOntologyPacks("family tree");
    const people = result.find(p => p.packId === "people");
    expect(people).toBeDefined();
    expect(people).toHaveProperty("ontologies");
    const prefixes = (people as any).ontologies.map((o: any) => o.prefix);
    expect(prefixes).toContain("foaf");
    expect(prefixes).toContain("rel");
    expect(prefixes).toContain("bio");
  });

  it("'sensor IoT' returns iot pack scoring above other packs", () => {
    const result = searchOntologyPacks("sensor IoT");
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].packId).toBe("iot");
    const prefixes = (result[0] as any).ontologies.map((o: any) => o.prefix);
    expect(prefixes).toContain("sosa");
    expect(prefixes).toContain("ssn");
  });

  it("all ontology prefixes in full-detail results exist in WELL_KNOWN_BY_PREFIX", () => {
    const result = searchOntologyPacks("knowledge graph");
    for (const pack of result) {
      if ("ontologies" in pack) {
        for (const ont of pack.ontologies) {
          expect(WELL_KNOWN_BY_PREFIX[ont.prefix]).toBeDefined();
        }
      }
    }
  });

  it("each ontology in a full pack has a non-empty namespace", () => {
    const result = searchOntologyPacks("calendar meetings");
    const events = result.find(p => p.packId === "events");
    expect(events).toBeDefined();
    for (const ont of (events as any).ontologies) {
      expect(ont.namespace).toBeTruthy();
      expect(ont.prefix).toBeTruthy();
    }
  });
});
