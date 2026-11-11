---
title: Pass the live N3 store to rdf-reasoner-konclude — no copy, no write-back, and what that makes the app responsible for
date: 2026-11-11
category: docs/solutions/architecture-patterns/
module: rdfManager.runtime (DlReasoner), N3DataProvider, ReactodiaCanvas
problem_type: architecture_pattern
component: tooling
severity: medium
applies_when:
  - Calling RdfReasoner (materialize, checkConsistency, explain*, repair, weaken, assessEdit) from the worker
  - Changing how blank nodes are stored (urn:vg:bnode:* skolem IRIs) or how the inferred graph is published
  - Wondering why runReasoning returned long after the reasoner finished
tags: [rdf-reasoner-konclude, 0.9.3, skolem, excludeGraphs, inferred-graph, graphCounts, message-order, runReasoning, N3DataProvider]
---

# Pass the live N3 store to the reasoner

## Context

Every reasoner call used to build a full copy of the shared store (`reasoningBase`: de-skolemize `urn:vg:bnode:*` IRIs into blank nodes, drop non-axiom graphs), then copy the inferred graph back (`removeQuads(getQuads(inferred))` plus `addQuads(reskolemizeAll(…))`). The copy was introduced for the old OWL-RL reasoner (restrictions sharing `owl:onProperty` collapsed) and kept for Konclude, which reads class expressions only in blank-node form. Native blank nodes in the store were investigated and rejected (about 25 files would have changed) once the package stopped needing them.

## Guidance

### The store stays skolemized; the package does the mapping

rdf-reasoner-konclude 0.9.2+ treats `urn:vg:bnode:*` (and `/.well-known/genid/*`) IRIs as blank nodes at intern time (`dist/intern.js`: `isSkolemIri`, `skolemIriToBlankLabel`, `blankLabelToSkolemIri`) and returns the original IRIs. Verified equal to the copy path on T2, pizza, PMDco, galen, mini-family, owl2dl fixtures, a `oneOf`/`unionOf` probe, and explain/repair/weaken outputs (`src/workers/__tests__/noCopyReasoner.test.ts`). The reasoner never returns blank nodes; an inference about a blank node comes back as the stored skolem IRI. Pin the package exactly: the mapping is internal, not a documented contract, so the gate tests act as a canary on every bump.

`excludeGraphs` is a constructor option (applies to every call on the instance; the reasoner's own inferred, hypothetical and explanation graphs are always excluded). `DlReasoner` passes `NON_AXIOM_GRAPHS` once.

### What the app is responsible for now

1. **Graph counts.** The package clears the inferred graph with a raw `clearGraph` but injects inferred triples through `addQuad`. The counting wrappers see only the additions, so after an edit and a rerun the inferred count doubled (5 instead of 3). `withReasoner` recounts `urn:vg:inferred`, `urn:vg:hypothetical` and `urn:konclude:explanations` after every reasoner command (`src/workers/__tests__/reasonerGraphCounts.test.ts`; it fails without the recount — a test on an unchanged second run does not).
2. **Stale runs.** The package replaces the live inferred graph before the app can check `isCurrent()`. A stale run drops the inferred graph the package just wrote and reports the previous run's inferred quads as removed, so the canvas clears them.
3. **Delta use.** The package writes the inferred graph itself; the app uses `delta.added`/`removed` only for emission and SHACL.

### Publish the result before the emission

`runReasoning` took 126 s although the reasoner needed 9 s. The worker posted the inferred `subjects` event (17,185 subjects) before the `reasoningResult` response. The page handles that event with long synchronous work (links, rendering), and messages are processed in post order, so the response queued behind it. The emission is now posted from a `setTimeout(0)` after the result (126 s to 12 s; ordering test in `reasonerGraphCounts.test.ts`).

### Inferred is a per-quad property

`handleApplyInferred` re-fetched every inferred quad (`limit: 0`) and re-added them with the `urn:vg:inferred` tag, although worker emissions already carry every quad of a subject with its own graph. `N3DataProvider.addGraph` now tracks a triple as inferred when the batch is flagged or when the quad's own graph is `urn:vg:inferred`, so the amber decoration needs no second path. The old ordering concern (links rendering blue before the tags exist) is covered because tagging happens in the same `addGraph` call, before the links are requested.

## Why This Matters

The copy cost 0.7–1.5 s per call and the write-back about 0.45 s on LUBM-1 (about 1.4 s of 10 s); the larger effects were the counters and the message order, which only show up once the copy is gone.

## When to Apply

When adding a reasoner call, bumping the package, or touching how inferred triples reach the canvas.

## Related

- `docs/solutions/logic-errors/konclude-v080-reuse-and-stale-inference-on-unload-2026-10-16.md`
- `docs/solutions/workflow-issues/browser-benchmark-validity-input-bundle-and-main-thread-2026-11-11.md`
