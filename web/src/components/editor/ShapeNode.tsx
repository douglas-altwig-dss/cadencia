import Konva from 'konva';
import { useEffect, useState } from 'react';
import { Group, Image as KonvaImage, Line as KonvaLine, Path, Rect, Text } from 'react-konva';

import type { SceneFill, SceneLine, SceneShape, SceneText } from '../../api/types';
import type { ContentFlag } from '../../lib/variableDisplay';

/** RF-57: how a shape is marked when it is showing a token, or has nothing to show. */
const FLAG_COLOR: Record<ContentFlag, string> = {
  token: '#2f6f8f',
  unresolved: '#c92a2a',
  empty: '#e8590c',
};
import type { EffectiveShape } from '../../lib/deckEdits';
import { emuToPx } from '../../lib/emu';
import { alignOffset, layoutParagraph } from '../../lib/textLayout';
import { fontStack } from '../../lib/fonts';

const EMU_PER_PT = 12700;

export const hex = (value?: string | null) =>
  value && /^[0-9A-Fa-f]{6}$/.test(value) ? `#${value}` : undefined;

/** Konva's fill props for a resolved scene fill, gradients included. */
function fillProps(fill: SceneFill, width: number, height: number): Konva.ShapeConfig {
  if (fill.type === 'gradient' && fill.stops?.length) {
    const radians = ((fill.angle ?? 90) * Math.PI) / 180;
    const dx = Math.cos(radians);
    const dy = Math.sin(radians);
    return {
      fillLinearGradientStartPoint: { x: width / 2 - (dx * width) / 2, y: height / 2 - (dy * height) / 2 },
      fillLinearGradientEndPoint: { x: width / 2 + (dx * width) / 2, y: height / 2 + (dy * height) / 2 },
      fillLinearGradientColorStops: fill.stops.flatMap((stop) => [stop.at, hex(stop.color) ?? '#ffffff']),
    };
  }
  if (fill.type === 'solid') return { fill: hex(fill.color) };
  return {};
}

function strokeProps(line: SceneLine, scale: number): Konva.ShapeConfig {
  if (line.type !== 'solid' || !line.color) return { strokeWidth: 0 };
  const width = Math.max((line.width_pt ?? 1) * EMU_PER_PT * scale, 0.4);
  const dashes: Record<string, number[]> = {
    dash: [width * 4, width * 3],
    sysDot: [width, width * 2],
    dot: [width, width * 2],
    dashDot: [width * 4, width * 2, width, width * 2],
    lgDash: [width * 8, width * 3],
  };
  return {
    stroke: hex(line.color),
    strokeWidth: width,
    dash: line.dash ? dashes[line.dash] : undefined,
    opacity: line.alpha ?? 1,
  };
}

/**
 * The shape's real outline, scaled out of its 0..1 path. A connector is stroked corner to corner;
 * everything else is a filled path.
 */
function Outline({ shape, width, height, scale }: { shape: SceneShape; width: number; height: number; scale: number }) {
  const stroke = strokeProps(shape.line, scale);
  if (shape.stroke_only) {
    const { h, v } = shape.flip ?? { h: false, v: false };
    const x1 = h ? width : 0;
    const x2 = h ? 0 : width;
    const y1 = v ? height : 0;
    const y2 = v ? 0 : height;
    return <KonvaLine points={[x1, y1, x2, y2]} {...stroke} listening={false} perfectDrawEnabled={false} />;
  }
  const fill = fillProps(shape.fill, width, height);
  const hasPaint = shape.fill.type !== 'none' || stroke.strokeWidth;
  if (!hasPaint) return null;
  const shadow = shape.shadow
    ? {
        shadowColor: hex(shape.shadow.color) ?? '#000000',
        shadowBlur: shape.shadow.blur * scale,
        shadowOffsetX: shape.shadow.dx * scale,
        shadowOffsetY: shape.shadow.dy * scale,
        shadowOpacity: shape.shadow.alpha,
      }
    : {};
  return (
    <Path
      data={shape.path || 'M0,0 L1,0 L1,1 L0,1 Z'}
      scaleX={width}
      scaleY={height}
      {...fill}
      {...stroke}
      {...shadow}
      strokeScaleEnabled={false}
      opacity={shape.fill.alpha ?? 1}
      listening={false}
      perfectDrawEnabled={false}
    />
  );
}

