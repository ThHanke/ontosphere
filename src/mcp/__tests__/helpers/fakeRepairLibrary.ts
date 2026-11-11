// A scripted stand-in for the reasoner's repair(), assessEdit() and weaken(), for tests of the
// code around them (adapter mapping, explainDiagnostics wiring, the repair panel). It builds its
// answers from the justifications a test supplies and records every call. The reasoner's own
// behaviour is covered by the integration tests that run the real Konclude.

import * as N3 from 'n3';
import type { Axiom, RepairResult, Weakening } from 'rdf-reasoner-konclude';
import { isDeclaration, isTBoxAxiom } from '../../tools/computeRepairs';
import type { RepairLibrary, SerializedTriple } from '../../tools/repairAdapter';

const { namedNode, literal, quad } = N3.DataFactory;
type RdfQuad = Axiom['principal'];

/** A justification triple as a store quad. Triples without a graph live in urn:vg:data, as stored data does. */
export function tripleToQuad(t: SerializedTriple): N3.Quad {
  const object =
    t.objectTermType === 'Literal'
      ? literal(t.object, t.objectLanguage ? t.objectLanguage : t.objectDatatype ? namedNode(t.objectDatatype) : undefined)
      : namedNode(t.object);
  return quad(namedNode(t.subject), namedNode(t.predicate), object, namedNode(t.graph ?? 'urn:vg:data'));
}

export interface FakeRepairOptions {
  /** `verifiedConsistent` of the repair set the fake returns (default true). */
  setVerified?: boolean | null;
  /** Does removing the given quads (one axiom, or the whole set) restore consistency? Default: only the whole set. */
  consistentAfter?: (removed: RdfQuad[], wholeSet: boolean) => boolean;
  /** Report every removal of an assessEdit call as unmatched (default none). */
  unmatchedRemovals?: boolean;
  /** Weakenings returned for a culprit axiom (default none). */
  weakenings?: (culprit: Axiom) => Weakening[];
  /** `reason` of the weaken() result when `weakenings` is empty. */
  weakenReason?: 'removal-does-not-restore-consistency';
}

export interface FakeRepairLibrary extends RepairLibrary {
  calls: {
    repair: Parameters<RepairLibrary['repair']>[0][];
    assessEdit: { remove: RdfQuad[]; opts?: Parameters<RepairLibrary['assessEdit']>[1] }[];
    weaken: Axiom[];
  };
  /** The axioms of the repair set the fake returned. */
  chosen: Axiom[];
}

const qk = (q: RdfQuad): string => `${q.subject.value}|${q.predicate.value}|${q.object.value}|${q.graph.value}`;

const asTriple = (q: RdfQuad): SerializedTriple => ({
  subject: q.subject.value, predicate: q.predicate.value, object: q.object.value,
});

export function fakeRepairLibrary(mips: SerializedTriple[][], opts: FakeRepairOptions = {}): FakeRepairLibrary {
  const justifications = mips.map((j) => ({
    axioms: j.map((t): Axiom => { const q = tripleToQuad(t); return { principal: q, quads: [q] }; }),
    context: [] as RdfQuad[],
  }));
  const rank = (a: Axiom) => (isDeclaration(asTriple(a.principal)) ? 2 : isTBoxAxiom(asTriple(a.principal)) ? 1 : 0);
  const chosen: Axiom[] = [];
  const covers: number[] = [];
  justifications.forEach((j, i) => {
    if (j.axioms.length === 0) return;
    const hit = chosen.find((c) => j.axioms.some((a) => a.principal.equals(c.principal)));
    if (hit) { covers.push(i); return; }
    const pick = [...j.axioms].sort((a, b) => rank(a) - rank(b))[0];
    chosen.push(pick);
    covers.push(i);
  });
  const wholeKeys = new Set(chosen.flatMap((a) => a.quads.map(qk)));
  const calls: FakeRepairLibrary['calls'] = { repair: [], assessEdit: [], weaken: [] };

  return {
    calls,
    chosen,
    async repair(o) {
      calls.repair.push(o);
      const result: RepairResult = {
        consistent: mips.length === 0,
        justifications,
        repairs: chosen.length === 0 ? [] : [{
          remove: chosen,
          covers,
          verifiedConsistent: opts.setVerified === undefined ? true : opts.setVerified,
          minimal: true,
        }],
        incomplete: false,
      };
      return result;
    },
    async assessEdit(edit, o) {
      const removed = edit.remove ?? [];
      calls.assessEdit.push({ remove: removed, opts: o });
      const whole = removed.length === wholeKeys.size && removed.every((q) => wholeKeys.has(qk(q)));
      return {
        consistent: opts.consistentAfter ? opts.consistentAfter(removed, whole) : whole,
        lostDisjointPairs: [],
        pairsChecked: [],
        unmatchedRemovals: opts.unmatchedRemovals ? removed : [],
        incomplete: false,
      };
    },
    async weaken(culprit) {
      calls.weaken.push(culprit);
      const weakenings = opts.weakenings?.(culprit) ?? [];
      return {
        weakenings,
        incomplete: false,
        ...(weakenings.length === 0 && opts.weakenReason ? { reason: opts.weakenReason } : {}),
      };
    },
  };
}
