import React from 'react';
import type { ReasoningResult } from '../../utils/rdfManager';
import { useAppConfigStore } from '../../stores/appConfigStore';
import { useShaclResultStore } from '../../stores/shaclResultStore';
import { useSettingsStore } from '../../stores/settingsStore';

interface TopBarProps {
  viewMode: 'abox' | 'tbox';
  onViewModeChange: (mode: 'abox' | 'tbox') => void;
  ontologyCount: number;
  onOpenReasoningReport?: () => void;
  onRunReason?: () => void;
  onStopReason?: () => void;
  onClearInferred?: () => void;
  onToggleOntologyList?: () => void;
  currentReasoning?: ReasoningResult | null;
  isReasoning?: boolean;
  isInconsistentDetected?: boolean;
  foldLevel?: number;
  maxFoldLevel?: number;
  canLevelUp?: boolean;
  canLevelDown?: boolean;
  onLevelUp?: () => void;
  onLevelDown?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  viewMode,
  onViewModeChange,
  ontologyCount,
  onOpenReasoningReport,
  onRunReason,
  onStopReason,
  onClearInferred,
  onToggleOntologyList,
  currentReasoning = null,
  isReasoning = false,
  isInconsistentDetected = false,
  foldLevel = 0,
  maxFoldLevel = 2,
  canLevelUp = false,
  canLevelDown = false,
  onLevelUp,
  onLevelDown,
}) => {
  const clusteringAlgorithm = useAppConfigStore(s => s.config.clusteringAlgorithm);
  const setClusteringAlgorithm = useAppConfigStore(s => s.setClusteringAlgorithm);
  const shaclEnabled = useAppConfigStore(s => s.config.shaclEnabled);
  const setShaclEnabled = useAppConfigStore(s => s.setShaclEnabled);
  const shaclShapesLoaded = useShaclResultStore(s => s.shaclShapesLoaded);
  const shaclShapesUrl = useSettingsStore(s => s.settings.shaclShapesUrl);
  const shaclAvailable = shaclShapesLoaded && shaclShapesUrl.trim().length > 0;

  return (
    <div className="reactodia-toolbar" role="toolbar" style={{
      display: 'inline-flex',
      whiteSpace: 'nowrap',
      gap: '4px',
      minWidth: 'max-content',
    }}>
      {/* Level fold controls */}
      <div className="reactodia-btn-group reactodia-btn-group-sm">
        <select
          className="reactodia-btn reactodia-btn-default glass-btn"
          style={{ appearance: 'none', WebkitAppearance: 'none', fontSize: 12, lineHeight: 1.5, padding: '5px 24px 5px 10px', cursor: 'pointer', boxSizing: 'border-box', borderRadius: 'unset', borderTopLeftRadius: 'var(--reactodia-button-border-radius)', borderBottomLeftRadius: 'var(--reactodia-button-border-radius)' }}
          value={clusteringAlgorithm}
          title="Clustering algorithm (used at level L3)"
          onChange={e => setClusteringAlgorithm(e.target.value as any)}
        >
          <option value="none">No clustering</option>
          <option value="label-propagation">Label Propagation</option>
          <option value="louvain">Louvain</option>
          <option value="kmeans">K-Means</option>
        </select>
        <button
          type="button"
          className="reactodia-btn reactodia-btn-default glass-btn"
          style={{ borderRadius: 'unset', fontSize: 12 }}
          title="Go to lower fold level"
          disabled={!canLevelDown || !onLevelDown}
          onClick={onLevelDown}
        >◄</button>
        <button
          type="button"
          disabled
          className="reactodia-btn reactodia-btn-default"
          style={{ borderRadius: 'unset', minWidth: 40, textAlign: 'center', fontSize: 12 }}
          title={
            foldLevel === 3 ? 'L3: community-detection clusters' :
            foldLevel === 2 ? 'L2: structural groups (subclass chains, OWL collections)' :
            foldLevel === 1 ? 'L1: annotation properties collapsed' :
            '∅: fully expanded'
          }
        >
          {foldLevel === 0 ? '∅' : `${foldLevel}/${maxFoldLevel}`}
        </button>
        <button
          type="button"
          className="reactodia-btn reactodia-btn-default glass-btn"
          style={{ borderRadius: 'unset', borderTopRightRadius: 'var(--reactodia-button-border-radius)', borderBottomRightRadius: 'var(--reactodia-button-border-radius)', fontSize: 12 }}
          title={
            foldLevel === 2 ? 'Apply L3 community-detection clustering' :
            foldLevel === 3 ? 'Already at maximum fold level' :
            'Go to higher fold level'
          }
          disabled={!canLevelUp || !onLevelUp}
          onClick={onLevelUp}
        >►</button>
      </div>

      {/* A-Box / T-Box group */}
      <div className="reactodia-btn-group reactodia-btn-group-sm">
        <button
          type="button"
          className={`reactodia-btn reactodia-btn-default glass-btn ${viewMode === 'abox' ? 'glass-btn--active' : ''}`}
          onClick={() => onViewModeChange('abox')}
          title="View instance data (A-Box)"
        >
          A-Box
        </button>
        <button
          type="button"
          className={`reactodia-btn reactodia-btn-default glass-btn ${viewMode === 'tbox' ? 'glass-btn--active' : ''}`}
          onClick={() => onViewModeChange('tbox')}
          title="View ontology schema (T-Box)"
        >
          T-Box
        </button>
      </div>

      {/* Ontology count — trigger only, panel renders in workspace container */}
      <button
        type="button"
        className="glass-btn text-xs"
        title="Loaded ontologies"
        onClick={onToggleOntologyList}
      >
        <svg className="shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="16"/>
          <circle cx="5" cy="19" r="3"/><line x1="12" y1="16" x2="5" y2="16"/>
          <circle cx="19" cy="19" r="3"/><line x1="12" y1="16" x2="19" y2="16"/>
        </svg>
        {ontologyCount}
      </button>

      {/* Reasoning group */}
      {onOpenReasoningReport && onRunReason && (
        <div className="reactodia-btn-group reactodia-btn-group-sm">
          <button
            type="button"
            className={`reactodia-btn reactodia-btn-default glass-btn ${
              isReasoning ? '' :
              !currentReasoning ? '' :
              currentReasoning.isConsistent === false || (currentReasoning.errors?.length ?? 0) > 0
                ? 'glass-btn--status-error'
                : 'glass-btn--status-ok'
            }`}
            onClick={onOpenReasoningReport}
            title={currentReasoning?.isConsistent === false ? "OWL DL inconsistency — see reasoning report" : "View reasoning results"}
          >
            {isReasoning ? (
              isInconsistentDetected ? (
                <>
                  <span style={{ flexShrink: 0 }}>⊗ Inconsistent —</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}>
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="32" strokeLinecap="round" />
                  </svg>
                  Explaining…
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}>
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="32" strokeLinecap="round" />
                  </svg>
                  Reasoning…
                </>
              )
            ) : currentReasoning ? (() => {
              const errs = currentReasoning.errors?.length ?? 0;
              const warns = currentReasoning.warnings?.length ?? 0;
              const consistent = currentReasoning.isConsistent !== false;
              if (!consistent) {
                return <span>⊗ Inconsistent · {errs > 0 ? `${errs} error${errs !== 1 ? 's' : ''}` : `${warns} warning${warns !== 1 ? 's' : ''}`}</span>;
              }
              if (errs > 0) {
                return <span>⚠ Consistent · {errs} error{errs !== 1 ? 's' : ''}</span>;
              }
              if (warns > 0) {
                return <span>✓ Consistent · {warns} warning{warns !== 1 ? 's' : ''}</span>;
              }
              return <span>✓ Consistent</span>;
            })() : (
              'Ready'
            )}
          </button>
          <button
            type="button"
            className="reactodia-btn reactodia-btn-default"
            onClick={onClearInferred}
            disabled={!currentReasoning || isReasoning}
            title="Clear inferred graph"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', verticalAlign: 'middle' }}>
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </button>
          <button
            type="button"
            className={`reactodia-btn reactodia-btn-default glass-btn ${shaclAvailable && shaclEnabled ? 'glass-btn--active' : ''}`}
            onClick={() => shaclAvailable && setShaclEnabled(!shaclEnabled)}
            disabled={!shaclAvailable}
            title={shaclAvailable ? 'Include SHACL validation in reasoning' : 'No SHACL shapes loaded'}
          >
            <input
              type="checkbox"
              checked={shaclAvailable && shaclEnabled}
              readOnly
              tabIndex={-1}
              className="size-3 accent-primary pointer-events-none"
              style={{ margin: 0 }}
            />
            SHACL
          </button>
          {isReasoning ? (
            <button
              type="button"
              className="reactodia-btn reactodia-btn-default"
              onClick={onStopReason}
              title="Stop reasoning"
            >
              ■
            </button>
          ) : (
            <button
              type="button"
              className="reactodia-btn reactodia-btn-default"
              onClick={onRunReason}
              title="Run reasoning"
            >
              ▶
            </button>
          )}
        </div>
      )}
    </div>
  );
};
