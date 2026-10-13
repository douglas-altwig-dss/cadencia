import { Badge, type BadgeProps, Group, Progress, SimpleGrid, Stack, Text, Tooltip } from '@mantine/core';
import { IconAlertTriangle, IconArrowDownRight, IconArrowUpRight, IconCheck, IconMinus, IconQuestionMark } from '@tabler/icons-react';
import type { ReactNode } from 'react';

import type { BlockCounts, PersonIndicators, WorkloadState } from '../../api/types';
import { fmtNum, plural } from '../../lib/format';
import { HELP } from '../../lib/indicatorHelp';
import { type Severity } from '../../lib/people';
import { Tipped } from '../common';

// The small, numeric pieces of a person's card. They are shared with the Home tiles so a gauge on the
// Pessoas page and the same gauge in the mosaic can never disagree about what a state means.

/** A stat's small-caps label, with the "i" that says how the number is calculated. */
export function Label({ children, help }: { children: ReactNode; help?: string }) {
  return (
    <Text className="pk-label" component="div">
      {typeof children === 'string' ? <Tipped help={help}>{children}</Tipped> : children}
    </Text>
  );
}

export const STATE_LABEL: Record<WorkloadState, string> = {
  ok: 'dentro da capacidade',
  acima: 'acima da capacidade',
  folga: 'com folga',
  sem_estimativa: 'sem estimativa',
  sem_capacidade: 'sem capacidade no período',
};

const STATE_COLOR: Record<WorkloadState, string> = {
  ok: 'var(--mantine-color-teal-6)',
  acima: 'var(--mantine-color-red-6)',
  folga: 'var(--mantine-color-petrol-5)',
  sem_estimativa: 'var(--mantine-color-gray-5)',
  sem_capacidade: 'var(--mantine-color-gray-5)',
};

const STATE_ICON: Record<WorkloadState, ReactNode> = {
  ok: <IconCheck size={12} />,
  acima: <IconAlertTriangle size={12} />,
  folga: <IconArrowDownRight size={12} />,
  sem_estimativa: <IconQuestionMark size={12} />,
  sem_capacidade: <IconMinus size={12} />,
};

/** The largest ratio the gauge draws; anything above is a full arc, the number still says the truth. */
const GAUGE_MAX = 1.5;

const point = (fraction: number, radius: number) => {
  const angle = Math.PI * (1 - fraction);
  return [60 + radius * Math.cos(angle), 60 - radius * Math.sin(angle)] as const;
};

const arc = (fraction: number, radius = 48) => {
  const [x, y] = point(fraction, radius);
  return `M ${60 - radius} 60 A ${radius} ${radius} 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}`;
};

export function loadPercent(ratio: number | null) {
  return ratio == null ? '—' : `${Math.round(ratio * 100)}%`;
}

/** Load against remaining capacity, as a half-circle with a tick at 100%. */
export type GaugeInput = Pick<PersonIndicators['workload'], 'ratio' | 'state' | 'hours' | 'capacity_hours'>;

export function LoadGauge({ workload, compact = false }: { workload: GaugeInput; compact?: boolean }) {
  const { ratio, state, hours, capacity_hours: capacity } = workload;
  const fraction = ratio == null ? 0 : Math.min(ratio / GAUGE_MAX, 1);
  const [tx1, ty1] = point(1 / GAUGE_MAX, 40);
  const [tx2, ty2] = point(1 / GAUGE_MAX, 56);
  const label =
    ratio == null
      ? `Carga: ${STATE_LABEL[state]}`
      : `Carga ${loadPercent(ratio)}: ${fmtNum(hours)} h abertas para ${fmtNum(capacity ?? 0)} h de capacidade restante, ${STATE_LABEL[state]}`;
  return (
    <div style={{ width: '100%', maxWidth: compact ? 130 : 170, margin: '0 auto' }}>
      <svg viewBox="0 0 120 72" width="100%" role="img" aria-label={label}>
        <title>{label}</title>
        <path d={arc(1)} fill="none" stroke="var(--border-soft)" strokeWidth={10} strokeLinecap="round" />
        {fraction > 0 && <path d={arc(fraction)} fill="none" stroke={STATE_COLOR[state]} strokeWidth={10} strokeLinecap="round" />}
        <line x1={tx1} y1={ty1} x2={tx2} y2={ty2} stroke="var(--mantine-color-text)" strokeWidth={1.5} />
        <text x="60" y="52" textAnchor="middle" fontSize="20" fontWeight="700" fill="var(--mantine-color-text)" className="num">
          {loadPercent(ratio)}
        </text>
        <text x="60" y="66" textAnchor="middle" fontSize="8" fill="var(--mantine-color-dimmed)" className="num">
          {ratio == null ? '' : `${fmtNum(hours)} h de ${fmtNum(capacity ?? 0)} h`}
        </text>
      </svg>
    </div>
  );
}

