import { describe, it, expect } from 'vitest';
import type { LayoutGraph, LayoutState } from '@reactodia/workspace';
import { dagreLayout } from '../dagreCore';
import { substituteFixedWithPhantom, restoreFixed, PHANTOM_ID } from '../fixedPhantom';
import { runSilentLayout } from '../silentLayout';

function makeGraph(nodeIds: string[], edges: [string, string][], fixedSet?: Set<string>): LayoutGraph {
  const nodes: Record<string, { types: []; fixed?: boolean }> = {};
  for (const id of nodeIds) nodes[id] = { types: [], ...(fixedSet?.has(id) ? { fixed: true } : {}) };
  return { nodes, links: edges.map(([s, t]) => ({ type: '' as any, source: s, target: t })) };
}

function makeState(nodeIds: string[], positions?: Record<string, { x: number; y: number }>, size = { width: 120, height: 40 }): LayoutState {
  const bounds: Record<string, { x: number; y: number; width: number; height: number }> = {};
  for (const id of nodeIds) {
    const pos = positions?.[id];
    bounds[id] = { x: pos?.x ?? 0, y: pos?.y ?? 0, ...size };
  }
  return { bounds };
}

function overlapArea(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): number {
  const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return ox > 0 && oy > 0 ? ox * oy : 0;
}

function checkNoOverlaps(bounds: LayoutState['bounds'], nodeIds: string[]) {
  const overlaps: string[] = [];
  for (let i = 0; i < nodeIds.length; i++) {
    for (let j = i + 1; j < nodeIds.length; j++) {
      const a = bounds[nodeIds[i]];
      const b = bounds[nodeIds[j]];
      if (!a || !b) continue;
      const area = overlapArea(a, b);
      if (area > 0) {
        overlaps.push(`${nodeIds[i]} <-> ${nodeIds[j]}: ${area.toFixed(0)}px²`);
      }
    }
  }
  return overlaps;
}

function dagreWithFixed(graph: LayoutGraph, state: LayoutState, dir: 'LR' | 'TB' = 'TB', spacing = 120): LayoutState {
  const fixedIds = new Set(Object.entries(graph.nodes).filter(([, n]) => n.fixed).map(([id]) => id));
  const phantom = substituteFixedWithPhantom(graph, state, fixedIds);
  const g = phantom ? phantom.graph : graph;
  const s = phantom ? phantom.state : state;
  const result = dagreLayout(g, s, dir, spacing);
  if (phantom) return restoreFixed(result, phantom.phantomId, phantom.originalFixedBounds);
  return result;
}