/** Text laid out run by run, so mixed formatting survives and the wrap matches the export. */
function ShapeText({ text, width, height, scale }: { text: SceneText; width: number; height: number; scale: number }) {
  const insets = text.insets_pt;
  const left = insets.l * EMU_PER_PT * scale;
  const right = insets.r * EMU_PER_PT * scale;
  const top = insets.t * EMU_PER_PT * scale;
  const bottom = insets.b * EMU_PER_PT * scale;
  const boxWidth = Math.max(width - left - right, 1);
  const boxHeight = Math.max(height - top - bottom, 1);
  const columns = Math.max(text.columns || 1, 1);
  const columnWidth = boxWidth / columns;
  const emuScale = EMU_PER_PT * scale;

  let counter = 0;
  const blocks = text.paragraphs.map((paragraph) => {
    const bullet =
      paragraph.bullet.kind === 'char'
        ? `${paragraph.bullet.char ?? '•'} `
        : paragraph.bullet.kind === 'number'
          ? `${(counter += 1)}. `
          : '';
    if (paragraph.bullet.kind !== 'number') counter = 0;
    const indent = paragraph.level * (paragraph.style.size_pt ?? 18) * emuScale * 1.2;
    const laid = layoutParagraph(paragraph, Math.max(columnWidth - indent, 1), emuScale, bullet);
    return {
      paragraph,
      laid,
      indent,
      before: (paragraph.space_before_pt ?? 0) * emuScale,
      after: (paragraph.space_after_pt ?? 0) * emuScale,
    };
  });

  const total = blocks.reduce((sum, b) => sum + b.before + b.laid.height + b.after, 0);
  const offset =
    text.anchor === 'middle'
      ? Math.max((boxHeight - total) / 2, 0)
      : text.anchor === 'bottom'
        ? Math.max(boxHeight - total, 0)
        : 0;

  let cursor = top + offset;
  const nodes: React.ReactNode[] = [];
  blocks.forEach((block, bi) => {
    cursor += block.before;
    for (const line of block.laid.lines) {
      const dx = alignOffset(line.width, columnWidth - block.indent, block.paragraph.align);
      for (const [si, segment] of line.segments.entries()) {
        if (!segment.text.trim()) continue;
        const size = (segment.style.size_pt ?? 18) * emuScale;
        nodes.push(
          <Text
            key={`${bi}-${line.y}-${si}`}
            x={left + block.indent + dx + segment.x}
            y={cursor + line.y + (line.height - size * 1.2) / 2}
            text={segment.text}
            fontSize={size}
            fontFamily={fontStack(segment.style.font)}
            fontStyle={`${segment.style.italic ? 'italic ' : ''}${segment.style.bold ? 'bold' : 'normal'}`}
            textDecoration={segment.style.underline ? 'underline' : undefined}
            fill={hex(segment.style.color) ?? '#1a1a1a'}
            listening={false}
            perfectDrawEnabled={false}
          />,
        );
      }
    }
    cursor += block.laid.height + block.after;
  });
  return <>{nodes}</>;
}

function useLoadedImage(url?: string): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!url) {
      setImage(null);
      return;
    }
    const element = new window.Image();
    element.crossOrigin = 'anonymous';
    element.onload = () => setImage(element);
    element.src = url;
    return () => {
      element.onload = null;
    };
  }, [url]);
  return image;
}

function ShapeImage({ url, width, height, crop }: { url: string; width: number; height: number; crop?: Record<string, number> }) {
  const image = useLoadedImage(url);
  if (!image) return <Rect width={width} height={height} fill="#e9ecef" listening={false} />;
  const left = crop?.left ?? 0;
  const top = crop?.top ?? 0;
  const right = crop?.right ?? 0;
  const bottom = crop?.bottom ?? 0;
  const cropped =
    left || top || right || bottom
      ? {
          crop: {
            x: image.width * left,
            y: image.height * top,
            width: image.width * (1 - left - right),
            height: image.height * (1 - top - bottom),
          },
        }
      : {};
  return <KonvaImage image={image} width={width} height={height} {...cropped} listening={false} />;
}

/**
 * Anything the vector model cannot draw honestly — a native chart, SmartArt — is shown as the
 * matching crop of the rendered slide. A faithful picture that happens not to be editable beats a
 * drawing that is wrong.
 */
function RasterCrop({
  url,
  shape,
  slideWidth,
  slideHeight,
  width,
  height,
}: {
  url: string;
  shape: SceneShape;
  slideWidth: number;
  slideHeight: number;
  width: number;
  height: number;
}) {
  const image = useLoadedImage(url);
  if (!image) {
    return (
      <>
        <Rect width={width} height={height} fill="#f1f3f5" stroke="#ced4da" dash={[4, 4]} listening={false} />
        <Text x={4} y={height / 2 - 6} width={width - 8} align="center" text={shape.kind} fontSize={11} fill="#868e96" listening={false} />
      </>
    );
  }
  const px = image.width / slideWidth;
  const py = image.height / slideHeight;
  return (
    <KonvaImage
      image={image}
      width={width}
      height={height}
      crop={{
        x: shape.frame.x * px,
        y: shape.frame.y * py,
        width: Math.max(shape.frame.cx * px, 1),
        height: Math.max(shape.frame.cy * py, 1),
      }}
      listening={false}
    />
  );
}

