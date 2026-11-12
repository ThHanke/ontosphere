# Changelog

## [1.8.1] — unreleased

### Fixed

- **Repair assessment and axiom-level explanations saw no blank nodes.** Since the reasoner stopped receiving a de-skolemized copy of the store (1.8.0 branch, commit 34fd069), `assessEdit` skipped every `owl:AllDisjointClasses` group (PMDco: 21 of 169 asserted disjointness pairs checked) and `repair`, `weaken` and `explainInconsistencyAxioms` split restrictions and RDF lists into one-triple "axioms", because the reasoner library's TypeScript readers only recognise real blank nodes. The worker's store now holds real blank nodes again; `urn:vg:bnode:<label>` is the id the canvas, the MCP tools and SPARQL use and is mapped only at the worker boundary. SPARQL patterns, `INSERT DATA` and `DELETE DATA` with such an id address the blank node it names. No change for users; ids and results keep their form. Details: `docs/solutions/architecture-patterns/reasoner-reads-the-live-store-no-copy-2026-11-11.md`.
- **`loadRdf` with inline Turtle no longer rewrites your own `@prefix` for a built-in prefix name.** `@prefix ex: <http://my.org/band-gap#> .` used to be deleted and replaced by `http://example.org/`, silently changing every IRI that used the prefix (same for `schema`, `dc`, `dcterms`, `foaf`, `skos`, `rdf`, `rdfs`, `owl`, `xsd`). A well-formed declaration of your own is kept; only a malformed one or an exact copy of the built-in mapping is dropped. Loading from a URL or file was not affected.

## [1.8.0] — 2026-11-11

Reasoning moves to rdf-reasoner-konclude 0.9.x (pinned 0.9.3): results change (see *Upgrade notes*), and repair suggestions are now computed by the reasoner. Startup is stricter: MCP tools answer only once startup loading has finished. Large graphs reason and render faster: `runReasoning` returns when the reasoner is done (LUBM-1: 126 s to 12 s), and the canvas finishes loading sooner.

### Upgrade notes

- **Inferred counts change with the reasoner (0.8.0 to 0.9.x).** Pizza (`bench-pizza.owl`): 137 inferred triples with 0.8.0, 165 with 0.9.1 and 170 with 0.9.3. PMDco classification: two direct edges that 0.8.0 lost are back (`PMD_0020243 ⊑ PMD_0023003`, `PMD_0080022 ⊑ PMD_0023003`). GALEN is unchanged (1,386). Re-measure any figure you published with 1.7.x.
- **Fewer unsound `rdf:type` assertions after materialization** (only ones the reasoner does not entail: a `someValuesFrom` filler typed from its owner, `hasSelf`, `hasValue` and `minCardinality` rules applied to `subClassOf`), and more types where the class hierarchy used to be incomplete.
- Texts, justifications and repair suggestions changed shape; see *Breaking changes*.

### Breaking changes

- **MCP tool calls are rejected until startup loading has finished.** Ontology autoload, `?rdfUrl=` data and the startup shapes load after the page opens, and a tool call during that window read a half-loaded graph. Calls now return `success: false` ("…still loading…") until `window.__startupComplete()` is `true` (a 120 s safety valve lifts the block if a start never completes). Scripts and agents that call a tool right after the page opens must wait for that flag or retry; the demo, relay and benchmark drivers in this repository were updated to wait (only the benchmark script has been run since).
- **An empty SHACL shapes URL in the settings now means "use the built-in ontology-quality shapes"** (it used to mean "do not load shapes"). The built-in shapes are the fallback only when neither `?shaclShapes=` nor the configured URL names shapes. Turn SHACL off with the SHACL toggle.
- **`explainDiagnostics` no longer returns laconic explanations.** The `laconicJustifications` field and the "Precise culprit (laconic — superfluous parts removed)" lines in `repairBrief` are gone. `justifications` still lists the whole axioms that cause each clash.
  - *Why:* laconic explanations show which part of an axiom causes a clash (for example `A ⊑ B` inside `A ⊑ B ⊓ C`). The app used them for two things only: hints to the old weakening code, and extra wording in the agent-facing repair brief. The hints are obsolete, because the reasoner's `weaken()` now splits conjuncts itself and verifies each weaker axiom. The wording was never shown in the UI. Computing them was the most expensive step of the call: 180.5 s of 232 s for PMDCO plus one disjoint-class clash (node, real reasoner), and `explainDiagnostics` took about 513 s in the browser.
  - *Impact:* agents that read `laconicJustifications` or the "Precise culprit" lines should read `justifications` instead. Repair suggestions are unaffected: they work on whole axioms, and weakenings still offer the dropped-conjunct alternatives. `rdf-reasoner-konclude` still provides `explainInconsistencyLaconic` for direct use.