const NODES = ['a', 'b', 'c', 'd', 'e'];
const EDGES: [string, string][] = [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e']];

describe('Overlap audit — dagre with phantom', () => {
  it('no overlaps: fixed at baseline positions', () => {
    const baseline = dagreLayout(makeGraph(NODES, EDGES), makeState(NODES), 'TB', 120);
    const fixedSet = new Set(['a', 'c']);
    const fixedPos: Record<string, { x: number; y: number }> = {
      a: baseline.bounds['a'],
      c: baseline.bounds['c'],
    };
    const result = dagreWithFixed(makeGraph(NODES, EDGES, fixedSet), makeState(NODES, fixedPos), 'TB', 120);
    const overlaps = checkNoOverlaps(result.bounds, NODES);
    expect(overlaps).toEqual([]);
  });

  it('no overlaps: fixed at non-baseline positions', () => {
    const fixedSet = new Set(['c']);
    const result = dagreWithFixed(
      makeGraph(NODES, EDGES, fixedSet),
      makeState(NODES, { c: { x: 0, y: 160 } }),
      'TB', 120
    );
    const overlaps = checkNoOverlaps(result.bounds, NODES);
    expect(overlaps).toEqual([]);
  });

  it('no overlaps: fixed node directly in free-node region', () => {
    // Place fixed node exactly where dagre would put a free node
    const baseline = dagreLayout(makeGraph(NODES, EDGES), makeState(NODES), 'TB', 120);
    const fixedSet = new Set(['c']);
    const result = dagreWithFixed(
      makeGraph(NODES, EDGES, fixedSet),
      makeState(NODES, { c: { x: baseline.bounds['b'].x, y: baseline.bounds['b'].y } }),
      'TB', 120
    );
    const overlaps = checkNoOverlaps(result.bounds, NODES);
    expect(overlaps).toEqual([]);
  });

  it('no overlaps: two fixed nodes close together', () => {
    const fixedSet = new Set(['a', 'b']);
    const result = dagreWithFixed(
      makeGraph(NODES, EDGES, fixedSet),
      makeState(NODES, { a: { x: 0, y: 0 }, b: { x: 10, y: 50 } }),
      'TB', 120
    );
    // Fixed nodes CAN overlap each other (user placed them there)
    // But free nodes must not overlap fixed nodes
    const freeIds = NODES.filter(id => !fixedSet.has(id));
    const fixedIds = [...fixedSet];
    for (const freeId of freeIds) {
      for (const fixedId of fixedIds) {
        const area = overlapArea(result.bounds[freeId], result.bounds[fixedId]);
        expect(area, `${freeId} overlaps fixed ${fixedId}`).toBe(0);
      }
    }
  });

  it('phantom bbox: free nodes placed outside phantom area', () => {
    const fixedSet = new Set(['b', 'd']);
    const phantom = substituteFixedWithPhantom(
      makeGraph(NODES, EDGES, fixedSet),
      makeState(NODES, { b: { x: 100, y: 100 }, d: { x: 200, y: 200 } }),
      fixedSet
    );
    expect(phantom).not.toBeNull();
    const engineResult = dagreLayout(phantom!.graph, phantom!.state, 'TB', 120);
    const phantomBounds = engineResult.bounds[PHANTOM_ID];
    // Every free node must not overlap the phantom
    for (const id of Object.keys(engineResult.bounds)) {
      if (id === PHANTOM_ID) continue;
      const area = overlapArea(engineResult.bounds[id], phantomBounds);
      expect(area, `free node ${id} overlaps phantom`).toBe(0);
    }
  });

  it('wide scatter: 3 fixed nodes spread across space', () => {
    const fixedSet = new Set(['a', 'c', 'e']);
    const result = dagreWithFixed(
      makeGraph(NODES, EDGES, fixedSet),
      makeState(NODES, { a: { x: 0, y: 0 }, c: { x: 500, y: 0 }, e: { x: 250, y: 500 } }),
      'TB', 120
    );
    // Free nodes (b, d) must not overlap any fixed node
    for (const freeId of ['b', 'd']) {
      for (const fixedId of ['a', 'c', 'e']) {
        const area = overlapArea(result.bounds[freeId], result.bounds[fixedId]);
        expect(area, `${freeId} overlaps fixed ${fixedId}`).toBe(0);
      }
    }
  });
});

describe('Overlap audit — runSilentLayout', () => {
  const dagreFn = async (graph: LayoutGraph, state: LayoutState) =>
    dagreLayout(graph, state, 'TB', 120);

  it('no overlaps: silentLayout with fixed nodes', async () => {
    const baseline = dagreLayout(makeGraph(NODES, EDGES), makeState(NODES), 'TB', 120);
    const seeds = new Map(NODES.map(id => [id, { x: baseline.bounds[id].x, y: baseline.bounds[id].y }]));
    const result = await runSilentLayout(dagreFn, NODES, EDGES.map(([s, t]) => ({ source: s, target: t })), {
      seeds,
      fixed: new Set(['a', 'c']),
    });
    // Convert positions to bounds for overlap check
    const bounds: Record<string, { x: number; y: number; width: number; height: number }> = {};
    for (const [id, pos] of result) {
      bounds[id] = { x: pos.x, y: pos.y, width: 120, height: 40 };
    }
    const overlaps = checkNoOverlaps(bounds, NODES);
    expect(overlaps).toEqual([]);
  });

  it('all positions present after silentLayout with fixed', async () => {
    const result = await runSilentLayout(dagreFn, NODES, EDGES.map(([s, t]) => ({ source: s, target: t })), {
      seeds: new Map([['a', { x: 100, y: 100 }], ['c', { x: 300, y: 300 }]]),
      fixed: new Set(['a', 'c']),
    });
    for (const id of NODES) {
      expect(result.has(id), `missing position for ${id}`).toBe(true);
    }
    // Fixed at exact seeds
    expect(result.get('a')).toEqual({ x: 100, y: 100 });
    expect(result.get('c')).toEqual({ x: 300, y: 300 });
  });
});
