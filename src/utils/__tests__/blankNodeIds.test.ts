import { describe, it, expect } from "vitest";
import { DataFactory } from "n3";
import {
  SKOLEM_PREFIX, idToTerm, termToId, serializeTermForUi, deserializeTermFromUi, serializeQuadForUi, deserializeQuadFromUi,
} from "../blankNodeIds";

const { namedNode, blankNode, literal, quad, defaultGraph } = DataFactory;

describe("blank-node boundary mapping", () => {
  it("a store blank node leaves the worker as its skolem IRI and comes back as the same blank node", () => {
    const b = blankNode("h3a4f01c");
    const wire = serializeTermForUi(b);
    expect(wire).toEqual({ termType: "NamedNode", value: `${SKOLEM_PREFIX}h3a4f01c` });
    const back = deserializeTermFromUi(wire, DataFactory);
    expect(back.termType).toBe("BlankNode");
    expect(back.equals(b)).toBe(true);
  });

  it("ordinary IRIs, literals and the default graph are unchanged", () => {
    for (const t of [namedNode("http://x/a"), literal("v", "en"), defaultGraph()]) {
      const back = deserializeTermFromUi(serializeTermForUi(t), DataFactory);
      expect(back.termType).toBe(t.termType);
      expect(back.value).toBe(t.value);
    }
  });

  it("round-trips a whole quad, and a stored blank node never reaches the UI as a BlankNode", () => {
    const q = quad(namedNode("http://x/A"), namedNode("http://www.w3.org/2002/07/owl#equivalentClass"), blankNode("rst1"), namedNode("urn:vg:data"));
    const wire = serializeQuadForUi(q);
    expect(wire.object).toEqual({ termType: "NamedNode", value: `${SKOLEM_PREFIX}rst1` });
    const back = deserializeQuadFromUi(wire, DataFactory);
    expect(back.object.termType).toBe("BlankNode");
    expect(back.object.value).toBe("rst1");
    expect(back.subject.value).toBe("http://x/A");
    expect(back.graph.value).toBe("urn:vg:data");
  });

  it("idToTerm and termToId are inverse for skolem IRIs, _:labels and IRIs", () => {
    expect(termToId(blankNode("x1"))).toBe(`${SKOLEM_PREFIX}x1`);
    expect(idToTerm(DataFactory, `${SKOLEM_PREFIX}x1`).equals(blankNode("x1"))).toBe(true);
    expect(idToTerm(DataFactory, "_:x1").equals(blankNode("x1"))).toBe(true);
    expect(idToTerm(DataFactory, "http://x/a").equals(namedNode("http://x/a"))).toBe(true);
    expect(termToId(namedNode("http://x/a"))).toBe("http://x/a");
  });
});
