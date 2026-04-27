# Demo video HOWTO

## Re-record an existing video

```sh
npm run dev          # terminal 1 — keep running
npm run demo:video   # terminal 2
```

Outputs `docs/demo-videos/<name>.webm` + `.mp4`. Commit both.
`demo:video` runs Playwright then automatically calls `scripts/collect-demo-videos.mjs`, which copies videos from the hashed Playwright output dir to `docs/demo-videos/<name>.*`.

> **Requires `ffmpeg`** for `.mp4` conversion. If missing, only `.webm` is written and a warning is printed.
> Install: `sudo apt install ffmpeg` (Debian/Ubuntu) or `brew install ffmpeg` (macOS).

## Create a new demo video

1. Write screenplay in `docs/demo-scripts/<name>.md` — plain English prose (see `advert-intro.md` as example)
2. Ask Claude: *"Record a demo video from this screenplay: `docs/demo-scripts/<name>.md`"*
3. Claude writes `e2e/demo-<name>.spec.ts` using `DemoRunner` from `e2e/demo-runner.ts`
4. Run `npm run demo:video` — produces and commits video files

## Create a seed-driven demo video

Seed files (`docs/mcp-demo/seeds/*.md`) already contain the full AI workflow as JSON-RPC tool calls.
To turn one into a video, create a spec that calls `DemoRunner.parseSeed()` + `runSeedTurn()`:

```ts
const turns = DemoRunner.parseSeed('docs/mcp-demo/seeds/my-seed.md'); // relative to repo root
await runner.openApp();
for (const turn of turns) {
  await runner.runSeedTurn(turn, 250);
  await runner.pauseMs(600);
}
```

`parseSeed()` extracts tool calls and snapshot captions from the seed markdown.
`runSeedTurn()` calls each tool directly on `window.__mcpTools` and shows the caption overlay.

## Runner primitives (`e2e/demo-runner.ts`)

| Method | Description |
|--------|-------------|
| `openStage()` | Opens mock chat (left) + app (right) at 1920×1080 |
| `openApp()` | Opens app alone (full viewport) — for seed-driven demos |
| `DemoRunner.parseSeed(path)` | Parse seed markdown → `SeedTurn[]` (static) |
| `runSeedTurn(turn, delayMs?)` | Execute one seed turn: caption + tool calls on app frame |
| `injectBookmarklet()` | Injects relay bookmarklet, waits for popup |
| `clickScenario(name)` | `single \| batch \| full \| prefixed \| unknown-tool` |
| `switchMode(mode)` | `fhgenie \| openwebui \| chatgpt` |
| `waitForResult(timeout?)` | Waits for `[Ontosphere` result in chat stream |
| `clearChat()` | Clears mock chat |
| `pauseMs(ms)` | Pacing pause |
| `caption(text)` | Bottom-center overlay — stays until replaced or cleared |
| `clearCaption()` | Remove overlay |
| `captionPause(text, ms)` | Show caption → pause → clear |

## Planned videos

- `advert-intro` — done (relay demo, mock chat + app side by side)
- `foaf-social-network` — done (seed-driven, FOAF + employment + OWL-RL reasoning)
- `reasoning-demo` — done (seed-driven, OWL-RL class/property hierarchy)
- `scene-ontology` — done (seed-driven, film ontology on BFO/RO)
- `basic-demo` — next: walkthrough of core UI, manual node authoring, layout, export
