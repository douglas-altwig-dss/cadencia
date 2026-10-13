import { Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';

import { useAging, useCfd, useCvd, useScatter } from '../api/hooks';
import { fmtDate, fmtNum } from '../lib/format';
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
  const { data, isLoading, error } = useCfd(boardId, start, end);
  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} />;
  if (!data || !data.dates.length) return <Empty title="Sem dados no período" action={{ label: 'Ver o status da coleta', to: '/status' }}>Amplie o período nos filtros ou confira se a última coleta deste board terminou.</Empty>;
  const columns = [...data.columns].reverse(); // done at the bottom, backlog on top
  return (
    <EChart
      label={`Fluxo cumulativo de ${data.dates[0]} a ${data.dates[data.dates.length - 1]} por coluna: ${data.columns.map((c) => c.name).join(', ')}`}
      deps={[data]}
      build={(p) => ({
        tooltip: { trigger: 'axis' },
        legend: { top: 0, textStyle: { color: p.text } },
        xAxis: { type: 'category', boundaryGap: false, data: data.dates.map((d) => d.slice(8, 10) + '/' + d.slice(5, 7)), ...axisStyle(p) },
        yAxis: { type: 'value', minInterval: 1, ...axisStyle(p) },
        color: [p.done, p.progress, p.warn, p.todo, p.added, p.risk],
        series: columns.map((c) => ({ name: c.name, type: 'line', stack: 'cfd', areaStyle: { opacity: 0.85 }, symbol: 'none', lineStyle: { width: 0.5 }, data: c.counts })),
      })}
    />
  );
}

function CycleScatter({ boardId, start, end }: { boardId: number; start?: string; end?: string }) {
  const { data, isLoading, error } = useScatter(boardId, start, end);
  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} />;
  if (!data || !data.points.length) return <Empty title="Nenhum item concluído no período">Amplie o período nos filtros: o gráfico precisa de itens que já terminaram para mostrar o tempo de ciclo.</Empty>;
  const pct = data.percentiles;
  const lines = (['p50', 'p85', 'p95'] as const)
    .filter((k) => pct[k] != null)
    .map((k) => ({ yAxis: pct[k] as number, name: k.toUpperCase(), label: { formatter: `${k.toUpperCase()} ${fmtNum(pct[k])} d` } }));
  return (
    <Stack gap={4}>
      <Percentiles dist={pct} />
      <EChart
        label={`Cycle time de ${data.points.length} itens concluídos; P50 ${fmtNum(pct.p50)} dias, P85 ${fmtNum(pct.p85)}, P95 ${fmtNum(pct.p95)}`}
        deps={[data]}
        build={(p) => ({
          tooltip: {
            trigger: 'item',
            formatter: (params: unknown) => {
              const v = (params as { data: [string, number, string, string] }).data;
              return `${v[2]} — ${v[3]}<br/>${fmtNum(v[1])} dias · concluído em ${fmtDate(v[0])}`;
            },
          },
          xAxis: { type: 'time', ...axisStyle(p) },
          yAxis: { type: 'value', name: 'dias', ...axisStyle(p) },
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
  const { data, isLoading, error } = useAging(boardId);
  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} />;
  if (!data || !data.items.length) return <Empty title="Nenhum item em andamento">Nada nas colunas de andamento deste board agora. Se isso não bate com o Jira, confira as colunas em Configuração → Perfil do board.</Empty>;
  const columns = data.columns.length ? data.columns : [...new Set(data.items.map((i) => i.column))];
  const p85 = data.percentiles.p85;
  return (
    <EChart
      label={`${data.items.length} itens em andamento por coluna; limite P85 histórico ${fmtNum(p85)} dias`}
      deps={[data]}
      build={(p) => ({
        tooltip: {
          trigger: 'item',
          formatter: (params: unknown) => {
            const v = (params as { data: [string, number, string, string, string | null] }).data;
            return `${v[2]} — ${v[3]}<br/>${fmtNum(v[1])} dias em andamento${v[4] ? ` · ${v[4]}` : ''}`;
          },
        },
        xAxis: { type: 'category', data: columns, ...axisStyle(p) },
        yAxis: { type: 'value', name: 'dias', ...axisStyle(p) },
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
                ? { symbol: 'none', lineStyle: { color: p.warn, type: 'dashed' }, label: { formatter: `P85 ${fmtNum(p85)} d`, color: p.text }, data: [{ yAxis: p85 }] }
                : undefined,
          },
        ],
      })}
    />
  );
}

function CommittedVsDelivered({ boardId }: { boardId: number }) {
  const { data, isLoading, error } = useCvd(boardId);
  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} />;
  if (!data || !data.items.length) return <Empty title="Sem sprints para comparar">O comparativo aparece depois da primeira sprint encerrada com compromisso registrado.</Empty>;
  const rows = data.items;
  return (
    <EChart
      label={`Comprometido versus entregue: ${rows.map((r) => `${r.sprint.name} ${r.delivered} de ${r.committed}, ${r.added} adicionados`).join('; ')}`}
      deps={[data]}
      build={(p) => ({
        tooltip: { trigger: 'axis' },
        legend: { top: 0, textStyle: { color: p.text } },
        xAxis: { type: 'category', data: rows.map((r) => r.sprint.name), ...axisStyle(p) },
        yAxis: { type: 'value', minInterval: 1, ...axisStyle(p) },
        series: [
          { name: 'Comprometido no início', type: 'bar', itemStyle: { color: p.todo }, data: rows.map((r) => r.committed) },
          { name: 'Entregue do compromisso', type: 'bar', itemStyle: { color: p.done }, data: rows.map((r) => r.delivered) },
          { name: 'Escopo adicionado', type: 'bar', itemStyle: { color: p.added }, data: rows.map((r) => r.added) },
        ],
      })}
    />
  );
}

/** RF-33 flow views for one board. */
export function FlowCharts({ boardId, start, end }: { boardId: number; start?: string; end?: string }) {
  return (
    <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
      <ChartCard title="Fluxo cumulativo" caption="Itens por coluna, dia a dia: faixas que engordam mostram acúmulo.">
        <CumulativeFlow boardId={boardId} start={start} end={end} />
      </ChartCard>
      <ChartCard title="Cycle time" caption="Cada ponto é um item concluído; linhas tracejadas são os percentis 50, 85 e 95.">
        <CycleScatter boardId={boardId} start={start} end={end} />
      </ChartCard>
      <ChartCard title="Envelhecimento do trabalho em andamento" caption="Idade de cada item aberto por coluna; losangos passaram do P85 histórico do tipo.">
        <AgingChart boardId={boardId} />
      </ChartCard>
      <ChartCard title="Comprometido × entregue" caption="Escopo que entrou depois do início aparece à parte, para não confundir compromisso com demanda nova.">
        <CommittedVsDelivered boardId={boardId} />
      </ChartCard>
    </SimpleGrid>
  );
}
