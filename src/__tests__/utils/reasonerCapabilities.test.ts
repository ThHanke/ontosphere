// @vitest-environment node
//
// Fails loudly when the installed rdf-reasoner-konclude is older than the repair API
// (0.9.0): repair, weaken, assessEdit and explainInconsistencyAxioms must all exist.
import { describe, it, expect } from 'vitest';
import { RdfReasoner } from 'rdf-reasoner-konclude';
import {
  REQUIRED_REPAIR_METHODS,
  missingRepairMethods,
  assertRepairCapabilities,
} from '../../utils/reasonerCapabilities';

describe('installed rdf-reasoner-konclude', () => {
  it.each(REQUIRED_REPAIR_METHODS)('provides RdfReasoner.%s', (method) => {
    expect(typeof (RdfReasoner.prototype as unknown as Record<string, unknown>)[method]).toBe('function');
  });

  it('passes the capability check', () => {
    expect(missingRepairMethods(RdfReasoner.prototype)).toEqual([]);
    expect(() => assertRepairCapabilities(RdfReasoner.prototype)).not.toThrow();
  });
});

describe('missingRepairMethods', () => {
  it('names every missing entry point of an older reasoner', () => {
    const v08 = { classify() {}, explainInconsistency() {}, explainInconsistencyAxioms() {} };
    expect(missingRepairMethods(v08)).toEqual(['repair', 'weaken', 'assessEdit']);
    expect(() => assertRepairCapabilities(v08)).toThrow(/repair, weaken, assessEdit.*0\.9\.0/);
  });

  it('treats null and non-objects as missing everything', () => {
    expect(missingRepairMethods(null)).toHaveLength(REQUIRED_REPAIR_METHODS.length);
    expect(missingRepairMethods(undefined)).toHaveLength(REQUIRED_REPAIR_METHODS.length);
  });
});

describe('REPAIR_ACCEPTS_JUSTIFICATIONS', () => {
  it('matches what the installed rdf-reasoner-konclude declares for RepairOptions', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const { REPAIR_ACCEPTS_JUSTIFICATIONS } = await import('../../utils/reasonerCapabilities');
    const types = readFileSync(resolve(__dirname, '../../../node_modules/rdf-reasoner-konclude/dist/types.d.ts'), 'utf8');
    const block = types.slice(types.indexOf('interface RepairOptions'));
    const declared = /justifications\?\s*:\s*AxiomJustification\[\]/.test(block.slice(0, block.indexOf('export interface Repair ')));
    expect(
      REPAIR_ACCEPTS_JUSTIFICATIONS,
      'flip REPAIR_ACCEPTS_JUSTIFICATIONS in src/utils/reasonerCapabilities.ts together with the reasoner upgrade',
    ).toBe(declared);
  });
});
