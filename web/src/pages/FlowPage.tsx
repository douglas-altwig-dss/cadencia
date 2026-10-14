import { Anchor, Group, MultiSelect, Paper, Select, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { Link } from 'react-router';

import { useBoards, useBoardSprints, useFlow } from '../api/hooks';
import { Empty, ErrorState, ExportMenu, Freshness, KpiCard, Loading, Note, PageHeader, Percentiles, Stat } from '../components/common';
import { axisStyle, EChart } from '../components/EChart';
import { FlowCharts } from '../components/FlowCharts';
import { useT } from '../i18n';
import { useFilters } from '../lib/filters';
import { HELP } from '../lib/indicatorHelp';
import { fmtDate, fmtNum, fmtPct } from '../lib/format';

/** RF-20 … RF-22: flow metrics per board, people alphabetical against the boards' median. */
export function FlowPage() {
  const { get, set, carry } = useFilters();
  const m = useT().tracking.flow;
  const filters = { board: get('board'), type: get('type'), start: get('start'), end: get('end') };
  const boards = useBoards('', 1, 200, true);
  const flow = useFlow(filters);
  const data = flow.data;
  // This page has no freshness of its own — it can span every board. When exactly one is chosen,
  // though, its own staleness (and a failed-collection alert) is worth the same one call the board
  // page already makes for it, instead of leaving the header pill as the only signal.
  const soleBoardId = filters.board && !filters.board.includes(',') ? Number(filters.board) : undefined;
  const soleBoard = useBoardSprints(soleBoardId);

  const range: [string | null, string | null] = [filters.start ?? null, filters.end ?? null];
  const types = data ? Object.keys(data.summary.work_mix) : [];
  const overallP50 = data?.summary.cycle_time.p50 ?? null;

  return (
    <>
      <PageHeader
        title={m.title}
        subtitle={m.subtitle}
        actions={
          <>
            <ExportMenu label={m.exportItems} dataset="flow" params={{ board_id: filters.board, type: filters.type, start: filters.start, end: filters.end }} />
            <ExportMenu label={m.exportPeople} dataset="flow_people" params={{ board_id: filters.board, start: filters.start, end: filters.end }} />
          </>
        }
      />
      {soleBoard.data && <Freshness freshness={soleBoard.data.freshness} />}
      <Group align="flex-end" mb="md" wrap="wrap">
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
              action={
                filters.start || filters.end ? { label: m.widenPeriod, onClick: () => set({ start: undefined, end: undefined }) } : undefined
              }
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
          {soleBoardId ? (
            <FlowCharts boardId={soleBoardId} start={filters.start} end={filters.end} />
          ) : (
            <Note>{m.chooseBoard}</Note>
          )}
          <Stack gap="xs">
            <Title order={4}>{m.byPerson}</Title>
            <Note title={m.whyNoRanking}>{data.note}</Note>
            <Table.ScrollContainer minWidth={760}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{m.colPerson}</Table.Th>
                    <Table.Th className="num">{m.colCompleted}</Table.Th>
                    <Table.Th>{m.colCycle}</Table.Th>
                    <Table.Th>{m.colVsMedian}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.people.map((p) => (
                    <Table.Tr key={p.account_id ?? 'none'}>
                      <Table.Td>
                        {p.account_id ? (
                          <Anchor component={Link} to={carry(`/people/${encodeURIComponent(p.account_id)}`)}>
                            {p.name}
                          </Anchor>
                        ) : (
                          p.name
                        )}
                      </Table.Td>
                      <Table.Td className="num">{p.completed}</Table.Td>
                      <Table.Td>
                        <Percentiles dist={p.cycle_time} />
                      </Table.Td>
                      <Table.Td>
                        {p.cycle_time.p50 != null && overallP50 != null
                          ? m.vsMedian(fmtNum(p.cycle_time.p50), fmtNum(overallP50))
                          : '—'}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Stack>
        </Stack>
      )}
    </>
  );
}
