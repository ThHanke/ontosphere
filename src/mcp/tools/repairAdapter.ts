// src/mcp/tools/repairAdapter.ts
//
// Deletion repairs from the reasoner's own repair() (rdf-reasoner-konclude >= 0.9.0).
//
// The reasoner finds the axiom sets whose removal restores consistency and verifies them. This
// module keeps the application side: it chooses the cost function (policy), translates the
// reasoner's quads back to the store's skolemised form, and maps the result onto the existing
// RepairSuggestion shape that the MCP output, the brief and the repair panel consume.
//
// No worker or WASM dependency: the reasoner is injected as `RepairLibrary`, so the mapping is
// unit-testable without it (see __tests__/repairAdapter.test.ts).

import type {
  Axiom as LibAxiom,
  AxiomJustification,
  AssessEditOptions,
  Edit,
  EditAssessment,
  Repair,
  RepairOptions,
  RepairResult,
  WeakenOptions,
  WeakenResult,
} from 'rdf-reasoner-konclude';
import {
  axiomKey,
  hasIriObject,
  isDeclaration,
  isTBoxAxiom,
  localName,
  type AxiomTriple,
  type RepairSuggestion,
} from './computeRepairs';

/** The quad type the reasoner returns (RDF/JS). N3 quads are assignable to it. */
type Quad = LibAxiom['principal'];

/** A triple of a justification: the plain-object shape the diagnostics and the brief use. */
export type SerializedTriple = AxiomTriple;

/** RepairOptions plus the seed option of rdf-reasoner-konclude releases that have it (older ones ignore it). */
type SeededRepairOptions = RepairOptions & { justifications?: AxiomJustification[] };

/** The reasoner calls the adapter needs. Quads are in reasoning-base form (blank nodes restored). */
export interface RepairLibrary {
  repair(opts: SeededRepairOptions): Promise<RepairResult>;
  assessEdit(edit: Edit, opts?: AssessEditOptions): Promise<EditAssessment>;
  weaken(culprit: LibAxiom, opts?: WeakenOptions): Promise<WeakenResult>;
}

export interface SuggestDeletionRepairsInput {
  lib: RepairLibrary;
  /** Reasoner form to stored form: blank nodes back to urn:vg:bnode:* IRIs. */
  reskolemize: (q: Quad) => Quad;
  /**
   * The justifications the caller shows (explainInconsistency): `justificationsCovered` indexes into
   * these. Without them the reasoner's own justifications are used.
   */
  justifications?: SerializedTriple[][];
  /**
   * Justifications of this exact store state that are already known (blank-node form, as the
   * reasoner returned them). repair() skips its first explanation round for those that still hold.
   * Pass only to a reasoner whose repair() accepts RepairOptions.justifications.
   */
  seed?: AxiomJustification[];
  unsatisfiableClasses?: string[];
  /** Justifications per explanation round. Default 3. */
  maxJustifications?: number;
  /** Wall-clock budget in ms for the repair search and for each weakening call; 0 = none. Library defaults when absent. */
  timeoutMs?: number;
  /** Also offer weakenings of rdfs:subClassOf culprits (default true). */
  weaken?: boolean;
}

export interface SuggestRepairsResult {
  /** The input was already consistent; `repairs` is empty. */
  consistent: boolean;
  /** Deletion repairs of the best repair set (ids R1, R2, ...), plus needsManualReview markers. */
  repairs: RepairSuggestion[];
  /** Does removing the whole best set restore consistency (the reasoner's verification)? null = not checked. */
  repairSetVerifiedConsistent: boolean | null;
  /** Inclusion-minimal, as reported by the reasoner. null = not verified. */
  minimal: boolean | null;
  repairSetMatchWarning?: string;
  /** Further repair sets the reasoner found besides the one shown. */
  alternativeSets: number;
  /** Wall time of each reasoner call of the search (worker command only). */
  libTimingsMs?: { call: string; ms: number }[];
  /** The search stopped early; `reason` says why. */
  incomplete: boolean;
  reason?: RepairResult['reason'];
  /** A weakening search failed or hit its deadline: the weakenings listed may be incomplete. */
  weakenIncomplete: boolean;
  /** The reasoner's justifications as plain triples (reskolemised). */
  justifications: SerializedTriple[][];
}

