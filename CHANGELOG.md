# Changelog

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
