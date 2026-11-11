---
title: A readiness gate and a text-format change broke consumers that no test covered (benchmark and demo drivers, UI label substitution, test mocks)
date: 2026-11-10
category: docs/solutions/integration-issues/
module: MCP startup guard, startupReady, ReactodiaCanvas, scripts/, e2e/
problem_type: integration_issue
component: tooling
symptoms:
  - scripts/bench-paper-table2.mjs failed on every ontology with '"loadRdf" rejected: Ontosphere is still loading its startup ontologies, data and shapes'
  - After messages named IRIs as prefixed names or full IRIs, the canvas SHACL label substitution (which matched "path: <local name>") silently stopped working
  - Unit tests failed with "rdfManager.getNamespaces is not a function" once code asked the registry for prefixes
root_cause: missing_workflow_step
resolution_type: code_fix
severity: medium
tags: [startup, readiness, mcp, playwright, benchmark, demo, drivers, ui-text-matching, mocks]
---

# A contract change broke consumers that no test covered

## Problem
Two deliberate contract changes had quiet consumers: (1) MCP tools now reject calls until startup loading is complete (`window.__startupComplete()`), (2) result text names IRIs as prefixed names or full IRIs instead of bare local names.

## Symptoms
See frontmatter. The first full benchmark run produced "error" for all five ontologies.

## What Didn't Work
Relying on the unit and e2e suites: they all use `gotoAndWaitForReady`, which was updated, so they passed. The drivers outside that helper (benchmark scripts, demo runner and specs, relay specs, `demo-video.sh`, `demo-bootstrap.mjs`) each had their own "wait for `__mcpTools`" and none was exercised.

## Solution
- Add the startup wait to every driver, written to stay compatible with older builds: `(window.__startupComplete?.() ?? true)` next to the tools-registered check.
- Find consumers by grep before shipping a contract change: `grep -rn "__mcpTools" scripts e2e docs`, and any code that matches message text (`replaceAll(`path: ...`)`).
- The UI label substitution now matches the exact text the worker writes (the same abbreviation function and namespace map) and leaves the text alone when there is no label; it no longer falls back to a local name.
- Mocks of `rdfManager` in tests need every method the changed code now calls (`getNamespaces`).

## Why This Works
A gate or format change is a protocol change; every client that speaks the old protocol (scripts, UI string matchers, mocks) has to move with it, and only a search finds the ones tests do not touch.

## Prevention
- When adding a readiness gate, list its clients first and make the wait part of one shared helper where possible.
- Never match on generated message text in code; if a UI must rewrite text, derive the match from the same function that produced it.
- Run each driver once after the change (only the benchmark script was re-run here; the demo and relay drivers were updated but not run).

## Related Issues
- `docs/solutions/performance-issues/explain-pipeline-one-explain-per-graph-state-2026-11-10.md`
