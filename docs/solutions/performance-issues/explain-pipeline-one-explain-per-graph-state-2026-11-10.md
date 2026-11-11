---
title: explainDiagnostics took 513 s on PMDco plus one clash — three explain passes, a laconic pass nobody needed, and a pointless classification
date: 2026-11-10
category: docs/solutions/performance-issues/
module: explainDiagnostics, suggestRepairs, rdfManager.runtime
problem_type: performance_issue
component: tooling
symptoms:
  - explainDiagnostics on PMDco (bench-pmdco.ttl) plus one disjoint-class clash took 512.9 s and 517.0 s in headless Chromium
  - In node the same flow was 232 s of reasoner calls, 180.5 s of it the laconic explanation
root_cause: logic_error
resolution_type: code_fix
severity: high
tags: [explainDiagnostics, repair, laconic, cache, reasoningInputGeneration, rdf-reasoner-konclude, 0.9.1, performance]
---

# explainDiagnostics took 513 s on PMDco plus one clash

## Problem
`explainDiagnostics` on an inconsistent large ontology took about 8.5 minutes in the browser. An agent tool call that long is unusable.

## Symptoms
- 512.9 s and 517.0 s in two identical browser runs (so not noise).
- Node timings on the same data: `checkConsistency` 0.5 s, `explainInconsistency` 23.1 s, `repair` 28.2 s, `explainInconsistencyLaconic` 180.5 s.

## What Didn't Work
- Assuming startup loading inflated the number: the app was loaded and ready after 3.2 s.
- Assuming the browser is about 2x node: per-stage browser timings showed 4 to 5x on reasoner calls (`runReasoning` 129 s against about 24 s in node).
- Estimating the saving of the `repair()` seed at about 100 s: the real saving was about 135 s (`repair` 156.9 s to 21.2 s).

## Solution
Measure per stage first (`explainDiagnostics({ includeTimings: true })` returns `timingsMs`), then remove work:
1. **Drop laconic explanations from the tool.** They only fed agent-facing brief wording (the UI never showed them); `weaken()` splits conjuncts itself.
2. **One explain per input state.** Cache the whole-axiom justifications (`explainInconsistencyAxioms`) in the worker per `reasoningInputGeneration`, a counter bumped on every store write, unload, graph removal and reset. `runReasoning`'s clash entries and `suggestRepairs` read the same cache.
3. **Seed `repair()`** with the cached justifications (`RepairOptions.justifications`, rdf-reasoner-konclude 0.9.1). The option cannot be detected from the method, so a flag (`REPAIR_ACCEPTS_JUSTIFICATIONS`) is checked by a test against the installed library's type declarations.
4. **Skip `validate`** (unsatisfiable classes) for an inconsistent ontology: every class is unsatisfiable there, and it cost 52 s. The output says `unsatisfiableClassesSkipped` and the UI shows a toast.

Result, browser, same scenario: 513 s, then 347.9 s (laconic gone), 127.9 s (seed, no `validate`).

## Why This Works
The three explains (inside `runReasoning`, in `explainDiagnostics`, inside `repair`) recomputed the same justifications; the cache is safe because the generation counter moves on every write that can change an answer. The reasoner invalidates its own cache on store changes, so only the app's cache needs the invalidation tests.

## Prevention
- Time stages before estimating; browser reasoner calls ran 4 to 5x node here.
- A cache keyed on a generation counter needs tests for each write path, unload, graph removal and reset (see the 0.8.0 doc below).
- Remove output that only exists for a consumer that no longer exists; check who reads it (`grep` the UI and the tool path).

## Related Issues
- `docs/solutions/logic-errors/konclude-v080-reuse-and-stale-inference-on-unload-2026-10-16.md` (same counter, same invalidation rule).
- LUBM-1 with data is still bimodal on 0.9.1 (28.5 to 85.8 s over 4 runs, one tab crash); tracked in the reasoner repo plan `docs/plans/2026-11-10-001-feat-upstream-differential-order-audit-tooling-plan.md`. A like-for-like 0.8.0 comparison is still open (see the workflow doc about the invalid baseline).
