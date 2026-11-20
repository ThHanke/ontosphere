import { describe, it, expect } from 'vitest';
import {
  substituteFixedWithPhantom,
  restoreFixed,
  PHANTOM_ID,
} from '../fixedPhantom';
import type { LayoutGraph, LayoutState } from '@reactodia/workspace';

function makeGraph(
  nodeIds: string[],
  edges: [string, string][]
): LayoutGraph {
  const nodes: Record<string, { types: [] }> = {};
  for (const id of nodeIds) nodes[id] = { types: [] };
  return {
    nodes,
    links: edges.map(([s, t]) => ({ type: '' as any, source: s, target: t })),
  };
}

function makeState(
  entries: Record<string, { x: number; y: number; width: number; height: number }>
): LayoutState {
  return { bounds: entries };
}

describe('substituteFixedWithPhantom', () => {
  it('returns null when no nodes are fixed', () => {
    const graph = makeGraph(['a', 'b'], [['a', 'b']]);
    const state = makeState({
      a: { x: 0, y: 0, width: 100, height: 50 },
      b: { x: 200, y: 0, width: 100, height: 50 },
    });
    expect(substituteFixedWithPhantom(graph, state, new Set())).toBeNull();
  });

  it('creates phantom at correct bounding box for 2 fixed + 3 free', () => {
    const graph = makeGraph(['a', 'b', 'c', 'd', 'e'], [
      ['a', 'c'], ['b', 'd'], ['c', 'e'], ['a', 'b'],
    ]);
    const state = makeState({
      a: { x: 10, y: 20, width: 100, height: 50 },
      b: { x: 300, y: 100, width: 80, height: 40 },
      c: { x: 0, y: 200, width: 120, height: 60 },
      d: { x: 200, y: 200, width: 120, height: 60 },
      e: { x: 100, y: 400, width: 100, height: 50 },
    });
    const fixed = new Set(['a', 'b']);
    const result = substituteFixedWithPhantom(graph, state, fixed);

    expect(result).not.toBeNull();
    const r = result!;

    // Phantom bbox: min(10,300)=10, min(20,100)=20, max(110,380)=380, max(70,140)=140
    expect(r.state.bounds[PHANTOM_ID]).toEqual({
      x: 10, y: 20, width: 370, height: 120,
    });

    // Fixed nodes absent from graph
    expect(r.graph.nodes).not.toHaveProperty('a');
    expect(r.graph.nodes).not.toHaveProperty('b');
    // Free nodes + phantom present
    expect(r.graph.nodes).toHaveProperty('c');
    expect(r.graph.nodes).toHaveProperty('d');
    expect(r.graph.nodes).toHaveProperty('e');
    expect(r.graph.nodes).toHaveProperty(PHANTOM_ID);

    // Edges: a→c becomes phantom→c, b→d becomes phantom→d, a↔b dropped
    const edgeKeys = r.graph.links.map(
      (l) => `${l.source}->${l.target}`
    );
    expect(edgeKeys).toContain(`${PHANTOM_ID}->c`);
    expect(edgeKeys).toContain(`${PHANTOM_ID}->d`);
    expect(edgeKeys).toContain('c->e');
    expect(edgeKeys).not.toContain('a->b');
    expect(edgeKeys).not.toContain('a->c');
  });

  it('handles all nodes fixed — phantom = full bbox, no free nodes', () => {
    const graph = makeGraph(['a', 'b'], [['a', 'b']]);
    const state = makeState({
      a: { x: 0, y: 0, width: 100, height: 50 },
      b: { x: 200, y: 100, width: 80, height: 40 },
    });
    const result = substituteFixedWithPhantom(graph, state, new Set(['a', 'b']));
    expect(result).not.toBeNull();
    const r = result!;

    // Only phantom in graph
    const nodeIds = Object.keys(r.graph.nodes);
    expect(nodeIds).toEqual([PHANTOM_ID]);

    // All edges dropped (both endpoints fixed)
    expect(r.graph.links).toHaveLength(0);
  });

  it('handles single fixed node — phantom = that node bounds', () => {
    const graph = makeGraph(['a', 'b'], [['a', 'b']]);
    const state = makeState({
      a: { x: 50, y: 60, width: 100, height: 40 },
      b: { x: 200, y: 200, width: 80, height: 30 },
    });
    const result = substituteFixedWithPhantom(graph, state, new Set(['a']));
    expect(result).not.toBeNull();
    expect(result!.state.bounds[PHANTOM_ID]).toEqual({
      x: 50, y: 60, width: 100, height: 40,
    });
  });

  it('handles scattered fixed nodes — bbox encompasses all', () => {
    const graph = makeGraph(['a', 'b', 'c', 'd'], []);
    const state = makeState({
      a: { x: 0, y: 0, width: 50, height: 50 },
      b: { x: 500, y: 500, width: 50, height: 50 },
      c: { x: 100, y: 100, width: 50, height: 50 },
      d: { x: 250, y: 250, width: 50, height: 50 },
    });
    const result = substituteFixedWithPhantom(graph, state, new Set(['a', 'b']));
    expect(result).not.toBeNull();
    // bbox: min(0,500)=0, min(0,500)=0, max(50,550)=550, max(50,550)=550
    expect(result!.state.bounds[PHANTOM_ID]).toEqual({
      x: 0, y: 0, width: 550, height: 550,
    });
  });

  it('deduplicates edges when two free nodes connect to different fixed nodes', () => {
    // c→a and c→b both become c→phantom — should deduplicate
    const graph = makeGraph(['a', 'b', 'c'], [
      ['c', 'a'], ['c', 'b'],
    ]);
    const state = makeState({
      a: { x: 0, y: 0, width: 50, height: 50 },
      b: { x: 100, y: 0, width: 50, height: 50 },
      c: { x: 50, y: 100, width: 50, height: 50 },
    });
    const result = substituteFixedWithPhantom(graph, state, new Set(['a', 'b']));
    expect(result).not.toBeNull();
    const phantomEdges = result!.graph.links.filter(
      (l) => l.target === PHANTOM_ID || l.source === PHANTOM_ID
    );
    expect(phantomEdges).toHaveLength(1);
    expect(phantomEdges[0].source).toBe('c');
    expect(phantomEdges[0].target).toBe(PHANTOM_ID);
  });
});

