import { describe, it, expect } from 'vitest';
import { shaclFocusLine } from '../shaclFocusLine';

describe('shaclFocusLine', () => {
  const focus = { nodeShapes: 270, shapesWithFocus: 16, perShape: {}, afterReasoning: true };
  it('is empty without a validation', () => {
    expect(shaclFocusLine(undefined)).toBeNull();
  });
  it('states the shapes that select nodes', () => {
    expect(shaclFocusLine({ focus })).toBe('16 of 270 shapes select nodes in the record');
  });
  it('compares asserted-only and reasoned validation', () => {
    expect(shaclFocusLine({
      focus,
      focusComparison: { nodeShapes: 270, asserted: 14, reasoned: 16, newlyActive: ['https://w3id.org/pmd/co/S1', 'http://ex.org/x#S2'] },
    })).toBe('14 of 270 shapes select nodes in the record; after reasoning 16; newly active: S1, S2');
  });
});
