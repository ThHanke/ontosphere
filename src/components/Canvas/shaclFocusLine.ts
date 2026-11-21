import type { ShaclFocusInfo } from '../../utils/reasoningTypes';

const localName = (iri: string) => iri.replace(/^.*[#/]/, '') || iri;

/**
 * One line on how many node shapes select focus nodes in the record: of the last validation
 * without inferred triples and of the last one after reasoning, when both ran.
 */
export function shaclFocusLine(info: ShaclFocusInfo | undefined): string | null {
  const focus = info?.focus;
  if (!focus) return null;
  const c = info.focusComparison;
  if (!c) return `${focus.shapesWithFocus} of ${focus.nodeShapes} shapes select nodes in the record`;
  const active = c.newlyActive.length > 0 ? `; newly active: ${c.newlyActive.map(localName).join(', ')}` : '';
  return `${c.asserted} of ${c.nodeShapes} shapes select nodes in the record; after reasoning ${c.reasoned}${active}`;
}
