/**
 * @fileoverview Configuration Panel Component
 * Provides UI for managing and testing persistent app configurations
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Slider } from '../ui/slider';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
// Tailwind-native dialog (no Radix)
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Settings, Download, Upload, RotateCcw, RefreshCw } from 'lucide-react';
import { useAppConfigStore } from '../../stores/appConfigStore';
import { useOntologyStore } from '../../stores/ontologyStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { WELL_KNOWN } from '../../utils/wellKnownOntologies';
import { fallback } from '../../utils/startupDebug';
import { toast } from 'sonner';
import { getRdfManager } from '../../utils/storeHelpers';
import { loadWorkflowCatalog, getWorkflowCatalogStats } from '../../utils/workflowCatalogLoader';
import { useShaclResultStore } from '../../stores/shaclResultStore';



export interface ConfigurationPanelProps {
  triggerVariant?: 'default' | 'none' | 'fixed-icon' | 'inline-icon';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const ConfigurationPanel = ({
  triggerVariant = 'default',
  open: controlledOpen,
  onOpenChange,
}: ConfigurationPanelProps) => {
  // Use internal state when not controlled, otherwise use props
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined && onOpenChange !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;
  
  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (isControlled) {
      onOpenChange?.(newOpen);
    } else {
      setInternalOpen(newOpen);
    }
  }, [isControlled, onOpenChange]);
  const [importText, setImportText] = useState('');
  const [workflowStats, setWorkflowStats] = useState({ workflowsGraphSize: 0, ontologiesGraphSize: 0 });
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);

  // Blacklist UI local state (decoupled from persisted config until applied)
  const [blacklistEnabledLocal, setBlacklistEnabledLocal] = useState<boolean>(() => {
    try { return !!useAppConfigStore.getState().config.blacklistEnabled; } catch { return true; }
  });
  const [prefixesText, setPrefixesText] = useState<string>(() => {
    try { return (useAppConfigStore.getState().config.blacklistedPrefixes || []).join(', '); } catch { return 'owl, rdf, rdfs, xml, xsd'; }
  });
  const [urisText, setUrisText] = useState<string>(() => {
    try { return (useAppConfigStore.getState().config.blacklistedUris || []).join(', '); } catch { return 'http://www.w3.org/2002/07/owl, http://www.w3.org/1999/02/22-rdf-syntax-ns#'; }
  });

      useEffect(() => {
    {
      const cfg = useAppConfigStore.getState().config;
      setBlacklistEnabledLocal(!!cfg.blacklistEnabled);
      setPrefixesText((cfg.blacklistedPrefixes || []).join(', '));
      setUrisText((cfg.blacklistedUris || []).join(', '));
    }
  }, []);

  const {
    config,
    setCurrentLayout,
    setLayoutAnimations,
    setLayoutSpacing,
    setCanvasTheme,
    setAutoReasoning,
    setAutoDiscoverOntologies,
    setClusteringAlgorithm,
    // Reasoning rulesets setter
    setReasoningRulesets,
    setReasonerBackend,
    resetToDefaults,
    exportConfig,
    importConfig,
    // Blacklist controls
    setBlacklistEnabled,
    setBlacklistedPrefixes,
    setBlacklistedUris,
    // Persisted autoload toggle
    setPersistedAutoload,
    removeAdditionalOntology,
    // Debugging toggles
    setDebugRdfLogging,
    // Debug master toggle
    setDebugAll,
    setTooltipEnabled,
    // Large graph threshold control
    setLargeGraphThreshold,
    // Workflow catalog controls
    setWorkflowCatalogEnabled,
    setWorkflowCatalogUrls,
    setLoadWorkflowCatalogOnStartup,
    resetWorkflowCatalogUrls,
  } = useAppConfigStore();

  const { settings: appSettings, updateSettings } = useSettingsStore();

  const KNOWN_PROXIES = [
    { label: "corsproxy.io — works on public HTTPS deployments", value: "https://corsproxy.io/?url=" },
    { label: "None (disabled)", value: "__none__" },
    { label: "Custom (self-hosted or other)…", value: "__custom__" },
  ];

  const resolveProxySelection = (url: string) => {
    if (!url) return "__none__";
    const known = KNOWN_PROXIES.find(p => p.value === url && p.value !== "__custom__" && p.value !== "__none__");
    return known ? url : "__custom__";
  };

  const [corsProxyUrlLocal, setCorsProxyUrlLocal] = useState(appSettings.corsProxyUrl);
  const [corsProxySelection, setCorsProxySelection] = useState(() => resolveProxySelection(appSettings.corsProxyUrl));

  const saveCorsProxy = (url: string) => {
    try {
      updateSettings({ corsProxyUrl: url });
      toast.success('CORS proxy saved');
    } catch {
      toast.error('Failed to save CORS proxy');
    }
  };

  // Load workflow stats when dialog opens
  useEffect(() => {
    if (isOpen) {
      getWorkflowCatalogStats().then(setWorkflowStats).catch(console.error);
    }
  }, [isOpen]);

  /**
   * Clear all cluster state from the live React Flow canvas.
   * Removes both 'cluster' and 'collection' cluster nodes, un-hides their
   * members, and strips cluster boundary edges.  Called before emitAllSubjects
   * triggers a fresh re-cluster so the canvas doesn't flash stale clusters.
   */
  const clearClusterState = () => {
    try {
      const reactFlowInstance = (window as any).__VG_RF_INSTANCE;
      if (reactFlowInstance && typeof reactFlowInstance.getNodes === 'function') {
        const currentNodes = reactFlowInstance.getNodes();
        const currentEdges = reactFlowInstance.getEdges();

        // Remove ALL cluster nodes (both 'cluster' and 'collection' types)
        // and un-hide members that were hidden by them.
        const cleanedNodes = currentNodes
          .filter((n: any) => !(n.data as any)?.clusterType)
          .map((n: any) => ({ ...n, hidden: false }));

        // Remove cluster boundary edges
        const cleanedEdges = currentEdges.filter(
          (e: any) => !String(e.id).startsWith('cluster-edge-'),
        );

        reactFlowInstance.setNodes(cleanedNodes);
        reactFlowInstance.setEdges(cleanedEdges);

        console.log('[VG_UI] Cleared cluster state:', {
          removedNodes: currentNodes.length - cleanedNodes.length,
          removedEdges: currentEdges.length - cleanedEdges.length,
        });
      }
    } catch (err) {
      console.error('[VG_DEBUG] Failed to clear cluster state:', err);
    }
  };

  /**
   * Trigger a full re-cluster by emitting all subjects.
   * The pipeline's isFullReload path will apply fresh clustering and
   * remove any remaining stale cluster artefacts.
   */
  const triggerRecluster = () => {
    try {
      if (typeof window !== 'undefined' && (window as any).__VG_REQUEST_FORCE_LAYOUT_NEXT_MAPPING) {
        (window as any).__VG_REQUEST_FORCE_LAYOUT_NEXT_MAPPING();
      }
    } catch (_) { /* ignore */ }

    const mgr = getRdfManager();
    if (mgr && typeof mgr.emitAllSubjects === 'function') {
      mgr.emitAllSubjects('urn:vg:data').catch((err) => {
        console.error('[VG_DEBUG] emitAllSubjects failed during re-cluster:', err);
        toast.error('Failed to re-cluster graph');
      });
    }
  };

  // Watch for clustering algorithm changes and trigger re-clustering
  const previousAlgorithm = useRef(config.clusteringAlgorithm);
  useEffect(() => {
    if (previousAlgorithm.current !== config.clusteringAlgorithm) {
      previousAlgorithm.current = config.clusteringAlgorithm;

      clearClusterState();
      triggerRecluster();

      // Close the configuration dialog
      handleOpenChange(false);

      toast.success(
        config.clusteringAlgorithm === "none"
          ? "Clustering disabled"
          : `Switched to ${config.clusteringAlgorithm} clustering`,
        {
          description: config.clusteringAlgorithm === "none"
            ? "Clusters cleared"
            : "Re-clustering with new algorithm...",
        },
      );
    }
  }, [config.clusteringAlgorithm, handleOpenChange]);


  const handleExportConfig = () => {
    const configJson = exportConfig();
    navigator.clipboard.writeText(configJson);
    toast.success('Configuration copied to clipboard');
  };

  const handleImportConfig = () => {
    try {
      importConfig(importText);
      setImportText('');
      toast.success('Configuration imported successfully');
    } catch (error) {
      toast.error('Invalid configuration format');
    }
  };

  const handleResetDefaults = () => {
    resetToDefaults();
    toast.success('Configuration reset to defaults');
  };

  if (!isOpen) return null;

  return (
    <div
      className="absolute inset-0 z-50 flex items-start justify-center bg-black/60 pt-4"
      onMouseDown={e => { if (e.target === e.currentTarget) handleOpenChange(false); }}
    >
      <div className="w-full max-w-[min(90%,42rem)] max-h-[calc(100%-2rem)] overflow-y-auto rounded-lg border bg-background p-6 shadow-lg animate-in fade-in-0 zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold leading-none tracking-tight">Application Configuration</h2>
            <p className="text-sm text-muted-foreground mt-1">Manage persistent settings and preferences for Ontosphere.</p>
          </div>
          <button
            className="rounded-sm p-1.5 opacity-70 hover:opacity-100 hover:bg-accent transition-colors text-sm leading-none"
            onClick={() => handleOpenChange(false)}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <Tabs defaultValue="ui" className="w-full">
          <TabsList className="flex w-full overflow-x-auto">
            <TabsTrigger value="ui" className="flex-1 min-w-0 text-xs sm:text-sm px-2 sm:px-3">Interface</TabsTrigger>
            <TabsTrigger value="performance" className="flex-1 min-w-0 text-xs sm:text-sm px-2 sm:px-3">Perf</TabsTrigger>
            <TabsTrigger value="reasoning" className="flex-1 min-w-0 text-xs sm:text-sm px-2 sm:px-3">Reasoning</TabsTrigger>
            <TabsTrigger value="shacl" className="flex-1 min-w-0 text-xs sm:text-sm px-2 sm:px-3">SHACL</TabsTrigger>
            <TabsTrigger value="workflows" className="flex-1 min-w-0 text-xs sm:text-sm px-2 sm:px-3">Workflows</TabsTrigger>
            <TabsTrigger value="advanced" className="flex-1 min-w-0 text-xs sm:text-sm px-2 sm:px-3">Advanced</TabsTrigger>
          </TabsList>

          {/* UI Settings */}
          <TabsContent value="ui" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Interface Preferences</CardTitle>
                <CardDescription>Customize the user interface appearance</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="animations">Layout Animations</Label>
                  <Switch
                    id="animations"
                    checked={config.layoutAnimations}
                    onCheckedChange={setLayoutAnimations}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Canvas Theme</Label>
                  <Select value={config.canvasTheme} onValueChange={setCanvasTheme}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                      <SelectItem value="auto">Auto (System)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Current View Mode</Label>
                  <Badge variant="outline">{config.viewMode.toUpperCase()}</Badge>
                </div>

                <div className="space-y-2">
                  <Label>Legend Visibility</Label>
                  <Badge variant={config.showLegend ? "default" : "secondary"}>
                    {config.showLegend ? "Visible" : "Hidden"}
                  </Badge>
                </div>

                <div className="flex items-center justify-between">
                  <Label>Enable tooltips</Label>
                  <Switch
                    checked={config.tooltipEnabled}
                    onCheckedChange={(val) => {
                      try {
                        setTooltipEnabled(Boolean(val));
                        toast.success(`Tooltips ${val ? "enabled" : "disabled"}`);
                      } catch (e) {
                        try { console.debug("[VG_DEBUG] setTooltipEnabled failed", e); } catch (_) { void 0; }
                        toast.error("Failed to update tooltip setting");
                      }
                    }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label>Auto-load configured ontologies on startup</Label>
                  <Switch
                    checked={config.persistedAutoload}
                    onCheckedChange={(val) => {
                      try {
                        // Persist the new setting immediately
                        setPersistedAutoload(val);
                        toast.success(`Persisted autoload ${val ? "enabled" : "disabled"}`);
                      } catch (e) {
                        try { console.debug("[VG_DEBUG] setPersistedAutoload failed", e); } catch (_) { void 0; }
                        toast.error("Failed to update autoload setting");
                      }
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Performance Settings */}
          <TabsContent value="performance" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Performance Settings</CardTitle>
                <CardDescription>Optimize performance for large graphs</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Clustering Algorithm</Label>
                  <Select
                    value={config.clusteringAlgorithm}
                    onValueChange={(value) => setClusteringAlgorithm(value as "none" | "louvain" | "label-propagation" | "kmeans")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None (Disabled)</SelectItem>
                      <SelectItem value="louvain">Louvain (Recommended)</SelectItem>
                      <SelectItem value="label-propagation">Label Propagation (SLPA)</SelectItem>
                      <SelectItem value="kmeans">K-Means</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="text-xs text-muted-foreground">
                    {config.clusteringAlgorithm === "none" && "Clustering disabled — all nodes are rendered individually"}
                    {config.clusteringAlgorithm === "louvain" && "Community detection via modularity optimization - best for dense knowledge graphs"}
                    {config.clusteringAlgorithm === "label-propagation" && "Speaker-Listener Label Propagation - detects overlapping communities in social networks"}
                    {config.clusteringAlgorithm === "kmeans" && "Feature-based clustering using position and connectivity - groups similar nodes spatially"}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Auto-cluster threshold: {config.largeGraphThreshold ?? 100} nodes</Label>
                  <div className="text-xs text-muted-foreground mb-2">
                    Graphs with more than {config.largeGraphThreshold ?? 100} nodes will be automatically clustered on load. Set clustering algorithm to "None" to disable.
                  </div>
                  <Slider
                    value={[config.largeGraphThreshold ?? 100]}
                    onValueChange={([value]) => {
                      setLargeGraphThreshold(value);
                    }}
                    min={10}
                    max={500}
                    step={10}
                    className="w-full"
                  />
                </div>
                
              </CardContent>
            </Card>
          </TabsContent>
  
          <TabsContent value="reasoning" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Reasoning</CardTitle>
                <CardDescription>Configure automatic reasoning and rulesets</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="reasoning">Auto Reasoning</Label>
                  <Switch
                    id="reasoning"
                    checked={config.autoReasoning}
                    onCheckedChange={setAutoReasoning}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="autoDiscover">Automatically load referenced ontologies</Label>
                    <p className="text-xs text-muted-foreground">When loading RDF data, automatically fetch ontologies referenced via owl:imports.</p>
                  </div>
                  <Switch
                    id="autoDiscover"
                    checked={config.autoDiscoverOntologies ?? true}
                    onCheckedChange={setAutoDiscoverOntologies}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Reasoner Backend</Label>
                  <div className="flex gap-3 text-xs">
                    {(['konclude', 'n3'] as const).map((b) => (
                      <label key={b} className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="radio"
                          name="reasonerBackend"
                          value={b}
                          checked={(config.reasonerBackend ?? 'konclude') === b}
                          onChange={() => setReasonerBackend(b)}
                        />
                        {b === 'konclude' ? 'OWL DL (Konclude)' : 'N3 Rules'}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    OWL DL uses the Konclude tableau reasoner for complete OWL 2 classification. N3 Rules uses forward-chaining with custom rulesets.
                  </p>
                </div>

                {(config.reasonerBackend ?? 'konclude') === 'n3' && (
                <div className="space-y-2">
                  <Label>Reasoning Rulesets</Label>
                  <div className="space-y-2 text-xs">
                    <div className="text-xs text-muted-foreground">
                      The selected rulesets will be fetched from the app's public assets and combined to drive the N3 reasoner.
                    </div>

                    {(() => {
                      try {
                        const available = ['best-practice.n3', 'owl-e.n3', 'owl-p.n3', 'owl-rl.n3'];
                        const selected = Array.isArray(config.reasoningRulesets) ? config.reasoningRulesets : [];

                        return available.map((name) => {
                          const checked = selected.includes(name);
                          return (
                            <div key={name} className="flex items-center gap-2">
                              <input
                                id={`rr-${name}`}
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  try {
                                    const cur = Array.isArray(config.reasoningRulesets) ? config.reasoningRulesets.slice() : [];
                                    const next = cur.includes(name) ? cur.filter((n) => n !== name) : [...cur, name];
                                    setReasoningRulesets(next);
                                    toast.success('Updated reasoning rulesets');
                                  } catch (e) {
                                    try { console.debug("[VG_DEBUG] setReasoningRulesets failed", e); } catch (_) { void 0; }
                                    toast.error('Failed to update reasoning rulesets');
                                  }
                                }}
                              />
                              <label htmlFor={`rr-${name}`} className="truncate">{name}</label>
                            </div>
                          );
                        });
                      } catch (_) {
                        return <div className="text-xs text-muted-foreground">n/a</div>;
                      }
                    })()}
                  </div>
                </div>
                )}

                <div className="space-y-2">
                  <Label>Auto-loaded Ontologies ({config.additionalOntologies.length})</Label>
                  {config.additionalOntologies.length === 0 ? (
                    <div className="text-xs text-muted-foreground">
                      No additional ontologies loaded automatically
                    </div>
                  ) : (
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {config.additionalOntologies.map((ontology, index) => (
                        <div 
                          key={index} 
                          className="flex items-center justify-between text-xs p-2 bg-primary/10 rounded"
                        >
                          <span 
                            className="truncate flex-1 mr-2" 
                            title={ontology}
                          >
                            {ontology.split('/').pop()?.replace('#', '') || ontology}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-4 w-4 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              removeAdditionalOntology(ontology);
                              toast.success('Removed ontology from autoload list');
                            }}
                          >
                            ×
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <Label>Auto-load configured ontologies on startup</Label>
                  <Switch
                    checked={config.persistedAutoload}
                    onCheckedChange={(val) => {
                      try {
                        // Persist the new setting immediately
                        setPersistedAutoload(val);
                        toast.success(`Persisted autoload ${val ? "enabled" : "disabled"}`);
                      } catch (e) {
                        try { console.debug("[VG_DEBUG] setPersistedAutoload failed", e); } catch (_) { void 0; }
                        toast.error("Failed to update autoload setting");
                      }
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* SHACL Settings */}
          <TabsContent value="shacl" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">SHACL Shapes</CardTitle>
                <CardDescription>Configure SHACL shape sources for constraint validation</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Shapes URL</Label>
                  <p className="text-xs text-muted-foreground">
                    Direct .ttl URL, GitHub folder URL, or comma-separated list. Leave empty to use the built-in ontology-quality shapes. A ?shaclShapes= URL parameter overrides this.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      value={appSettings.shaclShapesUrl}
                      onChange={e => updateSettings({ shaclShapesUrl: e.target.value })}
                      placeholder="https://raw.githubusercontent.com/..."
                      className="flex-1 text-xs"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          const url = appSettings.shaclShapesUrl;
                          if (!url.trim()) {
                            toast.info('No SHACL shapes URL configured');
                            return;
                          }
                          toast.loading('Loading SHACL shapes...', { id: 'shacl-reload' });
                          useShaclResultStore.getState().clearShaclResults();
                          const { loadShaclShapes } = await import('../../utils/shaclShapeLoader');
                          const manifest = await loadShaclShapes(url);
                          if (manifest.loaded.length > 0) {
                            toast.success(`Loaded ${manifest.loaded.length} shape file(s)`, { id: 'shacl-reload' });
                            useShaclResultStore.getState().setShaclShapesLoaded(true);
                          } else if (manifest.errors.length > 0) {
                            toast.error('Failed to load shapes', { id: 'shacl-reload', description: manifest.errors[0].error });
                            useShaclResultStore.getState().setShaclShapesLoaded(false);
                          } else {
                            toast.info('No shapes found at URL', { id: 'shacl-reload' });
                            useShaclResultStore.getState().setShaclShapesLoaded(false);
                          }
                        } catch (err) {
                          toast.error('Shape loading failed', { id: 'shacl-reload', description: String(err) });
                          useShaclResultStore.getState().setShaclShapesLoaded(false);
                        }
                      }}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Bundled Presets</Label>
                  <div className="space-y-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full justify-start text-xs"
                      onClick={() => {
                        const base = window.location.origin + (import.meta.env.BASE_URL || '/');
                        const url = `${base}shacl-shapes/ontology-quality.shacl.ttl`;
                        updateSettings({ shaclShapesUrl: url });
                        toast.success('Set to ontology quality shapes');
                      }}
                    >
                      Ontology Quality (default) — labels
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full justify-start text-xs"
                      onClick={() => {
                        const base = window.location.origin + (import.meta.env.BASE_URL || '/');
                        const url = `${base}shacl-shapes/ontology-quality.shacl.ttl,${base}shacl-shapes/ontology-documentation.shacl.ttl`;
                        updateSettings({ shaclShapesUrl: url });
                        toast.success('Set to ontology quality + documentation shapes');
                      }}
                    >
                      Ontology Documentation — labels plus comments, domain/range (info)
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full justify-start text-xs"
                      onClick={() => {
                        const base = window.location.origin + (import.meta.env.BASE_URL || '/');
                        const url = `${base}shacl-shapes/reasoning-demo.shacl.ttl`;
                        updateSettings({ shaclShapesUrl: url });
                        toast.success('Set to reasoning-demo shapes (errors + warnings)');
                      }}
                    >
                      Reasoning Demo — violations + warnings for reasoning-demo.ttl
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full justify-start text-xs"
                      onClick={() => {
                        updateSettings({ shaclShapesUrl: 'https://raw.githubusercontent.com/gcpdev/xpshacl/main/data/shark_shapes.ttl' });
                        toast.success('Set to xpSHACL shark_shapes (uses SPARQL constraints)');
                      }}
                    >
                      xpSHACL shark_shapes — SPARQL-based (limited support)
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Workflows Settings */}
          <TabsContent value="workflows" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Workflow Catalog</CardTitle>
                <CardDescription>PyodideSemanticWorkflow catalog integration</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Enable Workflow Catalog</Label>
                  <Switch
                    checked={config.workflowCatalogEnabled}
                    onCheckedChange={(val) => {
                      try {
                        setWorkflowCatalogEnabled(val);
                        toast.success(`Workflow catalog ${val ? 'enabled' : 'disabled'}`);
                      } catch (e) {
                        toast.error('Failed to update workflow catalog setting');
                      }
                    }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label>Auto-load on Startup</Label>
                  <Switch
                    checked={config.loadWorkflowCatalogOnStartup}
                    onCheckedChange={(val) => {
                      try {
                        setLoadWorkflowCatalogOnStartup(val);
                        toast.success(`Auto-load ${val ? 'enabled' : 'disabled'}`);
                      } catch (e) {
                        toast.error('Failed to update auto-load setting');
                      }
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Catalog URLs</Label>
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">SPW Ontology</Label>
                      <Input
                        value={config.workflowCatalogUrls.ontology}
                        onChange={(e) => setWorkflowCatalogUrls({ ontology: e.target.value })}
                        className="text-xs"
                        placeholder="Ontology URL"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Workflow Catalog</Label>
                      <Input
                        value={config.workflowCatalogUrls.catalog}
                        onChange={(e) => setWorkflowCatalogUrls({ catalog: e.target.value })}
                        className="text-xs"
                        placeholder="Catalog URL"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">UI Metadata (Optional)</Label>
                      <Input
                        value={config.workflowCatalogUrls.catalogUi}
                        onChange={(e) => setWorkflowCatalogUrls({ catalogUi: e.target.value })}
                        className="text-xs"
                        placeholder="UI Metadata URL"
                      />
                    </div>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    resetWorkflowCatalogUrls();
                    toast.success('Reset to default GitHub URLs');
                  }}
                >
                  <RotateCcw className="h-3 w-3 mr-2" />
                  Reset to Defaults
                </Button>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Catalog Status</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isLoadingCatalog}
                      onClick={async () => {
                        setIsLoadingCatalog(true);
                        try {
                          const result = await loadWorkflowCatalog(config);
                          if (result.success) {
                            toast.success('Workflow catalog loaded', {
                              description: `${result.loadedFiles?.length || 0} files loaded`,
                            });
                            const stats = await getWorkflowCatalogStats();
                            setWorkflowStats(stats);
                          } else {
                            toast.error('Failed to load catalog', {
                              description: result.error || 'Unknown error',
                            });
                          }
                        } catch (error) {
                          toast.error('Error loading catalog');
                        } finally {
                          setIsLoadingCatalog(false);
                        }
                      }}
                    >
                      {isLoadingCatalog ? (
                        <>
                          <RefreshCw className="h-3 w-3 mr-2 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-3 w-3 mr-2" />
                          Reload Now
                        </>
                      )}
                    </Button>
                  </div>
                  <div className="text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Workflows Graph:</span>
                      <span className="font-mono">{workflowStats.workflowsGraphSize} triples</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">SPW Ontology:</span>
                      <span className="font-mono">{workflowStats.ontologiesGraphSize} triples</span>
                    </div>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground">
                  The workflow catalog is loaded from GitHub and provides semantic workflow templates
                  (SumTemplate, MultiplyTemplate, ConvertTemplate) with P-Plan and PROV-O metadata.
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Advanced Settings */}
          <TabsContent value="advanced" className="space-y-4">
          <Card>
              <CardHeader>
                <CardTitle className="text-sm">Debug</CardTitle>
                <CardDescription>Developer debug helpers</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-xs text-muted-foreground">
                  When enabled, diagnostic logs prefixed with <code>[VG_]</code> and in-canvas metrics become visible.
                </div>

                <div className="flex items-center justify-between">
                  <Label>Enable developer debug (master)</Label>
                  <Switch
                    checked={config.debugAll}
                    onCheckedChange={(val) => {
                      try {
                        setDebugAll(Boolean(val));
                        toast.success(`Debug ${val ? "enabled" : "disabled"}`);
                      } catch (e) {
                        try { console.debug("[VG_DEBUG] setDebugAll failed", e); } catch (_) { void 0; }
                        toast.error("Failed to update debug setting");
                      }
                    }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label>Enable RDF write logging</Label>
                  <Switch
                    checked={config.debugRdfLogging}
                    onCheckedChange={(val) => {
                      try {
                        setDebugRdfLogging(Boolean(val));
                        toast.success(`RDF write logging ${val ? "enabled" : "disabled"}`);
                      } catch (e) {
                        try { console.debug("[VG_DEBUG] setDebugRdfLogging failed", e); } catch (_) { void 0; }
                        toast.error("Failed to update RDF logging setting");
                      }
                    }}
                  />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">CORS Proxy for Ontology Loading</CardTitle>
                <CardDescription>
                  Some ontology servers (e.g. purl.org, w3id.org) redirect to destinations that block
                  browser access (missing CORS headers). A proxy fetches them on your behalf as a fallback.
                  Only used for ontology loading — never for other data.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label>Proxy</Label>
                  <Select
                    value={corsProxySelection}
                    onValueChange={(val) => {
                      setCorsProxySelection(val);
                      if (val === "__none__") {
                        setCorsProxyUrlLocal("");
                        saveCorsProxy("");
                      } else if (val !== "__custom__") {
                        setCorsProxyUrlLocal(val);
                        saveCorsProxy(val);
                      }
                    }}
                  >
                    <SelectTrigger className="text-xs">
                      <SelectValue placeholder="Select a proxy…" />
                    </SelectTrigger>
                    <SelectContent>
                      {KNOWN_PROXIES.map(p => (
                        <SelectItem key={p.value} value={p.value} className="text-xs">
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {corsProxySelection === "__custom__" && (
                  <div className="space-y-1">
                    <Label htmlFor="corsProxyUrlCustom">Custom proxy prefix URL</Label>
                    <div className="flex gap-2">
                      <Input
                        id="corsProxyUrlCustom"
                        value={corsProxyUrlLocal}
                        onChange={(e) => setCorsProxyUrlLocal((e.target as HTMLInputElement).value)}
                        placeholder="https://my-proxy.example.com/?url="
                        className="font-mono text-xs"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => saveCorsProxy(corsProxyUrlLocal)}
                      >
                        Save
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      The ontology URL will be appended URL-encoded to this prefix.
                    </p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Public proxies only work from public HTTPS origins. For internal or private network
                  deployments, use a self-hosted proxy (e.g.{' '}
                  <code>corsproxy</code> on npm or a simple nginx <code>proxy_pass</code>).
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Blacklist</CardTitle>
                <CardDescription>Exclude subjects from UI node emission by prefix or namespace URI</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Enable blacklist</Label>
                  <Switch
                    checked={blacklistEnabledLocal}
                    onCheckedChange={(val) => {
                      try {
                        setBlacklistEnabledLocal(val);
                        setBlacklistEnabled(val);
                        try {
                          const mgr = getRdfManager();
                          const prefixes = (prefixesText || "").split(",").map(s=>s.trim()).filter(Boolean);
                          const uris = (urisText || "").split(",").map(s=>s.trim()).filter(Boolean);
                          if (mgr) mgr.setBlacklist(prefixes, uris);
                        } catch (_) { /* ignore */ }
                        toast.success(`Blacklist ${val ? 'enabled' : 'disabled'}`);
                      } catch (e) {
                        toast.error('Failed to update blacklist');
                      }
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Blacklisted prefixes (comma-separated)</Label>
                  <Input
                    value={prefixesText}
                    onChange={(e) => {
                      const v = (e.target as HTMLInputElement).value;
                      setPrefixesText(v);
                      {
                        const prefixes = (v || "").split(",").map(s=>s.trim()).filter(Boolean);
                        setBlacklistedPrefixes(prefixes);
                        const uris = (urisText || "").split(",").map(s=>s.trim()).filter(Boolean);
                        const mgr = getRdfManager();
                        if (mgr) mgr.setBlacklist(prefixes, uris);
                      }
                    }}
                    className="text-xs"
                    placeholder="e.g. owl, rdf, rdfs, xml, xsd"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Blacklisted namespace URIs (comma-separated)</Label>
                  <Input
                    value={urisText}
                    onChange={(e) => {
                      const v = (e.target as HTMLInputElement).value;
                      setUrisText(v);
                      {
                        const uris = (v || "").split(",").map(s=>s.trim()).filter(Boolean);
                        setBlacklistedUris(uris);
                        const prefixes = (prefixesText || "").split(",").map(s=>s.trim()).filter(Boolean);
                        const mgr = getRdfManager();
                        if (mgr) mgr.setBlacklist(prefixes, uris);
                      }
                    }}
                    className="text-xs"
                    placeholder="e.g. http://www.w3.org/1999/02/22-rdf-syntax-ns#"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Computed expanded URIs</Label>
                  <div className="text-xs text-muted-foreground">
                    These are expanded namespace URIs derived from current prefixes and known namespaces (for visibility).
                  </div>
                  <div className="mt-2 text-xs">
                    {(() => {
                      try {
                        const mgr = getRdfManager();
                        const ns = (mgr && typeof mgr.getNamespaces === 'function') ? mgr.getNamespaces() : {};
                        const wkPrefixes = (WELL_KNOWN && (WELL_KNOWN as any).prefixes) ? (WELL_KNOWN as any).prefixes : {};
                        const prefixes = (prefixesText || "").split(",").map(s=>s.trim()).filter(Boolean);
                        const explicitUris = (urisText || "").split(",").map(s=>s.trim()).filter(Boolean);

                        // Expand prefixes to namespace URIs using runtime namespaces, then well-known fallbacks.
                        const expandedFromPrefixes = prefixes.map((p) => {
                          try {
                            if (!p) return "";
                            if (ns[p]) return ns[p];
                            if (wkPrefixes && wkPrefixes[p]) return wkPrefixes[p];
                            if (mgr && typeof (mgr as any).expandPrefix === 'function') {
                              try {
                                const attempt = (mgr as any).expandPrefix(`${p}:dummy`);
                                // If expandPrefix returns something containing http, try to strip the dummy suffix.
                                if (typeof attempt === 'string') {
                                  const stripped = attempt.replace(/dummy$/, '');
                                  if (/^https?:\/\//i.test(stripped)) return stripped;
                                }
                              } catch (_) { /* ignore */ }
                            }
                            return "";
                          } catch (_) {
                            return "";
                          }
                        }).filter(Boolean);

                        // Combine and dedupe expanded URIs and explicit URIs
                        const combined = Array.from(new Set<string>([...expandedFromPrefixes, ...explicitUris])).filter(Boolean);

                        if (combined.length === 0) {
                          return <div className="text-xs text-muted-foreground">None</div>;
                        }

                        return combined.map((u, i) => (
                          <div key={i} className="truncate">{u}</div>
                        ));
                      } catch (_) {
                        return <div className="text-xs text-muted-foreground">n/a</div>;
                      }
                    })()}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Import/Export Configuration</CardTitle>
                <CardDescription>Backup or restore your settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Button onClick={handleExportConfig} variant="outline" className="flex-1">
                    <Download className="h-4 w-4 mr-2" />
                    Export Config
                  </Button>
                  <Button onClick={handleResetDefaults} variant="outline" className="flex-1">
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset Defaults
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label>Import Configuration</Label>
                  <textarea
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder="Paste configuration JSON here..."
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 h-24 resize-none"
                  />
                  <Button 
                    onClick={handleImportConfig} 
                    disabled={!importText.trim()}
                    className="w-full"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Import Configuration
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label>Storage Info</Label>
                  <div className="text-xs text-muted-foreground">
                    Settings are automatically saved to browser localStorage
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