export function StateBadge({ state }: { state: WorkloadState }) {
  const color = state === 'acima' ? 'red' : state === 'ok' ? 'teal' : state === 'folga' ? 'petrol' : 'gray';
  return (
    <Badge color={color} variant="light" size="sm" leftSection={STATE_ICON[state]}>
      {STATE_LABEL[state]}
    </Badge>
  );
}

/** One palette for block severity everywhere it appears: red, orange, yellow, always with its word. */
const SEVERITY: Record<Severity, { label: string; color: string }> = {
  alta: { label: 'alta', color: 'red' },
  media: { label: 'média', color: 'orange' },
  baixa: { label: 'baixa', color: 'yellow' },
};

/** A block's severity as a badge. ``children`` replaces the bare word, e.g. a count with it. */
export function SeverityBadge({
  level,
  children,
  ...badge
}: { level: Severity; children?: ReactNode } & Omit<BadgeProps, 'color' | 'children'>) {
  const meta = SEVERITY[level];
  return (
    <Badge color={meta.color} variant="light" size="xs" {...badge}>
      {children ?? meta.label}
    </Badge>
  );
}

/** How many blocks and how bad. Severity is the days blocked; the words come with the colours. */
export function BlockSummary({ blocks }: { blocks: BlockCounts }) {
  if (!blocks.count) {
    return (
      <Group gap={4} wrap="nowrap">
        <IconCheck size={14} color="var(--mantine-color-teal-7)" aria-hidden />
        <Text size="sm">Nenhum</Text>
      </Group>
    );
  }
  return (
    <div>
      <Group gap={6} wrap="nowrap" align="baseline">
        <Text fw={700} fz={22} lh={1} className="num" c="red.8">
          {blocks.count}
        </Text>
        <Text size="xs" c="dimmed">
          {plural(blocks.count, 'bloqueio')}
        </Text>
      </Group>
      <Group gap={4} mt={4}>
        {(['alta', 'media', 'baixa'] as const)
          .filter((level) => blocks[level] > 0)
          .map((level) => (
            <SeverityBadge key={level} level={level}>
              {blocks[level]} {SEVERITY[level].label}
            </SeverityBadge>
          ))}
      </Group>
      {blocks.oldest_days != null && (
        <Text size="xs" c="dimmed" mt={2}>
          o mais antigo: {blocks.oldest_days} d
        </Text>
      )}
    </div>
  );
}

/**
 * A person's four numbers, in the one layout the card and the summary share: load, deliveries, blocks and
 * past sprints. ``card`` stacks them for a Pessoas card; ``row`` lays them out side by side on the page.
 */
