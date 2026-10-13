import {
  IconAlignCenter,
  IconAlignJustified,
  IconAlignLeft,
  IconAlignRight,
} from '@tabler/icons-react';

import type { ParagraphEdit } from '../../api/types';
import type { EffectiveShape } from '../../lib/deckEdits';

/** Shared by the toolbar and the properties panel, so the two never disagree about a control. */
export const FONTS = [
  'Calibri',
  'Arial',
  'Times New Roman',
  'Georgia',
  'Verdana',
  'Tahoma',
  'Courier New',
  'Consolas',
];

export const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 54, 60, 72, 96];

export const ALIGNS = [
  { value: 'left', icon: IconAlignLeft, label: 'à esquerda' },
  { value: 'center', icon: IconAlignCenter, label: 'centralizado' },
  { value: 'right', icon: IconAlignRight, label: 'à direita' },
  { value: 'justify', icon: IconAlignJustified, label: 'justificado' },
] as const;

export const hex = (value?: string | null) => (value ? `#${value.replace('#', '')}` : '');
export const bare = (value: string) => value.replace('#', '').toUpperCase().slice(0, 6);

/** Every paragraph of the shape as an editable list, seeded from whatever is on the slide now. */
export function paragraphsOf(shape: EffectiveShape): ParagraphEdit[] {
  return (shape.text?.paragraphs ?? []).map((p) => ({
    text: p.text,
    align: p.align,
    level: p.level,
    line_spacing: p.line_spacing,
    space_before_pt: p.space_before_pt,
    space_after_pt: p.space_after_pt,
    bullet: p.bullet.kind === 'inherit' ? null : p.bullet.kind,
    bullet_char: p.bullet.char ?? '•',
    style: { ...(p.style ?? {}), ...(p.runs?.[0] ?? {}) },
  }));
}

/** The same paragraph patch the panel applies, as a whole-shape text override. */
export function patchedParagraphs(shape: EffectiveShape, patch: Partial<ParagraphEdit>): ParagraphEdit[] {
  return paragraphsOf(shape).map((p) => ({
    ...p,
    ...patch,
    style: { ...p.style, ...(patch.style ?? {}) },
  }));
}
