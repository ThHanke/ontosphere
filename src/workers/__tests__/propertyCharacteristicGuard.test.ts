// A differential cross-check against HermiT (pykonclude, 2026-08) found native Konclude
// v0.7.0-1138 reporting graphs as consistent that have no model, for IrreflexiveObjectProperty
// and AsymmetricObjectProperty with a self-assertion.
//
// Re-measured against the WebAssembly build Ontosphere ships (rdf-reasoner-konclude 0.6.9):
//   IrreflexiveProperty(:T) + :x :T :x   -> correctly reported inconsistent
//   AsymmetricProperty(:T)  + :x :T :x   -> reported CONSISTENT, although no model exists
//
// Asymmetry entails irreflexivity (the asymmetry condition at x = y), so the second graph is
// unsatisfiable. The guard closes that hole before the reasoner is consulted.

import { describe, it, expect } from 'vitest';
import * as N3 from 'n3';
import { findCharacteristicViolations } from '../propertyCharacteristicGuard.ts';

const nn = N3.DataFactory.namedNode;
const lit = N3.DataFactory.literal;
const q = N3.DataFactory.quad;
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const OWL = 'http://www.w3.org/2002/07/owl#';
const EX = 'http://example.org/#';

const decl = (p: string, characteristic: string) => q(nn(p), nn(RDF_TYPE), nn(`${OWL}${characteristic}`));

describe('findCharacteristicViolations', () => {
  it('catches the asymmetric self-loop the reasoner misses', () => {
    const v = findCharacteristicViolations([
      decl(`${EX}T`, 'AsymmetricProperty'),
      q(nn(`${EX}x`), nn(`${EX}T`), nn(`${EX}x`)),
    ]);
    expect(v).toHaveLength(1);
    expect(v[0].characteristic).toBe('AsymmetricProperty');
    expect(v[0].subject).toBe(`${EX}x`);
    expect(v[0].message).toMatch(/asymmetric/i);
  });

  it('catches the irreflexive self-loop', () => {
    const v = findCharacteristicViolations([
      decl(`${EX}P`, 'IrreflexiveProperty'),
      q(nn(`${EX}part`), nn(`${EX}P`), nn(`${EX}part`)),
    ]);
    expect(v).toHaveLength(1);
    expect(v[0].characteristic).toBe('IrreflexiveProperty');
  });

  it('catches an asymmetric two-cycle', () => {
    const v = findCharacteristicViolations([
      decl(`${EX}parentOf`, 'AsymmetricProperty'),
      q(nn(`${EX}alice`), nn(`${EX}parentOf`), nn(`${EX}bob`)),
      q(nn(`${EX}bob`), nn(`${EX}parentOf`), nn(`${EX}alice`)),
    ]);
    expect(v.length).toBeGreaterThanOrEqual(1);
    expect(v.every((x) => x.characteristic === 'AsymmetricProperty')).toBe(true);
  });

  it('accepts graphs that satisfy the characteristics', () => {
    expect(findCharacteristicViolations([
      decl(`${EX}T`, 'AsymmetricProperty'),
      decl(`${EX}P`, 'IrreflexiveProperty'),
      q(nn(`${EX}a`), nn(`${EX}T`), nn(`${EX}b`)),   // one direction only
      q(nn(`${EX}a`), nn(`${EX}P`), nn(`${EX}b`)),   // not a self-loop
    ])).toEqual([]);
  });

  it('ignores properties without the declaration', () => {
    expect(findCharacteristicViolations([
      q(nn(`${EX}x`), nn(`${EX}undeclared`), nn(`${EX}x`)),
    ])).toEqual([]);
  });

  it('ignores literal objects, which cannot be the same node as the subject', () => {
    expect(findCharacteristicViolations([
      decl(`${EX}T`, 'AsymmetricProperty'),
      q(nn(`${EX}x`), nn(`${EX}T`), lit(`${EX}x`)),
    ])).toEqual([]);
  });

  it('does not report the same violation twice', () => {
    const v = findCharacteristicViolations([
      decl(`${EX}T`, 'AsymmetricProperty'),
      q(nn(`${EX}x`), nn(`${EX}T`), nn(`${EX}x`)),
      q(nn(`${EX}x`), nn(`${EX}T`), nn(`${EX}x`)),
    ]);
    expect(v).toHaveLength(1);
  });

  it('returns nothing when no characteristic is declared at all', () => {
    expect(findCharacteristicViolations([q(nn(`${EX}a`), nn(`${EX}p`), nn(`${EX}a`))])).toEqual([]);
  });
});
