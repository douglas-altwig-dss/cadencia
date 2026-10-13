import { Badge, Box, Group as MGroup, Text as MText } from '@mantine/core';
import Konva from 'konva';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Layer, Line, Rect, Stage, Transformer } from 'react-konva';

import type { DeckScene } from '../../api/types';
import type { EffectiveShape } from '../../lib/deckEdits';
import { EMU_PER_INCH, emuToCm, emuToPx, pxToEmu } from '../../lib/emu';
import type { DisplayShape } from '../../lib/variableDisplay';
import { ShapeNode, hex } from './ShapeNode';
import { useT } from '../../i18n';

/** How close, in screen pixels, an edge has to be before it snaps. */
const SNAP_PX = 6;
export const RULER = 18;
const MIN_EMU = 9144; // a hundredth of an inch: smaller than this is a mis-drag, not a shape

export interface Frame {
  x: number;
  y: number;
  cx: number;
  cy: number;
  rotation: number;
}

interface Props {
  scene: DeckScene;
  shapes: EffectiveShape[];
  width: number;
  /** "edit" gives handles and drag; "preview" only draws and reports clicks. */
  mode?: 'edit' | 'preview';
  /** A thumbnail: no rulers, no shadow, nothing listening. */
  chromeless?: boolean;
  selected?: string[];
  zoom?: number;
  showGrid?: boolean;
  showRulers?: boolean;
  snap?: boolean;
  lockAspect?: boolean;
  /** This slide's own background (RF-102), over the deck theme's default — Slides' "Background".
   * A bare 6-digit hex, the same shape `scene.theme.background` is in: this module's own `hex`
   * (from `ShapeNode`) adds the `#`, and rejects one already there. */
  background?: string | null;

  /** The shape whose text is being typed on the canvas: its text is drawn by the overlay instead. */
  editingKey?: string | null;
  /** The rendered slide, used to crop charts and SmartArt the vector model cannot draw. */
  rasterUrl?: string;
  /** Marks a shape with the numbers of the bindings that fill it (mapping view). */
  badges?: Map<string, number[]>;
  onSelect?: (keys: string[]) => void;
  onChange?: (key: string, frame: Frame) => void;
  /** A whole selection moved at once, so dragging three boxes is one undo step. */
  onChangeMany?: (frames: Record<string, Frame>) => void;
  onEditText?: (key: string) => void;
  /** What was right-clicked, so the caller can select it before its menu opens. */
  onContextMenu?: (key: string | null) => void;
}

/**
 * RF-47/RF-48: the slide, drawn from the file's own EMU geometry at a known scale.
 *
 * One component serves the editor, the mapping preview and the thumbnails, which is what stops the
 * three surfaces from disagreeing about what the slide looks like. Position, size and rotation on
 * screen are the numbers in the .pptx multiplied by one scale factor; dragging and the handles
 * write EMU straight back.
 */
