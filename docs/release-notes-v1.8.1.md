# Ontosphere v1.8.1

A correctness and speed release on top of 1.8.0. **Reasoning in the browser is about six times faster again** (reasoner 0.9.5), **explanations of derived facts are correct after a reasoning run**, repair assessment sees every disjointness group, and SHACL validation follows the spec on blank nodes and class hierarchies. A few results change (see *Upgrade notes*).

## Highlights

- **PMDCO reasoning in the browser: 14.9 s → 2.5 s.** 1.8.0 shipped reasoner 0.9.3, which was about eight times slower in the browser than the release before it (1.7.7: 2.4 s). rdf-reasoner-konclude 0.9.4 removes the cause (a C++ exception thrown on every OR branch, 77 µs each in Chromium) and 0.9.5 is the version pinned here. Same inferred triples as 0.9.3 (counted on all five benchmark ontologies).
- **Correct explanations after a reasoning run.** `explainEntailment` returned an inferred class-hierarchy edge or an unrelated axiom once `runReasoning` had run, and printed "directly asserted" for the empty answers. It now searches for the guaranteed-minimal justification by default and returns HermiT's two justifications on the Fe-Si case.
- **Repair assessment and axiom-level explanations see blank nodes again.** `assessEdit` checked 21 of 169 asserted disjointness pairs on PMDco; it now checks all of them. Restrictions and lists are one axiom in `repair`, `weaken` and `explainInconsistencyAxioms` instead of one-triple fragments.
- **SHACL on the spec:** blank nodes are validated as blank nodes, shapes see imported ontologies and the class hierarchy, the default shapes check labels only, and validation reads the store without copying it (LUBM-1: 32 MB held instead of 464 MB).

## Upgrade notes

- **`explainEntailment` defaults to the exact search and can take seconds.** The default `justificationMode: "exact"` returns guaranteed-minimal justifications (Fe-Si: about 18 s; a repeat of the same question on an unchanged graph is cached). It has a 60 s limit; if it ends without a justification the tool falls back to `"fast"` (one verified candidate, not necessarily minimal), and if that has none either the result says `justificationUnavailable: true` with a `reason`. New optional input `justificationMode` (`"exact"` or `"fast"`); the result names the mode it used. An empty `justifications` list no longer means "directly asserted": a directly asserted axiom is its own one-axiom justification. Agents that read an empty list as "asserted" must read `justificationUnavailable` instead.
- **Browser requirement: WebAssembly exception handling** (Chrome 95+, Firefox 100+, Safari 15.2+, Node 17+). Older runtimes cannot instantiate the reasoner module.
- **SHACL findings change.** The default shapes check labels only (`rdfs:label`, `skos:prefLabel` or `dcterms:title`; at most one per language; no `rdfs:subClassOf` cycles). Comments, domain, range and `skos:inScheme` moved to the opt-in `ontology-documentation.shacl.ttl` ("Ontology Documentation" preset). `sh:Info` findings are no longer warnings: they appear in the Warnings tab on request and as `infoCount`, and draw no canvas badges. Anonymous classes no longer get label findings (on PMD Core as data: 570 findings, 285 of them warnings, gone). The "SKOS Quality" preset is removed; its label checks are in the default shapes.
- **`loadRdf` with inline Turtle keeps your own `@prefix` for a built-in prefix name** (`ex`, `schema`, `dc`, `dcterms`, `foaf`, `skos`, `rdf`, `rdfs`, `owl`, `xsd`). Before, `@prefix ex: <http://my.org/band-gap#> .` was replaced by `http://example.org/`. Loading from a URL or file was never affected.
- **Inferred triples are unchanged** from 1.8.0 on reasoning-demo (53), Pizza (170), PMDco (289), GALEN (1,386) and LUBM-1 (71,025), counted on 0.9.5. The reasoner's release notes also report identical results on Roberts.

## Features and improvements

