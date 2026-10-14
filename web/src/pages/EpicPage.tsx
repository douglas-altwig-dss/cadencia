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

/**
 * An epic across every sprint and every board: how much has shipped, how much is left, and its plan.
 * It lives at `/epics/<key>` because its children can sit on several boards; `?board=` says which
 * board it was opened from (and is read from), and `?sprint=` which sprint, for the way back.
 */
export function EpicPage() {
  const key = useParams().epicKey!;
  const { get, set } = useFilters();
  const sprintId = get('sprint');
  const requestedBoard = get('board');
  const fromBoard = requestedBoard && /^\d+$/.test(requestedBoard) ? Number(requestedBoard) : undefined;
  const epic = useEpic(key, fromBoard);
  const boardId = fromBoard ?? epic.data?.board.id;
  const board = useBoardSprints(boardId);
  const forecast = useEpicForecast(key, fromBoard);
  const t = useT();
  const m = t.tracking.epic;

  if (epic.isLoading) return <Loading rows={8} />;
  if (epic.error) return <ErrorState error={epic.error} />;
  if (!epic.data) return null;
  const data = epic.data;
  const home = boardId ?? data.board.id;
  const sprint = board.data?.sprints.find((s) => String(s.id) === sprintId);
  const crumbs = [
    { label: t.tracking.crumbs.home, to: '/' },
    ...(board.data?.board.space ? [{ label: board.data.board.space.name, to: `/spaces/${encodeURIComponent(board.data.board.space.key)}` }] : []),
    { label: board.data?.board.name ?? data.board.name, to: `/boards/${home}` },
    ...(sprint ? [{ label: sprint.name, to: `/boards/${home}/sprints/${sprint.id}?tab=work-tree` }] : []),
    { label: key },
  ];

  const tab = get('tab') ?? 'overview';
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
      {/* Keyed by the epic: switching to another one remounts the tabs, so no tab keeps the
          previous one's state (picked checkpoints, a what-if result, an open detail). */}
      <Tabs key={key} value={tab} onChange={(value) => set({ tab: value })} keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="overview">{m.tabOverview}</Tabs.Tab>
          <Tabs.Tab value="plan">{m.tabPlan}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="plan">
          <EpicPlanTab epicKey={key} />
        </Tabs.Panel>
        <Tabs.Panel value="overview">
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
              <TreeTable nodes={data.tree.children} boardId={home} sprintId={sprintId ? Number(sprintId) : undefined} />
            ) : (
              <Empty title={m.empty} />
            )}
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </>
  );
}
