import { useState, useEffect, useCallback, useRef } from 'react';
import { rdfManager } from '../../utils/rdfManager';
import { Badge } from '../ui/badge';
import { Shield, ChevronDown, ChevronRight, AlertTriangle, XCircle } from 'lucide-react';
import { useShaclResultStore, makeShaclMessageKey } from '../../stores/shaclResultStore';
import { getWorkspaceRefs } from '@/mcp/workspaceContext';
import { cn } from '../../lib/utils';
import { prefixShorten } from '../../providers/prefixShorten';

interface ConstraintInfo {
  path: string | null;
  message: string | null;
  severity: 'violation' | 'warning' | 'info';
}

interface ShapeInfo {
  iri: string;
  label: string;
  targetClass: string | null;
  constraints: ConstraintInfo[];
}

interface ShapeGroup {
  source: string;
  shapes: ShapeInfo[];
}

const SH = 'http://www.w3.org/ns/shacl#';

export function ShaclShapesPanel() {
  const [groups, setGroups] = useState<ShapeGroup[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [shapeCount, setShapeCount] = useState(0);
  const [labelMap, setLabelMap] = useState<Map<string, string>>(new Map());
  // Cache keyed on sorted IRI set — skips label fetches when shapes haven't changed.
  const labelCacheRef = useRef<{ key: string; map: Map<string, string> } | null>(null);
  const [prefixes, setPrefixes] = useState<Record<string, string>>(() =>
    Object.fromEntries(rdfManager.getNamespaces().map(e => [e.prefix, e.uri]))
  );

  const shaclErrors = useShaclResultStore(s => s.errors);
  const shaclWarnings = useShaclResultStore(s => s.warnings);
  const activeMessageKey = useShaclResultStore(s => s.activeMessageKey);
  const highlightMessage = useShaclResultStore(s => s.highlightMessage);
  const hasResults = shaclErrors.length > 0 || shaclWarnings.length > 0;

  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (activeMessageKey && activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeMessageKey]);

  // Derive an effective expanded set: when there are validation results, always expand
  // 'urn:vg:shapes' so findings are immediately visible without an extra click.
  // We compute this during render instead of syncing via an effect+setState.
  const effectiveExpanded = hasResults
    ? new Set([...expanded, 'urn:vg:shapes'])
    : expanded;

  const loadShapeInfo = useCallback(async () => {
    try {
      const SH_SHAPE_TYPES = new Set([SH + 'NodeShape', SH + 'Shape']);
      const SH_TARGET_CLASS = SH + 'targetClass';
      const SH_PROPERTY = SH + 'property';
      const SH_PATH = SH + 'path';
      const SH_MESSAGE = SH + 'message';
      const SH_SEVERITY = SH + 'severity';
      const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
      const RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';
      const SH_NAME = SH + 'name';

      const { items } = await rdfManager.fetchQuadsPage({ graphName: 'urn:vg:shapes', limit: 0 });
      if (!items || items.length === 0) {
        setGroups([]);
        setShapeCount(0);
        return;
      }

      const nodeShapes = items
        .filter(q => q.predicate === RDF_TYPE && SH_SHAPE_TYPES.has(q.object))
        .map(q => q.subject);

      const shapes: ShapeInfo[] = nodeShapes.map(iri => {
        const targetQ = items.find(q => q.subject === iri && q.predicate === SH_TARGET_CLASS);
        const labelQ = items.find(q => q.subject === iri && (q.predicate === RDFS_LABEL || q.predicate === SH_NAME));
        const propBNodes = items
          .filter(q => q.subject === iri && q.predicate === SH_PROPERTY)
          .map(q => q.object);

        const constraints: ConstraintInfo[] = propBNodes.map(bn => {
          const pathQ = items.find(q => q.subject === bn && q.predicate === SH_PATH);
          const msgQ = items.find(q => q.subject === bn && q.predicate === SH_MESSAGE);
          const sevQ = items.find(q => q.subject === bn && q.predicate === SH_SEVERITY);
          const sevVal = sevQ?.object ?? '';
          const severity: ConstraintInfo['severity'] =
            sevVal.endsWith('Violation') ? 'violation' :
            sevVal.endsWith('Info') ? 'info' : 'warning';
          return {
            path: pathQ?.object ?? null,
            message: msgQ?.object ?? null,
            severity,
          };
        });

        const label = labelQ?.object ?? iri.split(/[#/]/).pop() ?? iri;
        return { iri, label, targetClass: targetQ?.object ?? null, constraints };
      });

      // Resolve rdfs:labels for domain IRIs (shape IRIs, targetClass, sh:path values) from ontology/data graphs
      const irisToResolve = new Set<string>();
      for (const s of shapes) {
        irisToResolve.add(s.iri);
        if (s.targetClass) irisToResolve.add(s.targetClass);
        for (const c of s.constraints) {
          if (c.path) irisToResolve.add(c.path);
        }
      }
      const cacheKey = [...irisToResolve].sort().join('\n');
      let newLabelMap: Map<string, string>;
      if (labelCacheRef.current?.key === cacheKey) {
        // Shape IRIs unchanged — reuse cached labels, no extra worker calls.
        newLabelMap = labelCacheRef.current.map;
      } else {
        newLabelMap = new Map<string, string>();
        for (const graphName of ['urn:vg:ontologies', 'urn:vg:data']) {
          try {
            const { items: labelItems } = await rdfManager.fetchQuadsPage({
              graphName,
              limit: 0,
              filter: { predicate: RDFS_LABEL },
            });
            for (const q of labelItems ?? []) {
              if (irisToResolve.has(q.subject) && !newLabelMap.has(q.subject)) {
                newLabelMap.set(q.subject, q.object);
              }
            }
          } catch { /* graph may not exist yet */ }
        }
        labelCacheRef.current = { key: cacheKey, map: newLabelMap };
      }
      setLabelMap(newLabelMap);

      setShapeCount(shapes.length);
      const group: ShapeGroup = { source: 'urn:vg:shapes', shapes };
      setGroups(shapes.length > 0 ? [group] : []);
    } catch (err) {
      console.warn('[ShaclShapesPanel] Failed to load shape info', err);
      setGroups([]);
      setShapeCount(0);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect -- loadShapeInfo is async; all setState calls
     inside it occur after "await rdfManager.fetchQuadsPage()", not synchronously in the effect
     body. The linter cannot infer async control flow statically. */
  useEffect(() => {
    loadShapeInfo();
    const handler = () => { loadShapeInfo(); };
    rdfManager.onChange(handler);
    return () => { rdfManager.offChange(handler); };
  }, [loadShapeInfo]);

  useEffect(() => {
    return rdfManager.onNamespacesChange(entries => {
      setPrefixes(Object.fromEntries(entries.map(e => [e.prefix, e.uri])));
    });
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const toggleGroup = (source: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  };

  // Prefix-shorten an IRI using the registered namespace map.
  const shortenIri = (iri: string) => prefixShorten(iri, prefixes);

  // Use rdfs:label from labelMap when available, fall back to prefixed IRI.
  const resolveLabel = (iri: string) => labelMap.get(iri) ?? shortenIri(iri);

  const severityIcon = (sev: ConstraintInfo['severity'] | 'error') => {
    if (sev === 'violation' || sev === 'error') return <XCircle className="w-3 h-3 text-destructive shrink-0" />;
    if (sev === 'warning') return <AlertTriangle className="w-3 h-3 text-warning shrink-0" />;
    return <Shield className="w-3 h-3 text-blue-400 shrink-0" />;
  };

  const navigateToNode = useCallback((iri: string) => {
    try {
      const { navigateToIri } = getWorkspaceRefs();
      navigateToIri?.(iri);
    } catch { /* workspace not ready */ }
  }, []);

  const allMessages = [
    ...shaclErrors.map(e => ({ ...e, type: 'error' as const })),
    ...shaclWarnings.map(w => ({ ...w, type: 'warning' as const })),
  ];

  const getShapeMessages = (shapeIri: string, constraintMessages: (string | null)[]) => {
    const byShape = allMessages.filter(m => m.sourceShape === shapeIri);
    if (byShape.length > 0) return byShape;
    const msgSet = new Set(constraintMessages.filter(Boolean));
    return allMessages.filter(m => msgSet.has(m.message));
  };

  if (shapeCount === 0 && !hasResults) {
    return (
      <div className="px-3 py-4 text-center">
        <Shield className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground mb-1">No shapes loaded</p>
        <p className="text-xs text-muted-foreground">
          Add a SHACL shapes URL in Settings or via <code className="text-xs">?shaclShapes=</code> parameter
        </p>
      </div>
    );
  }

  const renderMessage = (m: typeof allMessages[0], idx: number) => {
    const key = makeShaclMessageKey(m.type, m.nodeId, m.message);
    const isActive = activeMessageKey === key;
    return (
      <button
        key={idx}
        ref={isActive ? activeRef : undefined}
        className={cn(
          'w-full flex items-start gap-1.5 py-1.5 px-1.5 rounded text-xs text-left transition-colors cursor-pointer',
          'hover:bg-accent/50',
          isActive && 'bg-accent ring-1 ring-ring',
        )}
        onClick={() => {
          highlightMessage(key);
          if (m.nodeId) navigateToNode(m.nodeId);
        }}
        disabled={!m.nodeId}
        title={m.nodeId ? `Navigate to ${m.nodeId}` : undefined}
      >
        {severityIcon(m.type)}
        <div className="flex-1 min-w-0">
          <span className="break-words text-muted-foreground whitespace-pre-line">{m.message}</span>
          {m.nodeId && (
            <span className="block text-[11px] text-primary mt-0.5">
              → {resolveLabel(m.nodeId)}
            </span>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-2 px-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-muted-foreground">
          {shapeCount} shape{shapeCount !== 1 ? 's' : ''} loaded
          {hasResults && (
            <span className="ml-1">
              · {shaclErrors.length} error{shaclErrors.length !== 1 ? 's' : ''}, {shaclWarnings.length} warning{shaclWarnings.length !== 1 ? 's' : ''}
            </span>
          )}
        </span>
      </div>

      {groups.map(group => (
        <div key={group.source} className="border rounded-md overflow-hidden">
          <button
            className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs hover:bg-accent/50 transition-colors"
            onClick={() => toggleGroup(group.source)}
          >
            {effectiveExpanded.has(group.source) ? (
              <ChevronDown className="w-3 h-3 shrink-0" />
            ) : (
              <ChevronRight className="w-3 h-3 shrink-0" />
            )}
            <span className="font-medium truncate">{shortenIri(group.source)}</span>
            <Badge variant="secondary" className="ml-auto text-[10px] h-4 px-1">
              {group.shapes.length}
            </Badge>
          </button>
          {effectiveExpanded.has(group.source) && (
            <div className="border-t divide-y">
              {group.shapes.map(shape => {
                const shapeMessages = getShapeMessages(shape.iri, shape.constraints.map(c => c.message));
                return (
                  <div key={shape.iri} className="px-2 py-1.5 text-xs space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium truncate" title={`${shape.iri}\n${shortenIri(shape.iri)}`}>
                        {labelMap.get(shape.iri) ?? shape.label}
                      </span>
                      {shape.targetClass && (
                        <Badge variant="outline" className="text-[9px] h-3.5 px-1 shrink-0" title={`${shape.targetClass}\n${shortenIri(shape.targetClass)}`}>
                          {resolveLabel(shape.targetClass)}
                        </Badge>
                      )}
                      {shapeMessages.length > 0 && (
                        <Badge
                          variant={shapeMessages.some(m => m.type === 'error') ? 'destructive' : 'secondary'}
                          className="text-[9px] h-3.5 px-1 shrink-0 ml-auto"
                        >
                          {shapeMessages.length}
                        </Badge>
                      )}
                    </div>
                    {shape.constraints.map((c, i) => (
                      <div key={i} className="flex items-start gap-1 text-muted-foreground pl-1">
                        {severityIcon(c.severity)}
                        <span
                          className="break-words"
                          title={c.path ? `${c.path}\n${shortenIri(c.path)}` : undefined}
                        >
                          {c.message || (c.path ? `requires ${resolveLabel(c.path)}` : 'constraint')}
                        </span>
                      </div>
                    ))}
                    {shapeMessages.length > 0 && (
                      <div className="mt-1 pt-1 border-t border-dashed space-y-0.5">
                        <div className="text-[10px] text-muted-foreground/60 uppercase tracking-wide font-medium">
                          Findings
                        </div>
                        {shapeMessages.map((m, i) => renderMessage(m, i))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}

    </div>
  );
}
