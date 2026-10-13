import { Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';

import { useAging, useCfd, useCvd, useScatter } from '../api/hooks';
import { useT } from '../i18n';
import { fmtDate, fmtDays, fmtNum } from '../lib/format';
import { Empty, ErrorState, Loading, Percentiles } from './common';
import { axisStyle, EChart } from './EChart';

function ChartCard({ title, caption, children }: { title: string; caption: string; children: React.ReactNode }) {
  return (
    <Paper withBorder p="md">
      <Stack gap={4}>
        <Title order={4}>{title}</Title>
        <Text size="xs" c="dimmed">
          {caption}
        </Text>
        {children}
      </Stack>
    </Paper>
  );
}

function CumulativeFlow({ boardId, start, end }: { boardId: number; start?: string; end?: string }) {
  const t = useT();
  const { data, isLoading, error } = useCfd(boardId, start, end);
  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} />;
  if (!data || !data.dates.length) return <Empty title={t.shell.flowCharts.noData} action={{ label: t.shell.flowCharts.seeStatus, to: '/status' }}>{t.shell.flowCharts.noDataBody}</Empty>;
  const columns = [...data.columns].reverse(); // done at the bottom, backlog on top
  return (
    <EChart
      label={t.shell.flowCharts.cfdLabel(data.dates[0], data.dates[data.dates.length - 1], data.columns.map((c) => c.name).join(', '))}
      deps={[data]}
      build={(p) => ({
        tooltip: { trigger: 'axis' },
        legend: { top: 0, textStyle: { color: p.text } },
        xAxis: { type: 'category', boundaryGap: false, data: data.dates.map((d) => t.shell.format.dayMonth(d.slice(8, 10), d.slice(5, 7))), ...axisStyle(p) },
        yAxis: { type: 'value', minInterval: 1, ...axisStyle(p) },
        color: [p.done, p.progress, p.warn, p.todo, p.added, p.risk],
        series: columns.map((c) => ({ name: c.name, type: 'line', stack: 'cfd', areaStyle: { opacity: 0.85 }, symbol: 'none', lineStyle: { width: 0.5 }, data: c.counts })),
      })}
    />
  );
}

function CycleScatter({ boardId, start, end }: { boardId: number; start?: string; end?: string }) {
  const t = useT();
  const { data, isLoading, error } = useScatter(boardId, start, end);
  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} />;
  if (!data || !data.points.length) return <Empty title={t.shell.flowCharts.noneDone}>{t.shell.flowCharts.noneDoneBody}</Empty>;
  const pct = data.percentiles;
  const lines = (['p50', 'p85', 'p95'] as const)
    .filter((k) => pct[k] != null)
    .map((k) => ({ yAxis: pct[k] as number, name: k.toUpperCase(), label: { formatter: `${k.toUpperCase()} ${fmtDays(pct[k])}` } }));
  return (
    <Stack gap={4}>
      <Percentiles dist={pct} />
      <EChart
        label={t.shell.flowCharts.scatterLabel(data.points.length, fmtNum(pct.p50), fmtNum(pct.p85), fmtNum(pct.p95))}
        deps={[data]}
        build={(p) => ({
          tooltip: {
            trigger: 'item',
            formatter: (params: unknown) => {
              const v = (params as { data: [string, number, string, string] }).data;
              return `${v[2]} — ${v[3]}<br/>${t.shell.flowCharts.scatterTip(fmtNum(v[1]), fmtDate(v[0]))}`;
            },
          },
          xAxis: { type: 'time', ...axisStyle(p) },
          yAxis: { type: 'value', name: t.shell.flowCharts.days, ...axisStyle(p) },
          series: [
            {
              type: 'scatter',
              symbolSize: 8,
              itemStyle: { color: p.progress, opacity: 0.8 },
              data: data.points.map((pt) => [pt.done_at, pt.cycle_days, pt.key, pt.summary]),
              markLine: { symbol: 'none', lineStyle: { color: p.warn, type: 'dashed' }, label: { color: p.text }, data: lines },
            },
          ],
        })}
      />
    </Stack>
  );
}