// ---------------------------------------------------------------------------
// Cost policy
// ---------------------------------------------------------------------------

/**
 * The reasoner orders repair sets by TOTAL cost, then size. Ontosphere wants the smallest set
 * first (as the greedy cover it replaces did), so every axiom carries a large constant and the
 * policy terms only break ties between sets of the same size:
 *
 *   cost(axiom) = SIZE_WEIGHT + destructiveness * 10 + (touches an unsatisfiable class ? 0 : 1)
 *
 * destructiveness: assertion 0, schema axiom 1, declaration 2. A set of n axioms costs at least
 * n * SIZE_WEIGHT; the policy terms sum to at most 21 per axiom, so a smaller set always wins
 * while n < SIZE_WEIGHT / 21 (about 4700 axioms).
 */
export const SIZE_WEIGHT = 100_000;

const RDFS_SUBCLASS_OF = 'http://www.w3.org/2000/01/rdf-schema#subClassOf';
const SKOLEM_PREFIX = 'urn:vg:bnode:';

const destructiveness = (t: SerializedTriple): number => (isDeclaration(t) ? 2 : isTBoxAxiom(t) ? 1 : 0);

function costOf(t: SerializedTriple, unsat: ReadonlySet<string>): number {
  const touchesUnsat = unsat.has(t.subject) || unsat.has(t.object);
  return SIZE_WEIGHT + destructiveness(t) * 10 + (touchesUnsat ? 0 : 1);
}

// ---------------------------------------------------------------------------
// Quad <-> plain triple
// ---------------------------------------------------------------------------

/** A quad as the plain triple the diagnostics carry: term kind, datatype, language and graph kept. */
export function quadToTriple(q: Quad): SerializedTriple {
  const o = q.object;
  const triple: SerializedTriple = {
    subject: q.subject.value,
    predicate: q.predicate.value,
    object: o.value,
    objectTermType: o.termType,
  };
  if (o.termType === 'Literal') {
    const lit = o as { datatype?: { value?: string }; language?: string };
    if (lit.datatype?.value) triple.objectDatatype = lit.datatype.value;
    if (lit.language) triple.objectLanguage = lit.language;
  }
  if (q.graph && q.graph.termType !== 'DefaultGraph' && q.graph.value) triple.graph = q.graph.value;
  return triple;
}

const spo = (t: { subject: string; predicate: string; object: string }): string =>
  `${t.subject}\u0000${t.predicate}\u0000${t.object}`;

