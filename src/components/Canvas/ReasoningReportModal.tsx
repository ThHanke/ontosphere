import { memo, useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { rdfManager } from '../../utils/rdfManager';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { ScrollArea } from '../ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { AlertTriangle, CheckCircle, XCircle, Lightbulb, Clock, Shield, ExternalLink, X, Wrench } from 'lucide-react';
import { isShaclInfo } from '@/utils/shaclInfo';
import type { ReasoningResult } from '../../utils/rdfManager';
import { getWorkspaceRefs } from '@/mcp/workspaceContext';
import { useShaclResultStore, makeShaclMessageKey } from '@/stores/shaclResultStore';
import { RepairSuggestions } from './RepairSuggestions';

const InferredTriplesTable = () => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [pageItems, setPageItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);

  const fetchPage = useCallback(async (p: number, ps: number) => {
    setLoading(true);
    try {
      const offset = Math.max(0, (p - 1) * ps);
      const res = await rdfManager.fetchQuadsPage({
        graphName: 'urn:vg:inferred',
        offset,
        limit: ps,
        serialize: true
      });
      setTotal(res && typeof res.total === 'number' ? res.total : 0);
      setPageItems(Array.isArray(res.items) ? res.items : []);
    } catch (e) {
      console.error("Failed to fetch inferred triples page", e);
      setPageItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPage(page, pageSize);
  }, [page, pageSize, fetchPage]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    setPage((prev) => (prev > totalPages ? totalPages : prev));
  }, [total, pageSize]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const toggleSelect = (idx: number) => {
    setSelected((s) => ({ ...s, [idx]: !s[idx] }));
  };

  const promoteSelected = async () => {
    try {
      const selectedIndices = Object.keys(selected)
        .map((k) => parseInt(k, 10))
        .filter((i) => selected[i]);
      if (selectedIndices.length === 0) {
        toast.info("No triples selected for promotion.");
        return;
      }

      const adds: any[] = [];
      for (const si of selectedIndices) {
        const q = pageItems[si];
        if (!q) continue;
        adds.push({ subject: q.subject, predicate: q.predicate, object: q.object });
      }

      await rdfManager.applyBatch({ removes: [], adds }, "urn:vg:data");
      try { await rdfManager.emitAllSubjects("urn:vg:data"); } catch (_) { /* ignore */ }

      const promotedAdds = [...adds];
      setSelected({});
      void fetchPage(page, pageSize);

      toast.success(`Promoted ${promotedAdds.length} triple(s) into urn:vg:data`, {
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              await rdfManager.applyBatch({ removes: promotedAdds, adds: [] }, "urn:vg:data");
              try { await rdfManager.emitAllSubjects("urn:vg:data"); } catch (_) { /* ignore */ }
              toast.success(`Undid promotion of ${promotedAdds.length} triple(s)`);
            } catch (err) {
              console.error("Undo promotion failed", err);
              toast.error("Undo failed (see console)");
            }
          },
        },
        duration: 8000,
      });
    } catch (e) {
      console.error("Promote failed", e);
      toast.error("Promotion failed (see console).");
    }
  };

  const copyTriple = async (q: any) => {
    try {
      const t = `${q.subject} ${q.predicate} ${q.object}`;
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(t);
        toast.success("Copied triple to clipboard");
      } else {
        toast.info("Copy the triple below", { description: t });
      }
    } catch (e) {
      console.error("copy failed", e);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <button className="btn" onClick={() => {
            const newSel = { ...selected };
            pageItems.forEach((_, i) => { newSel[i] = true; });
            setSelected(newSel);
          }}>Select page</button>
          <button className="btn" onClick={() => setSelected({})}>Clear</button>
          <button className="btn btn-primary" onClick={promoteSelected}>Promote selected</button>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm">Page size</label>
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading inferred triples...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th></th>
                <th>Subject</th>
                <th>Predicate</th>
                <th>Object</th>
                <th>Graph</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((q, i) => {
                const globalIndex = (page - 1) * pageSize + i;
                return (
                  <tr key={globalIndex} className="border-b">
                    <td>
                      <input type="checkbox" checked={!!selected[i]} onChange={() => toggleSelect(i)} />
                    </td>
                    <td className="font-mono break-all">{q.subject}</td>
                    <td className="font-mono break-all">{q.predicate}</td>
                    <td className="font-mono break-all">{q.object}</td>
                    <td className="text-xs text-muted-foreground">{q.graph}</td>
                    <td className="text-right">
                      <button className="btn btn-ghost" onClick={() => copyTriple(q)}>Copy</button>
                    </td>
                  </tr>
                );
              })}
              {pageItems.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="text-center text-muted-foreground py-8">No inferred triples on this page.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between mt-2">
        <div className="text-sm">Showing page {page} of {totalPages} — {total} triples</div>
        <div className="flex items-center gap-2">
          <button className="btn" onClick={() => { setPage((p) => Math.max(1, p-1)); }} disabled={page <= 1}>Prev</button>
          <button className="btn" onClick={() => { setPage((p) => Math.min(totalPages, p+1)); }} disabled={page >= totalPages}>Next</button>
        </div>
      </div>
    </div>
  );
};