export function SlideStage({
  scene,
  shapes,
  width,
  mode = 'edit',
  chromeless = false,
  selected = [],
  zoom = 1,
  showGrid = false,
  showRulers = false,
  snap = true,
  lockAspect = false,
  background: slideBackground,
  editingKey = null,
  rasterUrl,
  badges,
  onSelect,
  onChange,
  onChangeMany,
  onEditText,
  onContextMenu,
}: Props) {
  const t = useT();
  const scale = (width * zoom) / scene.slide_width;
  /**
   * RF-61: where this scene's embedded pictures live. The scene says which file it was read from,
   * so the canvas no longer has to be handed a run id — forgetting it used to silently drop every
   * picture in the deck, which is a footgun a prop cannot fix and a derived value removes.
   */
  const imageBase =
    scene.image_base ??
    (scene.run_id ? `/api/reports/runs/${scene.run_id}/images` : `/api/reports/templates/${scene.template_id}/images`);
  const stageWidth = scene.slide_width * scale;
  const stageHeight = scene.slide_height * scale;
  const editable = mode === 'edit' && !chromeless;
  const rulers = showRulers && !chromeless;
  const transformer = useRef<Konva.Transformer>(null);
  const nodes = useRef(new Map<string, Konva.Group>());
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  /** Where each co-selected shape started, so a group drag moves them all by the same delta. */
  const convoy = useRef<{ lead: string; from: { x: number; y: number }; others: EffectiveShape[] } | null>(null);
  /** Set the moment a drag actually moves, so a plain click can be told from the end of a drag. */
  const dragged = useRef(false);

  useEffect(() => {
    if (!editable) return;
    const chosen = selected.map((key) => nodes.current.get(key)).filter(Boolean) as Konva.Group[];
    transformer.current?.nodes(chosen);
    transformer.current?.getLayer()?.batchDraw();
  }, [selected, shapes, editable]);

  /** Candidate snap lines: the slide's own edges and centre, plus every other shape's box. */
  const targets = useMemo(() => {
    const xs = [0, scene.slide_width / 2, scene.slide_width];
    const ys = [0, scene.slide_height / 2, scene.slide_height];
    for (const shape of shapes) {
      if (selected.includes(shape.key) || shape.container) continue;
      xs.push(shape.frame.x, shape.frame.x + shape.frame.cx / 2, shape.frame.x + shape.frame.cx);
      ys.push(shape.frame.y, shape.frame.y + shape.frame.cy / 2, shape.frame.y + shape.frame.cy);
    }
    return { xs, ys };
  }, [shapes, selected, scene.slide_width, scene.slide_height]);

  const snapEmu = useCallback(
    (value: number, size: number, axis: 'x' | 'y') => {
      if (!snap) return { value, guide: null as number | null };
      const tolerance = SNAP_PX / scale;
      const candidates = axis === 'x' ? targets.xs : targets.ys;
      for (const edge of [value, value + size / 2, value + size]) {
        for (const target of candidates) {
          if (Math.abs(edge - target) <= tolerance) {
            return { value: Math.round(value + (target - edge)), guide: target };
          }
        }
      }
      return { value, guide: null };
    },
    [snap, scale, targets],
  );

  const startDrag = (key: string) => () => {
    dragged.current = false;
    const lead = shapes.find((s) => s.key === key);
    if (!lead) return;
    const others = selected.includes(key)
      ? shapes.filter((s) => s.key !== key && selected.includes(s.key) && !s.locked)
      : [];
    convoy.current = { lead: key, from: { x: lead.frame.x, y: lead.frame.y }, others };
  };

  const handleDragMove = (event: Konva.KonvaEventObject<DragEvent>) => {
    const node = event.target as Konva.Group;
    const shape = shapes.find((s) => s.key === node.name());
    if (!shape) return;
    dragged.current = true;
    const x = snapEmu(pxToEmu(node.x(), scale), shape.frame.cx, 'x');
    const y = snapEmu(pxToEmu(node.y(), scale), shape.frame.cy, 'y');
    node.x(emuToPx(x.value, scale));
    node.y(emuToPx(y.value, scale));
    setGuides({ x: x.guide != null ? [x.guide] : [], y: y.guide != null ? [y.guide] : [] });
    // Everything else in the selection follows, drawn live so the group looks like one object.
    const travelling = convoy.current;
    if (travelling?.lead === shape.key) {
      const dx = x.value - travelling.from.x;
      const dy = y.value - travelling.from.y;
      for (const other of travelling.others) {
        const peer = nodes.current.get(other.key);
        peer?.x(emuToPx(other.frame.x + dx, scale));
        peer?.y(emuToPx(other.frame.y + dy, scale));
      }
    }
  };

  const commitDrag = (key: string) => (event: Konva.KonvaEventObject<DragEvent>) => {
    const node = event.target as Konva.Group;
    const shape = shapes.find((s) => s.key === key);
    if (!shape) return;
    setGuides({ x: [], y: [] });
    const frame = {
      x: pxToEmu(node.x(), scale),
      y: pxToEmu(node.y(), scale),
      cx: shape.frame.cx,
      cy: shape.frame.cy,
      rotation: shape.frame.rotation,
    };
    const travelling = convoy.current;
    convoy.current = null;
    if (travelling?.lead === key && travelling.others.length && onChangeMany) {
      const dx = frame.x - travelling.from.x;
      const dy = frame.y - travelling.from.y;
      const all: Record<string, Frame> = { [key]: frame };
      for (const other of travelling.others) {
        all[other.key] = { ...other.frame, x: other.frame.x + dx, y: other.frame.y + dy };
      }
      onChangeMany(all);
      return;
    }
    onChange?.(key, frame);
  };

  /** Konva scales the node; we fold that scale back into the size so the file keeps integers. */
  const commitTransform = (key: string) => (event: Konva.KonvaEventObject<Event>) => {
    const node = event.target as Konva.Group;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scaleX(1);
    node.scaleY(1);
    const shape = shapes.find((s) => s.key === key);
    if (!shape) return;
    onChange?.(key, {
      x: pxToEmu(node.x(), scale),
      y: pxToEmu(node.y(), scale),
      cx: Math.max(Math.round(shape.frame.cx * scaleX), MIN_EMU),
      cy: Math.max(Math.round(shape.frame.cy * scaleY), MIN_EMU),
      rotation: Math.round(node.rotation() * 100) / 100,
    });
  };

  /** Rubber band over empty canvas: everything it touches ends up selected. */
  const beginMarquee = (event: Konva.KonvaEventObject<MouseEvent>) => {
    // Left button only: a right-click is the context menu's, and must not clear the selection.
    if (!editable || event.evt.button !== 0 || event.target !== event.target.getStage()) return;
    const at = event.target.getStage()?.getPointerPosition();
    if (!at) return;
    setMarquee({ x0: at.x, y0: at.y, x1: at.x, y1: at.y });
  };

  const dragMarquee = (event: Konva.KonvaEventObject<MouseEvent>) => {
    if (!marquee) return;
    const at = event.target.getStage()?.getPointerPosition();
    if (at) setMarquee({ ...marquee, x1: at.x, y1: at.y });
  };

  const endMarquee = () => {
    if (!marquee) return;
    const left = pxToEmu(Math.min(marquee.x0, marquee.x1), scale);
    const right = pxToEmu(Math.max(marquee.x0, marquee.x1), scale);
    const top = pxToEmu(Math.min(marquee.y0, marquee.y1), scale);
    const bottom = pxToEmu(Math.max(marquee.y0, marquee.y1), scale);
    setMarquee(null);
    // A click, not a drag: treat it as clearing the selection.
    if (right - left < MIN_EMU && bottom - top < MIN_EMU) {
      onSelect?.([]);
      return;
    }
    const caught = shapes
      .filter(
        (shape) =>
          !shape.container &&
          shape.frame.x < right &&
          shape.frame.x + shape.frame.cx > left &&
          shape.frame.y < bottom &&
          shape.frame.y + shape.frame.cy > top,
      )
      .map((shape) => shape.key);
    onSelect?.(caught);
  };

  const gridStep = EMU_PER_INCH / 4; // quarter inch, PowerPoint's own default grid
  const gridLines: React.ReactNode[] = [];
  if (showGrid && !chromeless) {
    for (let x = gridStep; x < scene.slide_width; x += gridStep) {
      gridLines.push(
        <Line
          key={`gx${x}`}
          points={[emuToPx(x, scale), 0, emuToPx(x, scale), stageHeight]}
          stroke="rgba(120,140,160,.28)"
          strokeWidth={1}
          listening={false}
        />,
      );
    }
    for (let y = gridStep; y < scene.slide_height; y += gridStep) {
      gridLines.push(
        <Line
          key={`gy${y}`}
          points={[0, emuToPx(y, scale), stageWidth, emuToPx(y, scale)]}
          stroke="rgba(120,140,160,.28)"
          strokeWidth={1}
          listening={false}
        />,
      );
    }
  }

  const background = hex(slideBackground ?? scene.theme.background) ?? '#ffffff';

  return (
    <Box style={{ display: 'flex', flexDirection: 'column', width: stageWidth + (rulers ? RULER : 0) }}>
      {rulers && <Ruler length={stageWidth} scale={scale} axis="x" offset={RULER} />}
      <Box style={{ display: 'flex', position: 'relative' }}>
        {rulers && <Ruler length={stageHeight} scale={scale} axis="y" offset={0} />}
        <Stage
          width={stageWidth}
          height={stageHeight}
          listening={!chromeless}
          style={{ background, boxShadow: chromeless ? undefined : '0 1px 6px rgba(0,0,0,.18)' }}
          onMouseDown={beginMarquee}
          onMouseMove={dragMarquee}
          onMouseUp={endMarquee}
          onContextMenu={(event) => {
            // Never preventDefault here: Mantine's context menu suppresses the native one itself,
            // and swallowing the event would leave nothing for it to open on.
            const key = event.target === event.target.getStage() ? null : (event.target.getParent()?.name() ?? null);
            onContextMenu?.(key || null);
          }}
        >
          <Layer listening={false}>
            <Rect width={stageWidth} height={stageHeight} fill={background} />
            {gridLines}
          </Layer>
          <Layer>
            {/* RF-89: a hidden shape is still in the file (and in the thumbnails), just not in the way here. */}
            {shapes.filter((shape) => !(editable && shape.hidden)).map((shape) => (
              <ShapeNode
                key={shape.key}
                shape={shape}
                scale={scale}
                slideWidth={scene.slide_width}
                slideHeight={scene.slide_height}
                rasterUrl={rasterUrl}
                hideText={shape.key === editingKey}
                flag={(shape as DisplayShape).flag ?? null}
                imageUrl={
                  shape.image?.asset_id
                    ? `/api/reports/assets/${shape.image.asset_id}`
                    : shape.kind === 'image' && imageBase
                      ? `${imageBase}/${encodeURIComponent(shape.key)}`
                      : undefined
                }
                interactive={!chromeless && !shape.container}
                draggable={editable && !shape.container && !shape.locked}
                nodeRef={(node) => {
                  if (node) nodes.current.set(shape.key, node);
                  else nodes.current.delete(shape.key);
                }}
                // Pressing keeps an existing multi-selection, so the whole group can be dragged…
                onSelect={(event) => {
                  const native = event.evt as MouseEvent;
                  const additive = Boolean(native.shiftKey || native.metaKey || native.ctrlKey);
                  if (additive) {
                    onSelect?.(
                      selected.includes(shape.key)
                        ? selected.filter((key) => key !== shape.key)
                        : [...selected, shape.key],
                    );
                  } else if (!selected.includes(shape.key)) {
                    onSelect?.([shape.key]);
                  }
                }}
                // …and releasing without having dragged narrows it down to the one clicked.
                onClick={(event) => {
                  const native = event.evt as MouseEvent;
                  if (dragged.current || native.shiftKey || native.metaKey || native.ctrlKey) return;
                  if (selected.length > 1 && selected.includes(shape.key)) onSelect?.([shape.key]);
                }}
                onEditText={() => onEditText?.(shape.key)}
                onDragStart={startDrag(shape.key)}
                onDragMove={handleDragMove}
                onDragEnd={commitDrag(shape.key)}
                onTransformEnd={commitTransform(shape.key)}
              />
            ))}
            {editable && (
              <Transformer
                ref={transformer}
                // RF-89: a locked shape shows its selection box but offers no handles to pull.
                rotateEnabled={!shapes.some((s) => selected.includes(s.key) && s.locked)}
                resizeEnabled={!shapes.some((s) => selected.includes(s.key) && s.locked)}
                keepRatio={lockAspect || shapes.some((s) => selected.includes(s.key) && s.kind === 'image')}
                rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
                anchorSize={8}
                borderStroke="#2f6f8f"
                anchorStroke="#2f6f8f"
                boundBoxFunc={(previous, next) => (next.width < 6 || next.height < 6 ? previous : next)}
              />
            )}
            {marquee && (
              <Rect
                x={Math.min(marquee.x0, marquee.x1)}
                y={Math.min(marquee.y0, marquee.y1)}
                width={Math.abs(marquee.x1 - marquee.x0)}
                height={Math.abs(marquee.y1 - marquee.y0)}
                fill="rgba(47,111,143,.12)"
                stroke="#2f6f8f"
                strokeWidth={1}
                listening={false}
              />
            )}
            {/* Preview mode outlines what a binding fills, instead of showing handles. */}
            {!editable &&
              badges &&
              shapes
                .filter((shape) => badges.has(shape.key))
                .map((shape) => (
                  <Rect
                    key={`b-${shape.key}`}
                    x={emuToPx(shape.frame.x, scale)}
                    y={emuToPx(shape.frame.y, scale)}
                    width={emuToPx(shape.frame.cx, scale)}
                    height={emuToPx(shape.frame.cy, scale)}
                    stroke="#2f6f8f"
                    strokeWidth={1.5}
                    dash={[5, 3]}
                    listening={false}
                  />
                ))}
            {guides.x.map((value) => (
              <Line
                key={`sx${value}`}
                points={[emuToPx(value, scale), 0, emuToPx(value, scale), stageHeight]}
                stroke="#e8590c"
                strokeWidth={1}
                dash={[4, 4]}
                listening={false}
              />
            ))}
            {guides.y.map((value) => (
              <Line
                key={`sy${value}`}
                points={[0, emuToPx(value, scale), stageWidth, emuToPx(value, scale)]}
                stroke="#e8590c"
                strokeWidth={1}
                dash={[4, 4]}
                listening={false}
              />
            ))}
          </Layer>
        </Stage>
        {/* Binding numbers ride above the canvas in DOM, so they stay crisp at any zoom. */}
        {badges &&
          shapes
            .filter((shape) => badges.has(shape.key))
            .map((shape) => (
              <MGroup
                key={`n-${shape.key}`}
                gap={2}
                style={{
                  position: 'absolute',
                  left: (rulers ? RULER : 0) + emuToPx(shape.frame.x, scale) + 2,
                  top: emuToPx(shape.frame.y, scale) + 2,
                  pointerEvents: 'none',
                }}
              >
                {(badges.get(shape.key) ?? []).slice(0, 3).map((index) => (
                  <Badge key={index} size="xs" circle={index < 9} variant="filled">
                    {index + 1}
                  </Badge>
                ))}
              </MGroup>
            ))}
      </Box>
      {!chromeless && (
        <MText className="sr-only">
          {t.editor.stage.summary(
            shapes.length,
            emuToCm(scene.slide_width).toFixed(1),
            emuToCm(scene.slide_height).toFixed(1),
          )}
        </MText>
      )}
    </Box>
  );
}

