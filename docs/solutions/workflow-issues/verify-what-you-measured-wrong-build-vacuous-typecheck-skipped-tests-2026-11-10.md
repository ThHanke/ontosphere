---
title: Verify that a check checks what you think — a baseline that measured the wrong build, a typecheck that checks nothing, tests skipped for an old reasoner
date: 2026-11-10
category: docs/solutions/workflow-issues/
module: release verification, benchmarks, typecheck ratchet, test gating
problem_type: workflow_issue
component: development_workflow
severity: high
applies_when:
  - A comparison against an older build is part of a release decision
  - A "clean" typecheck or green suite is quoted as evidence
  - A dependency is upgraded and tests were skipped or gated for the old version
tags: [benchmark, baseline, vite, strictPort, tsc, typecheck-ratchet, skipped-tests, release]
---

# Verify that a check checks what you think

## Context
During the 1.8.0 release prep three "evidence" items turned out to be hollow, and one false conclusion reached a CHANGELOG draft before it was caught.

## Guidance
1. **Baseline runs: confirm which build answers.** A baseline `vite --port 8081 --strictPort` in a second worktree failed ("Port 8081 is already in use") because the main dev server had moved to 8081 ("Port 8080 is in use, trying another one"). The benchmark then ran against the main app, so "0.8.0" and "0.9.1" were the same build and agreed suspiciously well, including a bimodal LUBM-1 result. Before trusting a comparison: read the server log, check the listener's working directory (`readlink /proc/<pid>/cwd`), compare a build-specific asset or version, and use a dedicated free port.
2. **`tsc --noEmit -p .` checks nothing here.** The root `tsconfig.json` has `"files": []`. The real check is `tsc --noEmit -p tsconfig.app.json`, which `scripts/typecheck-ratchet.mjs` runs; its baseline said 190 while the real count was 4. "Typecheck clean" claims made with the root config were vacuous.
3. **Retry skipped and gated tests on upgrade.** An `it.skip` for `owl:oneOf` realization ("does not fire in v0.3.0") passed on 0.9.1; manual gates (`PMDCO_SCALE`, `P14_FILE`) existed for flakiness that was gone. Enabling them added coverage at no cost; the checked-in `bench-pmdco.ttl` replaced the manual file.
4. **Retract a wrong conclusion everywhere it landed.** The invalid baseline had already produced a table, a CHANGELOG paragraph and a chat conclusion; remove or correct each, and re-state only what was actually measured.

## Why This Matters
A comparison with the wrong baseline produces a confident, wrong release note; a vacuous typecheck hides regressions; skipped tests hide fixes and regressions alike.

## When to Apply
- Any benchmark or A/B comparison between builds.
- Any time a check passes on the first try for a surprising reason.
- Every dependency upgrade (grep for `skip`, `skipIf`, and env-gated tests).

## Examples
```bash
ss -ltnp | grep ':8081 '          # who listens?
readlink /proc/<pid>/cwd          # which checkout?
curl -sI http://localhost:8081/rdf-reasoner-konclude/konclude.wasm   # size differs between 0.8.0 and 0.9.1
npx tsc --noEmit -p tsconfig.app.json
```

## Related
- `docs/solutions/developer-experience/scripted-edits-and-shell-slips-2026-11-10.md`
