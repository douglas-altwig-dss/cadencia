import { Group, MultiSelect, Paper, Select, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';

import { useBoards, useBoardSprints, useFlow } from '../../api/hooks';
import { useT } from '../../i18n';
import { useFilters } from '../../lib/filters';
import { fmtDate, fmtNum, fmtPct } from '../../lib/format';
import { HELP } from '../../lib/indicatorHelp';
import { Empty, ErrorState, Freshness, KpiCard, Loading, Note, Percentiles, Stat } from '../common';
import { axisStyle, EChart } from '../EChart';
import { FlowCharts } from '../FlowCharts';

export const FLOW_ANCHOR = 'flow';

/** Smooth unless the person asked for less motion, here or in the system. */
function scrollBehavior(): ScrollBehavior {
  const reduced = document.documentElement.dataset.motion === 'reduzido' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return reduced ? 'auto' : 'smooth';
}

/**
 * RF-20 … RF-22: flow metrics for the boards in the filter (every tracked one when none is chosen),
 * the second half of the Boards page. Arriving with `#flow` — the old Flow page's redirect, or a
 * card's "Flow metrics" — scrolls here once the page above has rendered, so it lands where it stays.
 */
export function FlowSection({ ready }: { ready: boolean }) {
  const { get, set } = useFilters();
  const m = useT().tracking.flow;
  const location = useLocation();
  const section = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef<string | null>(null);
  const filters = { board: get('board'), type: get('type'), start: get('start'), end: get('end') };
  const boards = useBoards('', 1, 200, true);
  const flow = useFlow(filters);
  const data = flow.data;
  // The section can span every board. When exactly one is chosen, its own staleness (and a
  // failed-collection alert) is worth the same one call the board page already makes for it.
  const soleBoardId = filters.board && !filters.board.includes(',') ? Number(filters.board) : undefined;
  const soleBoard = useBoardSprints(soleBoardId);

  const settled = ready && !flow.isLoading;
  useEffect(() => {
    if (location.hash !== `#${FLOW_ANCHOR}` || !settled || scrolledFor.current === location.key) return;
    scrolledFor.current = location.key;
    // After the frame that laid the data out, so the target does not move under the scroll.
    const frame = requestAnimationFrame(() => section.current?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' }));
    return () => cancelAnimationFrame(frame);
  }, [location.hash, location.key, settled]);

  const range: [string | null, string | null] = [filters.start ?? null, filters.end ?? null];
  const types = data ? Object.keys(data.summary.work_mix) : [];

  return (
    <Stack component="section" id={FLOW_ANCHOR} ref={section} className="boards-flow" gap="md" aria-labelledby="flow-title">
      <Stack gap={4}>
        <Title order={3} id="flow-title">
          {m.title}
        </Title>
        <Text size="sm" c="dimmed" maw={820}>
          {m.subtitle}
        </Text>
      </Stack>
      {soleBoard.data && <Freshness freshness={soleBoard.data.freshness} />}
      <Group align="flex-end" wrap="wrap">
        <MultiSelect
          label={m.boards}
          placeholder={m.allTracked}
          data={(boards.data?.items ?? []).map((b) => ({ value: String(b.id), label: b.name }))}
          value={filters.board ? filters.board.split(',') : []}
          onChange={(value) => set({ board: value.join(',') })}
          w={280}
          clearable
        />
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
          {soleBoardId ? <FlowCharts boardId={soleBoardId} start={filters.start} end={filters.end} /> : <Note>{m.chooseBoard}</Note>}
        </Stack>
      )}
    </Stack>
  );
}