export function PersonIndicatorBlocks({ indicators, layout }: { indicators: PersonIndicators; layout: 'card' | 'row' }) {
  const { workload, delivered, blocks, past } = indicators;
  const compact = layout === 'row';
  const ratio = delivered.committed ? Math.min((delivered.count / delivered.committed) * 100, 100) : null;
  const load = (
    <Stack gap={4}>
      <Label help={HELP['person:load']}>{`Carga ${workload.window === 'sprint' ? 'na sprint' : 'na semana'}`}</Label>
      <LoadGauge workload={workload} compact={compact} />
      <Group justify="center">
        <StateBadge state={workload.state} />
      </Group>
    </Stack>
  );
  const deliveries = (
    <Stack gap={4}>
      <Label help={HELP['person:delivered']}>{delivered.window === 'sprint' ? 'Entregas' : 'Entregas (semana)'}</Label>
      <Group gap={6} align="baseline" wrap="nowrap">
        <Text fw={700} fz={22} lh={1} className="num">
          {delivered.count}
        </Text>
        {delivered.committed != null && (
          <Text size="xs" c="dimmed" className="num">
            de {delivered.committed} comprometidas
          </Text>
        )}
      </Group>
      {ratio != null && <Progress value={ratio} size="xs" mt={2} aria-label={`${Math.round(ratio)}% do compromisso entregue`} />}
    </Stack>
  );
  const blockCell = (
    <Stack gap={4}>
      <Label help={HELP['person:blocks']}>Bloqueios</Label>
      <BlockSummary blocks={blocks} />
    </Stack>
  );
  const pastCell = (
    <Stack gap={4}>
      <Label help={HELP['person:past']}>Sprints anteriores</Label>
      <PastBars past={past} />
    </Stack>
  );
  if (layout === 'card') {
    return (
      <Stack gap="sm">
        {load}
        <div className="pk-grid">
          {deliveries}
          {blockCell}
        </div>
        {pastCell}
      </Stack>
    );
  }
  return (
    <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} spacing="lg">
      {load}
      {deliveries}
      {blockCell}
      {pastCell}
    </SimpleGrid>
  );
}

/** Delivered per closed sprint, oldest to newest, with the commitment as an outline; empty where the person was not there. */
export function PastBars({ past }: { past: PersonIndicators['past'] }) {
  const points = past.points;
  const have = points.filter((p) => p.delivered != null);
  if (!have.length) {
    return (
      <Text size="xs" c="dimmed">
        sem sprints anteriores
      </Text>
    );
  }
  const max = Math.max(1, ...points.map((p) => Math.max(p.delivered ?? 0, p.committed ?? 0)));
  const width = 14;
  const gap = 6;
  const height = 34;
  const label = `Entregues nas últimas sprints: ${points
    .map((p) => (p.delivered == null ? 'sem dados' : `${p.label ?? ''} ${p.delivered}${p.committed ? ` de ${p.committed}` : ''}`.trim()))
    .join('; ')}`;
  const delta = past.delta;
  const Icon = delta == null ? IconMinus : delta > 0 ? IconArrowUpRight : delta < 0 ? IconArrowDownRight : IconMinus;
  return (
    <Group gap="sm" wrap="nowrap" align="flex-end">
      <svg width={points.length * (width + gap)} height={height} role="img" aria-label={label}>
        <title>{label}</title>
        {points.map((p, i) => {
          const x = i * (width + gap);
          if (p.delivered == null) {
            return <line key={i} x1={x} x2={x + width} y1={height - 1} y2={height - 1} stroke="var(--border-soft)" strokeWidth={2} strokeDasharray="3 2" />;
          }
          const delivered = (p.delivered / max) * (height - 2);
          const committed = ((p.committed ?? 0) / max) * (height - 2);
          return (
            <g key={i}>
              {p.committed != null && p.committed > 0 && (
                <rect x={x} y={height - committed} width={width} height={committed} fill="none" stroke="var(--mantine-color-dimmed)" strokeWidth={1} />
              )}
              <rect x={x + 2} y={height - delivered} width={width - 4} height={delivered} fill="var(--mantine-primary-color-filled)" />
            </g>
          );
        })}
      </svg>
      <Tooltip label="Diferença nas entregas entre as duas últimas sprints" disabled={delta == null}>
        <Group gap={2} wrap="nowrap">
          <Icon size={14} aria-hidden />
          <Text size="xs" c="dimmed" className="num">
            {delta == null ? 'sem comparativo' : delta === 0 ? 'igual' : `${delta > 0 ? '+' : ''}${delta}`}
          </Text>
        </Group>
      </Tooltip>
    </Group>
  );
}
