// src/workers/canonicalHierarchy.ts
//
// WHY THIS EXISTS
// ---------------
// Konclude reports the inferred named-class hierarchy as a transitive reduction, but the
// reduction it picks is NOT canonical: across independent cold sessions on a byte-identical
// reasoning base it emits different subsets of the redundant subsumption edges. Measured on
// PMDco @3b98aad + the Fe-Si record, ten cold sessions returned 380-389 inferred triples,
// and all 59 differing statements were rdfs:subClassOf between named classes. The transitive
// CLOSURE was identical (8246 statements) in every run, so no entailment varies — but the
// materialised graph, the triple counts we publish, and anything diffing sessions all do.
//
// This module makes the emitted hierarchy a function of the entailed hierarchy alone:
// compute the closure, then take THE canonical transitive reduction of it. Equivalent
// classes (cycles) are handled by reducing the condensation and emitting a deterministic
// ring inside each cycle, so the closure is preserved exactly.
//
// Scope: named-class rdfs:subClassOf only. Blank-node class expressions, rdf:type and every
// other materialised predicate are passed through untouched — the observed variance was
// confined to named-class subsumption.

export type Edge = readonly [string, string];

const key = (a: string, b: string) => `${a} ${b}`;

function adjacency(edges: readonly Edge[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const [a, b] of edges) {
    let s = m.get(a);
    if (!s) m.set(a, (s = new Set()));
    s.add(b);
  }
  return m;
}

/**
 * Tarjan's SCC, iterative (the class graph can be deep and a recursive version risks a
 * stack overflow inside the worker). Returns every strongly connected component; a
 * component with more than one member is a set of mutually equivalent classes.
 */
function stronglyConnectedComponents(edges: readonly Edge[]): string[][] {
  const g = adjacency(edges);
  const nodes = new Set<string>();
  for (const [a, b] of edges) { nodes.add(a); nodes.add(b); }

  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const out: string[][] = [];
  let counter = 0;

  for (const root of nodes) {
    if (index.has(root)) continue;
    // frame: [node, iterator over successors]
    const work: Array<{ v: string; it: Iterator<string> }> = [
      { v: root, it: (g.get(root) ?? new Set<string>())[Symbol.iterator]() },
    ];
    index.set(root, counter); low.set(root, counter); counter++;
    stack.push(root); onStack.add(root);

    while (work.length) {
      const frame = work[work.length - 1];
      const step = frame.it.next();
      if (!step.done) {
        const w = step.value;
        if (!index.has(w)) {
          index.set(w, counter); low.set(w, counter); counter++;
          stack.push(w); onStack.add(w);
          work.push({ v: w, it: (g.get(w) ?? new Set<string>())[Symbol.iterator]() });
        } else if (onStack.has(w)) {
          low.set(frame.v, Math.min(low.get(frame.v)!, index.get(w)!));
        }
      } else {
        work.pop();
        const v = frame.v;
        if (work.length) {
          const parent = work[work.length - 1].v;
          low.set(parent, Math.min(low.get(parent)!, low.get(v)!));
        }
        if (low.get(v) === index.get(v)) {
          const comp: string[] = [];
          let w: string;
          do { w = stack.pop()!; onStack.delete(w); comp.push(w); } while (w !== v);
          out.push(comp);
        }
      }
    }
  }
  return out;
}

/** Transitive reduction of a DAG: keep (a,b) only when b is unreachable from a via a path of length >= 2. */
function reduceDag(edges: readonly Edge[]): Edge[] {
  const g = adjacency(edges);
  const kept: Edge[] = [];
  for (const [a, b] of edges) {
    let redundant = false;
    for (const mid of g.get(a) ?? []) {
      if (mid === b) continue;
      // depth-first from mid; if it reaches b, the direct edge (a,b) is implied
      const seen = new Set<string>([mid]);
      const stack = [mid];
      while (stack.length) {
        const n = stack.pop()!;
        if (n === b) { redundant = true; break; }
        for (const x of g.get(n) ?? []) if (!seen.has(x)) { seen.add(x); stack.push(x); }
      }
      if (redundant) break;
    }
    if (!redundant) kept.push([a, b]);
  }
  return kept;
}

/**
 * Canonical inferred named-class subsumption edges for a reasoning base.
 *
 * Deterministic: the result depends only on the SET of asserted+inferred edges, never on
 * their order or on which redundant subset the reasoner happened to report. Closure-
 * preserving: `closure(asserted ∪ result) === closure(asserted ∪ inferred)`.
 *
 * @param asserted named-class subClassOf edges already present outside the inferred graph
 * @param inferred named-class subClassOf edges the reasoner materialised
 * @returns the canonical edges to materialise (asserted edges are never re-emitted)
 */
export function canonicalInferredHierarchy(
  asserted: readonly Edge[],
  inferred: readonly Edge[],
): Edge[] {
  const all: Edge[] = [...asserted, ...inferred];
  if (all.length === 0) return [];

  const comps = stronglyConnectedComponents(all);
  // Deterministic representative per component: the lexicographically smallest IRI.
  const repOf = new Map<string, string>();
  const membersOf = new Map<string, string[]>();
  for (const comp of comps) {
    const sorted = [...comp].sort();
    const rep = sorted[0];
    for (const m of sorted) repOf.set(m, rep);
    membersOf.set(rep, sorted);
  }

  // Condensation: edges between distinct components, deduplicated and sorted.
  const condensed = new Set<string>();
  for (const [a, b] of all) {
    const ra = repOf.get(a) ?? a;
    const rb = repOf.get(b) ?? b;
    if (ra !== rb) condensed.add(key(ra, rb));
  }
  const condensedEdges: Edge[] = [...condensed]
    .sort()
    .map((k) => k.split(' ') as unknown as Edge);

  const result: Edge[] = [...reduceDag(condensedEdges)];

  // Re-materialise each equivalence cycle as a deterministic ring over its sorted members,
  // so members remain mutually derivable and the closure is unchanged.
  for (const [, members] of membersOf) {
    if (members.length < 2) continue;
    for (let i = 0; i < members.length; i++) {
      result.push([members[i], members[(i + 1) % members.length]]);
    }
  }

  const assertedSet = new Set(asserted.map(([a, b]) => key(a, b)));
  const seen = new Set<string>();
  const out: Edge[] = [];
  for (const [a, b] of result) {
    const k = key(a, b);
    if (a === b || assertedSet.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push([a, b]);
  }
  // Stable order so serialisations and diffs are reproducible too.
  out.sort((x, y) => (x[0] === y[0] ? x[1].localeCompare(y[1]) : x[0].localeCompare(y[0])));
  return out;
}

/** Transitive closure over the edge set — exported for the regression test. */
export function transitiveClosure(edges: readonly Edge[]): Set<string> {
  const g = adjacency(edges);
  const out = new Set<string>();
  for (const start of g.keys()) {
    const seen = new Set<string>();
    const stack = [...(g.get(start) ?? [])];
    while (stack.length) {
      const n = stack.pop()!;
      if (seen.has(n)) continue;
      seen.add(n);
      out.add(key(start, n));
      for (const m of g.get(n) ?? []) if (!seen.has(m)) stack.push(m);
    }
  }
  return out;
}
