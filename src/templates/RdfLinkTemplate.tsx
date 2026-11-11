import React from 'react';
import * as Reactodia from '@reactodia/workspace';
import { VG_GRAPH_NAME_PROP, VG_GRAPH_NAME_STATE } from '../providers/N3DataProvider';
import { toPrefixed } from '../utils/termUtils';

function isInferred(link: Reactodia.Link): boolean {
  if (!(link instanceof Reactodia.RelationLink)) return false;
  // linkState persists across importLayout (serialized in diagram snapshot).
  if (link.linkState?.get(VG_GRAPH_NAME_STATE) === 'urn:vg:inferred') return true;
  // data.properties fallback for the initial render right after reasoning.
  const graphName = link.data?.properties[VG_GRAPH_NAME_PROP]?.[0];
  return graphName?.termType === 'NamedNode' && graphName.value === 'urn:vg:inferred';
}

// Above this many links on the canvas, links that are not selected render as a bare path: no label
// (an HTML label layer node, measured and positioned per link), no per-link type subscription.
// Selecting a link shows the full template. See docs/solutions/performance-issues/.
const LEAN_LINKS_THRESHOLD = 300;

interface RdfLinkBodyProps extends Reactodia.LinkTemplateProps {
  inferred: boolean;
}

// This file's public exports are the RdfLinkTemplate descriptor and its resolver
// function, not a component; the body component is intentionally co-located here.
// eslint-disable-next-line react-refresh/only-export-components
function RdfLinkBody({ inferred, ...rest }: RdfLinkBodyProps) {
  const { model } = Reactodia.useWorkspace();
  if (!rest.onlySelected && model.links.length > LEAN_LINKS_THRESHOLD) {
    return (
      <g className="reactodia-standard-link">
        <Reactodia.LinkPath
          path={rest.path}
          pathProps={{
            fill: 'none',
            className: 'reactodia-standard-link__path',
            ...(inferred ? { strokeDasharray: '6 3', stroke: 'var(--vg-inferred-color)' } : {}),
          }}
          markerSource={rest.markerSource}
          markerTarget={rest.markerTarget}
        />
      </g>
    );
  }
  const typeId = String(rest.link.typeId);
  const prefixed = toPrefixed(typeId);
  const baseTitle = prefixed !== typeId ? `${prefixed} <${typeId}>` : typeId;
  // Inferred links render as SVG labels (no room for an interactive HTML
  // popover), so we surface the "inferred" status via the hover title. The
  // interactive "why was this inferred?" explanation lives on the HTML element
  // template for inferred types and inferred data properties.
  const hoverTitle = inferred
    ? `${baseTitle} — inferred (entailed, not asserted)`
    : baseTitle;

  return (
    <Reactodia.StandardRelation
      {...rest}
      pathProps={inferred ? { strokeDasharray: '6 3', stroke: 'var(--vg-inferred-color)' } : undefined}
      primaryLabelProps={{
        ...(inferred ? { style: { color: 'var(--vg-inferred-color)', fontStyle: 'italic' } } : {}),
        title: hoverTitle,
      }}
      // Hide the synthetic urn:vg:graphName property — it must not render as a visible label
      propertyLabelProps={(iri) => iri === VG_GRAPH_NAME_PROP ? null : undefined}
    />
  );
}

export const RdfLinkTemplate: Reactodia.LinkTemplate = {
  markerTarget: Reactodia.LinkMarkerArrowhead,
  renderLink: (props: Reactodia.LinkTemplateProps) => {
    const inferred = isInferred(props.link);
    return <RdfLinkBody {...props} inferred={inferred} />;
  },
};

export function rdfLinkTemplateResolver(
  _linkType: Reactodia.LinkTypeIri | undefined,
  _link: Reactodia.Link
): Reactodia.LinkTemplate {
  return RdfLinkTemplate;
}
