/**
 * RF-90: copy a shape's look and paint it onto others — fill, outline, corner and the text's font,
 * size, weight, colour and alignment — across slides, the way PowerPoint's format painter does.
 * The words stay the target's own; only how they look changes.
 */
import type { ParagraphEdit, RunStyle, SceneFill, SceneLine, ShapeEdit } from '../api/types';
import type { EffectiveShape } from './deckEdits';

export interface CopiedStyle {
  from: string;
  fill: SceneFill | null;
  line: SceneLine | null;
  cornerRadius: number | null;
  align: ParagraphEdit['align'] | null;
  text: RunStyle | null;
}

export function styleOf(shape: EffectiveShape): CopiedStyle {
  const first = shape.text?.paragraphs[0];
  const run = first?.runs[0];
  const text = first ? { ...first.style, ...(run ? { font: run.font, size_pt: run.size_pt, bold: run.bold, italic: run.italic, underline: run.underline, color: run.color } : {}) } : null;
  return {
    from: shape.name || shape.key,
    fill: shape.kind === 'image' || shape.kind === 'line' ? null : shape.fill,
    line: shape.line,
    cornerRadius: shape.edit?.corner_radius ?? null,
    align: first?.align ?? null,
    text: text ? Object.fromEntries(Object.entries(text).filter(([, v]) => v != null)) : null,
  };
}

export function styledPatch(target: EffectiveShape, style: CopiedStyle): Partial<ShapeEdit> {
  const patch: Partial<ShapeEdit> = {};
  if (style.fill && target.kind !== 'image') patch.fill = style.fill;
  if (style.line) patch.line = style.line;
  if (style.cornerRadius != null && target.geometry === 'roundRect') patch.corner_radius = style.cornerRadius;
  if (style.text && target.text) {
    patch.text = {
      paragraphs: target.text.paragraphs.map((p) => ({
        text: p.text,
        runs: p.runs.map(({ text }) => ({ text, style: { ...style.text } })),
        align: style.align ?? p.align,
        level: p.level,
        line_spacing: p.line_spacing,
        bullet: p.bullet.kind === 'inherit' ? null : p.bullet.kind,
        bullet_char: p.bullet.char ?? '•',
        style: { ...p.style, ...style.text },
      })),
    };
  }
  return patch;
}
