# Project Guidelines

## Documentation

After adding or changing any user-facing feature, always check whether `README.md` needs updating. Ask: does this change affect setup, UI behaviour, URL parameters, MCP tools, or AI integration? If yes, update the relevant README section and keep the Table of Contents in sync.

## Demo videos

Videos live in `docs/demo-videos/` (committed). Screenplays in `docs/demo-scripts/`. One video per screenplay, named to match.

**To re-record an existing video:**
```sh
npm run dev          # terminal 1 — keep running
npm run demo:video   # terminal 2
```
Outputs `docs/demo-videos/<name>.webm` + `.mp4`. Commit both.

**To create a new demo video:**
1. Write screenplay in `docs/demo-scripts/<name>.md` — plain English prose
2. Ask Claude: *"Record a demo video from this screenplay: `docs/demo-scripts/<name>.md`"*
3. Claude writes `e2e/demo-<name>.spec.ts` using `DemoRunner` from `e2e/demo-runner.ts`
4. Run `npm run demo:video` — produces and commits video files

**Runner primitives** (`e2e/demo-runner.ts`):
- `openStage()` — opens mock chat (left) + app (right) at 1920×1080
- `injectBookmarklet()` — injects relay, waits for popup
- `clickScenario(name)` — `single | batch | full | prefixed | unknown-tool`
- `switchMode(mode)` — `fhgenie | openwebui | chatgpt`
- `waitForResult(timeout?)` — waits for `[Ontosphere` in chat stream
- `clearChat()` — clears chat
- `pauseMs(ms)` — pacing pause
- `caption(text)` — bottom-center overlay (stays until replaced/cleared)
- `clearCaption()` — remove overlay
- `captionPause(text, ms)` — show caption → pause → clear

**Planned videos** (see `docs/demo-scripts/` for screenplays):
- `advert-intro` — done
- `basic-demo` — next session