- **`explainDiagnostics` justifications come from the reasoner's repair search.** Declarations (`C a owl:Class`) are not part of a justification, and the number of justifications can exceed `maxJustifications`. Repairs are one minimal verified set (a deletion set, as before), and weakenings are offered only when removing the culprit alone restores consistency, i.e. with a single independent clash.
- **Text in results names IRIs as prefixed names or full IRIs, never as bare local names.** The clash message of `runReasoning`, SHACL error text, repair rationales and weakening notes, the repair brief, SHACL repair text and the `explainEntailment` summary used the part after the last `#` or `/`, which is not unique across namespaces and cannot be passed back to a tool. They now use a prefix from the namespace map (`inc:frank`, `rdf:type`) or the full IRI when no prefix is registered. Structured fields were already full IRIs. The canvas still shows an `rdfs:label` in place of the name where the ontology has one. Agents that parse these texts need to adapt.

### Reasoning

- **rdf-reasoner-konclude 0.9.x, pinned to 0.9.3 (no caret).** 0.9.1 completes class hierarchies again, removes the unsound type post-processing, fixes the blank-node ids it returned, and removes an intermittent slow role realization (same output, up to 8× CPU on the Roberts ontology). LUBM-1 with data takes 11.4–11.7 s in the browser benchmark (see *Changes*).
- **Repair and weakening run on the reasoner.** `repair()`, `weaken()` and `assessEdit()` find and verify the repair sets; Ontosphere maps them onto the existing `RepairSuggestion` shape (ranking: smallest set first, then assertions before schema axioms). The panel and the `explainDiagnostics` tool share one worker command. The old greedy hitting set, minimality search, weakening enumerator and `verifyRepair` command are removed; SHACL repair suggestions are unchanged.
- **One explain per graph state.** The worker caches the whole-axiom justifications per input generation (any write to the store invalidates them) and hands them to `repair()` as a seed, so `runReasoning`, `explainDiagnostics` and the panel do not explain again.
- **`explainDiagnostics` is about four times faster on a large inconsistent ontology.** PMDCO plus one disjoint-class clash, headless Chromium: 513 s before, 128 s now. The gains come from reasoner 0.9.1 (`repair()` takes the justifications that were already computed instead of explaining again), no laconic pass, no classification of an inconsistent ontology, and one explain per graph state (cached, invalidated on every write to the store). Most of what remains is the first consistency check and explain inside `runReasoning` (99 s).
- **`explainDiagnostics` does not compute `unsatisfiableClasses` for an inconsistent ontology.** In an inconsistent ontology every class is unsatisfiable, so the list says nothing, and the classification took 52 s on PMDCO in the browser. The field is empty, the output carries `unsatisfiableClassesSkipped: "ontology-inconsistent"`, and the UI shows a toast ("Unsatisfiable classes not computed"). Consistent ontologies are unchanged.
- **Deletion repairs carry `kind: "delete"`**, as the tool description always said (weakenings carry `kind: "weaken"`). Before, a deletion had no `kind`.
- **`explainDiagnostics({ includeTimings: true })`** adds `timingsMs` (wall time of each stage and of each reasoner call) for diagnosing slow runs.
- **A stalled or crashed reasoner is a failed run.** SHACL is skipped, the result status is `error`, and the MCP tool `runReasoning` returns `success: false`.

### Startup and loading

- **`window.__startupComplete()`** reports whether startup loading has finished.
- **Shapes:** `?shaclShapes=` wins, then the configured shapes URL, then the built-in shapes (written only into an empty shapes graph).
- **`?workflowCatalog=off`** skips the startup load of the PyodideSemanticWorkflow catalog, for headless runs and evaluations.
- **The PyodideSemanticWorkflow ontology joins `urn:vg:ontologies` when a workflow is first dropped on the canvas**, not at startup, so it is not reasoning input for sessions that never use a workflow.
- **Bundled W3C vocabularies are a fallback.** `rdf`, `rdfs`, `owl` and `prov` are fetched from w3.org first; if that fails (blocked, offline) the copies shipped in `public/w3-vocabularies/` are used.

