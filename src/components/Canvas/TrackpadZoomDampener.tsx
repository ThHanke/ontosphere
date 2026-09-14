import * as React from 'react';
import * as Reactodia from '@reactodia/workspace';

const DAMPENING_FACTOR = 0.003;

export function TrackpadZoomDampener(): React.ReactElement {
  const { canvas } = Reactodia.useCanvas();
  const probeRef = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    const probe = probeRef.current;
    if (!probe) return;

    const paperRoot = probe.closest('.reactodia-paper') as HTMLElement;
    if (!paperRoot) return;

    const handler = (e: WheelEvent) => {
      // Ctrl+wheel with small delta = browser-synthesized pinch gesture
      const ctrlPinch = e.ctrlKey && Math.abs(e.deltaY) < 50;
      // Fractional deltaY = trackpad continuous scroll
      const fractional = !Number.isInteger(e.deltaY);
      // Very small integer delta = trackpad on some platforms
      const tinyDelta = Math.abs(e.deltaY) > 0 && Math.abs(e.deltaY) < 4;

      if (!ctrlPinch && !fractional && !tinyDelta) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      const delta = -e.deltaY * DAMPENING_FACTOR;
      const pivot = canvas.metrics.pageToPaperCoords(e.pageX, e.pageY);
      void canvas.zoomBy(delta, { pivot });
    };

    paperRoot.addEventListener('wheel', handler, { capture: true, passive: false });
    return () => paperRoot.removeEventListener('wheel', handler, { capture: true } as any);
  }, [canvas]);

  return <span ref={probeRef} style={{ display: 'none' }} />;
}
