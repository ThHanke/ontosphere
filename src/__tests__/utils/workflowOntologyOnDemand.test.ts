// The PyodideSemanticWorkflow ontology is reasoning input (urn:vg:ontologies). Startup loads
// only the catalog; the ontology is added once, when a workflow is first used.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const loadRDFFromUrl = vi.fn();
let ontologyGraphHasMarker = false;
vi.mock('../../utils/rdfManager', () => ({
  rdfManager: {
    loadRDFFromUrl: async (...a: unknown[]) => { await loadRDFFromUrl(...a); ontologyGraphHasMarker = true; },
    fetchQuadsPage: async () => ({ items: [], total: ontologyGraphHasMarker ? 1 : 0 }),
    removeGraph: vi.fn(),
  },
}));

import { loadWorkflowCatalog, loadWorkflowOntology } from '../../utils/workflowCatalogLoader';

const config: any = {
  workflowCatalogEnabled: true,
  workflowCatalogUrls: { ontology: 'https://x/spw.ttl', catalog: 'https://x/catalog.ttl', catalogUi: 'https://x/ui.ttl' },
};
const graphsLoaded = () => loadRDFFromUrl.mock.calls.map((c) => `${c[0]} -> ${c[1]}`);

describe('workflow ontology on demand', () => {
  beforeEach(() => { loadRDFFromUrl.mockReset(); loadRDFFromUrl.mockResolvedValue(undefined); ontologyGraphHasMarker = false; });

  it('startup catalog load leaves urn:vg:ontologies alone', async () => {
    const res = await loadWorkflowCatalog(config, { includeOntology: false });
    expect(res.success).toBe(true);
    expect(graphsLoaded().some((g) => g.endsWith('urn:vg:ontologies'))).toBe(false);
    expect(graphsLoaded()).toContain('https://x/catalog.ttl -> urn:vg:workflows');
  });

  it('loads the ontology once, however often a workflow is used', async () => {
    await loadWorkflowOntology(config);
    await loadWorkflowOntology(config);
    expect(graphsLoaded()).toEqual(['https://x/spw.ttl -> urn:vg:ontologies']);
  });

  it('loads again when the store was cleared', async () => {
    await loadWorkflowOntology(config);
    ontologyGraphHasMarker = false;
    await loadWorkflowOntology(config);
    expect(loadRDFFromUrl).toHaveBeenCalledTimes(2);
  });

  it('retries after a failed load', async () => {
    loadRDFFromUrl.mockRejectedValueOnce(new Error('offline'));
    expect((await loadWorkflowOntology(config)).success).toBe(false);
    expect((await loadWorkflowOntology(config)).success).toBe(true);
    expect(loadRDFFromUrl).toHaveBeenCalledTimes(2);
  });
});
