import { useEffect, useLayoutEffect, useRef } from 'react';

import type { SceneText } from '../../api/types';
import type { EffectiveShape } from '../../lib/deckEdits';
import { EMU_PER_PT, emuToPx } from '../../lib/emu';
import { fontStack } from '../../lib/fonts';
import { layoutParagraph } from '../../lib/textLayout';
import { useT } from '../../i18n';

const EMPTY_FRAME: SceneText = {
  paragraphs: [{ text: '', level: 0, align: 'center', line_spacing: null, space_before_pt: null, space_after_pt: null, bullet: { kind: 'none' }, style: { size_pt: 18 }, runs: [] }],
  anchor: 'middle',
  word_wrap: true,
  autofit: 'none',
  columns: 1,
  insets_pt: { l: 7.2, r: 7.2, t: 3.6, b: 3.6 },
};

/**
 * Typing happens on the slide, not in a side panel (RF-53).
 *
 * The caret is the thing a slide editor is judged on: in Google Slides and PowerPoint Online you
 * double-click a box and type where the words are. So a textarea is laid exactly over the shape's
 * text frame — same insets, same font, same size, same alignment, same rotation — and the canvas
 * stops drawing that shape's text while it is open. Nothing else about the shape changes, so what
 * you see under the caret is still the file's own geometry.
 *
 * A textarea holds plain text, which is deliberate: paragraph runs keep their formatting because
 * `setText` in the editor re-applies each paragraph's original style to the line that replaces it.
 * Restyling *inside* a paragraph stays the toolbar's job, where it cannot corrupt run boundaries.
 */

export function TextOverlay({
  shape,
  scale,
  offsetX,
  offsetY,
  value,
  onChange,
  onDone,
}: {
  shape: EffectiveShape;
  scale: number;
  offsetX: number;
  offsetY: number;
  value: string;
  onChange: (text: string) => void;
  onDone: () => void;
}) {
  const t = useT();
  const ref = useRef<HTMLTextAreaElement>(null);
  // A shape with no text frame yet still gets a caret: PowerPoint's own defaults for an autoshape,
  // which is what the file will end up with if anything is typed.
  const text = shape.text ?? EMPTY_FRAME;
  const first = text?.paragraphs?.[0];
  const style = { ...(first?.style ?? {}), ...(first?.runs?.[0] ?? {}) };

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.focus();
    node.setSelectionRange(node.value.length, node.value.length);
  }, []);

  // Clicking anywhere else, or Escape, leaves the box the way both products behave.
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onDone();
    };
    window.addEventListener('mousedown', onDown, true);
    return () => window.removeEventListener('mousedown', onDown, true);
  }, [onDone]);

  const emuScale = EMU_PER_PT * scale;
  const insets = text.insets_pt;
  const width = emuToPx(shape.frame.cx, scale);
  const height = emuToPx(shape.frame.cy, scale);
  const padLeft = insets.l * emuScale;
  const padRight = insets.r * emuScale;
  const padTop = insets.t * emuScale;
  const padBottom = insets.b * emuScale;
  const boxWidth = Math.max(width - padLeft - padRight, 1);
  const boxHeight = Math.max(height - padTop - padBottom, 1);

  // The same measurement the canvas uses, so the first line sits where it was sitting.
  const laidHeight = text.paragraphs.reduce(
    (sum, paragraph) =>
      sum +
      (paragraph.space_before_pt ?? 0) * emuScale +
      layoutParagraph(paragraph, boxWidth, emuScale).height +
      (paragraph.space_after_pt ?? 0) * emuScale,
    0,
  );
  const anchorPad =
    text.anchor === 'middle'
      ? Math.max((boxHeight - laidHeight) / 2, 0)
      : text.anchor === 'bottom'
        ? Math.max(boxHeight - laidHeight, 0)
        : 0;

  const fontSize = (style.size_pt ?? 18) * emuScale;

  return (
    <textarea
      ref={ref}
      value={value}
      spellCheck={false}
      aria-label={t.editor.stage.textAria}
      onChange={(event) => onChange(event.currentTarget.value)}
      onKeyDown={(event) => {
        event.stopPropagation(); // the canvas shortcuts must not see typing
        if (event.key === 'Escape' || (event.key === 'Enter' && (event.metaKey || event.ctrlKey))) {
          event.preventDefault();
          onDone();
        }
      }}
      style={{
        position: 'absolute',
        left: offsetX + emuToPx(shape.frame.x, scale),
        top: offsetY + emuToPx(shape.frame.y, scale),
        width,
        height,
        transform: shape.frame.rotation ? `rotate(${shape.frame.rotation}deg)` : undefined,
        transformOrigin: 'top left',
        margin: 0,
        padding: `${padTop + anchorPad}px ${padRight}px ${padBottom}px ${padLeft}px`,
        border: '2px solid var(--mantine-primary-color-filled)',
        outline: 'none',
        resize: 'none',
        overflow: 'hidden',
        background: 'rgba(255,255,255,.82)',
        boxSizing: 'border-box',
        fontFamily: fontStack(style.font),
        fontSize,
        fontWeight: style.bold ? 700 : 400,
        fontStyle: style.italic ? 'italic' : 'normal',
        textDecoration: style.underline ? 'underline' : 'none',
        color: style.color ? `#${style.color}` : '#1a1a1a',
        lineHeight: `${(first?.line_spacing ?? 1) * 1.2}`,
        textAlign: (first?.align ?? 'left') as 'left' | 'center' | 'right' | 'justify',
        whiteSpace: text.word_wrap ? 'pre-wrap' : 'pre',
        zIndex: 5,
      }}
    />
  );
}
