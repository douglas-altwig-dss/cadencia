import { Group, Paper, Select, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';

import { useFlow } from '../api/hooks';
import { useT } from '../i18n';
import { useFilters } from '../lib/filters';
import { fmtDate, fmtNum, fmtPct } from '../lib/format';
import { HELP } from '../lib/indicatorHelp';
import { Empty, ErrorState, ExportMenu, KpiCard, Loading, Note, Percentiles, Stat } from './common';
import { axisStyle, EChart } from './EChart';
import { FlowCharts } from './FlowCharts';

/**
 * RF-20 … RF-22: flow metrics for a set of boards — one board's Flow tab, or every tracked board of
 * a space on the space's. The boards are the page's, not a filter: the work-item type and the period
 * stay in the URL (`type`, `start`, `end`) like every other shared filter. Cumulative flow, cycle
 * time and aging are drawn per board, so a space shows them only through its boards' own tabs.
 */
export function FlowSection({ boardIds }: { boardIds: number[] }) {
  const { get, set } = useFilters();
  const m = useT().tracking.flow;
  const board = boardIds.join(',');
  const filters = { board, type: get('type'), start: get('start'), end: get('end') };
  const flow = useFlow(filters, boardIds.length > 0);
  const data = flow.data;
  const sole = boardIds.length === 1 ? boardIds[0] : undefined;

  const range: [string | null, string | null] = [filters.start ?? null, filters.end ?? null];
  const types = data ? Object.keys(data.summary.work_mix) : [];

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed" maw={820}>
        {m.subtitle}
      </Text>
      <Group align="flex-end" wrap="wrap">
        <Select label={m.type} placeholder={m.all} data={types} value={filters.type ?? null} onChange={(value) => set({ type: value })} clearable w={160} />
        <DatePickerInput
          type="range"
          label={m.period}
          placeholder={m.periodPlaceholder}
          description={data ? m.periodDescription(fmtDate(data.period.start, true), fmtDate(data.period.end, true)) : undefined}
          value={range}
          onChange={(value) => set({ start: value[0] ?? undefined, end: value[1] ?? undefined })}
          clearable
          w={260}
          valueFormat={m.dateFormat}
        />
        <ExportMenu label={m.exportItems} dataset="flow" params={{ board_id: board, type: filters.type, start: filters.start, end: filters.end }} />
      </Group>
      {flow.isLoading && <Loading rows={6} />}
      {flow.error && <ErrorState error={flow.error} />}
      {data && (
        <Stack gap="lg">
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
            <Stat label={m.completed} help={HELP['flow:completed']} value={data.summary.completed} />
            <KpiCard label={m.leadP85} help={HELP['flow:lead']} value={data.summary.lead_time.n ? m.days(fmtNum(data.summary.lead_time.p85)) : '—'}>
              <Percentiles dist={data.summary.lead_time} />
              {m.leadHint}
            </KpiCard>
            <KpiCard label={m.cycleP85} help={HELP['flow:cycle']} value={data.summary.cycle_time.n ? m.days(fmtNum(data.summary.cycle_time.p85)) : '—'}>
              <Percentiles dist={data.summary.cycle_time} />
              {m.cycleHint}
            </KpiCard>
            <Stat label={m.wip} help={HELP['flow:wip']} value={fmtNum(data.wip_average)} />
            <Stat label={m.efficiency} help={HELP['flow:efficiency']} value={fmtPct(data.summary.flow_efficiency)} hint={m.efficiencyHint} />
            <Stat label={m.adherence} help={HELP['flow:adherence']} value={fmtPct(data.commitment_adherence)} hint={m.closedSprintsMedian} />
            <Stat label={m.carryover} help={HELP['flow:carryover']} value={fmtPct(data.carryover_rate)} hint={m.closedSprintsMedian} />
            <Stat label={m.reopen} help={HELP['flow:reopen']} value={fmtPct(data.summary.reopen_rate)} hint={m.backwardMoves(data.summary.backward_moves)} />
          </SimpleGrid>
          {data.summary.completed === 0 ? (
            <Empty
              title={m.emptyTitle}
              action={filters.start || filters.end ? { label: m.widenPeriod, onClick: () => set({ start: undefined, end: undefined }) } : undefined}
            >
              {m.emptyBody}
            </Empty>
          ) : (
            <SimpleGrid cols={{ base: 1, lg: 2 }}>
              <Paper withBorder p="md">
                <Title order={4}>{m.throughput}</Title>
                <EChart
                  label={m.throughputLabel(data.throughput.map((t) => t.count).join(', '))}
                  deps={[data]}
                  height={260}
                  build={(p) => ({
                    tooltip: { trigger: 'axis' },
                    xAxis: { type: 'category', data: data.throughput.map((t) => fmtDate(t.end)), ...axisStyle(p) },
                    yAxis: { type: 'value', minInterval: 1, ...axisStyle(p) },
                    series: [{ type: 'bar', name: m.seriesCompleted, itemStyle: { color: p.done }, data: data.throughput.map((t) => t.count) }],
                  })}
                />
              </Paper>
              <Paper withBorder p="md">
                <Title order={4}>{m.mix}</Title>
                <Text size="xs" c="dimmed">
                  {m.mixHint}
                </Text>
                <EChart
                  label={m.mixLabel(Object.entries(data.summary.work_mix).map(([k, v]) => `${k} ${v}`).join(', '))}
                  deps={[data]}
                  height={240}
                  build={(p) => ({
                    tooltip: { trigger: 'axis' },
                    xAxis: { type: 'value', minInterval: 1, ...axisStyle(p) },
                    yAxis: { type: 'category', data: Object.keys(data.summary.work_mix), ...axisStyle(p) },
                    series: [{ type: 'bar', itemStyle: { color: p.progress }, data: Object.values(data.summary.work_mix) }],
                  })}
                />
              </Paper>
            </SimpleGrid>
          )}
          {sole !== undefined ? <FlowCharts boardId={sole} start={filters.start} end={filters.end} /> : <Note>{m.chooseBoard}</Note>}
        </Stack>
      )}
    </Stack>
  );
}
