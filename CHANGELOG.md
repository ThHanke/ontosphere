# Changelog

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
