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
import { t as messages, useT } from '../i18n';
import { fmtDateTime } from '../lib/format';

export interface SituationMeta {
  key: Situation;
  /** The badge's name, in the language current when it is read. */
  readonly label: string;
  color: string;
  icon: Icon;
}

const situation = (key: Situation, color: string, icon: Icon): SituationMeta => ({
  key,
  color,
  icon,
  get label() {
    return messages().shell.risk.label[key];
  },
});

// Colour reinforces state; the icon and the words carry it (never colour alone, RF-36).
export const SITUATIONS: SituationMeta[] = [
  situation('arrastado', 'red', IconArrowForwardUp),
  situation('atrasado', 'red', IconAlarm),
  situation('bloqueado', 'red', IconBan),
  situation('estagnado', 'orange', IconPlayerPause),
  situation('envelhecendo', 'yellow', IconHourglassHigh),
  situation('em_dia', 'teal', IconCircleCheck),
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

/**
 * The count of each situation, each one with its name beside the number: a bare "2" with an icon
 * says nothing on a touch screen, where there is no tooltip to read. ``compact`` shortens the names.
 */
export function RiskCountsInline({ counts, hideOnTrack = true, compact = false }: { counts: Partial<RiskCounts>; hideOnTrack?: boolean; compact?: boolean }) {
  const t = useT();
  const visible = SITUATIONS.filter((s) => (counts[s.key] ?? 0) > 0 && !(hideOnTrack && s.key === 'em_dia'));
  if (!visible.length) {
    return (
      <Text size="sm" c="dimmed">
        {t.shell.risk.noneAtRisk}
      </Text>
    );
  }
  return (
    <Group gap={6} wrap="wrap">
      {visible.map((s) => {
        const IconComponent = s.icon;
        // The short form is for a table cell where space is what runs out (M22).
        const counted = t.shell.risk.counted[s.key];
        const name = compact ? t.shell.risk.short[s.key] : counted;
        return (
          <Badge
            key={s.key}
            variant="light"
            color={s.color}
            size="md"
            leftSection={<IconComponent size={13} aria-hidden />}
            aria-label={`${counts[s.key]} ${counted}`}
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
  const t = useT();
  if (!risk.evidence.length) {
    return (
      <Text size="sm" c="dimmed">
        {t.shell.risk.noRuleFired}
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
            {t.shell.risk.ruleApplied(e.rule_description)}
          </Text>
          {e.last_transition && (
            <Text size="xs">
              {t.shell.risk.lastTransition(
                e.last_transition.from ?? '—',
                e.last_transition.to ?? '—',
                fmtDateTime(e.last_transition.at),
                e.last_transition.author ?? null,
              )}
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
