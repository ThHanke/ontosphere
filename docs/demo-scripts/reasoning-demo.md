# Screenplay: OWL-RL Reasoning Demo

Open the Ontosphere app full-screen.

Pause two seconds — caption "Ontosphere — AI builds an OWL ontology from scratch".

The AI runs a multi-turn workflow driven from `docs/mcp-demo/seeds/reasoning-demo.md`:

**Turn 1 — Class hierarchy:** AI starts in TBox view and creates Person → Employee → Manager → Executive
as owl:Class nodes with subClassOf links. Run layout.

**Turn 2 — Properties:** AI adds seven property nodes (worksFor, manages, reportsTo, salary, hired,
collaboratesWith, sameTeamAs) with domain/range axioms. Some are transitive or symmetric.
Snapshot "TBox — class and property hierarchy".

**Turn 3 — ABox individuals:** AI switches to ABox and creates five individuals: Alice (Executive),
Bob (Manager), Carol/Dave (Employees), Eve (no explicit type — will be inferred).
Snapshot "ABox before reasoning".

**Turn 4 — Relationships:** AI asserts manages/reportsTo/collaboratesWith edges between individuals.
Eve gets no rdf:type — only relationships.

**Turn 5 — Reasoning:** AI calls runReasoning. OWL-RL fires domain/range rules and subclass
entailments. Eve is inferred as Employee, then Person. Transitivity propagates salary data.
Snapshot "After reasoning — inferred types in amber".

**Turn 6 — Focus Eve:** Expand Eve's annotation card to show inferred types.

End with caption "OWL-RL reasoning inferred types and relationships automatically". Pause 3.5 seconds.

---

## How to re-record this video

```sh
npm run dev          # terminal 1 — keep running
npm run demo:video   # terminal 2
```

Output: `docs/demo-videos/reasoning-demo.webm` and `.mp4`.
Spec: `e2e/demo-reasoning-demo.spec.ts` — parses `docs/mcp-demo/seeds/reasoning-demo.md` at runtime.