### Changes

- **README performance numbers re-measured on valid inputs with reasoner 0.9.3** (8 cores, headless Chromium; see *Performance*): reasoning-demo 1.1 s, Pizza 1.3–1.4 s, PMDCO 14.8–15.3 s, GALEN 3.9–4.0 s, LUBM-1 with data 11.4–11.7 s. The earlier LUBM-1 and GALEN figures loaded an OWL/XML TBox the RDF parser cannot read, so no inference took place and they measured only the canvas; the README's 2.6 s for PMDCO is not reproduced. Pizza reports 170 inferred triples with 0.9.3 (165 with 0.9.1; the change comes from the package version, the no-copy path was checked equal on the same package). The Konclude WASM table (native against WASM, in Node) is copied from the reasoner repository and still carries its 0.8.0 numbers.
- **`runReasoning` returns when the reasoner result is in.** The inferred triples reach the canvas afterwards, in chunks. LUBM-1 with data: 126 s to 11.4–11.7 s (reasoner 8.6–8.8 s); the canvas then settles in about 85–90 s (it was about 125 s).
- **Canvas loads are faster and shorter-blocking.** Elements are created in chunks, the inferred refresh runs in chunks, Reactodia's per-link element scan is replaced by an index, and the authoring decorators (inline Edit/Delete) are mounted only for the hovered, selected or edited element instead of for all elements. At 8,000 individuals the load settles in 19 s instead of 31 s and the longest single task drops from 4.9 s to 3.1 s.
- **Large canvases: relation labels show only on selection.** Above 300 links, links that are not selected are drawn as a bare line with arrowhead (no label, no per-link type subscription); selecting a link brings back its label and the full template, and links stay clickable. About 30 to 24.5 DOM nodes and 0.34 to 0.26 MB renderer memory per individual (1 element + 2 links; headless Chromium, no layout). Entity cards use shared CSS classes instead of per-node inline styles (one DOM node fewer per card). The threshold is `LEAN_LINKS_THRESHOLD` in `src/templates/RdfLinkTemplate.tsx`.
- **The halo's delete button (×) is gone.** It duplicated the entity's inline Delete; the Delete key and the inline buttons work as before.
- **The reasoner reads the real store** (rdf-reasoner-konclude 0.9.3, pinned): no copy, no write-back, inferences unchanged. About 1.4 s less on LUBM-1.

### Bug fixes

- **Dataset and Turtle export no longer drop literals that differ only by language or datatype.** The export de-duplicated quads by the literal's text alone, so `"chair"`, `"chair"@en` and `"chair"^^xsd:token` on the same subject and predicate collapsed into one. Exporting PMDco (commit 3b98aad) lost 7 triples this way, among them the labels of `PMD_0000964`, `PMD_0001003`, `IAO_0000112`, `IAO_0000115`, `dc:source` and `rdfs:label`. The same key was used for inferred quads. Loading was never affected.
- **Reasoning no longer reports success when the reasoner stalls.** A stalled or crashed run is now a failed run: SHACL is skipped, the result status is `error`, and the MCP tool `runReasoning` returns `success: false`.
- **`explainEntailment` resolves prefixed names like every other tool.** It took only full IRIs and answered "NOT entailed" (with `success: true`) for anything else, so `inc:frank` from a `queryGraph` row looked like an unentailed fact. Prefixed names now go through the namespace map, full IRIs pass unchanged, and an unknown prefix or a bare name is an error.
- **Validation reports carry a node id.** A SHACL violation without a focus node is attributed to its shape.
- **Blank-node values after reasoning** (`sh:class` on `x p [ a SubOfTarget ]`) conform again. The cause was inferred blank nodes coming back from the reasoner under another name; fixed in rdf-reasoner-konclude 0.9.1.

### Tests and tooling

