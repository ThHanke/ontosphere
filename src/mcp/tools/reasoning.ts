// src/mcp/tools/reasoning.ts
import { toast } from 'sonner';
import type { McpTool, McpResult } from '@/mcp/types';
import { getWorkspaceRefs } from '@/mcp/workspaceContext';
import { useAppConfigStore } from '@/stores/appConfigStore';
import { VALID_ALGORITHMS } from './layout';
import { rdfManager } from '@/utils/rdfManager';
import { checkOwl2Profile, detectOwl2Profiles, type ProfileTriple } from '@/utils/owlProfile';
import { buildRepairBrief, type DiagnosticsData } from './diagnosticsBrief';
import { buildShaclRepairs, type RepairSuggestion } from './computeRepairs';
const EXPORT_FORMATS = ['turtle', 'jsonld', 'rdfxml', 'svg', 'png'];

const DATA_GRAPH = 'urn:vg:data';

async function loadDataProfileTriples(): Promise<ProfileTriple[]> {
  const page = await rdfManager.fetchQuadsPage({ graphName: DATA_GRAPH, limit: 0, serialize: true });
  const items = (page?.items ?? []) as Array<{
    subject: { value: string };
    predicate: { value: string };
    object: { value: string; termType: string };
  }>;
  return items.map((q) => ({
    subject: q.subject.value,
    predicate: q.predicate.value,
    object: q.object.value,
    objectIsLiteral: q.object.termType === 'Literal',
  }));
}

