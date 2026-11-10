import { describe, it, expect } from 'vitest';
import { abbreviateIri } from '../iriAbbreviation';

const NS = { inc: 'http://example.com/reasoning-demo-inconsistent#', ex: 'http://example.com/', exdeep: 'http://example.com/deep/' };

describe('abbreviateIri: a prefixed name or the full IRI, never a bare local name', () => {
  it('uses a registered prefix', () => {
    expect(abbreviateIri('http://example.com/reasoning-demo-inconsistent#frank', NS)).toBe('inc:frank');
  });

  it('uses the built-in W3C prefixes without a registry', () => {
    expect(abbreviateIri('http://www.w3.org/1999/02/22-rdf-syntax-ns#type')).toBe('rdf:type');
    expect(abbreviateIri('http://www.w3.org/ns/shacl#MinCountConstraintComponent')).toBe('sh:MinCountConstraintComponent');
  });

  it('keeps the full IRI when no namespace matches', () => {
    expect(abbreviateIri('http://unknown.org/vocab#Thing', NS)).toBe('http://unknown.org/vocab#Thing');
  });

  it('prefers the longest matching namespace', () => {
    expect(abbreviateIri('http://example.com/deep/Widget', NS)).toBe('exdeep:Widget');
  });

  it('does not abbreviate the namespace IRI itself or use an empty prefix', () => {
    expect(abbreviateIri('http://example.com/', NS)).toBe('http://example.com/');
    expect(abbreviateIri('http://default.org/x', { '': 'http://default.org/' })).toBe('http://default.org/x');
  });

  it('names a skolemised blank node as a blank-node label', () => {
    expect(abbreviateIri('urn:vg:bnode:b12')).toBe('_:b12');
  });

  it('two IRIs that share a local name stay distinguishable', () => {
    const a = abbreviateIri('http://a.org/ns#Employee', { a: 'http://a.org/ns#' });
    const b = abbreviateIri('http://b.org/ns#Employee', { b: 'http://b.org/ns#' });
    expect(a).not.toBe(b);
  });
});
