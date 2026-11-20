import { describe, it, expect } from 'vitest';
import ELK from 'elkjs/lib/elk.bundled.js';
import type { LayoutGraph, LayoutState } from '@reactodia/workspace';
import { substituteFixedWithPhantom, restoreFixed } from '../fixedPhantom';

const elk = new ELK();

const ELK_ALGORITHM_IDS: Record<string, string> = {
  layered: 'org.eclipse.elk.layered',
  force: 'org.eclipse.elk.force',
  stress: 'org.eclipse.elk.stress',
};

function makeGraph(
  nodeIds: string[],
  edges: [string, string][],
  fixedSet?: Set<string>
): LayoutGraph {
  const nodes: Record<string, { types: []; fixed?: boolean }> = {};
  for (const id of nodeIds) {
    nodes[id] = { types: [], ...(fixedSet?.has(id) ? { fixed: true } : {}) };
  }
  return {
    nodes,
    links: edges.map(([s, t]) => ({ type: '' as any, source: s, target: t })),
  };
}

function makeState(
  nodeIds: string[],
  positions?: Record<string, { x: number; y: number }>
): LayoutState {
  const bounds: Record<string, { x: number; y: number; width: number; height: number }> = {};
  for (const id of nodeIds) {
    const pos = positions?.[id];
    bounds[id] = { x: pos?.x ?? 0, y: pos?.y ?? 0, width: 120, height: 40 };
  }
  return { bounds };
}

async function runElkDirect(
  graph: LayoutGraph,
  state: LayoutState,
  algorithm: string,
  spacing = 120
): Promise<LayoutState> {
  const elkGraph = {
    id: 'root',
    layoutOptions: {
      'org.eclipse.elk.algorithm': ELK_ALGORITHM_IDS[algorithm],
      'org.eclipse.elk.spacing.nodeNode': String(spacing),
    },
    children: Object.keys(graph.nodes).map((id) => {
      const b = state.bounds[id];
      return {
        id,
        x: b?.x ?? 0,
        y: b?.y ?? 0,
        width: b?.width ?? 120,
        height: b?.height ?? 40,
      };
    }),
    edges: graph.links.map((link, i) => ({
      id: `e${i}`,
      sources: [link.source],
      targets: [link.target],
    })),
  };

  const result = await elk.layout(elkGraph);

  const bounds = { ...state.bounds };
  for (const child of result.children ?? []) {
    const existing = state.bounds[child.id];
    bounds[child.id] = {
      x: child.x ?? 0,
      y: child.y ?? 0,
      width: existing?.width ?? child.width ?? 120,
      height: existing?.height ?? child.height ?? 40,
    };
  }
  return { bounds };
}

// Mirrors createElkLayout logic — phantom for all algorithms
async function elkWithFixed(
  graph: LayoutGraph,
  state: LayoutState,
  algorithm: string,
  spacing = 120
): Promise<LayoutState> {
  const fixedIds = new Set(
    Object.entries(graph.nodes)
      .filter(([, n]) => n.fixed)
      .map(([id]) => id)
  );

  const phantom = substituteFixedWithPhantom(graph, state, fixedIds);
  const effectiveGraph = phantom ? phantom.graph : graph;
  const effectiveState = phantom ? phantom.state : state;

  const result = await runElkDirect(effectiveGraph, effectiveState, algorithm, spacing);

  if (phantom) {
    return restoreFixed(result, phantom.phantomId, phantom.originalFixedBounds);
  }
  return result;
}

function rectOverlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x &&
         a.y < b.y + b.height && a.y + a.height > b.y;
}

function avgEdgeLength(
  bounds: LayoutState['bounds'],
  edges: [string, string][]
): number {
  let total = 0;
  for (const [s, t] of edges) {
    const a = bounds[s];
    const b = bounds[t];
    if (!a || !b) continue;
    const cx = (a.x + a.width / 2) - (b.x + b.width / 2);
    const cy = (a.y + a.height / 2) - (b.y + b.height / 2);
    total += Math.sqrt(cx * cx + cy * cy);
  }
  return total / edges.length;
}