describe('restoreFixed', () => {
  it('removes phantom and restores fixed nodes at original positions', () => {
    const engineResult: LayoutState = {
      bounds: {
        [PHANTOM_ID]: { x: 10, y: 20, width: 370, height: 120 },
        c: { x: 50, y: 300, width: 120, height: 60 },
        d: { x: 250, y: 300, width: 120, height: 60 },
        e: { x: 150, y: 500, width: 100, height: 50 },
      },
    };
    const originalFixed = {
      a: { x: 10, y: 20, width: 100, height: 50 },
      b: { x: 300, y: 100, width: 80, height: 40 },
    };

    const restored = restoreFixed(engineResult, PHANTOM_ID, originalFixed);

    // Phantom gone
    expect(restored.bounds).not.toHaveProperty(PHANTOM_ID);

    // Fixed at exact original positions
    expect(restored.bounds['a']).toEqual({ x: 10, y: 20, width: 100, height: 50 });
    expect(restored.bounds['b']).toEqual({ x: 300, y: 100, width: 80, height: 40 });

    // Free at engine-computed positions
    expect(restored.bounds['c']).toEqual({ x: 50, y: 300, width: 120, height: 60 });
    expect(restored.bounds['d']).toEqual({ x: 250, y: 300, width: 120, height: 60 });
    expect(restored.bounds['e']).toEqual({ x: 150, y: 500, width: 100, height: 50 });
  });
});