/** Centimetre ruler: the unit the properties panel also speaks. */
function Ruler({ length, scale, axis, offset }: { length: number; scale: number; axis: 'x' | 'y'; offset: number }) {
  const step = EMU_PER_INCH / 2.54; // 1 cm
  const marks: React.ReactNode[] = [];
  for (let cm = 0; cm * step * scale < length; cm += 1) {
    const at = cm * step * scale;
    marks.push(
      <Box
        key={cm}
        style={{
          position: 'absolute',
          [axis === 'x' ? 'left' : 'top']: at,
          [axis === 'x' ? 'top' : 'left']: 0,
          [axis === 'x' ? 'height' : 'width']: cm % 5 === 0 ? '100%' : '55%',
          [axis === 'x' ? 'width' : 'height']: 1,
          background: 'var(--mantine-color-dimmed)',
          opacity: cm % 5 === 0 ? 0.7 : 0.4,
        }}
      />,
    );
  }
  return (
    <Box
      aria-hidden
      style={{
        position: 'relative',
        marginLeft: axis === 'x' ? offset : 0,
        width: axis === 'x' ? length : RULER,
        height: axis === 'x' ? RULER : length,
        borderBottom: axis === 'x' ? '1px solid var(--mantine-color-default-border)' : undefined,
        borderRight: axis === 'y' ? '1px solid var(--mantine-color-default-border)' : undefined,
        background: 'var(--mantine-color-body)',
        flex: '0 0 auto',
      }}
    >
      {marks}
    </Box>
  );
}
