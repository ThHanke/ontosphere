import { describe, it, expect } from 'vitest';
import * as N3 from 'n3';
import { serializeQuad, deserializeQuad } from '../rdfSerialization';

const { namedNode: nn, quad, literal } = N3.DataFactory;
const XSD = 'http://www.w3.org/2001/XMLSchema#';

describe('worker quad round trip keeps literal datatypes and languages', () => {
  it('typed literal comes back with a NamedNode datatype', () => {
    const q = quad(nn('urn:s'), nn('urn:p'), literal('1', nn(`${XSD}integer`)), nn('urn:g'));
    const back = deserializeQuad(serializeQuad(q), N3.DataFactory);
    expect((back.object as N3.Literal).datatype.value).toBe(`${XSD}integer`);
    expect(back.object.equals(q.object)).toBe(true);
    // N3 store ids derive from datatype.value: a malformed datatype would become "1"^^undefined
    const store = new N3.Store([back]);
    expect(store.countQuads(nn('urn:s'), nn('urn:p'), literal('1', nn(`${XSD}integer`)), nn('urn:g'))).toBe(1);
  });

  it('language literal and plain string are unchanged', () => {
    const lang = quad(nn('urn:s'), nn('urn:p'), literal('a', 'en'), nn('urn:g'));
    const plain = quad(nn('urn:s'), nn('urn:p'), literal('a'), nn('urn:g'));
    expect(deserializeQuad(serializeQuad(lang), N3.DataFactory).object.equals(lang.object)).toBe(true);
    expect(deserializeQuad(serializeQuad(plain), N3.DataFactory).object.equals(plain.object)).toBe(true);
  });
});
