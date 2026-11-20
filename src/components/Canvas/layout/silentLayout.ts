import type { LayoutFunction, LayoutGraph, Vector } from '@reactodia/workspace';

export interface SilentLayoutEdge {
  source: string;
  target: string;
}

export interface SilentLayoutOptions {
  sizes?: Map<string, { width: number; height: number }>;
  /** Initial positions used as starting bounds for free nodes, and as final positions for fixed nodes. */
  seeds?: Map<string, { x: number; y: number }>;
  /** Nodes whose positions must not change — returned at their seed position. */
  fixed?: Set<string>;
}

/**
 * Compute layout positions for a set of nodes without triggering Reactodia's
 * spinner overlay. Returns a Map from element IRI to position Vector.
 *
 * All nodes (fixed and free) are passed to the engine with `fixed: true` set
 * on fixed nodes. Engine wrappers handle fixed-node constraints (phantom
 * substitution or native support). As a safety net, fixed nodes are
 * overridden with their seed positions after the engine returns.
 */
export async function runSilentLayout(
  layoutFn: LayoutFunction,
  iris: string[],
  edges: SilentLayoutEdge[],
  options?: SilentLayoutOptions
): Promise<Map<string, Vector>> {
  if (iris.length === 0) return new Map();

  const fixedSet = options?.fixed;
  const allFixed = fixedSet && iris.every(id => fixedSet.has(id));

  // Short-circuit: all nodes fixed → return seeds directly, no engine call needed.
  if (allFixed) {
    const positions = new Map<string, Vector>();
    for (const id of iris) {
      const seed = options?.seeds?.get(id);
      if (seed) positions.set(id, { x: seed.x, y: seed.y });
    }
    return positions;
  }

  // Build graph with ALL nodes — fixed flag passed through to engine.
  const nodesMutable: Record<string, { types: []; fixed?: boolean }> = {};
  for (const id of iris) {
    nodesMutable[id] = {
      types: [],
      ...(fixedSet?.has(id) ? { fixed: true } : {}),
    };
  }

  // Keep ALL edges — engine wrappers handle fixed↔free edges via phantom substitution.
  const links: LayoutGraph['links'] = edges
    .map(e => ({ type: '' as any, source: e.source, target: e.target }));

  const graph: LayoutGraph = { nodes: nodesMutable as LayoutGraph['nodes'], links };

  const bounds: Record<string, { x: number; y: number; width: number; height: number }> = {};
  for (const id of iris) {
    const s = options?.sizes?.get(id);
    const seed = options?.seeds?.get(id);
    bounds[id] = {
      x: seed?.x ?? 0,
      y: seed?.y ?? 0,
      width: s?.width ?? 120,
      height: s?.height ?? 40,
    };
  }

  const result = await layoutFn(graph, { bounds });

  const positions = new Map<string, Vector>();
  for (const id of iris) {
    if (fixedSet?.has(id)) {
      // Safety net: use seed position even if engine moved the node.
      const seed = options?.seeds?.get(id);
      if (seed) positions.set(id, { x: seed.x, y: seed.y });
    } else {
      const b = result.bounds[id];
      if (b) positions.set(id, { x: b.x, y: b.y });
    }
  }

  return positions;
}
