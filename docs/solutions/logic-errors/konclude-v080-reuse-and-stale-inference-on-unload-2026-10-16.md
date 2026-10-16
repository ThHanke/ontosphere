---
title: Konclude 0.8.0 upgrade — reuse one reasoner; inferred graph and canvas must follow unloads
date: 2026-10-16
category: docs/solutions/logic-errors/
module: rdfManager.runtime, ReactodiaCanvas
problem_type: logic_error
component: tooling
symptoms:
  - After unloading an ontology (pmdco) the canvas suddenly showed thousands of its entities as boxes ("No annotation properties")
root_cause: logic_error
resolution_type: code_fix
severity: medium
tags: [konclude, rdf-reasoner-konclude, inferred-graph, unload, canvas, cache, 0.8.0]
---

# Konclude 0.8.0 upgrade — reuse one reasoner; inferred graph and canvas must follow unloads

## Problem
Upgrading `rdf-reasoner-konclude` 0.7.2 -> 0.8.0 made two app-side workarounds obsolete, and removing the reasoner reset exposed that unloads never cleared `urn:vg:inferred`. Separately, unloading an ontology resurrected its subjects on the canvas.

## Symptoms
- After unload, the canvas filled with the unloaded ontology's entities.

## What Didn't Work
- Clearing the inferred graph in the worker alone did not fix the canvas: the unload emission lists the removed subjects, and the canvas treated every subject not on it as new.

## Solution
- 0.8.0 digests store content per call and rebuilds only on change (recycles its own Worker at 2 GiB heap). Dropped `resetDlReasoner()` per run and on graph removal; one `DlReasoner` now serves all runs. Kept it only for the explicit stop button.
- `_entailmentCache` was cleared only by that reset; it is now keyed on `reasoningInputGeneration`.
- `unloadOntologySubjects` and `syncRemoveGraph` (non-axiom graphs excluded) call `dropInferredGraph()`: inferences outlive their axioms, so they are deleted and their subjects refreshed.
- `ReactodiaCanvas` on `unloadOntologySubjects`: remove subjects from provider, `knownSubjects` and canvas; filter them out of the emission; never create elements.
- Kept: `reasoningBase()` skolemization round trip and `NON_AXIOM_GRAPHS` (the package does not know them).

## Why This Works
The package now owns reasoner-state validity; the app owns the derived data it stores (inferred graph, explanation cache) and must invalidate it when its inputs change.

## Prevention
- Any new path that removes axioms must drop `urn:vg:inferred` (tests: `unloadDropsInference.test.ts`).
- Emissions that list removed subjects must be treated like `removeGraph` by the canvas.
- Worker changes need a hard reload of the dev server.

## Related Issues
- [konclude-v030-abox-realization-gaps-2026-06-10.md](konclude-v030-abox-realization-gaps-2026-06-10.md)
