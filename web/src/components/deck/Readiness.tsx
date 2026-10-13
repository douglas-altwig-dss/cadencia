import { Alert, Anchor, Group, List, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';

import type { SlideReadiness, TemplateReadiness } from '../../api/types';
import { plural } from '../../lib/format';

/** RF-66: one sentence per problem. Every surface that describes readiness goes through here. */
export function readinessProblemText(problem: SlideReadiness['problems'][number]): string {
  return problem.kind === 'nao_registrada'
    ? `${problem.variable} não está registrada`
    : `${problem.variable} sem valor para ${problem.boards.join(', ')}`;
}

/** Everything that keeps a slide from being ready, as sentences: its problems, then unbound areas. */
export function readinessLines(slide: SlideReadiness): string[] {
  const lines = slide.problems.map(readinessProblemText);
  if (slide.unbound_targets.length) lines.push(plural(slide.unbound_targets.length, 'área sem campo', 'áreas sem campo'));
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
  const slides = (readiness?.slides ?? []).filter((slide) => readinessLines(slide).length > 0);
  if (!slides.length) return null;
  const refusing = slides.some((slide) => slide.problems.length > 0);

  if (compact) {
    return (
      <Alert color="yellow" variant="light" title="Há variáveis sem valor" icon={<IconAlertTriangle size={16} />}>
        <List size="sm">
          {slides.slice(0, 6).map((slide) => (
            <List.Item key={slide.slide_id}>
              <b>{slide.name || `Slide ${slide.index}`}</b>: {readinessLines(slide).join(' · ')}
            </List.Item>
          ))}
        </List>
        {refusing && (
          <Text size="xs" c="dimmed" mt={4}>
            A geração vai recusar o arquivo. Resolva em <b>Variáveis</b>, ou baixe com “Baixar mesmo assim” sabendo que o marcador fica visível no slide.
          </Text>
        )}
      </Alert>
    );
  }

  return (
    <Alert variant="light" color="red" py={6} icon={<IconAlertTriangle size={16} />}>
      <Text size="xs">
        {slides.length === 1 ? '1 slide tem' : `${slides.length} slides têm`} variáveis que ainda não têm valor. Passe o mouse no aviso da
        miniatura para ver qual, ou resolva em <b>Variáveis</b>. A geração recusa o arquivo enquanto isso não estiver resolvido.
      </Text>
      {/* RF-83: each affected slide one click away. */}
      {onGo && (
        <Group gap={8} mt={4}>
          {slides.slice(0, 10).map((slide) => (
            <Anchor key={slide.slide_id} component="button" size="xs" onClick={() => onGo(slide.slide_id)}>
              ir para {slide.name || `slide ${slide.index}`}
            </Anchor>
          ))}
        </Group>
      )}
    </Alert>
  );
}
