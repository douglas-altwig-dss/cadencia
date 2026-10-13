import { Box } from '@mantine/core';
import { useRef } from 'react';

import type { Ink, InkPoint } from '../lib/presentChannel';

export type InkTool = 'none' | 'pen' | 'laser';

const toPath = (stroke: InkPoint[]) => stroke.map((p, i) => `${i ? 'L' : 'M'}${(p.x * 1000).toFixed(1)} ${(p.y * 1000).toFixed(1)}`).join(' ');

/**
 * #29: pen strokes and a laser dot over a slide picture. Points are fractions of the slide, so
 * the presenter's window and the projector draw the same marks whatever their sizes. With no tool
 * the layer lets clicks through; the picture underneath stays what it was.
 */
export function InkLayer({
  ink,
  tool = 'none',
  onInk,
  children,
}: {
  ink?: Ink;
  tool?: InkTool;
  onInk?: (next: Ink) => void;
  children: React.ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const drawing = useRef(false);
  const current = ink ?? { strokes: [], laser: null };

  const at = (event: React.PointerEvent): InkPoint | null => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return null;
    return {
      x: Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1),
      y: Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1),
    };
  };

  return (
    <Box ref={box} pos="relative" style={{ lineHeight: 0 }}>
      {children}
      <svg
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: tool === 'none' || !onInk ? 'none' : 'auto',
          cursor: tool === 'pen' ? 'crosshair' : tool === 'laser' ? 'none' : undefined,
          touchAction: 'none',
        }}
        onPointerDown={(event) => {
          const point = at(event);
          if (!point || !onInk || tool !== 'pen') return;
          drawing.current = true;
          (event.target as Element).setPointerCapture?.(event.pointerId);
          onInk({ ...current, strokes: [...current.strokes, [point]] });
        }}
        onPointerMove={(event) => {
          const point = at(event);
          if (!point || !onInk) return;
          if (tool === 'laser') onInk({ ...current, laser: point });
          else if (tool === 'pen' && drawing.current) {
            const strokes = current.strokes.slice();
            strokes[strokes.length - 1] = [...(strokes[strokes.length - 1] ?? []), point];
            onInk({ ...current, strokes });
          }
        }}
        onPointerUp={() => {
          drawing.current = false;
        }}
        onPointerLeave={() => {
          drawing.current = false;
          if (tool === 'laser' && onInk) onInk({ ...current, laser: null });
        }}
      >
        {current.strokes.map((stroke, i) => (
          <path
            key={i}
            d={toPath(stroke)}
            fill="none"
            stroke="#E03131"
            strokeWidth={4}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      {current.laser && (
        <Box
          aria-hidden
          style={{
            position: 'absolute',
            left: `${current.laser.x * 100}%`,
            top: `${current.laser.y * 100}%`,
            width: 14,
            height: 14,
            marginLeft: -7,
            marginTop: -7,
            borderRadius: '50%',
            background: 'rgba(224, 49, 49, 0.9)',
            boxShadow: '0 0 10px 4px rgba(224, 49, 49, 0.55)',
            pointerEvents: 'none',
          }}
        />
      )}
    </Box>
  );
}
