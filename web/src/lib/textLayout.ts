/**
 * Laying a paragraph out the way PowerPoint lays it out (RF-48).
 *
 * A paragraph is a sequence of runs, each with its own font, size and weight; a bold word inside a
 * sentence is a run of its own. Drawing the paragraph as one string in the first run's style — the
 * previous behaviour — loses that, and measuring it with the wrong font breaks the line in the
 * wrong place.
 *
 * So: every run is split into words, each word is measured with *its own* font on a real canvas,
 * and the words are packed into lines. With the metric-compatible faces loaded (see `fonts.ts`)
 * those measurements are Calibri's and Arial's own, which is why the wrap matches the export.
 */
import type { RunStyle, SceneParagraph } from '../api/types';
import { fontStack } from './fonts';

export interface Segment {
  text: string;
  x: number;
  width: number;
  style: RunStyle;
}

export interface LaidLine {
  segments: Segment[];
  width: number;
  height: number;
  y: number;
}

export interface LaidParagraph {
  lines: LaidLine[];
  height: number;
}

let measurer: CanvasRenderingContext2D | null = null;

function context(): CanvasRenderingContext2D | null {
  if (measurer) return measurer;
  if (typeof document === 'undefined') return null;
  measurer = document.createElement('canvas').getContext('2d');
  return measurer;
}

export function fontSpec(style: RunStyle, sizePx: number): string {
  const weight = style.bold ? '700' : '400';
  const italic = style.italic ? 'italic ' : '';
  return `${italic}${weight} ${sizePx}px ${fontStack(style.font)}`;
}

export function measure(text: string, style: RunStyle, sizePx: number): number {
  const ctx = context();
  if (!ctx) return text.length * sizePx * 0.5;
  ctx.font = fontSpec(style, sizePx);
  return ctx.measureText(text).width;
}

/** Runs split into measurable pieces, keeping the spaces so widths stay honest. */
function words(paragraph: SceneParagraph, scale: number): { text: string; style: RunStyle; width: number }[] {
  const out: { text: string; style: RunStyle; width: number }[] = [];
  for (const run of paragraph.runs ?? []) {
    const style: RunStyle = { ...paragraph.style, ...run };
    const size = (style.size_pt ?? 18) * scale;
    for (const piece of (run.text ?? '').split(/(\s+)/)) {
      if (!piece) continue;
      out.push({ text: piece, style, width: measure(piece, style, size) });
    }
  }
  return out;
}

/**
 * Wrap one paragraph into positioned segments.
 * `scale` converts points to the canvas's pixels; `width` is the usable text width in pixels.
 */
export function layoutParagraph(
  paragraph: SceneParagraph,
  width: number,
  scale: number,
  bulletPrefix = '',
): LaidParagraph {
  const pieces = words(paragraph, scale);
  const baseStyle: RunStyle = { ...paragraph.style, ...(paragraph.runs?.[0] ?? {}) };
  const baseSize = (baseStyle.size_pt ?? 18) * scale;
  const lineHeight = (paragraph.line_spacing ?? 1) * baseSize * 1.2;

  if (bulletPrefix) {
    pieces.unshift({
      text: bulletPrefix,
      style: baseStyle,
      width: measure(bulletPrefix, baseStyle, baseSize),
    });
  }

  const lines: LaidLine[] = [];
  let current: Segment[] = [];
  let x = 0;
  let tallest = baseSize;

  const flush = () => {
    if (!current.length) return;
    lines.push({ segments: current, width: x, height: tallest * ((paragraph.line_spacing ?? 1) * 1.2), y: 0 });
    current = [];
    x = 0;
    tallest = baseSize;
  };

  for (const piece of pieces) {
    const blank = /^\s+$/.test(piece.text);
    if (x + piece.width > width && x > 0 && !blank) flush();
    if (blank && x === 0) continue; // a wrapped line never starts with the space that broke it
    current.push({ text: piece.text, x, width: piece.width, style: piece.style });
    x += piece.width;
    tallest = Math.max(tallest, (piece.style.size_pt ?? 18) * scale);
  }
  flush();
  if (!lines.length) lines.push({ segments: [], width: 0, height: lineHeight, y: 0 });

  let cursor = 0;
  for (const line of lines) {
    line.y = cursor;
    cursor += line.height;
  }
  return { lines, height: cursor };
}

/** Horizontal offset of a laid line inside its box, for the paragraph's alignment. */
export function alignOffset(lineWidth: number, boxWidth: number, align?: string | null): number {
  if (align === 'center') return Math.max((boxWidth - lineWidth) / 2, 0);
  if (align === 'right') return Math.max(boxWidth - lineWidth, 0);
  return 0;
}
