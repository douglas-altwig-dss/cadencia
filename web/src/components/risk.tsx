import { Badge, Group, List, Stack, Text, ThemeIcon } from '@mantine/core';
import {
  IconAlarm,
  IconArrowForwardUp,
  IconBan,
  IconCircleCheck,
  IconHourglassHigh,
  IconPlayerPause,
  type Icon,
} from '@tabler/icons-react';

import type { Risk, RiskCounts, Situation } from '../api/types';
import { fmtDateTime } from '../lib/format';

// Colour reinforces state; the icon and the words carry it (never colour alone, RF-36).
export const SITUATIONS: { key: Situation; label: string; color: string; icon: Icon }[] = [
  { key: 'arrastado', label: 'Arrastado', color: 'red', icon: IconArrowForwardUp },
  { key: 'atrasado', label: 'Atrasado', color: 'red', icon: IconAlarm },
  { key: 'bloqueado', label: 'Bloqueado', color: 'red', icon: IconBan },
  { key: 'estagnado', label: 'Estagnado', color: 'orange', icon: IconPlayerPause },
  { key: 'envelhecendo', label: 'Envelhecendo', color: 'yellow', icon: IconHourglassHigh },
  { key: 'em_dia', label: 'Em dia', color: 'teal', icon: IconCircleCheck },
];

export const SITUATION = Object.fromEntries(SITUATIONS.map((s) => [s.key, s])) as Record<
  Situation,
  (typeof SITUATIONS)[number]
>;

export function RiskBadge({ situation, size = 'sm' }: { situation: Situation; size?: 'xs' | 'sm' | 'md' }) {
  const meta = SITUATION[situation];
  const IconComponent = meta.icon;
  return (
    <Badge
      size={size}
      variant="light"
      color={meta.color}
      leftSection={<IconComponent size={12} stroke={2} aria-hidden />}
      styles={{ label: { textTransform: 'none', fontWeight: 500 } }}
    >
      {meta.label}
    </Badge>
  );
}

/** The short form for a table cell where space is what runs out (M22). */
const SHORT_LABEL: Partial<Record<Situation, string>> = {
  arrastado: 'arrast.',
  atrasado: 'atras.',
  bloqueado: 'bloq.',
  estagnado: 'estag.',
  envelhecendo: 'envelh.',
};

/**
 * The count of each situation, each one with its name beside the number: a bare "2" with an icon
 * says nothing on a touch screen, where there is no tooltip to read. ``compact`` shortens the names.
 */
export function RiskCountsInline({ counts, hideOnTrack = true, compact = false }: { counts: Partial<RiskCounts>; hideOnTrack?: boolean; compact?: boolean }) {
  const visible = SITUATIONS.filter((s) => (counts[s.key] ?? 0) > 0 && !(hideOnTrack && s.key === 'em_dia'));
  if (!visible.length) {
    return (
      <Text size="sm" c="dimmed">
        nenhum item em risco
      </Text>
    );
  }
  return (
    <Group gap={6} wrap="wrap">
      {visible.map((s) => {
        const IconComponent = s.icon;
        const name = compact ? (SHORT_LABEL[s.key] ?? s.label.toLowerCase()) : s.label.toLowerCase();
        return (
          <Badge
            key={s.key}
            variant="light"
            color={s.color}
            size="md"
            leftSection={<IconComponent size={13} aria-hidden />}
            aria-label={`${counts[s.key]} ${s.label.toLowerCase()}`}
            styles={{ label: { textTransform: 'none' } }}
          >
            {`${counts[s.key]} ${name}`}
          </Badge>
        );
      })}
    </Group>
  );
}

/** RF-19: every classification opens the evidence that produced it. */
export function EvidenceList({ risk }: { risk: Risk }) {
  if (!risk.evidence.length) {
    return (
      <Text size="sm" c="dimmed">
        Nenhuma regra de risco disparou para este item.
      </Text>
    );
  }
  return (
    <Stack gap="sm">
      {risk.evidence.map((e) => (
        <Stack key={e.rule} gap={4}>
          <Group gap="xs">
            <RiskBadge situation={e.situation} />
            <Text size="sm" fw={500}>
              {e.message}
            </Text>
          </Group>
          <Text size="xs" c="dimmed">
            Regra aplicada: {e.rule_description}
          </Text>
          {e.last_transition && (
            <Text size="xs">
              Última transição: {e.last_transition.from ?? '—'} → {e.last_transition.to ?? '—'} em{' '}
              {fmtDateTime(e.last_transition.at)}
              {e.last_transition.author ? ` por ${e.last_transition.author}` : ''}
            </Text>
          )}
          {e.details.length > 0 && (
            <List size="xs" spacing={2}>
              {e.details.map((d) => (
                <List.Item key={d}>{d}</List.Item>
              ))}
            </List>
          )}
        </Stack>
      ))}
    </Stack>
  );
}

export function SeverityIcon({ situation }: { situation: Situation }) {
  const meta = SITUATION[situation];
  const IconComponent = meta.icon;
  return (
    <ThemeIcon variant="light" color={meta.color} size="sm" aria-label={meta.label}>
      <IconComponent size={14} />
    </ThemeIcon>
  );
}
