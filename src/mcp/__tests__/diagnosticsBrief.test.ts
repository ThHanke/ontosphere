// src/mcp/__tests__/diagnosticsBrief.test.ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildRepairBrief, type DiagnosticsData } from '../tools/diagnosticsBrief';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const cleanData: DiagnosticsData = {
  isConsistent: true,
  justifications: [],
  unsatisfiableClasses: [],
  profile: { owl2dl: true, violations: [] },
  shaclViolations: [],
};

// ---------------------------------------------------------------------------
describe('buildRepairBrief', () => {
  it('returns "No issues detected." when everything is clean', () => {
    expect(buildRepairBrief(cleanData)).toBe('No issues detected.');
  });

  it('returns "No issues detected." when isConsistent is null and all else clean', () => {
    const d: DiagnosticsData = { ...cleanData, isConsistent: null };
    expect(buildRepairBrief(d)).toBe('No issues detected.');
  });

  it('includes local names of both axioms for a single inconsistency justification', () => {
    const d: DiagnosticsData = {
      ...cleanData,
      isConsistent: false,
      justifications: [
        [
          {
            subject: 'http://example.org/Cat',
            predicate: 'http://www.w3.org/2002/07/owl#disjointWith',
            object: 'http://example.org/Animal',
          },
          {
            subject: 'http://example.org/Mittens',
            predicate: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
            object: 'http://example.org/Cat',
          },
        ],
      ],
    };
    const result = buildRepairBrief(d);
    expect(result).toContain('Cat');
    expect(result).toContain('disjointWith');
    expect(result).toContain('Mittens');
    expect(result).toContain('type');
    expect(result).toContain('remove or revise');
  });

  it('mentions N independent contradictions when there are multiple justifications', () => {
    const axiom = (s: string, p: string, o: string) => ({ subject: s, predicate: p, object: o });
    const d: DiagnosticsData = {
      ...cleanData,
      isConsistent: false,
      justifications: [
        [axiom('http://ex.org/A', 'http://ex.org/p', 'http://ex.org/B')],
        [axiom('http://ex.org/C', 'http://ex.org/q', 'http://ex.org/D')],
        [axiom('http://ex.org/E', 'http://ex.org/r', 'http://ex.org/F')],
      ],
    };
    const result = buildRepairBrief(d);
    expect(result).toContain('3 independent contradictions');
  });

  it('names the unsatisfiable class (local name)', () => {
    const d: DiagnosticsData = {
      ...cleanData,
      unsatisfiableClasses: ['http://example.org/EmptyConcept'],
    };
    const result = buildRepairBrief(d);
    expect(result).toContain('EmptyConcept');
    expect(result).toContain('never have instances');
  });

  it('includes axiom and reason for an OWL 2 DL profile violation', () => {
    const d: DiagnosticsData = {
      ...cleanData,
      profile: {
        owl2dl: false,
        violations: [
          {
            axiom: 'http://example.org/BadAxiom',
            reason: 'Uses punning not allowed in OWL 2 DL',
          },
        ],
      },
    };
    const result = buildRepairBrief(d);
    expect(result).toContain('BadAxiom');
    expect(result).toContain('Uses punning not allowed in OWL 2 DL');
  });

  it('includes focus node local name and message for a SHACL violation', () => {
    const d: DiagnosticsData = {
      ...cleanData,
      shaclViolations: [
        {
          focusNode: 'http://example.org/Alice',
          path: 'http://www.w3.org/2000/01/rdf-schema#label',
          severity: 'sh:Violation',
          message: 'Missing required label',
          sourceShape: 'http://example.org/PersonShape',
          constraint: 'http://www.w3.org/ns/shacl#MinCountConstraintComponent',
        },
      ],
    };
    const result = buildRepairBrief(d);
    expect(result).toContain('Alice');
    expect(result).toContain('Missing required label');
  });

  it('groups SHACL violations under correct severity section', () => {
    const d: DiagnosticsData = {
      ...cleanData,
      shaclViolations: [
        {
          focusNode: 'http://example.org/Bob',
          path: null,
          severity: 'sh:Warning',
          message: 'Recommended property missing',
          sourceShape: null,
          constraint: null,
        },
      ],
    };
    const result = buildRepairBrief(d);
    expect(result).toContain('sh:Warning');
    expect(result).toContain('Bob');
  });

  it('sections appear in ranked order (inconsistency before unsatisfiable before profile before shacl)', () => {
    const d: DiagnosticsData = {
      isConsistent: false,
      justifications: [
        [{ subject: 'http://ex.org/A', predicate: 'http://ex.org/p', object: 'http://ex.org/B' }],
      ],
      unsatisfiableClasses: ['http://ex.org/Empty'],
      profile: {
        owl2dl: false,
        violations: [{ axiom: 'http://ex.org/Ax', reason: 'reason' }],
      },
      shaclViolations: [
        {
          focusNode: 'http://ex.org/Node',
          path: null,
          severity: 'sh:Violation',
          message: 'msg',
          sourceShape: null,
          constraint: null,
        },
      ],
    };
    const result = buildRepairBrief(d);
    const idxInconsistency = result.indexOf('INCONSISTENCY');
    const idxUnsatisfiable = result.indexOf('UNSATISFIABLE');
    const idxProfile = result.indexOf('OWL 2 DL');
    const idxShacl = result.indexOf('SHACL');
    expect(idxInconsistency).toBeLessThan(idxUnsatisfiable);
    expect(idxUnsatisfiable).toBeLessThan(idxProfile);
    expect(idxProfile).toBeLessThan(idxShacl);
  });

  it('renders axiom-weakening repairs distinctly and notes they preserve more knowledge', () => {
    const RDFS_SUBCLASS = 'http://www.w3.org/2000/01/rdf-schema#subClassOf';
    const d: DiagnosticsData = {
      ...cleanData,
      isConsistent: false,
      justifications: [
        [{ subject: 'http://ex/A', predicate: RDFS_SUBCLASS, object: 'http://ex/B' }],
      ],
    };
    const repairs = [
      {
        id: 'R1',
        issue: 'inconsistency',
        action: { tool: 'removeLink', args: { subjectIri: 'http://ex/A', predicateIri: RDFS_SUBCLASS, objectIri: 'http://ex/B' } },
        rationale: 'Remove A subClassOf B',
        verifiedConsistent: true,
      },
      {
        id: 'W1',
        issue: 'inconsistency',
        kind: 'weaken',
        alternativeTo: 'R1',
        weakerThan: 'A ⊑ B',
        weakeningVerified: true,
        action: { tool: 'removeLink', args: { subjectIri: 'http://ex/A', predicateIri: RDFS_SUBCLASS, objectIri: 'http://ex/B' } },
        rationale: 'Weaken A ⊑ B to A ⊑ C (C ⊒ B).',
      },
    ];
    const result = buildRepairBrief(d, repairs);
    // Weakening rendered with [weaken] tag + alternative-to + verified note.
    expect(result).toContain('W1. [weaken]');
    expect(result).toContain('alternative to deletion R1');
    expect(result).toContain('adding the weaker axiom leaves the ontology consistent');
    // Deletion tagged [delete] when weakenings are present.
    expect(result).toContain('R1. removeLink [delete]');
    // The preserve-more-knowledge note + citation.
    expect(result).toContain('PRESERVE MORE KNOWLEDGE');
    expect(result).toContain('Troquard');
  });

  it('names IRIs as prefixed names from the namespace map, else as full IRIs, never as local names', () => {
    const d: any = {
      isConsistent: false,
      justifications: [[
        { subject: 'http://example.com/demo#frank', predicate: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', object: 'http://example.com/demo#Employee' },
      ]],
      unsatisfiableClasses: [], profile: { owl2dl: true, violations: [] }, shaclViolations: [],
    };
    const prefixed = buildRepairBrief(d, [], { namespaces: { inc: 'http://example.com/demo#' } });
    expect(prefixed).toContain('- inc:frank rdf:type inc:Employee');
    const full = buildRepairBrief(d);
    expect(full).toContain('- http://example.com/demo#frank rdf:type http://example.com/demo#Employee');
    expect(full).not.toMatch(/- frank /);
  });
});