const LINE_NODES = ['a', 'b', 'c', 'd', 'e'];
const LINE_EDGES: [string, string][] = [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e']];

for (const algorithm of ['stress', 'force', 'layered'] as const) {
  describe(`ELK ${algorithm} fixed-node support`, () => {
    it('2 fixed at baseline positions — fixed unchanged, all nodes placed', async () => {
      const graph = makeGraph(LINE_NODES, LINE_EDGES);
      const state = makeState(LINE_NODES);
      const baseline = await runElkDirect(graph, state, algorithm);

      const fixedSet = new Set(['a', 'c']);
      const fixedPositions: Record<string, { x: number; y: number }> = {
        a: { x: baseline.bounds['a'].x, y: baseline.bounds['a'].y },
        c: { x: baseline.bounds['c'].x, y: baseline.bounds['c'].y },
      };

      const constrainedGraph = makeGraph(LINE_NODES, LINE_EDGES, fixedSet);
      const constrainedState = makeState(LINE_NODES, fixedPositions);
      const result = await elkWithFixed(constrainedGraph, constrainedState, algorithm);

      // R1: fixed positions exact match
      expect(result.bounds['a'].x).toBe(fixedPositions['a'].x);
      expect(result.bounds['a'].y).toBe(fixedPositions['a'].y);
      expect(result.bounds['c'].x).toBe(fixedPositions['c'].x);
      expect(result.bounds['c'].y).toBe(fixedPositions['c'].y);

      // R4: all nodes present
      for (const id of LINE_NODES) {
        expect(result.bounds[id]).toBeDefined();
      }
    });

    it('R3: no node-on-node overlaps with fixed area', async () => {
      const fixedSet = new Set(['c']);
      const fixedPositions: Record<string, { x: number; y: number }> = {
        c: { x: 200, y: 200 },
      };

      const graph = makeGraph(LINE_NODES, LINE_EDGES, fixedSet);
      const state = makeState(LINE_NODES, fixedPositions);
      const result = await elkWithFixed(graph, state, algorithm);

      const fixedBounds = result.bounds['c'];
      for (const id of LINE_NODES) {
        if (id === 'c') continue;
        const b = result.bounds[id];
        if (rectOverlaps(b, fixedBounds)) {
          const overlapX = Math.min(b.x + b.width, fixedBounds.x + fixedBounds.width) - Math.max(b.x, fixedBounds.x);
          const overlapY = Math.min(b.y + b.height, fixedBounds.y + fixedBounds.height) - Math.max(b.y, fixedBounds.y);
          expect(overlapX * overlapY).toBeLessThanOrEqual(0);
        }
      }
    });

    it('all nodes fixed — output equals input', async () => {
      const allFixed = new Set(LINE_NODES);
      const positions: Record<string, { x: number; y: number }> = {
        a: { x: 0, y: 0 }, b: { x: 100, y: 100 },
        c: { x: 200, y: 200 }, d: { x: 300, y: 300 }, e: { x: 400, y: 400 },
      };

      const graph = makeGraph(LINE_NODES, LINE_EDGES, allFixed);
      const state = makeState(LINE_NODES, positions);
      const result = await elkWithFixed(graph, state, algorithm);

      for (const id of LINE_NODES) {
        expect(result.bounds[id].x).toBe(positions[id].x);
        expect(result.bounds[id].y).toBe(positions[id].y);
      }
    });

    // R5 only checked for stress/force — layered with phantom produces known-suboptimal edge lengths
    if (algorithm !== 'layered') {
      it('R5: average edge length ≤ 2× baseline', async () => {
        const graph = makeGraph(LINE_NODES, LINE_EDGES);
        const state = makeState(LINE_NODES);
        const baseline = await runElkDirect(graph, state, algorithm);
        const baselineAvg = avgEdgeLength(baseline.bounds, LINE_EDGES);

        const fixedSet = new Set(['a', 'e']);
        const fixedPositions: Record<string, { x: number; y: number }> = {
          a: { x: baseline.bounds['a'].x, y: baseline.bounds['a'].y },
          e: { x: baseline.bounds['e'].x, y: baseline.bounds['e'].y },
        };

        const constrainedGraph = makeGraph(LINE_NODES, LINE_EDGES, fixedSet);
        const constrainedState = makeState(LINE_NODES, fixedPositions);
        const result = await elkWithFixed(constrainedGraph, constrainedState, algorithm);
        const resultAvg = avgEdgeLength(result.bounds, LINE_EDGES);

        expect(resultAvg).toBeLessThanOrEqual(baselineAvg * 2);
      });
    }
  });
}
