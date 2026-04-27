# Screenplay: Ontosphere Relay — Advert Intro

Open the demo stage showing the mock chat on the left and the Ontosphere app on the right.

Pause two seconds to let the viewer take in both panels.

Draw attention to the UI mode buttons at the top of the mock chat — FhGenie, OpenWebUI, and ChatGPT.
Pause three seconds here. The message to the viewer: this mock chat simulates exactly what those real
interfaces send to an AI. Once you install the bookmarklet, it works with any of them — swap the mock
chat for the real ChatGPT or OpenWebUI and the relay just works.

Inject the bookmarklet. The relay popup appears, confirming the bridge is live. Pause one second.

Click the "Single addNode" scenario and wait for the result to appear in the chat. Pause two seconds
on the result so the viewer can read it.

Clear the chat.

Now run the full scenario — nodes, links, layout, fit to canvas, and export image — all in one
streaming AI message. Wait for the result. Pause three seconds on the result.

Finally switch focus to the Ontosphere graph tab to show the final knowledge graph that was built
entirely by AI tool calls through the relay.

---

## How to re-record this video

```sh
# Dev server must be running first
npm run dev

# In another terminal:
npm run demo:video
```

Output: `docs/demo-videos/advert-intro.webm` and `.mp4` — both committed, overwritten on each run.

## How to create a new demo video

1. Write a new screenplay in `docs/demo-scripts/<name>.md` (plain English, see this file as example)
2. Ask Claude: *"Record a demo video from this screenplay: `docs/demo-scripts/<name>.md`"*
3. Claude writes `e2e/demo-<name>.spec.ts` using `DemoRunner` primitives from `e2e/demo-runner.ts`
4. Run `npm run demo:video` → produces `docs/demo-videos/<name>.webm` + `.mp4`
5. Commit both the spec and the video files

## Planned videos

- [ ] **advert-intro** ← this file (done)
- [ ] **basic-demo** — next session: walkthrough of core UI, add nodes manually, run layout, export
