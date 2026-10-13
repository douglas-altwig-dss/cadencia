import { Box, Group, Paper, ScrollArea, Text } from '@mantine/core';
import { useState } from 'react';

import type { DeckEdits, DeckMapping, DeckScene, SceneSlide } from '../../api/types';
import { slideTitle } from '../../api/types';
import type { VariableDisplay } from '../../lib/variableDisplay';
import { Thumb } from './SlideRail';

const BAR = '3px solid var(--mantine-primary-color-filled)';

/**
 * RF-107: PowerPoint's "Modo de Classificação de Slides" — every slide at once, reordered by drag,
 * the way the filmstrip already reorders one at a time (RF-53). It draws through the same `Thumb`
 * the rail uses, so a slide looks identical whichever view is open; only the layout differs.
 */
export function SlideSorter({
  scene,
  slides,
  edits,
  currentKey,
  mapping,
  display,
  onSelect,
  onReorder,
}: {
  scene: DeckScene;
  slides: SceneSlide[];
  edits: DeckEdits;
  currentKey: string;
  mapping: DeckMapping;
  display: VariableDisplay;
  onSelect: (key: string) => void;
  onReorder: (order: string[]) => void;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const marker = (key: string): 'before' | 'after' | null => {
    if (over !== key || !dragging) return null;
    const order = slides.map((s) => s.key);
    return order.indexOf(dragging) < order.indexOf(key) ? 'after' : 'before';
  };

  const move = (from: string, to: string) => {
    if (from === to) return;
    const order = slides.map((s) => s.key);
    const at = order.indexOf(from);
    const onto = order.indexOf(to);
    if (at < 0 || onto < 0) return;
    order.splice(at, 1);
    order.splice(onto, 0, from);
    onReorder(order);
  };

  return (
    <ScrollArea h="100%" type="auto">
      <Group gap="md" p="md" align="flex-start">
        {slides.map((slide, position) => {
          const active = slide.key === currentKey;
          const label = slideTitle(mapping.slides[String(slide.origin_slide_id)], slide.layout ?? '', slide.index);
          const edge = marker(slide.key);
          return (
            <Box
              key={slide.key}
              draggable
              onDragStart={() => setDragging(slide.key)}
              onDragEnd={() => {
                setDragging(null);
                setOver(null);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                if (dragging && dragging !== slide.key) setOver(slide.key);
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragging) move(dragging, slide.key);
                setDragging(null);
                setOver(null);
              }}
              onClick={() => onSelect(slide.key)}
              style={{
                width: 150,
                borderLeft: edge === 'before' ? BAR : '3px solid transparent',
                borderRight: edge === 'after' ? BAR : '3px solid transparent',
                opacity: dragging === slide.key ? 0.4 : 1,
                cursor: 'grab',
              }}
            >
              <Paper
                withBorder
                p={0}
                style={{
                  overflow: 'hidden',
                  lineHeight: 0,
                  outline: active ? '2px solid var(--mantine-primary-color-filled)' : undefined,
                  outlineOffset: -1,
                }}
              >
                <Thumb scene={scene} slide={slide} edits={edits} mapping={mapping} display={display} />
              </Paper>
              <Text size="xs" c="dimmed" ta="center" mt={4} lineClamp={1}>
                {position + 1} · {label}
              </Text>
            </Box>
          );
        })}
      </Group>
    </ScrollArea>
  );
}
