/**
 * RF-57: show the token or show the value — a lens over the scene, never a change to it.
 *
 * Authoring a template and previewing it want opposite things from the same slide. While you are
 * wiring a deck you need to see *which* field lands in a box; while you are checking it before a
 * meeting you need to see what it will actually say. This builds a **display copy** of the shapes
 * for one of those two readings.
 *
 * Nothing here ever reaches `DeckEdits`. The copies are rebuilt on every render from the scene and
 * the mapping, and the editor refuses to open the text overlay on a shape whose text is a token,
 * so a token can never be committed as a manual override.
 */
import type { DeckMapping, SceneParagraph } from '../api/types';

import type { EffectiveShape } from './deckEdits';

export type VariableDisplay = 'valor' | 'texto';

/** What is wrong with a bound shape's content, for the canvas to mark. */
export type ContentFlag = 'token' | 'unresolved' | 'empty';

export interface DisplayShape extends EffectiveShape {
  /** Set only on a display copy; absent on anything that can be saved. */
  flag?: ContentFlag;
}

const MARKER = /\{\{\s*([^}]+?)\s*\}\}/;

const textOf = (shape: EffectiveShape) =>
  (shape.text?.paragraphs ?? []).map((p) => p.text).join('\n');

/** The token a bound shape stands for: the field's own name, or the literal as it was typed. */
export function tokenFor(mapping: DeckMapping, originSlideId: number, shapeId: number): string | null {
  const bindings = mapping.slides[String(originSlideId)]?.bindings ?? [];
  const binding = bindings.find((b) => b.target.endsWith(`/sh${shapeId}`));
  if (!binding) return null;
  if (binding.value != null) return binding.value;
  return binding.field ? `{{${binding.field}}}` : null;
}

/**
 * One paragraph carrying the token, wearing the first paragraph's clothes.
 *
 * Keeping the original style matters: the point of text mode is to see the *template*, and a token
 * rendered in the wrong size would misrepresent how much room the value has.
 */
function tokenParagraphs(shape: EffectiveShape, token: string): SceneParagraph[] {
  const first = shape.text?.paragraphs?.[0];
  const style = first?.style ?? {};
  return token.split('\n').map((line) => ({
    text: line,
    level: 0,
    align: first?.align ?? null,
    line_spacing: first?.line_spacing ?? null,
    space_before_pt: null,
    space_after_pt: null,
    bullet: { kind: 'none' as const },
    style,
    runs: [{ text: line, ...style }],
  }));
}

/**
 * The shapes as this reading wants them drawn.
 *
 * In **value** mode nothing is substituted — the scene already holds what the generator produced —
 * but a bound shape that came out empty, or that still carries an unsubstituted `{{marker}}`, is
 * flagged so the canvas can show it rather than leaving a hole the eye slides over.
 */
export function displayShapes(
  shapes: EffectiveShape[],
  mapping: DeckMapping,
  originSlideId: number | null,
  mode: VariableDisplay,
): DisplayShape[] {
  if (originSlideId == null) return shapes;
  return shapes.map((shape) => {
    if (!shape.bound) return shape;
    const token = tokenFor(mapping, originSlideId, shape.shape_id);
    const current = textOf(shape);
    if (mode === 'texto') {
      if (!token || !shape.text) return shape;
      return { ...shape, flag: 'token', text: { ...shape.text, paragraphs: tokenParagraphs(shape, token) } };
    }
    if (MARKER.test(current)) return { ...shape, flag: 'unresolved' };
    // A bound shape with nothing in it is the case a blank slide hides; only text-bearing shapes
    // can say so, since a status fill or a chart has no words by design.
    if (shape.text && !current.trim()) {
      return {
        ...shape,
        flag: 'empty',
        text: { ...shape.text, paragraphs: tokenParagraphs(shape, token ? `${token} — sem valor` : 'sem valor') },
      };
    }
    return shape;
  });
}
