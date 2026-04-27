# Screenplay: FOAF Social Network with OWL-RL Reasoning

Open the Ontosphere app full-screen.

Pause two seconds — caption "Ontosphere — AI builds a FOAF social & employment graph".

The AI runs a multi-turn workflow driven directly from
`docs/mcp-demo/seeds/foaf-social-network.md`:

**Turn 1 — TBox setup:** Load the FOAF vocabulary. Caption follows the seed's snapshot text.

**Turn 2 — Extend the ontology:** AI adds Employee, Manager, Executive subclasses of foaf:Person,
plus a Department class and manages/reportsTo/collaboratesWith properties. Run ELK layout.
Take a snapshot captioned "TBox — FOAF extended with employment hierarchy".

**Turn 3 — Switch to ABox:** AI adds Alice (Executive), Bob (Manager), Carol/Dave/Eve (Employees),
Frank (no explicit type), Engineering and Research departments.

**Turn 4 — Wire relationships:** AI asserts all manages/reportsTo/foaf:knows/member edges.
Run Dagre LR layout. Snapshot captioned "Full graph before reasoning".

**Turn 5 — Run reasoning:** AI calls runReasoning. The reasoner infers Frank as Employee
(range of manages), Alice as Manager and Employee (subclass chain), symmetric collaboratesWith.
Snapshot "Graph after reasoning — inferred types visible in amber".

**Turn 6 — Focus Frank:** AI calls focusNode + expandNode on Frank to reveal his inferred types
in the annotation card. Snapshot "Frank — inferred Employee, foaf:Person, foaf:Agent".

**Turn 7 — Export:** AI exports the full graph as Turtle.

End with caption "Graph built by AI tool calls — OWL-RL reasoning inferred Frank's types".
Pause 3.5 seconds.

---

## How to re-record this video

```sh
npm run dev          # terminal 1 — keep running
npm run demo:video   # terminal 2
```

Output: `docs/demo-videos/foaf-social-network.webm` and `.mp4` — both committed, overwritten on each run.
The spec `e2e/demo-foaf-social-network.spec.ts` drives the recording by parsing the seed file at runtime.
