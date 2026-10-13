import { Anchor, Group, MultiSelect, Paper, Select, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { Link } from 'react-router';

import { useBoards, useBoardSprints, useFlow } from '../api/hooks';
import { Empty, ErrorState, ExportMenu, Freshness, KpiCard, Loading, Note, PageHeader, Percentiles, Stat } from '../components/common';
import { axisStyle, EChart } from '../components/EChart';
import { FlowCharts } from '../components/FlowCharts';
import { useFilters } from '../lib/filters';
import { HELP } from '../lib/indicatorHelp';
import { fmtDate, fmtNum, fmtPct, plural } from '../lib/format';

/** RF-20 … RF-22: flow metrics per board, people alphabetical against the boards' median. */
export function FlowPage() {
  const { get, set, carry } = useFilters();
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
        title="Métricas de fluxo"
        subtitle="Números para sustentar conversa: percentis com tamanho de amostra, nunca médias ou rankings."
        actions={
          <>
            <ExportMenu label="Exportar itens" dataset="flow" params={{ board_id: filters.board, type: filters.type, start: filters.start, end: filters.end }} />
            <ExportMenu label="Exportar por pessoa" dataset="flow_people" params={{ board_id: filters.board, start: filters.start, end: filters.end }} />
          </>
        }
      />
      {soleBoard.data && <Freshness freshness={soleBoard.data.freshness} />}
      <Group align="flex-end" mb="md" wrap="wrap">
        <MultiSelect
          label="Boards"
          placeholder="Todos os acompanhados"
          data={(boards.data?.items ?? []).map((b) => ({ value: String(b.id), label: b.name }))}
          value={filters.board ? filters.board.split(',') : []}
          onChange={(value) => set({ board: value.join(',') })}
          w={280}
          clearable
        />
        <Select label="Tipo" placeholder="Todos" data={types} value={filters.type ?? null} onChange={(value) => set({ type: value })} clearable w={160} />
        <DatePickerInput
          type="range"
          label="Período (conclusão)"
          placeholder="últimas 12 semanas"
          description={data ? `Período: ${fmtDate(data.period.start, true)} a ${fmtDate(data.period.end, true)}` : undefined}
          value={range}
          onChange={(value) => set({ start: value[0] ?? undefined, end: value[1] ?? undefined })}
          clearable
          w={260}
          valueFormat="DD/MM/YYYY"
        />
      </Group>
      {flow.isLoading && <Loading rows={6} />}
      {flow.error && <ErrorState error={flow.error} />}
      {data && (
        <Stack gap="lg">
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
            <Stat label="Itens concluídos" help={HELP['flow:completed']} value={data.summary.completed} />
            <KpiCard label="Lead time · P85" help={HELP['flow:lead']} value={data.summary.lead_time.n ? `${fmtNum(data.summary.lead_time.p85)} d` : '—'}>
              <Percentiles dist={data.summary.lead_time} />
              criação → conclusão
            </KpiCard>
            <KpiCard label="Cycle time · P85" help={HELP['flow:cycle']} value={data.summary.cycle_time.n ? `${fmtNum(data.summary.cycle_time.p85)} d` : '—'}>
              <Percentiles dist={data.summary.cycle_time} />
              início → conclusão
            </KpiCard>
            <Stat label="Em andamento (média diária)" help={HELP['flow:wip']} value={fmtNum(data.wip_average)} />
            <Stat label="Eficiência de fluxo" help={HELP['flow:efficiency']} value={fmtPct(data.summary.flow_efficiency)} hint="tempo ativo ÷ lead time" />
            <Stat label="Aderência ao compromisso" help={HELP['flow:adherence']} value={fmtPct(data.commitment_adherence)} hint="mediana das sprints encerradas" />
            <Stat label="Taxa de arrasto" help={HELP['flow:carryover']} value={fmtPct(data.carryover_rate)} hint="mediana das sprints encerradas" />
            <Stat label="Taxa de reabertura" help={HELP['flow:reopen']} value={fmtPct(data.summary.reopen_rate)} hint={plural(data.summary.backward_moves, 'transição para trás', 'transições para trás')} />
          </SimpleGrid>
          {data.summary.completed === 0 ? (
            <Empty
              title="Nenhum item concluído neste período"
              action={
                filters.start || filters.end ? { label: 'Ampliar o período', onClick: () => set({ start: undefined, end: undefined }) } : undefined
              }
            >
              Os gráficos de vazão e de mix aparecem quando houver conclusões no período escolhido.
            </Empty>
          ) : (
            <SimpleGrid cols={{ base: 1, lg: 2 }}>
              <Paper withBorder p="md">
                <Title order={4}>Vazão por semana</Title>
                <EChart
                  label={`Itens concluídos por semana: ${data.throughput.map((t) => t.count).join(', ')}`}
                  deps={[data]}
                  height={260}
                  build={(p) => ({
                    tooltip: { trigger: 'axis' },
                    xAxis: { type: 'category', data: data.throughput.map((t) => fmtDate(t.end)), ...axisStyle(p) },
                    yAxis: { type: 'value', minInterval: 1, ...axisStyle(p) },
                    series: [{ type: 'bar', name: 'Concluídos', itemStyle: { color: p.done }, data: data.throughput.map((t) => t.count) }],
                  })}
                />
              </Paper>
              <Paper withBorder p="md">
                <Title order={4}>Distribuição do trabalho</Title>
                <Text size="xs" c="dimmed">
                  Quanto do que saiu foi bug, história, tarefa…
                </Text>
                <EChart
                  label={`Concluídos por tipo: ${Object.entries(data.summary.work_mix).map(([k, v]) => `${k} ${v}`).join(', ')}`}
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
            <Note>Escolha um board para ver fluxo cumulativo, cycle time e envelhecimento.</Note>
          )}
          <Stack gap="xs">
            <Title order={4}>Por pessoa</Title>
            <Note title="Por que não há ranking">{data.note}</Note>
            <Table.ScrollContainer minWidth={760}>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Pessoa (ordem alfabética)</Table.Th>
                    <Table.Th className="num">Concluídos</Table.Th>
                    <Table.Th>Cycle time</Table.Th>
                    <Table.Th>P50 frente à mediana dos boards</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.people.map((p) => (
                    <Table.Tr key={p.account_id ?? 'none'}>
                      <Table.Td>
                        {p.account_id ? (
                          <Anchor component={Link} to={carry(`/pessoas/${encodeURIComponent(p.account_id)}`)}>
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
                          ? `${fmtNum(p.cycle_time.p50)} d vs ${fmtNum(overallP50)} d dos boards`
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
