// src/workers/propertyCharacteristicGuard.ts
//
// WHY THIS EXISTS
// ---------------
// Konclude does not enforce every OWL 2 property characteristic. A differential
// cross-check against HermiT (pykonclude, 2026-08) found native Konclude v0.7.0-1138
// reporting ontologies as CONSISTENT that have no model, for both
// IrreflexiveObjectProperty and AsymmetricObjectProperty with a self-assertion.
//
// The WebAssembly build Ontosphere ships behaves better but not correctly. Measured on
// rdf-reasoner-konclude 0.6.9:
//
//   IrreflexiveProperty(:T) + :x :T :x   -> correctly reported inconsistent
//   AsymmetricProperty(:T)  + :x :T :x   -> reported CONSISTENT   (no model exists)
//
// Asymmetry entails irreflexivity: the asymmetry condition with x = y gives
// not(T(x,x)). So the second graph is unsatisfiable and the reasoner misses it.
//
// A reasoner that answers "consistent" for an inconsistent graph will not catch the
// modelling error the axiom was written to catch, and in this application it is the gate
// that decides whether entailments are materialised and validation may proceed. This guard
// closes the specific hole with a purely syntactic check: sound (every violation it reports
// genuinely has no model) and complete for self-assertions on these two characteristics.
// It is not a general conformance layer and does not claim to be.

export interface CharacteristicViolation {
  /** The offending assertion. */
  subject: string;
  predicate: string;
  object: string;
  /** Which declared characteristic it contradicts. */
  characteristic: "IrreflexiveProperty" | "AsymmetricProperty";
  /** Human-readable reason, used as the diagnostic message. */
  message: string;
}

interface QuadLike {
  subject: { termType: string; value: string };
  predicate: { termType: string; value: string };
  object: { termType: string; value: string };
}

const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const OWL = "http://www.w3.org/2002/07/owl#";

/**
 * Find assertions that contradict a declared irreflexive or asymmetric object property.
 *
 * Detects:
 *   - a self-assertion `x p x` where p is IrreflexiveProperty or AsymmetricProperty;
 *   - a two-cycle `x p y`, `y p x` where p is AsymmetricProperty.
 *
 * Konclude currently catches the two-cycle and the irreflexive self-loop but not the
 * asymmetric self-loop; all three are checked here so a change upstream cannot quietly
 * reopen the gap.
 */
export function findCharacteristicViolations(quads: readonly QuadLike[]): CharacteristicViolation[] {
  const irreflexive = new Set<string>();
  const asymmetric = new Set<string>();
  for (const q of quads) {
    if (q.predicate.value !== RDF_TYPE) continue;
    if (q.object.value === `${OWL}IrreflexiveProperty`) irreflexive.add(q.subject.value);
    else if (q.object.value === `${OWL}AsymmetricProperty`) asymmetric.add(q.subject.value);
  }
  if (irreflexive.size === 0 && asymmetric.size === 0) return [];

  const violations: CharacteristicViolation[] = [];
  const seen = new Set<string>();
  const push = (v: CharacteristicViolation) => {
    const k = `${v.subject}${v.predicate}${v.object}${v.characteristic}`;
    if (seen.has(k)) return;
    seen.add(k);
    violations.push(v);
  };

  // asymmetric two-cycles: index the assertions of each asymmetric property
  const pairs = new Set<string>();
  for (const q of quads) {
    if (!asymmetric.has(q.predicate.value)) continue;
    if (q.object.termType === "Literal") continue;
    pairs.add(`${q.predicate.value}${q.subject.value}${q.object.value}`);
  }

  for (const q of quads) {
    const p = q.predicate.value;
    const isIrr = irreflexive.has(p);
    const isAsym = asymmetric.has(p);
    if (!isIrr && !isAsym) continue;
    if (q.object.termType === "Literal") continue;

    if (q.subject.value === q.object.value) {
      const characteristic = isIrr ? "IrreflexiveProperty" : "AsymmetricProperty";
      push({
        subject: q.subject.value,
        predicate: p,
        object: q.object.value,
        characteristic,
        message:
          characteristic === "IrreflexiveProperty"
            ? `<${q.subject.value}> is related to itself by <${p}>, which is declared irreflexive. The graph has no model.`
            : `<${q.subject.value}> is related to itself by <${p}>, which is declared asymmetric. Asymmetry entails irreflexivity, so the graph has no model.`,
      });
      continue;
    }

    if (isAsym && pairs.has(`${p}${q.object.value}${q.subject.value}`)) {
      push({
        subject: q.subject.value,
        predicate: p,
        object: q.object.value,
        characteristic: "AsymmetricProperty",
        message: `<${q.subject.value}> and <${q.object.value}> are related in both directions by <${p}>, which is declared asymmetric. The graph has no model.`,
      });
    }
  }
  return violations;
}