### Reasoning
- `rdf-reasoner-konclude` 0.9.3 → 0.9.5 (pinned, no caret). 0.9.4: native WebAssembly exceptions, an optimized WASM binary (10.4 MB → 7.05 MB), and `checkConsistency` that stops at the consistency step. 0.9.5: sound `explainEntailment` after a reasoning run, `justificationMode` `"fast"`/`"exact"`, and the reasoner remembers the inferred graph it was given.
- Blank nodes are real blank nodes in the worker store again. The canvas, the MCP tools and SPARQL keep addressing them as `urn:vg:bnode:<label>`; the mapping is applied only where terms cross the worker boundary, and SPARQL patterns, `INSERT DATA` and `DELETE DATA` with such an id address the blank node it names. SPARQL clients never see blank-node terms.
- `validate()` receives the inferred graph name like every other reasoner call.

### SHACL
- Validation reads the N3 store through a read-only view, merging shapes, data, loaded ontologies and inferred triples into one triple set. `sh:targetClass` and `sh:class` follow `rdfs:subClassOf` across graphs; findings are still reported only for subjects of the data graph.
- `shacl-engine` 1.1.0 → 1.1.3 (pulls Comunica 5, which the app already uses). The W3C data-shapes suite (core and sparql, 106 cases) passes in four set-ups.
- Label uniqueness, class cycles and orphan classes are SPARQL targets evaluated as one query instead of one query per node.

## Fixes

- Repair assessment skipped every `owl:AllDisjointClasses` group, and repair, weaken and axiom-level explanations split restrictions and RDF lists into one-triple "axioms" (the reasoner library reads real blank nodes only; the store had held skolem IRIs since the copy was removed in 1.8.0).
- `explainEntailment` after a reasoning run (see Highlights).
- Typed literals written through `syncBatch` had no datatype IRI (`"1"^^undefined` in the store), so datatype constraints on authored values could misfire.
- `explainDiagnostics` kept SHACL honest only on reasoner 0.9.3/0.9.4: 0.9.5's `validate()` rewrites the inferred graph with the class hierarchy, which dropped the individual-level inferences before SHACL ran. `validate()` now writes to a scratch graph that is emptied right after, so the inferences of the last `runReasoning` stay.
- The MCP tool texts no longer say "directly asserted" for an entailed axiom that has no justification.

## Performance (8 cores, headless Chromium, `runReasoning` wall time, 3 runs, `scripts/bench-reasoner-phases.mjs`)

| Ontology | 1.8.0 (reasoner 0.9.3) | 1.8.1 (reasoner 0.9.5) | Inferred |
|---|---|---|---|
| reasoning-demo | 1.1 s | 0.85–0.95 s | 53 |
| Pizza | 1.3–1.4 s | 1.0–1.1 s | 170 |
| PMDCO | 14.8–15.3 s | 2.5–2.6 s | 289 |
| GALEN | 3.9–4.0 s | 3.0–3.1 s | 1,386 |
| LUBM-1 with data | 11.4–11.7 s | 9.7–9.9 s (reasoner 7.1–7.2 s) | 71,025 |

The inferred counts are identical in both columns. Peak renderer memory including the reasoner worker: 0.5–1.0 GB for the first four, 6.7 GB for LUBM-1 (17,174 individuals; the canvas keeps the page busy for about 64 s after the reasoner returns). The release before 1.8.0 (1.7.7, reasoner 0.8.0) took 2.4 s on PMDCO with a different script, but 0.8.0 left some true subsumptions untested (2 on PMDco, 70 on Pizza), which 0.9.0 fixed at a cost in time that 0.9.4 buys back.

## Known limits

- Exact explanations take seconds on large ontologies; the fallback to `"fast"` is bounded to 60 s.
- Blank-node ids are as stable as before: stable for the same load order, not content-addressed (the label is a hash of the parser's label).
- Scaled inputs (the evaluation record replicated ×20 and ×50, which stalled in the browser on 1.8.0) were not re-run for this release.
- SHACL Advanced Features are not supported by `shacl-engine`; SPARQL-based constraints and targets are.

## Housekeeping

- `npm audit` reports 0 vulnerabilities: `minimatch` is overridden to `^11.0.8` for `@typescript-eslint/typescript-estree`, which is dev tooling only.
- Removed the unused `@radix-ui/react-popover` dependency and the dead React Flow code (`EdgeParams`, `node-tooltip`, `edgeStyle`, `createEdge`).

The full list with commits is in [CHANGELOG.md](../CHANGELOG.md).
