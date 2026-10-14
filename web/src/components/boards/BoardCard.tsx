import { Anchor, Badge, Box, Button, Group, Paper, Progress, Stack, Text, Tooltip } from '@mantine/core';
import { IconAlertTriangle, IconChartDots, IconInfoCircle, IconLayoutKanban, IconPlugConnectedX, IconRepeat } from '@tabler/icons-react';
import { Link } from 'react-router';

import type { DashboardRow } from '../../api/types';
import { useT } from '../../i18n';
import { boardKind, spaceLabel } from '../../lib/boards';
import { useFilters } from '../../lib/filters';
import { fmtPct } from '../../lib/format';
import { HELP } from '../../lib/indicatorHelp';
import { InfoTip, Tipped } from '../common';
import { elapsedOf, FreshnessDot, Sparkline, Throughput } from '../home/parts';
import { RiskCountsInline } from '../risk';

/** A small-caps label with its "i", the way every indicator on the page is named. */
function Label({ children, help }: { children: string; help: string }) {
  return (
    <Text className="kpi-label" component="div">
      <Tipped help={help}>{children}</Tipped>
    </Text>
  );
}

/** One bar, done ÷ total by count, with the mark for how much of the sprint has passed. */
function SprintProgress({ row }: { row: DashboardRow }) {
  const t = useT();
  const m = t.tracking.boards;
  const progress = row.progress!;
  const pct = fmtPct(progress.count_ratio);
  const elapsed = elapsedOf(row);
  const label = m.progressAria(progress.done, progress.total, pct);
  return (
    <Stack gap={6}>
      <Label help={HELP['boards:progress']}>{m.progress}</Label>
      <Box style={{ position: 'relative' }}>
        <Progress
          value={(progress.count_ratio ?? 0) * 100}
          size="md"
          aria-label={elapsed == null ? label : t.shell.common.sprintElapsed(label, Math.round(elapsed * 100))}
        />
        {elapsed != null && (
          <span
            aria-hidden
            style={{ position: 'absolute', top: -3, bottom: -3, left: `${elapsed * 100}%`, width: 2, borderRadius: 1, background: 'var(--mantine-color-text)' }}
          />
        )}
      </Box>
      <Group gap={6} wrap="nowrap" justify="space-between">
        <Text size="sm" className="num">
          {m.progressOf(progress.done, progress.total, pct)}
        </Text>
        {progress.coverage_warning && (
          <Group gap={4} wrap="nowrap">
            <Badge variant="outline" color="yellow" size="xs" leftSection={<IconAlertTriangle size={10} aria-hidden />}>
              {t.shell.common.coverage(fmtPct(progress.coverage))}
            </Badge>
            <InfoTip label={`${HELP['progress:coverage']}\n\n${progress.coverage_warning}`} about={t.shell.common.coverageAbout} width={280} />
          </Group>
        )}
      </Group>
    </Stack>
  );
}

/**
 * One board at a glance: where its sprint is (or what it delivered this week, for a board without
 * one), how it has been delivering, what is at risk. The title opens the board; the footer opens the
 * board's own flow metrics.
 */
export function BoardCard({ row }: { row: DashboardRow }) {
  const t = useT();
  const m = t.tracking.boards;
  const { carry } = useFilters();
  const kind = boardKind(row);
  const space = spaceLabel(row);
  const KindIcon = kind === 'kanban' ? IconLayoutKanban : IconRepeat;
  const withSprint = !!row.sprint && !!row.progress && row.progress.total > 0;
  const trend = row.trend.map((p) => p.delivered);
  const trendLabel = t.tracking.home.deliveredPerPeriod(row.trend.map((p) => t.tracking.home.deliveredOf(p.label, p.delivered, null)).join('; '));
  const atRisk = Object.entries(row.risk_counts).some(([key, n]) => key !== 'em_dia' && (n ?? 0) > 0);

  return (
    <Paper withBorder p="md" h="100%" className="board-card" component="article" aria-label={row.board.name}>
      <Stack gap="sm" style={{ flex: 1 }}>
        <Stack gap={2}>
          <Tooltip label={space ?? m.noSpace} openDelay={400} withinPortal>
            <Text className="kpi-label" truncate="end">
              {space ?? m.noSpace}
            </Text>
          </Tooltip>
          <Group justify="space-between" wrap="nowrap" gap="sm" align="center">
            <Tooltip label={row.board.name} openDelay={400} withinPortal>
              <Anchor component={Link} to={carry(`/boards/${row.board.id}`)} fw={600} truncate="end" style={{ minWidth: 0 }}>
                {row.board.name}
              </Anchor>
            </Tooltip>
            <FreshnessDot freshness={row.freshness} />
          </Group>
        </Stack>

        <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
          <Badge variant="default" size="sm" leftSection={<KindIcon size={12} aria-hidden />} style={{ flexShrink: 0 }}>
            {m.kinds[kind]}
          </Badge>
          {row.sprint && (
            <Text size="xs" c="dimmed" truncate="end" style={{ minWidth: 0 }} title={row.sprint.name}>
              {row.sprint.name}
              {row.window ? ` · ${m.week(row.window.index, row.window.total)}` : ''}
            </Text>
          )}
        </Group>

        {row.error ? (
          <Group gap={6} wrap="nowrap">
            <IconPlugConnectedX size={16} color="var(--mantine-color-red-6)" aria-hidden />
            <Text size="sm" c="red.8" lineClamp={1}>
              {row.error.cause}
            </Text>
            <InfoTip label={row.error.message} about={m.collectionFailed} width={300} />
          </Group>
        ) : (
          <>
            {withSprint ? (
              <SprintProgress row={row} />
            ) : (
              <Stack gap={4}>
                <Label help={HELP['boards:delivered']}>{m.deliveredThisWeek}</Label>
                <Throughput row={row} />
              </Stack>
            )}

            {trend.length >= 2 && (
              <Group justify="space-between" wrap="nowrap" gap="xs">
                <Label help={HELP['boards:trend']}>{row.sprint ? m.trendSprint : m.trendWeek}</Label>
                <Sparkline values={trend} label={trendLabel} width={64} height={32} />
              </Group>
            )}

            {atRisk ? (
              <RiskCountsInline counts={row.risk_counts} compact />
            ) : (
              <Text size="sm" c="dimmed">
                {m.allOnTrack}
              </Text>
            )}

            {row.warnings.length > 0 && (
              <Group gap={6} wrap="nowrap" align="flex-start">
                <IconInfoCircle size={14} color="var(--text-muted)" aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
                <Text size="xs" c="dimmed" lineClamp={2} title={row.warnings.join(' ')}>
                  {row.warnings.join(' ')}
                </Text>
              </Group>
            )}
          </>
        )}

        <Group mt="auto" pt={4}>
          <Button
            variant="subtle"
            size="compact-sm"
            leftSection={<IconChartDots size={16} aria-hidden />}
            component={Link}
            to={carry(`/boards/${row.board.id}`, { tab: 'flow' })}
            aria-label={m.flowMetricsAria(row.board.name)}
          >
            {m.flowMetrics}
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
