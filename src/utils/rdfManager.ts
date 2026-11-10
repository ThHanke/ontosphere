import type {
  ReasoningError,
  ReasoningInference,
  ReasoningResult,
  ReasoningWarning,
} from "./reasoningTypes";
export type {
  ReasoningError,
  ReasoningInference,
  ReasoningResult,
  ReasoningWarning,
  ShaclViolation,
} from "./reasoningTypes";

import { RDFManagerImpl } from "./rdfManager.impl";
export type { SuggestRepairsResult } from "../mcp/tools/repairAdapter";
import { createRdfManagerWorkerClient } from "./rdfManager.workerClient";

let sharedWorkerClient: ReturnType<typeof createRdfManagerWorkerClient> | null = null;

const getWorkerClient = () => {
  if (!sharedWorkerClient) {
    sharedWorkerClient = createRdfManagerWorkerClient();
  }
  return sharedWorkerClient;
};

export const rdfManager = new RDFManagerImpl({ workerClient: getWorkerClient() });

export { RDFManagerImpl as RDFManager };