function TableNode({ shape, scale }: { shape: SceneShape; scale: number }) {
  const table = shape.table!;
  const widths = table.col_widths.map((w) => emuToPx(w, scale));
  const heights = table.row_heights.map((h) => emuToPx(h, scale));
  let y = 0;
  const nodes: React.ReactNode[] = [];
  table.cells.forEach((row, r) => {
    const top = y;
    y += heights[r] ?? 0;
    let x = 0;
    row.forEach((cell, c) => {
      const left = x;
      x += widths[c] ?? 0;
      const style = table.styles?.[r]?.[c] ?? {};
      const size = Math.max((style.size_pt ?? 10) * EMU_PER_PT * scale, 4);
      nodes.push(
        <Group key={`${r}-${c}`} x={left} y={top} listening={false}>
          <Rect
            width={widths[c] ?? 0}
            height={heights[r] ?? 0}
            fill={hex(table.fills?.[r]?.[c]) ?? undefined}
            stroke="rgba(120,120,120,.45)"
            strokeWidth={0.5}
            perfectDrawEnabled={false}
          />
          <Text
            x={3}
            y={3}
            width={Math.max((widths[c] ?? 0) - 6, 1)}
            height={Math.max((heights[r] ?? 0) - 6, 1)}
            text={cell}
            fontSize={size}
            fontFamily={fontStack(style.font)}
            fontStyle={style.bold ? 'bold' : 'normal'}
            fill={hex(style.color) ?? '#1a1a1a'}
            wrap="word"
            ellipsis
          />
        </Group>,
      );
    });
  });
  return <>{nodes}</>;
}

export interface ShapeNodeProps {
  shape: EffectiveShape;
  scale: number;
  slideWidth: number;
  slideHeight: number;
  /** Bitmaps for pictures already inside the deck, and the rendered slide for raster fallbacks. */
  imageUrl?: string;
  rasterUrl?: string;
  interactive?: boolean;
  draggable?: boolean;
  /** True while the text is being typed on the canvas: the overlay draws it instead. */
  hideText?: boolean;
  /** RF-57: draw the "this is a token" / "this has no value" outline over the shape. */
  flag?: ContentFlag | null;
  onSelect?: (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onClick?: (event: Konva.KonvaEventObject<MouseEvent>) => void;
  onEditText?: () => void;
  onDragStart?: (event: Konva.KonvaEventObject<DragEvent>) => void;
  onDragMove?: (event: Konva.KonvaEventObject<DragEvent>) => void;
  onDragEnd?: (event: Konva.KonvaEventObject<DragEvent>) => void;
  onTransformEnd?: (event: Konva.KonvaEventObject<Event>) => void;
  nodeRef?: (node: Konva.Group | null) => void;
}

/** One scene shape, drawn from its own resolved properties at the slide's own geometry. */
export function ShapeNode({
  shape,
  scale,
  slideWidth,
  slideHeight,
  imageUrl,
  rasterUrl,
  interactive = true,
  draggable = false,
  hideText = false,
  flag = null,
  onSelect,
  onClick,
  onEditText,
  onDragStart,
  onDragMove,
  onDragEnd,
  onTransformEnd,
  nodeRef,
}: ShapeNodeProps) {
  const width = emuToPx(shape.frame.cx, scale);
  const height = emuToPx(shape.frame.cy, scale);
  // A group is a container: its children are drawn on their own, at their own absolute geometry.
  const body = shape.container ? null : !shape.renderable && rasterUrl ? (
    <RasterCrop url={rasterUrl} shape={shape} slideWidth={slideWidth} slideHeight={slideHeight} width={width} height={height} />
  ) : (
    <>
      <Outline shape={shape} width={width} height={height} scale={scale} />
      {imageUrl && <ShapeImage url={imageUrl} width={width} height={height} crop={shape.image?.crop} />}
      {shape.table && <TableNode shape={shape} scale={scale} />}
      {shape.text && !hideText && <ShapeText text={shape.text} width={width} height={height} scale={scale} />}
    </>
  );

  return (
    <Group
      ref={nodeRef}
      name={shape.key}
      x={emuToPx(shape.frame.x, scale)}
      y={emuToPx(shape.frame.y, scale)}
      rotation={shape.frame.rotation}
      draggable={draggable}
      listening={interactive}
      onMouseDown={onSelect}
      onTap={onSelect}
      onClick={onClick}
      onDblClick={onEditText}
      onDblTap={onEditText}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onTransformEnd={onTransformEnd}
    >
      {/* An invisible hit area keeps an empty or unfilled box grabbable. */}
      {interactive && <Rect width={width} height={height} fill="rgba(0,0,0,0.001)" perfectDrawEnabled={false} />}
      {body}
      {/* RF-57: a bound box showing a token, or one the data left empty, is outlined rather than
          left looking like an ordinary blank — a hole is exactly what the eye skips. */}
      {flag && !shape.container && (
        <Rect
          width={width}
          height={height}
          stroke={FLAG_COLOR[flag]}
          strokeWidth={1}
          dash={[4, 3]}
          fill={flag === 'token' ? 'rgba(47,111,143,0.06)' : 'rgba(233,89,12,0.07)'}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
    </Group>
  );
}
