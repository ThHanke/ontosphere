import type { LayoutGraph, LayoutState } from '@reactodia/workspace';

export const PHANTOM_ID = '__fixed_phantom__';

export interface PhantomResult {
  graph: LayoutGraph;
  state: LayoutState;
  phantomId: string;
  originalFixedBounds: Record<string, LayoutState['bounds'][string]>;
}

/**
 * Replace all fixed nodes with a single phantom node sized to their bounding box.
 * Edges from free→fixed become free→phantom; fixed↔fixed edges are dropped.
 * Returns null when no nodes are fixed (caller should skip phantom path).
 */
export function substituteFixedWithPhantom(
  graph: LayoutGraph,
  state: LayoutState,
  fixedIds: ReadonlySet<string>
): PhantomResult | null {
  if (fixedIds.size === 0) return null;

  const originalFixedBounds: Record<string, LayoutState['bounds'][string]> = {};
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const id of fixedIds) {
    const b = state.bounds[id];
    if (!b) continue;
    originalFixedBounds[id] = b;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }

  if (minX === Infinity) return null;

  const phantomBounds = {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };

  const nodes: Record<string, LayoutGraph['nodes'][string]> = {};
  for (const [id, node] of Object.entries(graph.nodes)) {
    if (!fixedIds.has(id)) {
      nodes[id] = node;
    }
  }
  nodes[PHANTOM_ID] = { types: [] };

  const seenEdges = new Set<string>();
  const links: LayoutGraph['links'][number][] = [];
  for (const link of graph.links) {
    const srcFixed = fixedIds.has(link.source);
    const tgtFixed = fixedIds.has(link.target);
    if (srcFixed && tgtFixed) continue;

    const src = srcFixed ? PHANTOM_ID : link.source;
    const tgt = tgtFixed ? PHANTOM_ID : link.target;
    if (src === tgt) continue;

    const key = `${src}->${tgt}`;
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);

    links.push({ type: link.type, source: src, target: tgt });
  }

  const bounds: Record<string, LayoutState['bounds'][string]> = {};
  for (const id of Object.keys(nodes)) {
    if (id === PHANTOM_ID) {
      bounds[id] = phantomBounds;
    } else {
      bounds[id] = state.bounds[id] ?? { x: 0, y: 0, width: 120, height: 40 };
    }
  }

  return {
    graph: { nodes, links },
    state: { bounds },
    phantomId: PHANTOM_ID,
    originalFixedBounds,
  };
}

/**
 * Remove phantom from layout result and restore original fixed-node positions.
 *
 * The engine may have moved the phantom to a different position than the
 * original fixed bounding box. Free nodes are translated so they stay in the
 * correct spatial relationship to the fixed area (anchored to the original
 * bounding box, not to wherever the engine placed the phantom).
 */
export function restoreFixed(
  resultState: LayoutState,
  phantomId: string,
  originalFixedBounds: Record<string, LayoutState['bounds'][string]>
): LayoutState {
  const phantomEnginePos = resultState.bounds[phantomId];

  // Compute original fixed bounding box (same as what substituteFixedWithPhantom produced)
  let minX = Infinity, minY = Infinity;
  for (const b of Object.values(originalFixedBounds)) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
  }

  // Shift = difference between where the phantom was originally vs where engine put it
  const dx = phantomEnginePos ? minX - phantomEnginePos.x : 0;
  const dy = phantomEnginePos ? minY - phantomEnginePos.y : 0;

  const bounds: Record<string, LayoutState['bounds'][string]> = {};

  for (const [id, b] of Object.entries(resultState.bounds)) {
    if (id === phantomId) continue;
    bounds[id] = {
      x: b.x + dx,
      y: b.y + dy,
      width: b.width,
      height: b.height,
    };
  }

  for (const [id, b] of Object.entries(originalFixedBounds)) {
    bounds[id] = b;
  }

  return { bounds };
}
