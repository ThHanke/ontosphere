// @vitest-environment node
import { describe, it, expect } from "vitest";
import * as N3 from "n3";
import { mipsToReasoningError, shaclViolationToEntry } from "../reasoningDiagnostics";

const { namedNode, quad } = N3.DataFactory;

const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const OWL_DISJOINT = "http://www.w3.org/2002/07/owl#disjointWith";

function q(s: string, p: string, o: string) {
  return quad(namedNode(s), namedNode(p), namedNode(o));
}

describe("mipsToReasoningError", () => {
  it("attaches the FULL justification (no 3-axiom truncation)", () => {
    const mips = [
      q("http://ex/frank", RDF_TYPE, "http://ex/Employee"),
      q("http://ex/frank", RDF_TYPE, "http://ex/Contractor"),
      q("http://ex/Employee", OWL_DISJOINT, "http://ex/Contractor"),
      q("http://ex/extra1", RDF_TYPE, "http://ex/Thing"),
      q("http://ex/extra2", RDF_TYPE, "http://ex/Thing"),
    ];
    const err = mipsToReasoningError(mips);
    // Full axiom set is preserved (5 axioms), not truncated to 3.
    expect(err.justification).toHaveLength(5);
    expect(err.justification).toContainEqual({
      subject: "http://ex/Employee",
      predicate: OWL_DISJOINT,
      object: "http://ex/Contractor",
    });
  });

  it("identifies the clash individual as nodeId", () => {
    const mips = [
      q("http://ex/frank", RDF_TYPE, "http://ex/Employee"),
      q("http://ex/frank", RDF_TYPE, "http://ex/Contractor"),
      q("http://ex/Employee", OWL_DISJOINT, "http://ex/Contractor"),
    ];
    const err = mipsToReasoningError(mips);
    expect(err.nodeId).toBe("http://ex/frank");
  });

  it("derives the rule from a clash predicate", () => {
    const mips = [
      q("http://ex/frank", RDF_TYPE, "http://ex/Employee"),
      q("http://ex/Employee", OWL_DISJOINT, "http://ex/Contractor"),
    ];
    const err = mipsToReasoningError(mips);
    expect(err.rule).toBe("owl:disjointWith");
    expect(err.severity).toBe("critical");
  });

  it("keeps a human-readable summary in message", () => {
    const mips = [q("http://ex/frank", RDF_TYPE, "http://ex/Employee")];
    const err = mipsToReasoningError(mips);
    expect(err.message).toContain("Clash");
    expect(err.message.toLowerCase()).toContain("frank");
  });
});

describe("shaclViolationToEntry", () => {
  it("maps sh:Violation to error severity, others to warning", () => {
    expect(shaclViolationToEntry({ severity: "sh:Violation" }).severity).toBe("error");
    expect(shaclViolationToEntry({ severity: "sh:Warning" }).severity).toBe("warning");
    expect(shaclViolationToEntry({ severity: null }).severity).toBe("warning");
  });

  it("builds an informative fallback message naming focus node and constraint", () => {
    const entry = shaclViolationToEntry({
      focusNode: "http://ex/projectAlpha",
      message: null,
      constraint: "http://www.w3.org/ns/shacl#MinCountConstraintComponent",
    });
    // Not the bare generic string
    expect(entry.message).not.toBe("SHACL validation issue");
    expect(entry.message).toContain("projectAlpha");
    expect(entry.message).toContain("MinCountConstraintComponent");
  });

  it("preserves an explicit message when present", () => {
    const entry = shaclViolationToEntry({ focusNode: "http://ex/a", message: "Missing rdfs:comment" });
    expect(entry.message).toBe("Missing rdfs:comment");
  });

  it("derives rule from the constraint local name and carries node/sourceShape", () => {
    const entry = shaclViolationToEntry({
      focusNode: "http://ex/a",
      constraint: "http://www.w3.org/ns/shacl#MinCountConstraintComponent",
      sourceShape: "http://ex/AShape",
    });
    expect(entry.rule).toBe("shacl:MinCountConstraintComponent");
    expect(entry.nodeId).toBe("http://ex/a");
    expect(entry.sourceShape).toBe("http://ex/AShape");
  });

  it("falls back to the source shape when there is no focus node", () => {
    const entry = shaclViolationToEntry({ focusNode: null, sourceShape: "http://ex/AShape", message: "engine error" });
    expect(entry.nodeId).toBe("http://ex/AShape");
  });
});