// ---------------------------------------------------------------------------
// runReasoning
// ---------------------------------------------------------------------------
const runReasoning: McpTool = {
  name: 'runReasoning',
  description: "Run OWL reasoning over the loaded graph and infer new triples. Default backend is 'konclude' (full OWL 2 DL). Pass reasonerBackend='n3' to use N3 rule-based inference instead. Pass clearBefore=true to clear previous inferences first. SHACL validation runs by default after reasoning if shapes are loaded (shaclValidation=true); pass shaclValidation=false to skip it. Response: { inferredTriples, isConsistent: boolean|null, errors: ReasoningError[] }. isConsistent=false means the ontology is logically contradictory — inferences were skipped and errors contains per-entity clash details (nodeId: individual IRI, rule, message). isConsistent=null when using the n3 backend or when validation was unavailable.",
  inputSchema: {
    type: 'object',
    properties: {
      clearBefore: { type: 'boolean', default: false },
      reasonerBackend: { type: 'string', enum: ['konclude', 'n3'], description: "Reasoning backend: 'konclude' (OWL 2 DL, default) or 'n3' (N3 rule-based)" },
      shaclValidation: { type: 'boolean', default: true, description: 'Run SHACL validation after reasoning (default true). Pass false to skip.' },
    },
  },
  async handler(params): Promise<McpResult> {
    try {
      const { clearBefore = false, reasonerBackend, shaclValidation = true } = (params ?? {}) as { clearBefore?: boolean; reasonerBackend?: 'konclude' | 'n3'; shaclValidation?: boolean };
      const refs = getWorkspaceRefs();

      if (clearBefore) {
        if (refs.clearInferred) {
          refs.clearInferred();
        } else {
          refs.dataProvider.clearInferred();
        }
      }

      const prevShaclEnabled = useAppConfigStore.getState().config.shaclEnabled;
      if (shaclValidation !== prevShaclEnabled) {
        useAppConfigStore.getState().setShaclEnabled(shaclValidation);
      }

      const backend = reasonerBackend === 'n3' ? 'n3' : reasonerBackend === 'konclude' ? 'konclude' : undefined;
      let result: unknown;
      try {
        result = await refs.runReasoning?.(backend);
      } finally {
        if (shaclValidation !== prevShaclEnabled) {
          useAppConfigStore.getState().setShaclEnabled(prevShaclEnabled);
        }
      }
      const runErrors: any[] = (result as any)?.errors ?? [];
      const stall = runErrors.find((e) => e?.rule === 'reasoner-error');
      if (stall) {
        return { success: false, error: `Reasoning did not complete: ${stall.message ?? 'reasoner error'}` };
      }
      const inferredTriples = (result as any)?.meta?.addedCount ?? (result as any)?.inferences?.length ?? 0;

      return {
        success: true,
        data: {
          inferredTriples,
          isConsistent: (result as any)?.isConsistent ?? null,
          errors: ((result as any)?.errors ?? []).map((e: any) => ({
            nodeId: e.nodeId ?? null,
            rule: e.rule ?? 'unknown',
            severity: e.severity ?? 'error',
            message: e.message ?? '',
          })),
        },
      };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  },
};

// ---------------------------------------------------------------------------
// clearInferred
// ---------------------------------------------------------------------------
const clearInferred: McpTool = {
  name: 'clearInferred',
  description: 'Remove all inferred (reasoned) triples from the graph.',
  inputSchema: {
    type: 'object',
  },
  async handler(): Promise<McpResult> {
    try {
      const refs = getWorkspaceRefs();
      if (refs.clearInferred) {
        refs.clearInferred();
      } else {
        await refs.dataProvider.clearInferred();
      }
      return { success: true, data: { cleared: true } };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  },
};

// ---------------------------------------------------------------------------
// getCapabilities
// ---------------------------------------------------------------------------
const getCapabilities: McpTool = {
  name: 'getCapabilities',
  description: 'Return the supported layout algorithms and export formats.',
  inputSchema: {
    type: 'object',
  },
  async handler(): Promise<McpResult> {
    try {
      return {
        success: true,
        data: {
          layoutAlgorithms: [...VALID_ALGORITHMS],
          exportFormats: EXPORT_FORMATS,
          reasonerBackends: ['konclude', 'n3'],
        },
      };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  },
};

// ---------------------------------------------------------------------------
// explainDiagnostics
// ---------------------------------------------------------------------------
const explainDiagnostics: McpTool = {
  name: 'explainDiagnostics',
  description:
    "Run the full symbolic verifier (OWL 2 DL reasoning + SHACL) and return ONE structured, actionable diagnosis of everything wrong with the current graph. " +
    "Use this to decide what to fix after authoring. Response: { isConsistent, justifications, unsatisfiableClasses, profile, shaclViolations, repairBrief, suggestedRepairs }. " +
    "isConsistent=false means a logical contradiction: `justifications` lists the minimal sets of axioms (MIPS) the reasoner used to compute the repairs — remove or revise one axiom per set. Declarations (`C a owl:Class`) are not part of a justification, and the count follows the reasoner's repair search, so it can exceed `maxJustifications`. " +
    "`unsatisfiableClasses` are classes that can never have instances (best-effort); it is not computed for an inconsistent ontology (every class is unsatisfiable there), and `unsatisfiableClassesSkipped: 'ontology-inconsistent'` says so.  `profile` reports OWL 2 profile analysis: the legacy DL sanity check (owl2dl + violations, e.g. a literal on an object property) PLUS structural EL/QL/RL detection (el/ql/rl each { valid, violations:[{construct,axiom,reason}] }) and `mostRestrictive` (EL|QL|RL|DL|Full) — the tightest profile the ontology fits, indicating whether a cheaper profile-specific reasoner suffices. " +
    "`shaclViolations` are data-shape conformance failures. `repairBrief` is a ranked plain-language summary you can act on directly. " +
    "`suggestedRepairs` is a ranked list of EXECUTABLE reasoner-computed fixes, each { id, issue, kind?, action:{tool,args}, batch?, weakerThan?, alternativeTo?, weakeningVerified?, rationale, verifiedConsistent?, verifiedSet?, justificationsCovered?, needsValue?, needsManualReview? }: " +
    "for inconsistencies the DELETION repairs (kind:'delete') form a minimal hitting set over the MIPS — removing the WHOLE set restores consistency. AXIOM WEAKENING repairs (kind:'weaken', ids W1,W2,…) are a LESS-destructive alternative (Troquard et al. AAAI 2018; Li & Lambrix ISWC 2024): for an rdfs:subClassOf culprit A ⊑ D they replace it with a weaker A ⊑ D′ (D′ ⊒ D) or drop a conjunct — apply via batch:{removes,adds}; prefer weakening over deletion to preserve more knowledge. verifiedConsistent:true ⇒ removing that ONE axiom alone restores consistency; with multiple independent contradictions it is commonly false for every repair (means 'not ALONE', not 'wrong'). " +
    "Trust the top-level `repairSetVerifiedConsistent` / per-repair `verifiedSet` (the full set together) and apply the entire set. needsManualReview:true ⇒ no auto-repair (inspect manually). " +
    "Apply each by calling its action.tool (always removeLink for inconsistency repairs) with action.args. Read-only: never mutates asserted data.",
  inputSchema: {
    type: 'object',
    properties: {
      maxJustifications: {
        type: 'number',
        default: 3,
        description: 'Maximum number of independent inconsistency justifications (MIPS) to return when inconsistent.',
      },
      includeTimings: {
        type: 'boolean',
        default: false,
        description: 'Add timingsMs: wall time in milliseconds of each stage and of each reasoner call. For diagnosing slow runs.',
      },
    },
  },
  async handler(params): Promise<McpResult> {
    try {
      const { maxJustifications = 3, includeTimings = false } = (params ?? {}) as { maxJustifications?: number; includeTimings?: boolean };
      const stagesMs: Record<string, number> = {};
      const stage = async <T>(name: string, run: () => Promise<T>): Promise<T> => {
        const t0 = Date.now();
        try { return await run(); } finally { stagesMs[name] = Date.now() - t0; }
      };
      const startedAt = Date.now();

      // 1. Run reasoning to compute consistency, classify, and run SHACL.
      // The worker reports its own stage durations (consistency check, explain, ...) while it runs.
      const workerStages: { stage: string; meta?: Record<string, unknown> }[] = [];
      const stopStages = includeTimings
        ? rdfManager.onReasoningStage((e) => workerStages.push({ stage: e.stage, meta: e.meta }))
        : () => {};
      let reasoning: unknown;
      try {
        reasoning = await stage('runReasoning', () => rdfManager.runReasoning());
      } finally {
        stopStages();
      }
      const isConsistent = (reasoning as { isConsistent?: boolean | null })?.isConsistent ?? null;

      // 2. Unsatisfiable classes (Konclude classification — classes equivalent to owl:Nothing).
      //    Skipped for an inconsistent ontology: there every class is unsatisfiable, so the list says
      //    nothing, and the classification cost 52 s on PMDCO in the browser. The user is told.
      let unsatisfiableClasses: string[] = [];
      const unsatisfiableClassesSkipped = isConsistent === false;
      if (unsatisfiableClassesSkipped) {
        toast.info('Unsatisfiable classes not computed', {
          description: 'The ontology is inconsistent, so every class is unsatisfiable. Repair the inconsistency first.',
        });
      } else {
        try { unsatisfiableClasses = (await stage('validate', () => rdfManager.validate())).unsatisfiable; } catch { unsatisfiableClasses = []; }
      }

      // 3. OWL 2 profile detection over the asserted data graph.
      const profileTriples = await stage('profileTriples', () => loadDataProfileTriples());
      const dlReport = checkOwl2Profile(profileTriples);
      const profiles = detectOwl2Profiles(profileTriples);
      const profile = {
        owl2dl: dlReport.owl2dl,
        violations: dlReport.violations,
        el: profiles.el,
        ql: profiles.ql,
        rl: profiles.rl,
        mostRestrictive: profiles.mostRestrictive,
      };

      // 4. SHACL conformance.
      const shacl = await stage('shacl', () => rdfManager.runShaclValidation());
      const shaclViolations = (shacl?.violations ?? []) as DiagnosticsData['shaclViolations'];

      // 5. Repair suggestions, and with them the justifications. The reasoner computes both in one
      //    search (rdf-reasoner-konclude repair() and weaken(): the justifications it found, minimal
      //    axiom sets whose removal restores consistency, verified, plus weaker replacements for
      //    rdfs:subClassOf culprits); the worker maps them onto RepairSuggestion. It reuses the
      //    explanation runReasoning already made for this graph state. SHACL repairs restore
      //    conformance, not consistency, and stay a separate pipeline.
      let justifications: DiagnosticsData['justifications'] = [];
      let repairSetVerifiedConsistent: boolean | null = null;
      let repairSetMatchWarning: string | undefined;
      let libTimingsMs: { call: string; ms: number }[] | undefined;
      const shaclRepairs = buildShaclRepairs(shaclViolations);
      let suggestedRepairs: RepairSuggestion[] = shaclRepairs;

      if (isConsistent === false) {
        const suggested = await stage('suggestRepairs', () => rdfManager.suggestRepairs({
          unsatisfiableClasses,
          maxJustifications,
        }));
        libTimingsMs = suggested.libTimingsMs;
        justifications = suggested.justifications;
        repairSetVerifiedConsistent = suggested.repairSetVerifiedConsistent;
        repairSetMatchWarning = suggested.repairSetMatchWarning;
        // Deletions first, then SHACL, then weakening alternatives (the order the list always had).
        suggestedRepairs = [
          ...suggested.repairs.filter((r) => r.kind !== 'weaken'),
          ...shaclRepairs,
          ...suggested.repairs.filter((r) => r.kind === 'weaken'),
        ];
      }

      const data: DiagnosticsData = {
        isConsistent,
        justifications,
        unsatisfiableClasses,
        profile,
        shaclViolations,
      };

      const repairBrief = buildRepairBrief(data, suggestedRepairs, {
        repairSetVerifiedConsistent,
        repairSetMatchWarning,
      });

      return {
        success: true,
        data: {
          ...data,
          repairBrief,
          suggestedRepairs,
          repairSetVerifiedConsistent,
          ...(unsatisfiableClassesSkipped ? { unsatisfiableClassesSkipped: 'ontology-inconsistent' } : {}),
          ...(repairSetMatchWarning ? { repairSetMatchWarning } : {}),
          ...(includeTimings
            ? { timingsMs: { total: Date.now() - startedAt, stages: stagesMs, workerStages, reasonerCalls: libTimingsMs ?? [] } }
            : {}),
        },
      };
    } catch (e) {
      return { success: false, error: `explainDiagnostics: ${(e as Error)?.message ?? String(e)}` };
    }
  },
};

// ---------------------------------------------------------------------------
// explainEntailment
// ---------------------------------------------------------------------------

/** Local name of an IRI for compact, human-readable summaries. */
function localName(iri: string): string {
  const hash = iri.lastIndexOf('#');
  const slash = iri.lastIndexOf('/');
  const cut = Math.max(hash, slash);
  return cut >= 0 && cut < iri.length - 1 ? iri.slice(cut + 1) : iri;
}

function axiomToText(a: { subject: string; predicate: string; object: string }): string {
  return `${localName(a.subject)} ${localName(a.predicate)} ${localName(a.object)}`;
}

const explainEntailment: McpTool = {
  name: 'explainEntailment',
  description:
    "Explain WHY a specific entailed axiom holds — Horridge-style justifications for an ARBITRARY entailed axiom (not just inconsistency). " +
    "Ask 'why is A rdfs:subClassOf B?' or 'why is x rdf:type C?' and get back the minimal set(s) of asserted axioms whose conjunction logically entails it. " +
    "Input: { subjectIri, predicateIri, objectIri, maxJustifications? }. " +
    "Returns { isEntailed, justifications, summary, ontologyInconsistent?, vacuous?, reason? }: isEntailed=true means the OWL 2 DL reasoner derives the axiom; " +
    "justifications is a list of minimal axiom sets (each { subject, predicate, object }[]) — every axiom in a set is needed to derive the conclusion. " +
    "An empty justifications list with isEntailed=true means the axiom is directly asserted (nothing to derive) or its shape is unsupported. " +
    "isEntailed=false with empty justifications means the axiom is NOT entailed. " +
    "ontologyInconsistent=true (isEntailed=null) means the ontology is ALREADY inconsistent so entailment is vacuous — run explainDiagnostics and fix consistency first; the result is NOT a real entailment. " +
    "vacuous=true (subClassOf only) means the axiom holds ONLY because the subject class is unsatisfiable (empty class ⊑ anything) — not a genuine derivation; fix the unsatisfiable class. " +
    "summary is a short plain-language 'Inferred because: …' explanation. " +
    "Supported shapes: rdfs:subClassOf and rdf:type with an IRI object (e.g. transitive subclass A⊑B,B⊑C ⟹ A⊑C, or domain/range-driven type inference). " +
    "Read-only: never mutates asserted data.",
  inputSchema: {
    type: 'object',
    required: ['subjectIri', 'predicateIri', 'objectIri'],
    properties: {
      subjectIri: { type: 'string', description: 'IRI of the axiom subject (e.g. the subclass, or the individual).' },
      predicateIri: { type: 'string', description: 'IRI of the predicate — rdfs:subClassOf or rdf:type.' },
      objectIri: { type: 'string', description: 'IRI of the axiom object (e.g. the superclass, or the class).' },
      maxJustifications: { type: 'number', default: 1, description: 'Maximum number of independent justifications to return.' },
    },
  },
  async handler(params): Promise<McpResult> {
    try {
      const { subjectIri, predicateIri, objectIri, maxJustifications = 1 } = (params ?? {}) as {
        subjectIri?: string;
        predicateIri?: string;
        objectIri?: string;
        maxJustifications?: number;
      };
      if (!subjectIri || !predicateIri || !objectIri) {
        return { success: false, error: 'explainEntailment requires subjectIri, predicateIri and objectIri.' };
      }

      // Ensure the reasoner has the current asserted graph (read-only).
      const { isEntailed, justifications, ontologyInconsistent, vacuous, reason } =
        await rdfManager.explainEntailment(
          subjectIri,
          predicateIri,
          objectIri,
          { maxJustifications },
        );

      const axiomText = axiomToText({ subject: subjectIri, predicate: predicateIri, object: objectIri });
      let summary: string;
      if (ontologyInconsistent) {
        // C1: the ontology is already inconsistent, so the entailment reduction is
        // VACUOUS (a contradiction entails everything). isEntailed is null here.
        summary =
          `Cannot decide whether ${axiomText} is entailed: the ontology is already ` +
          `inconsistent, so every axiom is "entailed" by the contradiction. ` +
          `Run explainDiagnostics and fix consistency first.`;
        return {
          success: true,
          data: { isEntailed: null, ontologyInconsistent: true, justifications: [], reason, summary },
        };
      }
      if (vacuous) {
        // C2: A ⊑ anything holds only because the subject class is unsatisfiable.
        summary =
          `${axiomText} holds only VACUOUSLY: the subject class is unsatisfiable in the ` +
          `ontology, so it is a subclass of everything. This is not a genuine derivation — ` +
          `fix the unsatisfiable class (see explainDiagnostics / unsatisfiableClasses).`;
        return {
          success: true,
          data: { isEntailed: true, vacuous: true, justifications, reason, summary },
        };
      }
      if (!isEntailed) {
        summary = `${axiomText} is NOT entailed by the current ontology.`;
      } else if (justifications.length === 0) {
        summary = `${axiomText} holds — it is directly asserted (no derivation needed).`;
      } else {
        const sets = justifications
          .map((j, i) => {
            const axioms = j.map(axiomToText).join('; ');
            return justifications.length > 1 ? `[${i + 1}] ${axioms}` : axioms;
          })
          .join(' | ');
        summary = `${axiomText} is inferred because: ${sets}.`;
      }

      return { success: true, data: { isEntailed, justifications, summary } };
    } catch (e) {
      return { success: false, error: `explainEntailment: ${(e as Error)?.message ?? String(e)}` };
    }
  },
};

export const reasoningTools: McpTool[] = [runReasoning, clearInferred, getCapabilities, explainDiagnostics, explainEntailment];
