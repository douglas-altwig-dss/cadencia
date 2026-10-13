import { ActionIcon, Box, Group, ScrollArea, Stack, Text, UnstyledButton } from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';

import type { DeckScene } from '../../api/types';
import { EMPTY_EDITS, effectiveShapes } from '../../lib/deckEdits';
import { useT } from '../../i18n';
import { SlideStage } from '../editor/SlideStage';

/**
 * A generated deck, read-only: the slide, arrows, and a strip of thumbnails. It draws with
 * `SlideStage` — the only renderer (RF-48) — so a preview (#9) and a shared link (#14) look exactly
 * like the editor. ``raster`` gives each slide's rendered image, from which charts are cropped.
 */
export function DeckViewer({
  scene,
  raster,
  maxHeight = 560,
}: {
  scene: DeckScene;
  raster?: (index: number) => string | undefined;
  maxHeight?: number;
}) {
  const t = useT();
  const [current, setCurrent] = useState(0);
  const { ref, width } = useElementSize();
  const slides = scene.slides;
  const slide = slides[Math.min(current, slides.length - 1)];
  const ratio = scene.slide_height / scene.slide_width;
  const stageWidth = Math.max(Math.min(width, maxHeight / ratio), 200);
  const shapes = useMemo(() => (slide ? effectiveShapes(slide, EMPTY_EDITS) : []), [slide]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === 'ArrowRight') setCurrent((c) => Math.min(c + 1, slides.length - 1));
      if (event.key === 'ArrowLeft') setCurrent((c) => Math.max(c - 1, 0));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [slides.length]);

  if (!slide) {
    return (
      <Text size="sm" c="dimmed">
        {t.deck.viewer.empty}
      </Text>
    );
  }
  return (
    <Stack gap="sm">
      <Box ref={ref} style={{ display: 'grid', placeItems: 'center' }}>
        {width > 0 && (
          <SlideStage scene={scene} shapes={shapes} width={stageWidth} mode="preview" chromeless rasterUrl={raster?.(slide.index)} />
        )}
      </Box>
      <Group justify="center" gap="md">
        <ActionIcon variant="default" onClick={() => setCurrent((c) => Math.max(c - 1, 0))} disabled={current === 0} aria-label={t.deck.viewer.previous}>
          <IconChevronLeft size={16} />
        </ActionIcon>
        <Text size="sm" className="num" aria-live="polite">
          {t.deck.viewer.position(current + 1, slides.length)}
        </Text>
        <ActionIcon
          variant="default"
          onClick={() => setCurrent((c) => Math.min(c + 1, slides.length - 1))}
          disabled={current >= slides.length - 1}
          aria-label={t.deck.viewer.next}
        >
          <IconChevronRight size={16} />
        </ActionIcon>
      </Group>
      <ScrollArea type="auto" offsetScrollbars>
        <Group gap="xs" wrap="nowrap" pb={4}>
          {slides.map((s, index) => (
            <UnstyledButton
              key={s.key}
              onClick={() => setCurrent(index)}
              aria-label={t.deck.viewer.goTo(index + 1)}
              aria-current={index === current ? 'true' : undefined}
              style={{
                outline: index === current ? '2px solid var(--mantine-primary-color-filled)' : '1px solid var(--border-soft)',
                borderRadius: 4,
                flex: '0 0 auto',
              }}
            >
              <SlideStage scene={scene} shapes={effectiveShapes(s, EMPTY_EDITS)} width={112} mode="preview" chromeless rasterUrl={raster?.(s.index)} />
            </UnstyledButton>
          ))}
        </Group>
      </ScrollArea>
    </Stack>
  );
}
