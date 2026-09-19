// DlReasoner.reason publishes the change to the inferred graph: inferences that no longer hold
// are removed, new ones added, and the delta reports exactly those. A repeat run with the same
// result touches nothing.
import { describe, it, expect } from 'vitest';
import * as N3 from 'n3';
import type { RdfReasoner } from 'rdf-reasoner-konclude';
import { DlReasoner } from '../rdfManager.runtime.ts';

const { namedNode: nn, quad } = N3.DataFactory;
const EX = 'http://example.org/#';
const TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const INFERRED = 'urn:vg:inferred';
const inferred = (s: string, c: string) => quad(nn(`${EX}${s}`), nn(TYPE), nn(`${EX}${c}`), nn(INFERRED));

/** A reasoner whose materialize() writes `result()` into the inferred graph of the store it is given. */
function reasonerWriting(result: () => N3.Quad[]): RdfReasoner {
  return {
    ready: Promise.resolve(),
    materialize: async (store: N3.Store) => { store.addQuads(result()); },
    terminate: () => {},
  } as unknown as RdfReasoner;
}

const storeWith = (...extra: N3.Quad[]) =>
  new N3.Store([quad(nn(`${EX}a`), nn(TYPE), nn(`${EX}A`), nn('urn:vg:data')), ...extra]);

describe('publishing inferences', () => {
  it('a repeat run with the same result removes nothing and reports no change', async () => {
    const store = storeWith(inferred('a', 'B'), inferred('a', 'C'));
    const wrapper = new DlReasoner({ createReasoner: () => reasonerWriting(() => [inferred('a', 'B'), inferred('a', 'C')]) });
    let removals = 0;
    const removeQuad = store.removeQuad.bind(store);
    store.removeQuad = ((...args: Parameters<N3.Store['removeQuad']>) => { removals++; return removeQuad(...args); }) as N3.Store['removeQuad'];

    const { delta } = await wrapper.reason(store);
    expect(removals).toBe(0);
    expect(delta.added).toEqual([]);
    expect(delta.removed).toEqual([]);
    expect(store.getQuads(null, null, null, nn(INFERRED))).toHaveLength(2);
  });

  it('removes the inferences that no longer hold and reports them', async () => {
    const store = storeWith(inferred('a', 'B'), inferred('a', 'C'));
    const wrapper = new DlReasoner({ createReasoner: () => reasonerWriting(() => [inferred('a', 'B'), inferred('a', 'D')]) });

    const { delta } = await wrapper.reason(store);
    const text = (qs: readonly { object: { value: string } }[]) => qs.map((q) => q.object.value);
    expect(text(delta.removed)).toEqual([`${EX}C`]);
    expect(text(delta.added)).toEqual([`${EX}D`]);
    expect(text(store.getQuads(null, null, null, nn(INFERRED))).sort()).toEqual([`${EX}B`, `${EX}D`]);
  });
});
