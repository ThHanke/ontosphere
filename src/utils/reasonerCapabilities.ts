// The repair / weakening / assessment features need entry points that only exist in
// rdf-reasoner-konclude >= 0.9.0. A reasoner without them must fail loudly at the call site
// (and in the capability test), not degrade into "no repairs found".

/** Methods of RdfReasoner that Ontosphere's repair features call. */
export const REQUIRED_REPAIR_METHODS = [
  'repair',
  'weaken',
  'assessEdit',
  'explainInconsistencyAxioms',
] as const;

export type RequiredRepairMethod = (typeof REQUIRED_REPAIR_METHODS)[number];

/** The required methods that `reasoner` does not provide (empty when it is capable). */
export function missingRepairMethods(reasoner: unknown): RequiredRepairMethod[] {
  const target = reasoner as Record<string, unknown> | null | undefined;
  return REQUIRED_REPAIR_METHODS.filter((m) => typeof target?.[m] !== 'function');
}

/** Throws with an upgrade hint when the reasoner lacks the repair API. */
export function assertRepairCapabilities(reasoner: unknown): void {
  const missing = missingRepairMethods(reasoner);
  if (missing.length > 0) {
    throw new Error(
      `rdf-reasoner-konclude lacks ${missing.join(', ')}; repair suggestions need version 0.9.0 or newer.`,
    );
  }
}

/**
 * Does the installed `repair()` accept `RepairOptions.justifications` (seed justifications that
 * replace its first explanation round)? The option cannot be detected from the method, and an
 * older library silently ignores it, so the worker passes the seed only when this is true.
 * reasonerCapabilities.test.ts compares it with the installed package's type declarations and
 * fails when they disagree: flip it together with the library upgrade.
 */
export const REPAIR_ACCEPTS_JUSTIFICATIONS = true;
