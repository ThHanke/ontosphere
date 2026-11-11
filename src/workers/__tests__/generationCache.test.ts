import { describe, it, expect } from 'vitest';
import { GenerationCache } from '../generationCache.ts';

describe('GenerationCache', () => {
  it('returns what was stored for the same generation', () => {
    const c = new GenerationCache<string>();
    expect(c.set('k', 'v', 1, 1)).toBe(true);
    expect(c.get('k', 1)).toBe('v');
  });

  it('drops everything when the generation moves on', () => {
    const c = new GenerationCache<string>();
    c.set('k', 'v', 1, 1);
    expect(c.get('k', 2)).toBeUndefined();
    expect(c.get('k', 1)).toBeUndefined();
  });

  it('refuses a value computed against an older generation', () => {
    const c = new GenerationCache<string>();
    expect(c.set('k', 'stale', 1, 2)).toBe(false);
    expect(c.get('k', 2)).toBeUndefined();
  });

  it('clear() empties the cache', () => {
    const c = new GenerationCache<string>();
    c.set('k', 'v', 1, 1);
    c.clear();
    expect(c.get('k', 1)).toBeUndefined();
  });
});
