import { Alert, Anchor, Group, List, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';

import type { SlideReadiness, TemplateReadiness } from '../../api/types';
import { t as messages, useT } from '../../i18n';

/** RF-66: one sentence per problem. Every surface that describes readiness goes through here. */
export function readinessProblemText(problem: SlideReadiness['problems'][number]): string {
  const t = messages().deck.readiness;
  return problem.kind === 'nao_registrada' ? t.notRegistered(problem.variable) : t.noValue(problem.variable, problem.boards);
}

/** Everything that keeps a slide from being ready, as sentences: its problems, then unbound areas. */
export function readinessLines(slide: SlideReadiness): string[] {
  const lines = slide.problems.map(readinessProblemText);
  if (slide.unbound_targets.length) lines.push(messages().deck.readiness.unbound(slide.unbound_targets.length));
  return lines;
}

/**
 * RF-66: the deck-wide readiness in one place, so the editor and the generation drawer cannot
 * describe the same gaps differently. Renders nothing when every slide is ready.
 */
export function ReadinessAlert({
  readiness,
  onGo,
  compact = false,
}: {
  readiness?: TemplateReadiness;
  /** The editor's shortcut to a slide; the compact form lists slides without links. */
  onGo?: (slideId: number) => void;
  compact?: boolean;
}) {
  const t = useT();
  const slides = (readiness?.slides ?? []).filter((slide) => readinessLines(slide).length > 0);
  if (!slides.length) return null;
  const refusing = slides.some((slide) => slide.problems.length > 0);

  if (compact) {
    return (
      <Alert color="yellow" variant="light" title={t.deck.readiness.compactTitle} icon={<IconAlertTriangle size={16} />}>
        <List size="sm">
          {slides.slice(0, 6).map((slide) => (
            <List.Item key={slide.slide_id}>
              <b>{slide.name || t.deck.slideN(slide.index)}</b>: {readinessLines(slide).join(' · ')}
            </List.Item>
          ))}
        </List>
        {refusing && (
          <Text size="xs" c="dimmed" mt={4}>
            {t.deck.readiness.compactRefuses(<b key="v">{t.deck.readiness.variables}</b>)}
          </Text>
        )}
      </Alert>
    );
  }

  return (
    <Alert variant="light" color="red" py={6} icon={<IconAlertTriangle size={16} />}>
      <Text size="xs">
        {t.deck.readiness.slidesMissing(slides.length, <b key="v">{t.deck.readiness.variables}</b>)}
      </Text>
      {/* RF-83: each affected slide one click away. */}
      {onGo && (
        <Group gap={8} mt={4}>
          {slides.slice(0, 10).map((slide) => (
            <Anchor key={slide.slide_id} component="button" size="xs" onClick={() => onGo(slide.slide_id)}>
              {t.deck.readiness.goTo(slide.name || t.deck.readiness.slideLower(slide.index))}
            </Anchor>
          ))}
        </Group>
      )}
    </Alert>
  );
}
