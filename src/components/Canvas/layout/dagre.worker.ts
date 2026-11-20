import type { LayoutGraph, LayoutState } from '@reactodia/workspace';
import { dagreLayout } from './dagreCore';

export interface DagreWorkerRequest {
  graph: LayoutGraph;
  state: LayoutState;
  direction: 'LR' | 'TB';
  spacing: number;
}

export interface DagreWorkerResponse {
  bounds: LayoutState['bounds'];
}

self.onmessage = ({ data }: MessageEvent<DagreWorkerRequest>) => {
  const { graph, state, direction, spacing } = data;
  const result = dagreLayout(graph, state, direction, spacing);
  (self as unknown as Worker).postMessage({ bounds: result.bounds } satisfies DagreWorkerResponse);
};
