---
title: A browser reasoning benchmark can be wrong in three ways at once — unreadable input, stale dependency bundle, and a main thread that lies about being idle
date: 2026-11-11
category: docs/solutions/workflow-issues/
module: benchmarks, scripts/bench-reasoner-phases.mjs, scripts/bench-canvas-links.mjs, public/bench-*
problem_type: workflow_issue
component: development_workflow
severity: high
applies_when:
  - Timing a reasoning or canvas run in headless Chromium against the Vite dev server
  - A dependency (rdf-reasoner-konclude, @reactodia/workspace) was bumped or patched in the same session
  - A number looks too slow, too fast, or differs between the browser and node
tags: [benchmark, lubm, owl-xml, vite, pre-bundle, longtask, heartbeat, measurement, rdf-reasoner-konclude]
---

# A browser reasoning benchmark can be wrong in three ways at once

## Context

The LUBM-1 numbers in the README and CHANGELOG (28.5–85.8 s, 65.6 s) were wrong, and while correcting them three more measurement mistakes showed up. Each one produced a plausible-looking number. The related earlier lesson is `verify-what-you-measured-wrong-build-vacuous-typecheck-skipped-tests-2026-11-10.md` (wrong build, vacuous typecheck); this one adds input validity, bundle staleness and main-thread measurement.

## Guidance

### 1. Check that the reasoner inferred something

`public/bench-lubm-tbox.owl.xml` is **OWL/XML** (functional XML syntax: `<SubClassOf>`, `<Declaration>`), not RDF/XML. The app's RDF/XML parser read it as 1,023 junk quads with `owl:SubClassOf`, `owl:Declaration` and `owl:AnnotationAssertion` as predicates and no `rdfs:subClassOf`. The reasoner saw no TBox and returned `addedCount: 0`, so the "LUBM-1 with data" wall time measured only the canvas handling of a 100k-quad ABox. With the valid RDF TBox (`public/bench-lubm-tbox.nt`, the 307-triple `lubm.nt`) the run adds 71,025 quads, as in node.

- A reasoning benchmark must report the inferred count next to the time, and compare it with a known-good run (node, native Konclude). `scripts/bench-reasoner-phases.mjs` prints `addedCount` and the worker-side phase durations.
- `public/bench-galen.owl.xml` is OWL/XML too, so the GALEN row is unverified. Check a file's syntax before using it as RDF.

### 2. Restart Vite with `--force` after a dependency bump

Vite pre-bundles `node_modules` packages into `node_modules/.vite/deps/` and re-checks the lockfile hash only when it starts. A dev server left running across a bump from rdf-reasoner-konclude 0.9.1 to 0.9.3 kept serving the 0.9.1 JavaScript next to the 0.9.3 WASM and `worker.js` in `public/rdf-reasoner-konclude/` (copied by the `postinstall` script, served straight from disk). Symptom: 76,551 added quads instead of 71,025, the extra 5,521 being `rdf:type` quads on anonymous class expressions as skolem IRIs, because 0.9.1 does not map `urn:vg:bnode:*` IRIs to blank nodes. Node could not reproduce it under any call order.

- `scripts/bench-reasoner-phases.mjs` compares the mtime of the pre-bundled `rdf-reasoner-konclude.js` with the installed package and exits with `STALE BUILD` if the bundle is older. Check `grep -c <new symbol> node_modules/.vite/deps/<pkg>.js` after a restart.
- Same for patch-package changes to `@reactodia/workspace`: restart with `--force` or the old code keeps running.

### 3. Measure idleness with a heartbeat, not with `longtask` entries

`PerformanceObserver` `longtask` entries are delivered after the task ends. A polling check "no long task for N seconds" can therefore pass while a giant task is still running, and `settledMs` came out smaller than the sum of long tasks. Use a `setInterval(…, 50)` in the page that records the last time the gap between ticks exceeded 150 ms; "settled" is "no gap for N seconds and the heartbeat is alive". Use a 20 s window for LUBM-1: the load's tail (layout results, React) arrives after gaps of several seconds, and a 3 s window started reasoning during it.

### 4. Other measurement traps seen in this session

- A `page.evaluate` (for example to reset counters) waits for the busy main thread, so it can run after the giant task you wanted to count. Reset counters before the call and read them once at the end.
- Playwright has no `browser.process()`; get per-process memory from the browser-level CDP `SystemInfo.getProcessInfo` plus `VmHWM`/`VmRSS` in `/proc`. Dedicated workers are threads of the renderer process, so the renderer figure includes the WASM heap and worker stores.
- `Debugger.pause` sampling sees only JS and slows the run about 6× (a 109 s run took 703 s); CPU-profiler times are inflated too. Use sample shares, not absolute seconds, and confirm with an unprofiled run.
- `performance.memory` is coarse in Chromium (a fixed 30 MB for a 5 GB page). Use RSS.
- A trace across a whole load can be 470 MB; delete it afterwards and keep only the numbers.

## Why This Matters

Each mistake sent the investigation to the wrong place: the first made the reasoner chain look like the bottleneck (it was 10 s of 100), the second made a correct package look broken, the third made a long freeze look settled.

## When to Apply

Before publishing or acting on any browser benchmark number, and after every dependency bump or patch.

## Related

- `docs/solutions/workflow-issues/verify-what-you-measured-wrong-build-vacuous-typecheck-skipped-tests-2026-11-10.md`
- `docs/solutions/architecture-patterns/reasoner-reads-the-live-store-no-copy-2026-11-11.md`
- `docs/solutions/performance-issues/canvas-large-load-dom-size-and-chunking-2026-11-11.md`
