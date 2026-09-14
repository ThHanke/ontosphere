import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

const hoisted = vi.hoisted(() => ({
  zoomBy: vi.fn().mockResolvedValue(undefined),
  pageToPaperCoords: vi.fn().mockReturnValue({ x: 100, y: 100 }),
}));

vi.mock('@reactodia/workspace', () => ({
  useCanvas: () => ({
    canvas: {
      zoomBy: hoisted.zoomBy,
      metrics: { pageToPaperCoords: hoisted.pageToPaperCoords },
    },
  }),
}));

import { TrackpadZoomDampener } from '../TrackpadZoomDampener';

function mountInPaper() {
  const container = document.createElement('div');
  container.className = 'reactodia-paper';
  document.body.appendChild(container);

  const result = render(<TrackpadZoomDampener />, { container });
  return { container, result };
}

function fireWheel(target: HTMLElement, init: WheelEventInit & { pageX?: number; pageY?: number }) {
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
  Object.defineProperty(event, 'pageX', { value: init.pageX ?? 0 });
  Object.defineProperty(event, 'pageY', { value: init.pageY ?? 0 });
  target.dispatchEvent(event);
  return event;
}

describe('TrackpadZoomDampener', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  it('intercepts trackpad events with fractional deltaY', () => {
    const { container } = mountInPaper();

    const event = fireWheel(container, { deltaY: 3.5 });

    expect(event.defaultPrevented).toBe(true);
    expect(hoisted.zoomBy).toHaveBeenCalledOnce();
    const delta = hoisted.zoomBy.mock.calls[0][0];
    expect(delta).toBeCloseTo(-3.5 * 0.003, 6);
  });

  it('intercepts ctrl+pinch events (small ctrlKey deltaY)', () => {
    const { container } = mountInPaper();

    fireWheel(container, { deltaY: 5, ctrlKey: true });

    expect(hoisted.zoomBy).toHaveBeenCalledOnce();
  });

  it('passes through normal mouse wheel events (integer deltaY >= 4)', () => {
    const { container } = mountInPaper();

    const event = fireWheel(container, { deltaY: 100 });

    expect(event.defaultPrevented).toBe(false);
    expect(hoisted.zoomBy).not.toHaveBeenCalled();
  });

  it('applies proportional zoom — small trackpad delta = small zoom step', () => {
    const { container } = mountInPaper();

    fireWheel(container, { deltaY: 1.5 });
    const smallDelta = hoisted.zoomBy.mock.calls[0][0];

    vi.clearAllMocks();
    fireWheel(container, { deltaY: 30.5 });
    const largeDelta = hoisted.zoomBy.mock.calls[0][0];

    expect(Math.abs(largeDelta)).toBeGreaterThan(Math.abs(smallDelta) * 10);
  });

  it('uses cursor position as zoom pivot', () => {
    const { container } = mountInPaper();

    fireWheel(container, { deltaY: 2.5, pageX: 400, pageY: 300 });

    expect(hoisted.pageToPaperCoords).toHaveBeenCalledWith(400, 300);
    expect(hoisted.zoomBy.mock.calls[0][1]).toEqual({ pivot: { x: 100, y: 100 } });
  });

  it('intercepts tiny integer deltas (trackpad on some platforms)', () => {
    const { container } = mountInPaper();

    fireWheel(container, { deltaY: 1 });

    expect(hoisted.zoomBy).toHaveBeenCalledOnce();
  });

  it('does not intercept deltaY === 0', () => {
    const { container } = mountInPaper();

    fireWheel(container, { deltaY: 0 });

    expect(hoisted.zoomBy).not.toHaveBeenCalled();
  });
});