- New browser tests: the PMDCO chemical-composition user story (data, ontology and shapes through URL parameters, reasoning, the `some_silicon` violation and its fix), the diagnose, repair, apply and re-check loop, and startup from URL parameters. Previously skipped tests are enabled (`owl:oneOf` realization, the import and TriG round trip on PMDco); the PMDco repair check at scale runs by default.
- The demo, relay and benchmark drivers wait for `window.__startupComplete()` before their first tool call. `scripts/bench-paper-table2.mjs` gains `--only` and `--fresh-browser`.
- `e2e/canvas-footprint.spec.ts` guards DOM nodes and listeners per element. Benchmark and profiling scripts (`scripts/bench-reasoner-phases.mjs`, `bench-canvas-links.mjs`, `profile-*.mjs`; the first refuses to run on a stale Vite pre-bundle), tests for the no-copy chain, graph counts and per-quad inferred tagging, and write-ups in `docs/solutions/` (measurement pitfalls, the live-store reasoner chain, canvas load performance).

## [1.7.7] — 2026-10-16

### Reasoning

- **rdf-reasoner-konclude 0.8.0.** The reasoner digests the store content on every call, rebuilds only when it changed, recycles its own Worker when the WASM heap grows, and recovers from stalled kernels. It also fixes lossy realization, a cardinality crash and an `owl:AsymmetricProperty` self-loop gap.
- **One reasoner across runs.** The per-run terminate/recreate workaround is gone; an unchanged graph costs no rebuild. The entailment-explanation cache is keyed on the reasoning input, so edits invalidate it.
- **Stop button** terminates in-flight reasoning (play button becomes a stop button in the top bar and reasoning indicator).
- Benchmarks rerun on 0.8.0 (headless Chromium, median of 3): reasoning-demo 1.1 s, Pizza 1.4 s, PMDCO 2.6 s, GALEN 3.4 s, LUBM-1 65.6 s. On one page with PMDCO loaded, a run after a one-individual edit takes about 0.3 s once the first run has started the reasoner (2.3 s), and an unchanged graph about 0.5 s.

### Bug fixes

- **Unload / graph removal** now drop `urn:vg:inferred`: inferences no longer outlive the axioms they came from.
- **Canvas**: unloading an ontology no longer re-adds its subjects as canvas elements (the P boxes with "No annotation properties").
- **SPARQL**: bare `UPDATE` patterns are scoped to `urn:vg:data`, and a delete always refreshes the canvas.
- **Relay**: no `isProcessing` deadlock or lost batch calls on timeout; hard maximum call deadline with duplicate-call visibility; no duplicate-call toast for chat history entries; `notifiedDupSigs` seeded correctly from page history; JSON extraction restarts after a malformed `{` instead of aborting.

### Breaking changes

None.

## [1.7.6] — 2026-09-24

### New features

**WebMCP support (document.modelContext)**
- Full [WebMCP spec](https://webmachinelearning.github.io/webmcp/) compliance: `document.modelContext` polyfill, object-form `registerTool`, `toolchange` events, and signal-based unregistration
- TypeScript types for the polyfill and WebMCP surface
- Test suite covering polyfill registration, toolchange dispatch, and signal cleanup

**AI Relay Bridge — Gemini support**
- Input detection for Gemini's `rich-textarea` contenteditable component
- Send-button detection via `aria-label="Send message"` with visibility guard (Gemini hides the send button with a CSS `hidden` class during generation instead of using `disabled`)
- Streaming detection covers both `"Stop generating"` and `"Stop response"` button label variants

**AI Relay Bridge — reliability improvements**
- Session locking: relay popup binds to a specific Ontosphere tab; stale-tab messages are dropped
- Fast session discovery via ping rather than waiting for the next poll cycle
- 3-minute batch timeout with partial-result flush when individual tool calls hang
- Incremental injection with pending-count hints for multi-call batches
- Injection guard blocks new polls while a result is being inserted, preventing dropped results
- FhGenie stop-button streaming detection (DismissSquare icon path)
- `getGraphState` scoped by graph list; unified with canvas summary

**SHACL violations**
- Violation messages enriched with `rdfs:label` values for human-readable property and class names
- Improved tooltip readability in the SHACL shapes panel

### Bug fixes

- **Canvas**: `Delete` key and halo delete button now route through the authoring state machine; nodes no longer reappear after save when deleted via keyboard
- **Relay**: reverted polling strategy to `isAiStreaming()` guard after stability regression; added two-poll idle streak requirement before injection to prevent the UUID-echo bug on OWUI
- **Relay**: strict bidirectional session pairing blocks tabs running old bookmarklet code

### Breaking changes

None. The WebMCP polyfill is opt-in and backwards-compatible with the existing `window.__mcpTools` registration path.
