/**
 * RF-88: find and replace across a slide or the whole deck.
 *
 * It works on the effective shapes — what the canvas shows, overrides included — and writes its
 * result the way typing does: a text override per shape, run by run, so a bold word stays bold. A
 * shape bound to data is reported but not changed: the next generation would rewrite it anyway, and
 * the fix belongs in the variable or the field (the variables tab of the same panel does that).
 */
import type { DeckEdits, ParagraphEdit, SceneSlide } from '../api/types';
import { effectiveShapes, type EffectiveShape } from './deckEdits';

export interface Match {
  slideKey: string;
  slideIndex: number;
  shapeKey: string;
  shapeName: string;
  paragraph: number;
  text: string;
  bound: boolean;
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function pattern(query: string, matchCase: boolean): RegExp | null {
  return query ? new RegExp(escape(query), matchCase ? 'g' : 'gi') : null;
}

export function findMatches(slides: SceneSlide[], edits: DeckEdits, query: string, matchCase: boolean): Match[] {
  const rx = pattern(query, matchCase);
  if (!rx) return [];
  const out: Match[] = [];
  slides.forEach((slide, slideIndex) => {
    for (const shape of effectiveShapes(slide, edits)) {
      shape.text?.paragraphs.forEach((paragraph, index) => {
        rx.lastIndex = 0;
        if (rx.test(paragraph.text)) {
          out.push({
            slideKey: slide.key,
            slideIndex,
            shapeKey: shape.key,
            shapeName: shape.name,
            paragraph: index,
            text: paragraph.text,
            bound: shape.bound,
          });
        }
      });
    }
  });
  return out;
}

/** The shape's paragraphs with every occurrence replaced, keeping each run's own style. */
export function replacedParagraphs(shape: EffectiveShape, query: string, replacement: string, matchCase: boolean): ParagraphEdit[] | null {
  const rx = pattern(query, matchCase);
  if (!rx || !shape.text) return null;
  let changed = false;
  const paragraphs = shape.text.paragraphs.map((p) => {
    const runs = p.runs.map(({ text, ...style }) => {
      const next = text.replace(rx, () => replacement);
      if (next !== text) changed = true;
      return { text: next, style };
    });
    let joined = runs.map((r) => r.text).join('');
    // A match split across two runs is not visible to any single run: fall back to the paragraph,
    // written in its first run's style, rather than silently skipping it.
    if (joined.replace(rx, () => replacement) !== joined) {
      joined = joined.replace(rx, () => replacement);
      runs.splice(0, runs.length, { text: joined, style: runs[0]?.style ?? {} });
      changed = true;
    }
    return {
      text: joined,
      runs,
      align: p.align,
      level: p.level,
      line_spacing: p.line_spacing,
      space_before_pt: p.space_before_pt,
      space_after_pt: p.space_after_pt,
      bullet: p.bullet.kind === 'inherit' ? null : p.bullet.kind,
      bullet_char: p.bullet.char ?? '•',
      style: p.style,
    } satisfies ParagraphEdit;
  });
  return changed ? paragraphs : null;
}
