import { create } from "zustand";
import type { ShapeLoadError } from "../utils/shaclShapeLoader";
import type { ReasoningError, ReasoningWarning } from "../utils/reasoningTypes";

export interface ShaclResultState {
  errors: ReasoningError[];
  warnings: ReasoningWarning[];
  activeMessageKey: string | null;
  panelOpenRequest: number;
  shaclShapesLoaded: boolean;
  /** Shape files of the last load that could not be read or parsed; shown as a badge and list in the SHACL panel. */
  shapeLoadErrors: ShapeLoadError[];
  setShapeLoadErrors: (errors: ShapeLoadError[]) => void;
  setShaclResults: (errors: ReasoningError[], warnings: ReasoningWarning[]) => void;
  clearShaclResults: () => void;
  highlightMessage: (key: string) => void;
  clearHighlight: () => void;
  requestOpenPanel: () => void;
  setShaclShapesLoaded: (loaded: boolean) => void;
}

export function makeShaclMessageKey(
  severity: string,
  nodeId: string | undefined,
  message: string,
): string {
  return `${severity}::${nodeId ?? ""}::${message}`;
}

export const useShaclResultStore = create<ShaclResultState>((set) => ({
  errors: [],
  warnings: [],
  activeMessageKey: null,
  panelOpenRequest: 0,
  shaclShapesLoaded: false,
  shapeLoadErrors: [],
  setShapeLoadErrors: (errors) => set({ shapeLoadErrors: errors }),
  setShaclResults: (errors, warnings) => set({ errors, warnings }),
  clearShaclResults: () => set({ errors: [], warnings: [], activeMessageKey: null }),
  highlightMessage: (key) => set({ activeMessageKey: key }),
  clearHighlight: () => set({ activeMessageKey: null }),
  requestOpenPanel: () => set((s) => ({ panelOpenRequest: s.panelOpenRequest + 1 })),
  setShaclShapesLoaded: (loaded) => set({ shaclShapesLoaded: loaded }),
}));
