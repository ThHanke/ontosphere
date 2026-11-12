import type { ReasoningWarning } from './reasoningTypes';

/**
 * A SHACL finding of severity sh:Info. It is listed in the report on request but is not a warning:
 * no warning count, no canvas badge. Other messages with severity "info" (OWL notes) stay warnings.
 */
export const isShaclInfo = (w: Pick<ReasoningWarning, 'rule' | 'severity'>): boolean =>
  w.severity === 'info' && (w.rule.startsWith('shacl:') || w.rule === 'sh:ValidationResult');