interface ReasoningReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentReasoning: ReasoningResult | null;
  reasoningHistory: ReasoningResult[];
}

export const ReasoningReportModal = memo(({ open, onOpenChange, currentReasoning, reasoningHistory }: ReasoningReportModalProps) => {
  const [graphCounts, setGraphCounts] = useState<Record<string, number>>({});
  const [activeTab, setActiveTab] = useState('summary');
  const panelRef = useRef<HTMLDivElement>(null);
  const reasoningId = currentReasoning?.id ?? null;
  const hasReasoning = !!currentReasoning;

  const [showInfo, setShowInfo] = useState(false);
  const navigateToNode = useCallback((iri: string) => {
    try {
      const { navigateToIri } = getWorkspaceRefs();
      navigateToIri?.(iri);
      onOpenChange(false);
    } catch { /* workspace not ready */ }
  }, [onOpenChange]);

  const navigateToShaclMessage = useCallback((
    severity: string,
    nodeId: string | undefined,
    message: string,
  ) => {
    const store = useShaclResultStore.getState();
    store.highlightMessage(makeShaclMessageKey(severity, nodeId, message));
    store.requestOpenPanel();
    if (nodeId) {
      try {
        const { navigateToIri } = getWorkspaceRefs();
        navigateToIri?.(nodeId);
      } catch { /* workspace not ready */ }
    }
    onOpenChange(false);
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    let cancelled = false;
    const loadGraphCounts = async () => {
      if (!open || !hasReasoning) {
        if (!cancelled) setGraphCounts(prev => Object.keys(prev).length === 0 ? prev : {});
        return;
      }
      try {
        const counts = await rdfManager.getGraphCounts();
        if (!cancelled) setGraphCounts(counts || {});
      } catch (err) {
        if (!cancelled) {
          console.warn("[ReasoningReportModal] Failed to fetch graph counts", err);
          setGraphCounts({});
        }
      }
    };
    void loadGraphCounts();
    return () => { cancelled = true; };
  }, [open, reasoningId, hasReasoning]);

  if (!open) return null;

  if (!currentReasoning) {
    return (
      <div
        className="absolute inset-0 z-50 flex items-start justify-center bg-black/60 pt-4"
        onMouseDown={e => { if (e.target === e.currentTarget) onOpenChange(false); }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Reasoning report"
          className="w-full max-w-lg max-h-[calc(100%-2rem)] overflow-y-auto rounded-lg border bg-background p-6 shadow-lg animate-in fade-in-0 zoom-in-95 duration-200"
        >
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">Reasoning Report</h2>
            <button onClick={() => onOpenChange(false)} className="rounded-sm p-1.5 opacity-70 hover:opacity-100 hover:bg-accent transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-sm text-muted-foreground">
            No reasoning results available. Run reasoning on your knowledge graph to see analysis.
          </p>
        </div>
      </div>
    );
  }

  const { errors, warnings: allWarnings, inferences, status, duration, timestamp } = currentReasoning;
  // sh:Info findings are kept apart: they do not count as warnings and are listed on request only
  const warnings = allWarnings.filter(w => !isShaclInfo(w));
  const infos = allWarnings.filter(isShaclInfo);
  const isConsistent = currentReasoning?.isConsistent;
  const inferredCount = graphCounts['urn:vg:inferred'] || 0;

  const isShaclRule = (rule: string) => rule.startsWith('shacl:') || rule === 'sh:ValidationResult';
  const shaclErrors = errors.filter(e => isShaclRule(e.rule));
  const shaclWarnings = warnings.filter(w => isShaclRule(w.rule));
  // F7: first OWL (non-SHACL) clash, used to preview the cause in the inconsistency summary.
  const clashError = errors.find(e => !isShaclRule(e.rule));
  const clashLocalName = clashError?.nodeId ? (clashError.nodeId.split(/[#/]/).pop() ?? clashError.nodeId) : null;
  const shaclTotal = shaclErrors.length + shaclWarnings.length;
  const shaclHasErrors = shaclErrors.length > 0;
  // The graph is repairable when the reasoner found a logical contradiction or
  // when SHACL reported any conformance failure — these are exactly the cases
  // computeRepairs can produce executable fixes for.
  const hasRepairableIssues = isConsistent === false || shaclTotal > 0;

  return (
    <div
      className="absolute inset-0 z-50 flex items-start justify-center bg-black/60 pt-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onOpenChange(false); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Reasoning report"
        className="w-full max-w-[min(90%,64rem)] max-h-[calc(100%-2rem)] overflow-y-auto rounded-lg border bg-background p-6 shadow-lg animate-in fade-in-0 zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              Reasoning Report
              <Badge variant={status === 'completed' ? 'default' : status === 'error' ? 'destructive' : 'secondary'}>
                {status}
              </Badge>
            </h2>
            <p className="text-sm text-muted-foreground flex items-center gap-4 mt-1">
              <span>Generated at {new Date(timestamp).toLocaleString()}</span>
              {duration && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {duration}ms
                </span>
              )}
            </p>
          </div>
          <button onClick={() => onOpenChange(false)} className="rounded-sm p-1.5 opacity-70 hover:opacity-100 hover:bg-accent transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="flex w-full overflow-x-auto">
            <TabsTrigger value="summary" className="flex-1 min-w-0 text-xs sm:text-sm px-2 sm:px-3">Summary</TabsTrigger>
            <TabsTrigger value="errors" className="flex-1 min-w-0 text-xs sm:text-sm px-2 sm:px-3 flex items-center gap-1">
              Errors
              {errors.length > 0 && (
                <Badge variant="destructive" className="ml-1 h-4 min-w-4 px-1 text-[10px]">
                  {errors.length}
                </Badge>
              )}
            </TabsTrigger>
            {hasRepairableIssues && (
              <TabsTrigger value="repairs" className="flex-1 min-w-0 text-xs sm:text-sm px-2 sm:px-3 flex items-center gap-1">
                <Wrench className="w-3 h-3" />
                Repairs
              </TabsTrigger>
            )}
            <TabsTrigger value="warnings" className="flex-1 min-w-0 text-xs sm:text-sm px-2 sm:px-3 flex items-center gap-1">
              Warnings
              {warnings.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 min-w-4 px-1 text-[10px]">
                  {warnings.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="inferences" className="flex-1 min-w-0 text-xs sm:text-sm px-2 sm:px-3 flex items-center gap-1">
              Infer
              {inferences.length > 0 && (
                <Badge variant="outline" className="ml-1 h-4 min-w-4 px-1 text-[10px]">
                  {inferences.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-1 min-w-0 text-xs sm:text-sm px-2 sm:px-3">History</TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-destructive" />
                    Errors
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-destructive">{errors.length}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-warning" />
                    Warnings
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-warning">{warnings.length}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-primary" />
                    Inferences
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">{inferences.length}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Shield className="w-4 h-4 text-blue-500" />
                    SHACL
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-sm font-medium ${shaclTotal === 0 ? 'text-green-600' : shaclHasErrors ? 'text-destructive' : 'text-warning'}`}>
                    {shaclTotal === 0 ? (infos.length > 0 ? `Conforms · ${infos.length} info` : 'Conforms') : shaclHasErrors ? `${shaclErrors.length} errors, ${shaclWarnings.length} warnings` : `${shaclWarnings.length} warnings`}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-success" />
                    Status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm font-medium">
                    {errors.length > 0 ? 'Errors Found' : warnings.length > 0 ? 'Valid (with warnings)' : 'Valid'}
                  </div>
                </CardContent>
              </Card>
            </div>

            {isConsistent === false && (
              <Card className="bg-destructive/10 border-destructive/20">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-destructive">
                    <XCircle className="w-5 h-5" />
                    <span className="font-medium">OWL DL inconsistency detected</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    The ontology contains a logical contradiction.
                    {clashError && (
                      <>
                        {' '}First clash:{' '}
                        <span className="font-medium text-foreground">
                          {clashLocalName ? `${clashLocalName} — ` : ''}{clashError.rule}
                        </span>.
                      </>
                    )}
                    {' '}Inferred triples were not generated. See the Errors tab for the
                    specific axioms involved.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('repairs')}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline cursor-pointer"
                    aria-label="View suggested repairs for this inconsistency"
                  >
                    <Wrench className="w-3 h-3" />
                    View suggested repairs
                  </button>
                </CardContent>
              </Card>
            )}

            {status === 'completed' && errors.length === 0 && isConsistent !== false && (
              <Card className="bg-success/10 border-success/20">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-success">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-medium">Knowledge graph is consistent!</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {warnings.length > 0 && (
              <Card className="border-warning/10 bg-warning/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-warning" />
                    Validation Messages (preview)
                    <Badge variant="secondary" className="ml-auto">{warnings.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {warnings.slice(0, 5).map((w, i) => (
                      <div key={i} className="text-sm">
                        <div className="font-medium">{w.rule}</div>
                        <div className="text-xs text-muted-foreground break-words">{w.message}</div>
                        {w.nodeId && (
                          <button
                            className="flex items-center gap-1 text-xs text-primary hover:underline mt-0.5 cursor-pointer"
                            onClick={() => isShaclRule(w.rule)
                              ? navigateToShaclMessage('warning', w.nodeId, w.message)
                              : navigateToNode(w.nodeId!)
                            }
                          >
                            <ExternalLink className="w-3 h-3" />
                            {w.nodeId.split(/[#/]/).pop() || w.nodeId}
                          </button>
                        )}
                      </div>
                    ))}
                    {warnings.length > 5 && (
                      <div className="text-xs text-muted-foreground">Showing 5 of {warnings.length}. See Warnings tab.</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="errors">
            <ScrollArea className="h-[400px]">
              <div className="space-y-3">
                {errors.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    No errors found in the knowledge graph.
                  </div>
                ) : (
                  errors.map((error, index) => (
                    <Card key={index} className="border-destructive/20">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <XCircle className="w-4 h-4 text-destructive" />
                          <span>{error.rule}</span>
                          <Badge variant={isShaclRule(error.rule) ? 'outline' : 'secondary'} className="ml-auto text-[10px]">
                            {isShaclRule(error.rule) ? 'SHACL' : 'OWL'}
                          </Badge>
                          <Badge variant="destructive">
                            {error.severity}
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm">{error.message}</p>
                        {error.nodeId ? (
                          <button
                            className="flex items-center gap-1 text-xs text-primary hover:underline mt-2 cursor-pointer"
                            onClick={() => isShaclRule(error.rule)
                              ? navigateToShaclMessage('error', error.nodeId, error.message)
                              : navigateToNode(error.nodeId!)
                            }
                          >
                            <ExternalLink className="w-3 h-3" />
                            {error.nodeId.split(/[#/]/).pop() || error.nodeId}
                          </button>
                        ) : error.edgeId ? (
                          <p className="text-xs text-muted-foreground mt-2">
                            Affected: Edge {error.edgeId}
                          </p>
                        ) : null}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {hasRepairableIssues && (
            <TabsContent value="repairs">
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Reasoner-computed, verified fixes. Each suggestion is the same minimal
                    repair the symbolic verifier would hand an agent — click “Apply fix” to
                    apply it to your data, then re-run reasoning to confirm.
                  </p>
                  <RepairSuggestions reasoningId={reasoningId} isConsistent={isConsistent} />
                </div>
              </ScrollArea>
            </TabsContent>
          )}

          <TabsContent value="warnings">
            <ScrollArea className="h-[400px]">
              <div className="space-y-3">
                {warnings.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    No warnings for the knowledge graph.
                  </div>
                ) : (
                  warnings.map((warning, index) => (
                    <Card key={index} className="border-warning/20">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-warning" />
                          <span>{warning.rule}</span>
                          <Badge variant={isShaclRule(warning.rule) ? 'outline' : 'secondary'} className="ml-auto text-[10px]">
                            {isShaclRule(warning.rule) ? 'SHACL' : 'OWL'}
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm">{warning.message}</p>
                        {warning.nodeId ? (
                          <button
                            className="flex items-center gap-1 text-xs text-primary hover:underline mt-2 cursor-pointer"
                            onClick={() => isShaclRule(warning.rule)
                              ? navigateToShaclMessage('warning', warning.nodeId, warning.message)
                              : navigateToNode(warning.nodeId!)
                            }
                          >
                            <ExternalLink className="w-3 h-3" />
                            {warning.nodeId.split(/[#/]/).pop() || warning.nodeId}
                          </button>
                        ) : warning.edgeId ? (
                          <p className="text-xs text-muted-foreground mt-2">
                            Affected: Edge {warning.edgeId}
                          </p>
                        ) : null}
                      </CardContent>
                    </Card>
                  ))
                )}
                {infos.length > 0 && (
                  <div className="pt-2">
                    <button
                      className="text-xs text-primary hover:underline cursor-pointer"
                      onClick={() => setShowInfo(v => !v)}
                    >
                      {showInfo ? 'Hide' : 'Show'} {infos.length} info finding{infos.length !== 1 ? 's' : ''} (SHACL sh:Info, not counted as warnings)
                    </button>
                    {showInfo && (
                      <div className="mt-2 space-y-1">
                        {infos.map((info, index) => (
                          <div key={index} className="text-xs text-muted-foreground break-words border-b border-border/40 pb-1">
                            {info.nodeId ? (
                              <button
                                className="text-primary hover:underline cursor-pointer mr-1"
                                onClick={() => navigateToShaclMessage('info', info.nodeId!, info.message)}
                              >
                                {info.nodeId.split(/[#/]/).pop() || info.nodeId}
                              </button>
                            ) : null}
                            {info.message}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="inferences">
            <ScrollArea className="h-[400px]">
              <div className="space-y-3">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <span>Inferred Triples</span>
                      <Badge variant="outline" className="ml-auto">
                        {inferredCount}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <InferredTriplesTable />
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="history">
            <ScrollArea className="h-[400px]">
              <div className="space-y-3">
                {reasoningHistory.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    No reasoning history available.
                  </div>
                ) : (
                  reasoningHistory.map((result) => (
                    <Card key={result.id}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center justify-between">
                          <span>{new Date(result.timestamp).toLocaleString()}</span>
                          <div className="flex items-center gap-2">
                            <Badge variant={
                              result.status === 'completed' ? 'default' :
                              result.status === 'error' ? 'destructive' : 'secondary'
                            }>
                              {result.status}
                            </Badge>
                            {result.duration && (
                              <Badge variant="outline">{result.duration}ms</Badge>
                            )}
                          </div>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="flex items-center gap-1">
                            <XCircle className="w-3 h-3 text-destructive" />
                            {result.errors.length} errors
                          </span>
                          <span className="flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-warning" />
                            {result.warnings.length} warnings
                          </span>
                          <span className="flex items-center gap-1">
                            <Lightbulb className="w-3 h-3 text-primary" />
                            {result.inferences.length} inferences
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
});

ReasoningReportModal.displayName = 'ReasoningReportModal';