/** Every triple of every axiom of a justification, once each (an axiom lists every graph copy). */
function flattenJustification(
  axioms: readonly LibAxiom[],
  reskolemize: (q: Quad) => Quad,
): SerializedTriple[] {
  const seen = new Set<string>();
  const out: SerializedTriple[] = [];
  for (const ax of axioms) {
    for (const q of ax.quads) {
      const t = quadToTriple(reskolemize(q));
      const key = axiomKey(t);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(t);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Choosing the repair set to show
// ---------------------------------------------------------------------------

interface Chosen {
  repair: Repair;
  total: number;
  keys: string;
}

/**
 * Deterministic pick among the reasoner's sets (it leaves ties unspecified): a verified set first,
 * then lower total cost, then fewer axioms, then the lexicographic list of axiom keys.
 */
function chooseBest(
  repairs: readonly Repair[],
  unsat: ReadonlySet<string>,
  reskolemize: (q: Quad) => Quad,
): Repair | undefined {
  const scored: Chosen[] = repairs.map((repair) => {
    const triples = repair.remove.map((ax) => quadToTriple(reskolemize(ax.principal)));
    return {
      repair,
      total: triples.reduce((sum, t) => sum + costOf(t, unsat), 0),
      keys: triples.map(axiomKey).sort().join('\n'),
    };
  });
  scored.sort((a, b) => {
    const va = a.repair.verifiedConsistent === true ? 0 : 1;
    const vb = b.repair.verifiedConsistent === true ? 0 : 1;
    if (va !== vb) return va - vb;
    if (a.total !== b.total) return a.total - b.total;
    if (a.repair.remove.length !== b.repair.remove.length) return a.repair.remove.length - b.repair.remove.length;
    return a.keys < b.keys ? -1 : a.keys > b.keys ? 1 : 0;
  });
  return scored[0]?.repair;
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

interface Entry {
  axiom: LibAxiom;
  triple: SerializedTriple;
  covered: number[];
}

export async function suggestDeletionRepairs(input: SuggestDeletionRepairsInput): Promise<SuggestRepairsResult> {
  const { lib, reskolemize } = input;
  const unsat = new Set(input.unsatisfiableClasses ?? []);

  const seeded: SeededRepairOptions = {
    maxJustifications: input.maxJustifications ?? 3,
    ...(input.seed && input.seed.length > 0 ? { justifications: input.seed } : {}),
    cost: (ax) => costOf(quadToTriple(reskolemize(ax.principal)), unsat),
    ...(input.timeoutMs !== undefined ? { timeout: input.timeoutMs } : {}),
  };
  const result = await lib.repair(seeded);

  const libJustifications = result.justifications.map((j) => flattenJustification(j.axioms, reskolemize));
  const base = {
    alternativeSets: Math.max(0, result.repairs.length - 1),
    weakenIncomplete: false,
    incomplete: result.incomplete,
    ...(result.reason ? { reason: result.reason } : {}),
    justifications: libJustifications,
  };
  if (result.consistent) {
    return { ...base, consistent: true, repairs: [], repairSetVerifiedConsistent: null, minimal: null };
  }

  const justs = input.justifications ?? libJustifications;
  const best = chooseBest(result.repairs, unsat, reskolemize);

  // Rank the axioms of the chosen set the way the panel always listed them: more justifications
  // covered first, then less destructive, then touching an unsatisfiable class, then a stable key.
  const entries: Entry[] = (best?.remove ?? []).map((axiom) => {
    const triple = quadToTriple(reskolemize(axiom.principal));
    const own = new Set(axiom.quads.map((q) => spo(quadToTriple(reskolemize(q)))));
    const covered = justs.flatMap((j, i) => (j.some((t) => own.has(spo(t))) ? [i] : []));
    return { axiom, triple, covered };
  });
  entries.sort((x, y) => {
    if (x.covered.length !== y.covered.length) return y.covered.length - x.covered.length;
    const dx = destructiveness(x.triple);
    const dy = destructiveness(y.triple);
    if (dx !== dy) return dx - dy;
    const ux = unsat.has(x.triple.subject) || unsat.has(x.triple.object) ? 0 : 1;
    const uy = unsat.has(y.triple.subject) || unsat.has(y.triple.object) ? 0 : 1;
    if (ux !== uy) return ux - uy;
    const kx = axiomKey(x.triple);
    const ky = axiomKey(y.triple);
    return kx < ky ? -1 : kx > ky ? 1 : 0;
  });

  const setVerified = best?.verifiedConsistent ?? null;
  const minimal = best?.minimal ?? null;

  // Did the removals match the store? assessEdit reports requested quads that are not in it (the
  // edit would change nothing). pairs: [] skips the disjointness probes, leaving one consistency check.
  const requested = entries.reduce((n, e) => n + e.axiom.quads.length, 0);
  let unmatched = 0;
  if (entries.length > 0) {
    try {
      const all = await lib.assessEdit({ remove: entries.flatMap((e) => e.axiom.quads) }, { pairs: [] });
      unmatched = all.unmatchedRemovals.length;
    } catch {
      // oracle unavailable: no match report
    }
  }

  // Per-axiom check: does removing THIS axiom alone restore consistency? With one axiom it is the
  // set check; otherwise one consistency check per axiom.
  const verifiedAlone = new Map<number, boolean | undefined>();
  for (let i = 0; i < entries.length; i++) {
    if (entries.length === 1) {
      verifiedAlone.set(i, setVerified ?? undefined);
      continue;
    }
    try {
      const a = await lib.assessEdit({ remove: entries[i].axiom.quads }, { pairs: [] });
      verifiedAlone.set(i, a.incomplete ? undefined : a.consistent);
    } catch {
      verifiedAlone.set(i, undefined); // oracle unavailable: leave unverified
    }
  }

  const repairs: RepairSuggestion[] = entries.map(({ axiom, triple, covered }, i) => {
    const kind = isTBoxAxiom(triple)
      ? 'a TBox/structural axiom (more invasive — verify intent before applying)'
      : hasIriObject(triple)
        ? 'an ABox/assertion (least-destructive choice)'
        : 'an annotation/literal assertion (least-destructive choice)';
    const coversText =
      covered.length > 1
        ? `resolves ${covered.length} of the ${justs.length} contradictions`
        : covered.length === 1
          ? `resolves contradiction ${covered[0] + 1}`
          : 'is part of the set that resolves the contradictions';
    const graphs = [...new Set(axiom.quads.map((q) => reskolemize(q).graph.value).filter(Boolean))];
    const alsoIn =
      graphs.length > 1 ? ` The axiom is stored in ${graphs.length} graphs (${graphs.join(', ')}).` : '';
    const rationale =
      `Remove ${localName(triple.subject)} ${localName(triple.predicate)} ` +
      `${localName(triple.object)} — ${kind}; this ${coversText}.${alsoIn}`;
    const verified = verifiedAlone.get(i);
    return {
      id: `R${i + 1}`,
      issue: 'inconsistency' as const,
      action: {
        tool: 'removeLink' as const,
        args: {
          subjectIri: triple.subject,
          predicateIri: triple.predicate,
          objectIri: triple.object,
          ...(triple.graph ? { graph: triple.graph } : {}),
          ...(triple.objectTermType ? { objectTermType: triple.objectTermType } : {}),
          ...(triple.objectDatatype ? { objectDatatype: triple.objectDatatype } : {}),
          ...(triple.objectLanguage ? { objectLanguage: triple.objectLanguage } : {}),
        },
      },
      rationale,
      justificationsCovered: covered,
      ...(verified !== undefined ? { verifiedConsistent: verified } : {}),
      ...(setVerified !== null ? { verifiedSet: setVerified } : {}),
      ...(minimal !== null ? { minimalityVerified: minimal } : {}),
    };
  });

  // A justification with no axiom at all (empty), or any justification when the reasoner found no
  // repair set, cannot be repaired automatically: say so instead of leaving the agent without guidance.
  const noSet = best === undefined;
  justs.forEach((j, idx) => {
    if (j.length > 0 && !noSet) return;
    const why = noSet
      ? `The reasoner found no repair set (${result.reason ?? 'none found'}).`
      : 'Its justification has no covering axiom (the reasoner returned an empty justification).';
    repairs.push({
      id: `R${repairs.length + 1}`,
      issue: 'inconsistency',
      action: { tool: 'removeLink', args: {} },
      rationale:
        `Contradiction ${idx + 1} cannot be repaired automatically. ${why} ` +
        'Inspect the ontology manually (e.g. an implicit entailment or a class definition rather than a single removable axiom).',
      justificationsCovered: [idx],
      needsManualReview: true,
    });
  });
  if (noSet && justs.length === 0) {
    repairs.push({
      id: 'R1',
      issue: 'inconsistency',
      action: { tool: 'removeLink', args: {} },
      rationale:
        `The ontology is inconsistent but the reasoner found no repair set (${result.reason ?? 'none found'}). ` +
        'Inspect the ontology manually.',
      needsManualReview: true,
    });
  }

  // --- Weakening: a weaker replacement for each rdfs:subClassOf culprit, offered next to deletion.
  // The reasoner does the work (candidates, verification of remove + add). 'delete' is dropped:
  // the deletion repair above is that. weaken() supports named-class subClassOf culprits only
  // and splits conjuncts itself.
  let weakenIncomplete = false;
  if (input.weaken !== false) {
    const culprits = new Map<string, LibAxiom>();
    for (const j of result.justifications) {
      for (const ax of j.axioms) {
        if (ax.principal.predicate.value !== RDFS_SUBCLASS_OF) continue;
        culprits.set(axiomKey(quadToTriple(reskolemize(ax.principal))), ax);
      }
    }
    for (const [key, culprit] of culprits) {
      let weakened: WeakenResult;
      try {
        weakened = await input.lib.weaken(culprit, input.timeoutMs !== undefined ? { timeout: input.timeoutMs } : undefined);
      } catch {
        weakenIncomplete = true; // oracle unavailable: deletion repairs still stand
        continue;
      }
      if (weakened.incomplete) weakenIncomplete = true;
      const owner =
        entries.findIndex((e) => axiomKey(e.triple) === key) >= 0
          ? repairs[entries.findIndex((e) => axiomKey(e.triple) === key)]
          : repairs.find((r) => !r.needsManualReview);
      const culpritTriple = quadToTriple(reskolemize(culprit.principal));
      const covered =
        owner?.justificationsCovered ??
        justs.flatMap((j, i) => (j.some((t) => spo(t) === spo(culpritTriple)) ? [i] : []));
      for (const w of weakened.weakenings) {
        if (w.strategy === 'delete') continue;
        const A = localName(culpritTriple.subject);
        const original = culpritTriple.object.startsWith(SKOLEM_PREFIX) ? 'a class expression' : localName(culpritTriple.object);
        const rationale =
          w.strategy === 'generalize' && w.change?.to
            ? `Weaken ${A} ⊑ ${original} to ${A} ⊑ ${localName(w.change.to)} (a named superclass; logically weaker) — ` +
              `keeps ${A} ⊑ ${localName(w.change.to)} instead of deleting the axiom.`
            : `Weaken ${A} ⊑ ${original} by dropping the conjunct ${localName(w.change?.from ?? '')} — ` +
              `keeps the remaining conjuncts instead of deleting the axiom.`;
        const triples = (qs: readonly Quad[]) =>
          qs.map((q) => {
            const t = quadToTriple(reskolemize(q));
            return { subject: t.subject, predicate: t.predicate, object: t.object, ...(t.graph ? { graph: t.graph } : {}) };
          });
        const verified = w.verifiedConsistent === true;
        repairs.push({
          id: `W${repairs.filter((r) => r.kind === 'weaken').length + 1}`,
          issue: 'inconsistency',
          kind: 'weaken',
          ...(owner ? { alternativeTo: owner.id } : {}),
          // `action` removes the culprit so an apply path that only knows `action` still removes it;
          // `batch` carries the full remove + add for a weakening-aware path.
          action: {
            tool: 'removeLink',
            args: {
              subjectIri: culpritTriple.subject,
              predicateIri: culpritTriple.predicate,
              objectIri: culpritTriple.object,
              ...(culpritTriple.graph ? { graph: culpritTriple.graph } : {}),
            },
          },
          batch: { removes: triples(w.remove), adds: triples(w.add) },
          weakerThan: `${A} ⊑ ${original}`,
          rationale: `${rationale} (less destructive than deletion — apply as a remove+add batch).`,
          justificationsCovered: covered,
          weakeningVerified: verified,
          weakeningNote: verified
            ? 'Verified by the reasoner: removing the original axiom and adding the weaker one leaves the ontology ' +
              'consistent and the subclass satisfiable.'
            : 'Not verified: the reasoner did not confirm that removing the original axiom and adding the weaker one ' +
              'leaves the ontology consistent.',
        });
      }
    }
  }

  const repairSetMatchWarning =
    unmatched > 0
      ? `Only ${requested - unmatched} of ${requested} repair triples matched a triple in the store; ` +
        'the consistency verdict may reflect an unchanged store rather than the repair\'s effect.'
      : undefined;

  return {
    ...base,
    consistent: false,
    repairs,
    repairSetVerifiedConsistent: setVerified,
    minimal,
    weakenIncomplete,
    ...(repairSetMatchWarning ? { repairSetMatchWarning } : {}),
  };
}
