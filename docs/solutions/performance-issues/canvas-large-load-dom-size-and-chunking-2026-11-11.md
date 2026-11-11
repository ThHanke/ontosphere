---
title: LUBM-1 on the canvas — 760k DOM nodes, one 41 s animation frame, and what chunking the load and the inferred refresh does and does not buy
date: 2026-11-11
category: docs/solutions/performance-issues/
module: ReactodiaCanvas, N3DataProvider, @reactodia/workspace (patch)
problem_type: performance_issue
component: tooling
symptoms:
  - Loading LUBM-1 (about 17k individuals) keeps the main thread busy for minutes; the load and the inferred emission arrive as single giant tasks
  - Renderer RSS 241 MB at startup, 5.8 GB after the load, 9.3 GB after the inferred refresh
  - About 40 s of "native" time with no JS in the CPU profile
root_cause: logic_error
resolution_type: code_fix
severity: high
tags: [reactodia, createLinks, chunking, requestAnimationFrame, forced-layout, dom-size, memory, lubm, patch-package]
---

# LUBM-1 on the canvas

## Problem

After the reasoner chain was cleaned up, LUBM-1 still took minutes of main-thread time. The reasoner is not the cost (9 s of 100+); the canvas is.

## Symptoms

- `Memory.getDOMCounters` at the settled point: 760,782 DOM nodes and 2,422,322 JS event listeners for about 17k elements (about 45 nodes and 140 listeners per element). Renderer RSS 5.8 GB after the load, +1.8 GB for reasoning (WASM heap, inferred graph), +1.7 GB for the inferred refresh.
- The "40 s native block" in the CPU profile is one `requestAnimationFrame` callback (`FireAnimationFrame` 40.9 s, `Debouncer.runSynchronously`) that re-renders all elements, with 83,690 forced style and layout recalculations (6.4 s) and `react-dom` rendering.
- One `subjects` event of 17,174 subjects, one microtask loop creating every element, one `requestLinks` for all of them: nothing was chunked.

## What Didn't Work

- Blaming `createLinks` from `Debugger.pause` samples (82 of 110 samples). Pause sampling sees only JS time. On a small setup (N=2,000 individuals) `createLinks` was 3% of the profile; cost there is about 4 ms and 300 KB per individual of React/DOM work, nearly linear up to 8,000.
- 300-element chunks: longest task at 8,000 individuals fell to 3 s but the total doubled (28 s to 53 s), because every chunk makes Reactodia re-render all existing elements (`jsx`/`jsxDEV`/`ReactElement` and `getBoundingClientRect` dominated the profile).

## Solution

1. **`createLinks` IRI index** (`patches/@reactodia+workspace+0.34.1.patch`): `onLinkInfoLoaded` builds an IRI-to-elements map once per loaded batch and `createLinks` looks sources and targets up instead of scanning `graph.getElements()` twice per link. At LUBM scale `createLinks` was 25 s after the load and 50 s after reasoning in the timeline profile; it is 0 now. Restart Vite with `--force` after changing a patch.
2. **Chunked element creation** (`ReactodiaCanvas.tsx`, `elementCreateChunkSize`): about 8 chunks per load (clamped to 300–3,000 elements); after each chunk `requestData()` runs and the next animation frame is awaited (timer fallback for hidden tabs). A set of queued IRIs keeps a second emission from creating duplicates. At 8,000 individuals: longest task 14 s to 5 s, total unchanged.
3. **Chunked inferred refresh** (same file): `requestElementData` and `requestLinks` per chunk of changed subjects, amber `stampInferredLinks` once at the end. LUBM-1 after reasoning: longest task 40 s to 16 s, total catch-up about 83 s to about 108 s (single runs; each chunk requests links against all elements). Kept for responsiveness; revisit if total time matters more.
4. Not done: capping or clustering before creating DOM. That cuts memory and time by an order of magnitude and changes what users see on load, so it needs a product decision. The `subjects` emission from the worker is still one event.

## Why This Works

The costs are per rendered element (React tree, DOM, listeners) plus a quadratic term in Reactodia's per-link element scan. The index removes the quadratic term; chunking bounds each task but cannot go below one full render pass per chunk, which is why chunk size must scale with the load.

## Prevention

- Profile at the real scale before choosing a fix: shares measured at N=2,000 were misleading at 17k.
- `scripts/bench-canvas-links.mjs` (N individuals, 2N links, heartbeat settle detection, longest task and count), `scripts/profile-lubm-batches.mjs` (per-5 s main-thread categories next to worker batch arrivals) and `scripts/profile-memory-stages.mjs` (RSS at four points) are the reproducible setups. See the measurement traps in `docs/solutions/workflow-issues/browser-benchmark-validity-input-bundle-and-main-thread-2026-11-11.md`.
- Try LUBM-1 in the dev server: `cat public/bench-lubm-tbox.nt public/bench-lubm-abox.ttl > public/bench-lubm-full.ttl`, then `/?ontologies=&rdfUrl=<origin>/bench-lubm-full.ttl`.

## Related Issues

- `docs/solutions/architecture-patterns/reasoner-reads-the-live-store-no-copy-2026-11-11.md`
- `docs/solutions/performance-issues/explain-pipeline-one-explain-per-graph-state-2026-11-10.md`
