import { Box, Group, SimpleGrid, Stack, Tabs, Text } from '@mantine/core';
import { useParams } from 'react-router';

import { useEpicForecast } from '../api/featureHooks';
import { useBoardSprints, useEpic } from '../api/hooks';
import { Empty, ErrorState, Freshness, IssueLink, IssueStatusBadge, KpiCard, Loading, PageHeader, ProgressBars } from '../components/common';
import { EpicPlanTab } from '../components/epicPlan/EpicPlanTab';
import { ForecastCard } from '../components/ForecastCard';
import { ItemDescription } from '../components/ItemDescription';
import { RiskCountsInline } from '../components/risk';
import { TreeTable } from '../components/TreeTable';
import { useFilters } from '../lib/filters';
import { fmtDay, fmtNum } from '../lib/format';
import { HELP } from '../lib/indicatorHelp';

/** Épico across every sprint: how much has shipped and how much is left, and its plan. */
export function EpicPage() {
  const params = useParams();
  const boardId = Number(params.boardId);
  const key = params.epicKey!;
  const { get, set } = useFilters();
  const sprintId = get('sprint');
  const board = useBoardSprints(boardId);
  const epic = useEpic(key, boardId);
  const forecast = useEpicForecast(key, boardId);

  if (epic.isLoading) return <Loading rows={8} />;
  if (epic.error) return <ErrorState error={epic.error} />;
  if (!epic.data) return null;
  const data = epic.data;
  const sprint = board.data?.sprints.find((s) => String(s.id) === sprintId);
  const crumbs = [
    { label: 'Painel', to: '/' },
    { label: board.data?.board.name ?? `Board ${boardId}`, to: `/boards/${boardId}` },
    ...(sprint ? [{ label: sprint.name, to: `/boards/${boardId}/sprints/${sprint.id}?tab=arvore` }] : []),
    { label: key },
  ];

  const tab = get('tab') ?? 'visao';
  const estimate = data.tree?.estimate_rollup;

  return (
    <>
      <PageHeader title={data.epic.summary} subtitle={`Épico ${key} · todas as sprints`} crumbs={crumbs} />
      <Freshness freshness={data.freshness} />
      {/* Not the tree/plan's own content, so it stays above the tabs: it is true whichever one is open. */}
      <Group gap="xs" mb="md">
        <IssueLink issue={data.epic} showSummary={false} />
        <IssueStatusBadge status={data.epic.status} category={data.epic.category} />
        <Text size="sm" c="dimmed">
          {data.epic.due_date ? `data limite ${fmtDay(data.epic.due_date)}` : 'data limite não definida'}
        </Text>
      </Group>
      <Box mb="md">
        <ItemDescription text={data.description} />
      </Box>
      <Tabs value={tab} onChange={(value) => set({ tab: value })} keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="visao">Visão geral</Tabs.Tab>
          <Tabs.Tab value="plano">Plano</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="plano">
          <EpicPlanTab epicKey={key} />
        </Tabs.Panel>
        <Tabs.Panel value="visao">
          <Stack gap="md">
            {/* Numbers first, then the forecast, then the items they add up from. */}
            <SimpleGrid cols={{ base: 1, md: 3 }}>
              <KpiCard label="Progresso dos filhos diretos" help={HELP['epic:progress']}>
                <ProgressBars progress={data.tree?.progress ?? null} />
              </KpiCard>
              <KpiCard label="Situação dos itens abertos" help={HELP['epic:risk']}>
                <RiskCountsInline counts={data.risk_counts} />
              </KpiCard>
              <KpiCard
                label="Estimativa acumulada"
                help={HELP['epic:estimate']}
                value={estimate != null ? `${fmtNum(estimate)} pts` : '—'}
              />
            </SimpleGrid>
            <ForecastCard query={forecast} />
            {data.tree && data.tree.children.length ? (
              <TreeTable nodes={data.tree.children} boardId={boardId} sprintId={sprintId ? Number(sprintId) : undefined} />
            ) : (
              <Empty title="Este épico não tem itens coletados." />
            )}
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </>
  );
}