function AgingChart({ boardId }: { boardId: number }) {
  const t = useT();
  const { data, isLoading, error } = useAging(boardId);
  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} />;
  if (!data || !data.items.length) return <Empty title={t.shell.flowCharts.noneInProgress}>{t.shell.flowCharts.noneInProgressBody}</Empty>;
  const columns = data.columns.length ? data.columns : [...new Set(data.items.map((i) => i.column))];
  const p85 = data.percentiles.p85;
  return (
    <EChart
      label={t.shell.flowCharts.agingLabel(data.items.length, fmtNum(p85))}
      deps={[data]}
      build={(p) => ({
        tooltip: {
          trigger: 'item',
          formatter: (params: unknown) => {
            const v = (params as { data: [string, number, string, string, string | null] }).data;
            return `${v[2]} — ${v[3]}<br/>${t.shell.flowCharts.agingTip(fmtNum(v[1]))}${v[4] ? ` · ${v[4]}` : ''}`;
          },
        },
        xAxis: { type: 'category', data: columns, ...axisStyle(p) },
        yAxis: { type: 'value', name: t.shell.flowCharts.days, ...axisStyle(p) },
        series: [
          {
            type: 'scatter',
            symbolSize: 11,
            data: data.items.map((i) => ({
              value: [i.column, i.age_days, i.key, i.summary, i.assignee],
              itemStyle: { color: i.threshold_days != null && i.age_days > i.threshold_days ? p.risk : p.progress },
              symbol: i.threshold_days != null && i.age_days > i.threshold_days ? 'diamond' : 'circle',
            })),
            markLine:
              p85 != null
                ? { symbol: 'none', lineStyle: { color: p.warn, type: 'dashed' }, label: { formatter: `P85 ${fmtDays(p85)}`, color: p.text }, data: [{ yAxis: p85 }] }
                : undefined,
          },
        ],
      })}
    />
  );
}

function CommittedVsDelivered({ boardId }: { boardId: number }) {
  const t = useT();
  const { data, isLoading, error } = useCvd(boardId);
  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} />;
  if (!data || !data.items.length) return <Empty title={t.shell.flowCharts.noSprints}>{t.shell.flowCharts.noSprintsBody}</Empty>;
  const rows = data.items;
  return (
    <EChart
      label={t.shell.flowCharts.cvdLabel(rows.map((r) => t.shell.flowCharts.cvdRow(r.sprint.name, r.delivered, r.committed, r.added)).join('; '))}
      deps={[data]}
      build={(p) => ({
        tooltip: { trigger: 'axis' },
        legend: { top: 0, textStyle: { color: p.text } },
        xAxis: { type: 'category', data: rows.map((r) => r.sprint.name), ...axisStyle(p) },
        yAxis: { type: 'value', minInterval: 1, ...axisStyle(p) },
        series: [
          { name: t.shell.flowCharts.committed, type: 'bar', itemStyle: { color: p.todo }, data: rows.map((r) => r.committed) },
          { name: t.shell.flowCharts.delivered, type: 'bar', itemStyle: { color: p.done }, data: rows.map((r) => r.delivered) },
          { name: t.shell.flowCharts.added, type: 'bar', itemStyle: { color: p.added }, data: rows.map((r) => r.added) },
        ],
      })}
    />
  );
}

/** RF-33 flow views for one board. */
export function FlowCharts({ boardId, start, end }: { boardId: number; start?: string; end?: string }) {
  const t = useT();
  return (
    <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
      <ChartCard title={t.shell.flowCharts.cfdTitle} caption={t.shell.flowCharts.cfdCaption}>
        <CumulativeFlow boardId={boardId} start={start} end={end} />
      </ChartCard>
      <ChartCard title={t.shell.flowCharts.cycleTitle} caption={t.shell.flowCharts.cycleCaption}>
        <CycleScatter boardId={boardId} start={start} end={end} />
      </ChartCard>
      <ChartCard title={t.shell.flowCharts.agingTitle} caption={t.shell.flowCharts.agingCaption}>
        <AgingChart boardId={boardId} />
      </ChartCard>
      <ChartCard title={t.shell.flowCharts.cvdTitle} caption={t.shell.flowCharts.cvdCaption}>
        <CommittedVsDelivered boardId={boardId} />
      </ChartCard>
    </SimpleGrid>
  );
}
