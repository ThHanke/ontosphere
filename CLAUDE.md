# Project Guidelines

## Documentation

After adding or changing any user-facing feature, always check whether `README.md` needs updating. Ask: does this change affect setup, UI behaviour, URL parameters, MCP tools, or AI integration? If yes, update the relevant README section and keep the Table of Contents in sync.

## Canvas and template memory

Every element and link on the canvas costs DOM nodes, listeners and renderer memory (LUBM-1: 17,174 elements, several GB). Any change to the element or link templates (`src/templates/`), to Reactodia decorations, overlays or the `@reactodia/workspace` patch must be investigated for its memory cost before it is merged:

- Measure with `node scripts/bench-canvas-links.mjs 100 300 1000` (dev server on :8091; add `EXTRA_CSS='...'` to try a style change without editing code). It prints DOM nodes, listeners and renderer RSS per size; the cost per element is the slope between sizes. Reference (measured 2026-11-11, one individual = 1 element plus 2 links): about 31 DOM nodes and 0.34 MB renderer memory per individual before the card/link changes, about 24.5 nodes and 0.26 MB now (unselected links above 300 links render as a bare path without label, see `RdfLinkTemplate.tsx`), and about 840 listeners at any size. `e2e/canvas-footprint.spec.ts` guards it (budget 38 nodes per individual at 90 individuals). Large-graph checks: `scripts/profile-memory-stages.mjs` (LUBM-1 by stage), `scripts/profile-layout-memory.mjs` (layout step), `scripts/profile-url-memory.mjs <url>` (a startup URL).
- Listeners must not grow with the element count. Anything mounted per element (portals, React roots, buttons that show only on hover or selection) must be mounted lazily: a portal container gets React's whole delegated listener set (about 138 listeners), so 17k of them cost 2.4M listeners. See `docs/solutions/performance-issues/canvas-large-load-dom-size-and-chunking-2026-11-11.md`.
- Restart the Vite dev server with `--force` after changing a dependency or a patch before measuring.

## Demo videos

See [docs/demo-scripts/HOWTO.md](docs/demo-scripts/HOWTO.md) when recording or creating demo videos.

## OWUI relay sessions

See [docs/owui-relay-session.md](docs/owui-relay-session.md) for the full session setup guide (MCP browser tabs, auth, startup sequence, format enforcement, debug checklist).

## Background task output

Never write background task output to `/tmp`. Always tee to `logs/` in the repo:

```bash
some-long-running-command 2>&1 | tee logs/<descriptive-name>.log
```

Use a fixed, descriptive name (not timestamped) so the file is easy to find and `tail -f` works naturally. The `logs/` directory is git-ignored. Check `logs/` before `/tmp` when looking for recent run output.

## Documented Solutions

`docs/solutions/` — solutions to past problems (bugs, architecture patterns, workflow practices), organized by category with YAML frontmatter (`module`, `tags`, `problem_type`). Relevant when implementing or debugging in documented areas.
