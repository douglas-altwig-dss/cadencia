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
import { useT } from '../i18n';
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
  const t = useT();
  const m = t.tracking.epic;

  if (epic.isLoading) return <Loading rows={8} />;
  if (epic.error) return <ErrorState error={epic.error} />;
  if (!epic.data) return null;
  const data = epic.data;
  const sprint = board.data?.sprints.find((s) => String(s.id) === sprintId);
  const crumbs = [
    { label: t.tracking.crumbs.home, to: '/' },
    { label: board.data?.board.name ?? t.tracking.crumbs.board(boardId), to: `/boards/${boardId}` },
    ...(sprint ? [{ label: sprint.name, to: `/boards/${boardId}/sprints/${sprint.id}?tab=arvore` }] : []),
    { label: key },
  ];

  const tab = get('tab') ?? 'visao';
  const estimate = data.tree?.estimate_rollup;

  return (
    <>
      <PageHeader title={data.epic.summary} subtitle={m.subtitle(key)} crumbs={crumbs} />
      <Freshness freshness={data.freshness} />
      {/* Not the tree/plan's own content, so it stays above the tabs: it is true whichever one is open. */}
      <Group gap="xs" mb="md">
        <IssueLink issue={data.epic} showSummary={false} />
        <IssueStatusBadge status={data.epic.status} category={data.epic.category} />
        <Text size="sm" c="dimmed">
          {data.epic.due_date ? m.dueDate(fmtDay(data.epic.due_date)) : m.noDueDate}
        </Text>
      </Group>
      <Box mb="md">
        <ItemDescription text={data.description} />
      </Box>
      <Tabs value={tab} onChange={(value) => set({ tab: value })} keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="visao">{m.tabOverview}</Tabs.Tab>
          <Tabs.Tab value="plano">{m.tabPlan}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="plano">
          <EpicPlanTab epicKey={key} />
        </Tabs.Panel>
        <Tabs.Panel value="visao">
          <Stack gap="md">
            {/* Numbers first, then the forecast, then the items they add up from. */}
            <SimpleGrid cols={{ base: 1, md: 3 }}>
              <KpiCard label={m.progress} help={HELP['epic:progress']}>
                <ProgressBars progress={data.tree?.progress ?? null} />
              </KpiCard>
              <KpiCard label={m.risk} help={HELP['epic:risk']}>
                <RiskCountsInline counts={data.risk_counts} />
              </KpiCard>
              <KpiCard
                label={m.estimate}
                help={HELP['epic:estimate']}
                value={estimate != null ? m.points(fmtNum(estimate)) : '—'}
              />
            </SimpleGrid>
            <ForecastCard query={forecast} />
            {data.tree && data.tree.children.length ? (
              <TreeTable nodes={data.tree.children} boardId={boardId} sprintId={sprintId ? Number(sprintId) : undefined} />
            ) : (
              <Empty title={m.empty} />
            )}
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </>
  );
}
