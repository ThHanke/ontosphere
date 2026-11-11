# Ontosphere v1.8.0

Reasoning moves to **rdf-reasoner-konclude 0.9.3**, repair suggestions are now computed by the reasoner, and large graphs reason and render much faster. **Inferred counts change and some MCP behaviour changes, see Upgrade notes before updating scripts or agents.**

## Highlights

- **Faster reasoning on large graphs:** `runReasoning` returns when the reasoner has finished. LUBM-1 with data: 126 s → 11.4–11.7 s (reasoner 8.6–8.8 s). The inferred triples then reach the canvas in chunks.
- **Faster, lighter canvas:** elements are created in chunks and the editing buttons are mounted only for the hovered, selected or edited element. At 8,000 individuals the load settles in 19 s instead of 31 s. Renderer memory per individual drops from about 0.34 to 0.26 MB on large canvases (headless Chromium, 1 element + 2 links).
- **Repair and weakening run on the reasoner** (`repair()`, `weaken()`, `assessEdit()`). `explainDiagnostics` on a large inconsistent ontology (PMDCO plus one clash) takes 128 s instead of 513 s.
- **More reliable startup:** MCP tools answer only once startup loading has finished (`window.__startupComplete()`).

## Upgrade notes

- **Inferred counts change with the reasoner.** Pizza: 137 inferred triples with 0.8.0, 170 with 0.9.3. PMDco classification regains two direct edges (`PMD_0020243 ⊑ PMD_0023003`, `PMD_0080022 ⊑ PMD_0023003`). GALEN is unchanged (1,386). Re-measure any figure you published with 1.7.x.
- **MCP tool calls are rejected until startup loading has finished.** Calls return `success: false` ("…still loading…") until `window.__startupComplete()` is `true`. Scripts and agents that call a tool right after the page opens must wait for that flag or retry.
- **An empty SHACL shapes URL now means "use the built-in ontology-quality shapes"** (it used to mean "do not load shapes"). Turn SHACL off with the SHACL toggle.
- **`explainDiagnostics` no longer returns laconic explanations.** `laconicJustifications` and the "Precise culprit" lines in `repairBrief` are gone; read `justifications` instead. Repair suggestions are unaffected.
- **`explainDiagnostics` justifications come from the reasoner's repair search:** declarations are not part of a justification, and the number of justifications can exceed `maxJustifications`. Weakenings are offered only for a single independent clash.
- **Text results name IRIs as prefixed names or full IRIs,** never as bare local names (`inc:frank`, not `frank`). Agents that parse these texts need to adapt.

## Features and improvements

### Reasoning
- Repair and weakening on the reasoner; deletion repairs carry `kind: "delete"`.
- One explain per graph state, cached and invalidated on every write to the store.
- `explainDiagnostics` skips `unsatisfiableClasses` for an inconsistent ontology (the list is meaningless there and cost 52 s on PMDCO); the output says `unsatisfiableClassesSkipped: "ontology-inconsistent"`.
- `explainDiagnostics({ includeTimings: true })` returns per-stage timings.
- The reasoner reads the real store: no copy, no write-back, inferences unchanged (about 1.4 s less on LUBM-1).

### Canvas
- **Large canvases (more than 300 links): relation labels show only on selection.** Unselected links are drawn as a bare line with arrowhead; they stay clickable, and selecting one brings back its label.
- Entity cards use shared CSS classes (one DOM node fewer per card).
- The halo's delete button (×) is gone; it duplicated the inline Delete. The Delete key and inline buttons work as before.

### Startup and loading
- `window.__startupComplete()`; shapes precedence: `?shaclShapes=`, then the configured URL, then the built-in shapes.
- `?workflowCatalog=off` skips the PyodideSemanticWorkflow catalog load (headless runs, evaluations).
- Bundled `rdf`, `rdfs`, `owl` and `prov` vocabularies are used when w3.org cannot be reached.

## Fixes

- Dataset and Turtle export no longer drop literals that differ only by language or datatype (PMDco lost 7 triples this way).
- A stalled or crashed reasoner is a failed run (`success: false`, SHACL skipped) instead of a success.
- `explainEntailment` resolves prefixed names; before, `inc:frank` was answered "NOT entailed".
- SHACL violations without a focus node carry the shape as node id.
- Blank-node values after reasoning conform again (fixed in reasoner 0.9.1).

## Performance (8 cores, headless Chromium, reasoner 0.9.3)

reasoning-demo 1.1 s · Pizza 1.3–1.4 s · PMDCO 14.8–15.3 s · GALEN 3.9–4.0 s · LUBM-1 with data 11.4–11.7 s. Earlier LUBM-1 and GALEN figures in the README loaded an OWL/XML TBox the RDF parser cannot read, so no inference took place; they are replaced. Memory: LUBM-1 through a `?rdfUrl=` load peaks at 3.4 GB renderer memory in headless Chromium.

The full list with commits is in [CHANGELOG.md](../CHANGELOG.md).
