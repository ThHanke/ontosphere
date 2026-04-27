# Screenplay: Film Scene Ontology on BFO/RO

Open the Ontosphere app full-screen.

Pause two seconds — caption "Ontosphere — AI builds a film scene ontology on BFO + RO".

The AI runs a multi-turn workflow driven from `docs/mcp-demo/seeds/scene-ontology.md`:

**Turn 1 — Load upper ontology:** AI starts in TBox view and loads a minimal BFO 2 + RO subset
inline (BFO:process, BFO:independent_continuant, BFO:site, BFO:role, RO:has_participant, RO:occurs_in,
RO:has_role, BFO:realizes). Snapshot "Upper ontology — BFO 2 + RO subset".

**Turn 2 — Scene type hierarchy:** AI adds Scene (subclass of BFO:process), then ActionScene,
DialogueScene, ChaseScene, ConfrontationScene subclasses. Run ELK layout.

**Turn 3 — Characters and locations:** AI adds Character (subclass of BFO:independent_continuant),
HeroRole / VillainRole / SupportingRole (subclasses of BFO:role). Adds Location
(subclass of BFO:site). Snapshot "TBox — full scene ontology".

**Turn 4 — ABox individuals:** AI switches to ABox and adds concrete scenes from a fictional film:
OpeningScene (ActionScene), LabScene (DialogueScene), ChaseScene instance. Adds characters
and locations. Wires has_participant, occurs_in, has_role, realizes.

**Turn 5 — Reasoning:** AI calls runReasoning. BFO superclass chain fires — scene instances get
inferred as BFO:process → BFO:occurrent → BFO:entity. Character instances propagate up to
BFO:independent_continuant. Snapshot "After reasoning — BFO superclass memberships inferred".

End with caption "Domain ontology for film scene classification — built entirely by AI tool calls".
Pause 3.5 seconds.

---

## How to re-record this video

```sh
npm run dev          # terminal 1 — keep running
npm run demo:video   # terminal 2
```

Output: `docs/demo-videos/scene-ontology.webm` and `.mp4`.
Spec: `e2e/demo-scene-ontology.spec.ts` — parses `docs/mcp-demo/seeds/scene-ontology.md` at runtime.
