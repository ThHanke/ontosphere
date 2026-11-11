/**
 * @fileoverview Workflow Catalog Loader
 * Loads PyodideSemanticWorkflow catalog files from web URLs into the RDF store
 */

import { rdfManager } from "./rdfManager";
import type { AppConfig } from "../stores/appConfigStore";

export interface LoadCatalogResult {
  success: boolean;
  reason?: 'disabled' | 'network-error' | 'parse-error';
  error?: string;
  loadedFiles?: string[];
}

export interface LoadCatalogOptions {
  timeoutMs?: number;
  /**
   * Also load the PyodideSemanticWorkflow ontology into urn:vg:ontologies (default true).
   * The startup load passes false: the ontology is reasoning input, so it is added only when
   * a workflow is actually used (see loadWorkflowOntology).
   */
  includeOntology?: boolean;
}

const WORKFLOWS_GRAPH = "urn:vg:workflows";
const ONTOLOGIES_GRAPH = "urn:vg:ontologies";
const DEFAULT_TIMEOUT_MS = 30000;

/** A term every PyodideSemanticWorkflow ontology defines; its presence means the ontology is loaded. */
const SPW_MARKER_SUBJECT = "https://thhanke.github.io/PyodideSemanticWorkflow#expectedType";

/**
 * Add the PyodideSemanticWorkflow ontology to urn:vg:ontologies, the graph reasoning reads.
 * Workflows need it (classes and properties of the steps and variables they use), but a session
 * that never uses a workflow should not reason over it. Called when a workflow is dropped on
 * the canvas. The graph itself says whether it is already there, so a cleared store loads again.
 */
export async function loadWorkflowOntology(
  config: AppConfig,
  options?: { timeoutMs?: number },
): Promise<LoadCatalogResult> {
  const url = config.workflowCatalogUrls?.ontology;
  if (!url) return { success: false, reason: 'parse-error', error: 'No workflow ontology URL configured' };
  try {
    const present = await rdfManager.fetchQuadsPage({
      graphName: ONTOLOGIES_GRAPH, filter: { subject: SPW_MARKER_SUBJECT }, limit: 1,
    });
    if ((present?.total ?? 0) > 0) return { success: true, loadedFiles: [] };
    await rdfManager.loadRDFFromUrl(url, ONTOLOGIES_GRAPH, { timeoutMs: options?.timeoutMs ?? DEFAULT_TIMEOUT_MS });
    return { success: true, loadedFiles: [url] };
  } catch (error) {
    console.error('[WorkflowCatalog] Failed to load SPW ontology:', error);
    return {
      success: false,
      reason: 'network-error',
      error: `Failed to load ontology: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Load the workflow catalog from configured URLs
 * @param config Application configuration containing workflow catalog settings
 * @param options Loading options (timeout, etc.)
 * @returns Result indicating success or failure with details
 */
export async function loadWorkflowCatalog(
  config: AppConfig,
  options?: LoadCatalogOptions,
): Promise<LoadCatalogResult> {
  if (!config.workflowCatalogEnabled) {
    return { success: false, reason: 'disabled' };
  }

  // Defensive check: ensure workflowCatalogUrls exists
  if (!config.workflowCatalogUrls || typeof config.workflowCatalogUrls !== 'object') {
    console.error('[WorkflowCatalog] workflowCatalogUrls is missing or invalid');
    return {
      success: false,
      reason: 'parse-error',
      error: 'Configuration is missing workflowCatalogUrls. Please reset your settings.',
    };
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const loadedFiles: string[] = [];

  try {
    // 1. Load SPW ontology into ontologies graph
    if (options?.includeOntology !== false) {
      const ontology = await loadWorkflowOntology(config, { timeoutMs });
      if (!ontology.success) return ontology;
      loadedFiles.push(...(ontology.loadedFiles ?? []));
    }

    // 2. Load workflow catalog into workflows graph
    try {
      await rdfManager.loadRDFFromUrl(
        config.workflowCatalogUrls.catalog,
        WORKFLOWS_GRAPH,
        { timeoutMs },
      );
      loadedFiles.push(config.workflowCatalogUrls.catalog);
    } catch (error) {
      console.error('[WorkflowCatalog] Failed to load catalog:', error);
      return {
        success: false,
        reason: 'network-error',
        error: `Failed to load catalog: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    // 3. Load UI metadata into workflows graph (optional - don't fail if this doesn't work)
    try {
      await rdfManager.loadRDFFromUrl(
        config.workflowCatalogUrls.catalogUi,
        WORKFLOWS_GRAPH,
        { timeoutMs },
      );
      loadedFiles.push(config.workflowCatalogUrls.catalogUi);
    } catch (error) {
      // UI metadata is optional - log warning but don't fail
      console.warn('[WorkflowCatalog] UI metadata could not be loaded (this is optional):', error);
      // Continue without UI metadata
    }

    return { success: true, loadedFiles };
  } catch (error) {
    console.error('[WorkflowCatalog] Unexpected error:', error);
    return {
      success: false,
      reason: 'parse-error',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Clear workflow catalog data from the store
 */
export async function clearWorkflowCatalog(): Promise<void> {
  try {
    rdfManager.removeGraph(WORKFLOWS_GRAPH);
    console.log('[WorkflowCatalog] Cleared workflows graph');
  } catch (error) {
    console.error('[WorkflowCatalog] Failed to clear workflows graph:', error);
  }
}

/**
 * Get counts of loaded workflow catalog triples
 */
export async function getWorkflowCatalogStats(): Promise<{
  workflowsGraphSize: number;
  ontologiesGraphSize: number;
}> {
  try {
    const counts = await rdfManager.getGraphCounts();
    return {
      workflowsGraphSize: counts[WORKFLOWS_GRAPH] || 0,
      ontologiesGraphSize: counts[ONTOLOGIES_GRAPH] || 0,
    };
  } catch (error) {
    console.error('[WorkflowCatalog] Failed to get stats:', error);
    return {
      workflowsGraphSize: 0,
      ontologiesGraphSize: 0,
    };
  }
}
