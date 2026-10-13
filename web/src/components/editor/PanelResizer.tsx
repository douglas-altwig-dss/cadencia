import { useLocalStorage } from '@mantine/hooks';
import { useEffect, useRef, useState } from 'react';

const THICKNESS = 6;
/** One arrow press, in pixels; Shift makes it a bigger step, as in every other resize control. */
const STEP = 16;

/**
 * The splitter between a side panel and the canvas (RF-54).
 *
 * It is a flex item of its own in the gap on the panel's inner edge, not an overlay inside the
 * panel: an absolutely positioned handle would be clipped by the panel's `overflow: hidden` and
 * would sit right on top of the filmstrip's scrollbar, which shares that edge.
 *
 * The drag is reported through `requestAnimationFrame`, at most once a frame: the canvas re-scales
 * its Konva stage on every width change, and letting a stream of pointer events through
 * unthrottled is exactly what makes a resize feel heavy.
 *
 * Pointer capture means the drag survives the pointer leaving the handle — without it, moving
 * faster than React re-renders drops the drag halfway across the screen.
 */
export function PanelResizer({
  side,
  width,
  min,
  max,
  fallback,
  label,
  onResize,
  onCommit,
}: {
  /** Which panel this belongs to: "left" grows rightwards, "right" grows leftwards. */
  side: 'left' | 'right';
  width: number;
  min: number;
  max: number;
  /** Width restored by a double click. */
  fallback: number;
  label: string;
  onResize: (width: number) => void;
  /** Called once when the drag ends, which is when the width is worth writing down. */
  onCommit?: () => void;
}) {
  const origin = useRef<{ x: number; width: number } | null>(null);
  const frame = useRef<number | null>(null);
  const clamp = (value: number) => Math.round(Math.min(max, Math.max(min, value)));

  useEffect(
    () => () => {
      document.body.classList.remove('is-resizing');
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const report = (value: number) => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      onResize(clamp(value));
    });
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        origin.current = { x: event.clientX, width };
        document.body.classList.add('is-resizing');
      }}
      onPointerMove={(event) => {
        if (!origin.current) return;
        const travelled = event.clientX - origin.current.x;
        report(origin.current.width + (side === 'left' ? travelled : -travelled));
      }}
      onPointerUp={(event) => {
        event.currentTarget.releasePointerCapture(event.pointerId);
        origin.current = null;
        document.body.classList.remove('is-resizing');
        onCommit?.();
      }}
      onPointerCancel={() => {
        origin.current = null;
        document.body.classList.remove('is-resizing');
        onCommit?.();
      }}
      onDoubleClick={() => {
        onResize(clamp(fallback));
        onCommit?.();
      }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? STEP * 3 : STEP;
        const grow = side === 'left' ? 'ArrowRight' : 'ArrowLeft';
        const shrink = side === 'left' ? 'ArrowLeft' : 'ArrowRight';
        if (event.key === grow) onResize(clamp(width + step));
        else if (event.key === shrink) onResize(clamp(width - step));
        else if (event.key === 'Home') onResize(clamp(fallback));
        else return;
        event.preventDefault();
        onCommit?.();
      }}
      className="panel-resizer"
      style={{
        position: 'relative',
        flex: '0 0 auto',
        alignSelf: 'stretch',
        width: THICKNESS,
        cursor: 'col-resize',
        touchAction: 'none',
      }}
    />
  );
}

/**
 * A panel width that is remembered, without writing to `localStorage` sixty times a second.
 *
 * During a drag the width lives in ordinary state; the stored value is only updated when the
 * pointer is released. `localStorage` writes are synchronous, and doing one per animation frame is
 * precisely the kind of thing that makes a smooth-looking drag stutter.
 */
export function usePanelWidth(key: string, start: number) {
  const [stored, setStored] = useLocalStorage({ key, defaultValue: start });
  // RF-68: collapsed is remembered next to the width, so reopening the editor finds the panel the
  // way it was left — and the *width* is kept while collapsed, so expanding restores it rather
  // than snapping back to the default.
  const [collapsed, setCollapsed] = useLocalStorage({ key: `${key}-collapsed`, defaultValue: false });
  const [live, setLive] = useState<number | null>(null);
  return {
    width: live ?? stored,
    collapsed,
    toggle: () => setCollapsed((value) => !value),
    onResize: setLive,
    onCommit: () => {
      if (live === null) return;
      setStored(live);
      setLive(null);
    },
  };
}
