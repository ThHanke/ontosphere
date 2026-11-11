---
title: Export dropped 7 PMDco triples — the de-duplication key ignored a literal's language and datatype
date: 2026-11-10
category: docs/solutions/logic-errors/
module: rdfManager.runtime (exportGraph, quadKeyFromTerms)
problem_type: logic_error
component: tooling
symptoms:
  - A TriG export of PMDco (commit 3b98aad) was missing exactly 7 triples against the source file
  - The missing ones were labels (PMD_0000964 "supervised machine learning", IAO_0000112, IAO_0000115, dc:source, rdfs:label) and one IAO_0000119 value
  - Loading the same file into the store lost nothing
root_cause: logic_error
resolution_type: code_fix
severity: medium
tags: [export, trig, turtle, literal, language-tag, datatype, dedupe, pmdco, round-trip]
---

# Export dropped 7 PMDco triples

## Problem
A coworker's evaluation compared an exported dataset with `pmdco.ttl` and found 7 triples missing. Their files were not available, and their note named the cause only as a guess ("probably same subject/predicate with different language tags or datatypes").

## Symptoms
See frontmatter. The import path was lossless; only export lost triples.

## What Didn't Work
- Suspecting the parser or the merge on load: a round trip file → `importSerialized` → `getQuads` lost nothing.
- My first comparison reported 3,553, then 356 "missing" triples: the test keyed literals wrongly (the reply carries `datatype` as a plain string, not a term object). Fix the comparison before trusting a count.

## Solution
Reproduce from public data instead of waiting for the coworker's files: the exact ontology is in the public repo at the pinned commit (`https://raw.githubusercontent.com/materialdigital/core-ontology/3b98aad/pmdco.ttl`). Import it, export as TriG, parse the text again, compare typed keys: exactly 7 missing.

`quadKeyFromTerms` built `subject|predicate|objectText|graph`, so `"example of usage"` and `"example of usage"@en` collapsed into one and the export kept one. The key now includes termType, language and datatype for literals:

```ts
const o = obj.termType === "Literal"
  ? `"${obj.value}"@${obj.language ?? ""}^^${obj.datatype?.value ?? ""}`
  : obj.value;
```

## Why This Works
Language and datatype are part of a literal's identity in RDF; two literals with the same text differ as terms. The same key also de-duplicated inferred quads.

## Prevention
- A de-duplication key for RDF terms must include term type, language and datatype.
- Keep a round-trip test (import → export → parse → compare) on a real ontology that has several literals per predicate: `src/workers/__tests__/importRoundTrip.test.ts` (runs on the bundled `bench-pmdco.ttl`; `P14_FILE` selects another file). Revert the fix temporarily (with a file copy, not `git stash`) to confirm the test fails without it.
