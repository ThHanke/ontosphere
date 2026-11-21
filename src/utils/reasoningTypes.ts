export interface ReasoningError {
  nodeId?: string;
  edgeId?: string;
  message: string;
  rule: string;
  severity: "critical" | "error";
  sourceShape?: string;
  /** Raw sh:resultPath IRI — used for label resolution in the UI. */
  path?: string;
  /**
   * Complete justification axiom set for an inconsistency clash (the MIPS):
   * every axiom whose conjunction causes the contradiction. Present on OWL DL
   * inconsistency errors so the UI and MCP agents can inspect the full clash,
   * not just the truncated summary in `message`.
   */
  justification?: { subject: string; predicate: string; object: string }[];
}

export interface ReasoningWarning {
  nodeId?: string;
  edgeId?: string;
  message: string;
  rule: string;
  severity?: "critical" | "warning" | "info";
  sourceShape?: string;
  /** Raw sh:resultPath IRI — used for label resolution in the UI. */
  path?: string;
}

export interface ReasoningInference {
  type: "property" | "class" | "relationship";
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
}

export interface ShaclViolation {
  focusNode: string | null;
  path: string | null;
  severity: string | null;
  message: string | null;
  sourceShape: string | null;
  constraint: string | null;
  source: "shacl";
}

/** Node shapes that select focus nodes in the record (subjects in urn:vg:data), per validation. */
export interface ShaclFocusSummary {
  nodeShapes: number;
  shapesWithFocus: number;
  /** focus-node count per node shape that selects at least one node */
  perShape: Record<string, number>;
  /** the inferred graph held quads when this validation ran */
  afterReasoning: boolean;
}

/** The last asserted-only validation against the last validation after reasoning. */
export interface ShaclFocusComparison {
  nodeShapes: number;
  asserted: number;
  reasoned: number;
  /** shapes that select nodes only after reasoning */
  newlyActive: string[];
}

export interface ShaclFocusInfo {
  focus?: ShaclFocusSummary;
  focusComparison?: ShaclFocusComparison;
}

export interface ReasoningResult {
  id: string;
  timestamp: number;
  status: "running" | "completed" | "error";
  duration?: number;
  errors: ReasoningError[];
  warnings: ReasoningWarning[];
  inferences: ReasoningInference[];
  inferredQuads?: { subject: string; predicate: string; object: string; graph?: string }[];
  isConsistent?: boolean | null;
  /** SHACL focus-node counts of the validation that ran after reasoning */
  shaclFocus?: ShaclFocusInfo;
  meta?: {
    usedReasoner?: boolean;
    workerDurationMs?: number;
    totalDurationMs?: number;
    addedCount?: number;
    ruleQuadCount?: number;
  };
}
