import { Group, Text, Tooltip } from '@mantine/core';
import { IconAlertTriangle, IconArrowDownRight, IconArrowUpRight, IconMinus, IconPlugConnectedX } from '@tabler/icons-react';

import type { DashboardRow, TrendPoint } from '../../api/types';
import { fmtDateTime, fromNow } from '../../lib/format';
import { InfoTip } from '../common';

// The small drawings the Home tiles share: bars of a trend, a sparkline, a direction, a freshness.

export function MiniBars({ trend }: { trend: TrendPoint[] }) {
  if (!trend.length) return <Text size="sm" c="dimmed">—</Text>;
  const max = Math.max(1, ...trend.map((t) => Math.max(t.delivered, t.committed ?? 0)));
  const width = 14;
  const gap = 6;
  const height = 34;
  const label = `Entregues por período: ${trend.map((t) => `${t.label} ${t.delivered}${t.committed != null ? ` de ${t.committed}` : ''}`).join('; ')}`;
  return (
    <svg width={trend.length * (width + gap)} height={height} role="img" aria-label={label}>
      <title>{label}</title>
      {trend.map((t, i) => {
        const x = i * (width + gap);
        const delivered = (t.delivered / max) * (height - 2);
        const committed = ((t.committed ?? 0) / max) * (height - 2);
        return (
          <g key={t.label}>
            {t.committed != null && (
              <rect x={x} y={height - committed} width={width} height={committed} fill="none" stroke="var(--mantine-color-dimmed)" strokeWidth={1} />
            )}
            <rect
              x={x + 2}
              y={height - delivered}
              width={width - 4}
              height={delivered}
              fill={t.open ? 'var(--mantine-color-petrol-4)' : 'var(--mantine-primary-color-filled)'}
            />
          </g>
        );
      })}
    </svg>
  );
}

export function Throughput({ row }: { row: DashboardRow }) {
  const { current, previous } = row.throughput;
  if (current == null) return <Text size="sm" c="dimmed">—</Text>;
  const delta = previous == null ? 0 : current - previous;
  const Icon = delta > 0 ? IconArrowUpRight : delta < 0 ? IconArrowDownRight : IconMinus;
  return (
    <Group gap={6} wrap="nowrap">
      <Text fw={600} className="num">
        {current}
      </Text>
      <Icon size={14} aria-hidden />
      <Text size="xs" c="dimmed">
        {previous == null ? 'sem janela anterior' : `anterior: ${previous}`}
      </Text>
    </Group>
  );
}

export function FreshnessCell({ row }: { row: DashboardRow }) {
  const f = row.freshness;
  return (
    <Group gap={6} wrap="nowrap">
      <Tooltip label={f.last_success_at ? fmtDateTime(f.last_success_at) : 'nunca coletado'}>
        <Text size="sm">{fromNow(f.last_success_at)}</Text>
      </Tooltip>
      {f.last_error && (
        <Group gap={4} wrap="nowrap">
          <IconPlugConnectedX size={16} color="var(--mantine-color-red-6)" aria-hidden />
          <InfoTip label={`Última coleta falhou: ${f.last_error}`} about="Falha na última coleta" width={280} />
        </Group>
      )}
      {!f.last_error && f.stale && (
        <Tooltip label="Dados possivelmente desatualizados">
          <IconAlertTriangle size={16} color="var(--mantine-color-yellow-6)" aria-label="Dados desatualizados" />
        </Tooltip>
      )}
    </Group>
  );
}

export function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
  const width = 96;
  const height = 28;
  const max = Math.max(1, ...values);
  const min = Math.min(...values);
  const span = Math.max(1, max - min);
  const points = values.map((v, i) => `${(i / (values.length - 1)) * width},${height - 2 - ((v - min) / span) * (height - 4)}`).join(' ');
  return (
    <svg width={width} height={height} role="img" aria-label={label}>
      <title>{label}</title>
      <polyline points={points} fill="none" stroke="var(--mantine-primary-color-filled)" strokeWidth={2} />
      <circle cx={width} cy={Number(points.split(' ').at(-1)!.split(',')[1])} r={2.5} fill="var(--mantine-primary-color-filled)" />
    </svg>
  );
}

/** A change against the period before, in words as well as an arrow, and whether it is the better direction. */
export function Delta({ value, better, unit = '' }: { value: number | null; better: 'up' | 'down'; unit?: string }) {
  if (value == null) return <Text size="xs" c="dimmed">sem período anterior</Text>;
  if (value === 0) {
    return (
      <Group gap={2}>
        <IconMinus size={12} aria-hidden />
        <Text size="xs" c="dimmed">igual ao anterior</Text>
      </Group>
    );
  }
  const good = (value > 0) === (better === 'up');
  const Icon = value > 0 ? IconArrowUpRight : IconArrowDownRight;
  return (
    <Group gap={2}>
      <Icon size={12} aria-hidden />
      <Text size="xs" c={good ? 'teal.8' : 'red.8'}>
        {value > 0 ? '+' : ''}
        {Number.isInteger(value) ? value : value.toFixed(1)}
        {unit} {good ? '(melhor)' : '(pior)'}
      </Text>
    </Group>
  );
}

/** Trend points aligned from the most recent one, since boards have histories of different length. */
export function alignedSums(rows: DashboardRow[], pick: (t: TrendPoint) => number | null, closedOnly = false): number[] {
  const series = rows.map((r) => (r.trend ?? []).filter((t) => !closedOnly || !t.open));
  const length = Math.max(0, ...series.map((s) => s.length));
  return Array.from({ length }, (_, i) =>
    series.reduce((sum, s) => {
      const point = s[s.length - length + i];
      return sum + (point ? (pick(point) ?? 0) : 0);
    }, 0),
  );
}
