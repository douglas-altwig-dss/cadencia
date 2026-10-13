import { Anchor, Button, SimpleGrid, Stack, Table, Tabs, Text } from '@mantine/core';
import { Link, Navigate, useParams } from 'react-router';

import { useBoardForecast } from '../api/featureHooks';
import { useBoardOverview, useBoardSprints, useBoardTree } from '../api/hooks';
import type { BoardOverview } from '../api/types';
import { Empty, ErrorState, Freshness, KpiCard, Loading, PageHeader } from '../components/common';
import { ChangesPanel } from '../components/ChangesPanel';
import { ForecastCard } from '../components/ForecastCard';
import { RiskCountsInline } from '../components/risk';
import { RiskTable } from '../components/RiskTable';
import { TreeTable } from '../components/TreeTable';
import { WeeklyWindows } from '../components/WeeklyWindows';
import { useT } from '../i18n';
import { useFilters } from '../lib/filters';
import { HELP } from '../lib/indicatorHelp';
import { fmtDate } from '../lib/format';

/** RF-113: a kanban board's own "Visão geral" — the forecast and the weekly windows a sprint's
 * overview gives, built from the calendar instead of a sprint it does not have. */
function BoardOverviewTab({ boardId, data }: { boardId: number; data: BoardOverview }) {
  const forecast = useBoardForecast(boardId);
  const t = useT();
  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <KpiCard label={t.tracking.board.riskByItem} help={HELP['board:risk']}>
          <RiskCountsInline counts={data.risk_counts} />
        </KpiCard>
        <ForecastCard query={forecast} />
      </SimpleGrid>
      <WeeklyWindows windows={data.timeline.windows} items={data.items} kind="board" />
    </Stack>
  );
}

function BoardTreeTab({ boardId }: { boardId: number }) {
  const { data, isLoading, error } = useBoardTree(boardId);
  const t = useT();
  if (isLoading) return <Loading rows={8} />;
  if (error) return <ErrorState error={error} />;
  if (!data?.nodes.length) {
    return (
      <Empty title={t.tracking.board.treeEmptyTitle} action={{ label: t.tracking.board.seeCollectionStatus, to: '/status' }}>
        {t.tracking.board.treeEmptyBody}
      </Empty>
    );
  }
  return <TreeTable nodes={data.nodes} boardId={boardId} />;
}

/** A board: scrum boards open their current sprint; kanban boards show their own overview, work
 * tree, open work and flow — the same shape of screen a sprint gets, built from the calendar and
 * from what is open right now instead of from a sprint's own membership (RF-113). */
export function BoardPage() {
  const boardId = Number(useParams().boardId);
  const { carry, get, set } = useFilters();
  const { data, isLoading, error } = useBoardSprints(boardId);
  const overview = useBoardOverview(boardId);
  const t = useT();
  const m = t.tracking.board;

  if (isLoading) return <Loading rows={6} />;
  if (error) return <ErrorState error={error} />;
  if (!data) return null;
  if (data.current_sprint_id) return <Navigate to={carry(`/boards/${boardId}/sprints/${data.current_sprint_id}`)} replace />;

  const tab = get('tab') ?? 'visao';
  return (
    <>
      <PageHeader
        title={data.board.name}
        subtitle={data.board.type === 'kanban' ? m.kanbanSubtitle : m.noActiveSprint}
        crumbs={[{ label: t.tracking.crumbs.home, to: '/' }, { label: data.board.name }]}
      />
      <Freshness freshness={data.freshness} />
      <Tabs value={tab} onChange={(value) => set({ tab: value })} keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="visao">{m.tabOverview}</Tabs.Tab>
          <Tabs.Tab value="arvore">{m.tabTree}</Tabs.Tab>
          <Tabs.Tab value="riscos">{m.tabOpen}</Tabs.Tab>
          <Tabs.Tab value="fluxo">{m.tabFlow}</Tabs.Tab>
          {data.sprints.length > 0 && <Tabs.Tab value="sprints">{m.tabSprints}</Tabs.Tab>}
          <Tabs.Tab value="mudancas">{m.tabChanges}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="visao">
          {overview.isLoading && <Loading rows={6} />}
          {overview.error ? <ErrorState error={overview.error} /> : overview.data ? <BoardOverviewTab boardId={boardId} data={overview.data} /> : null}
        </Tabs.Panel>
        <Tabs.Panel value="arvore">
          <BoardTreeTab boardId={boardId} />
        </Tabs.Panel>
        <Tabs.Panel value="mudancas">
          <ChangesPanel boardId={boardId} />
        </Tabs.Panel>
        <Tabs.Panel value="riscos">
          <RiskTable boardId={boardId} />
        </Tabs.Panel>
        <Tabs.Panel value="fluxo">
          <Stack align="flex-start">
            <Text size="sm" c="dimmed">
              {m.flowHint}
            </Text>
            <Button component={Link} to={`/fluxo?board=${boardId}`} variant="light">
              {m.openInFlow}
            </Button>
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="sprints">
          <Stack>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{m.colSprint}</Table.Th>
                  <Table.Th>{m.colState}</Table.Th>
                  <Table.Th>{m.colPeriod}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.sprints.map((s) => (
                  <Table.Tr key={s.id}>
                    <Table.Td>
                      <Anchor component={Link} to={carry(`/boards/${boardId}/sprints/${s.id}`)} size="sm">
                        {s.name}
                      </Anchor>
                    </Table.Td>
                    <Table.Td>{m.sprintState[s.state]}</Table.Td>
                    <Table.Td>
                      {fmtDate(s.start)} – {fmtDate(s.end)}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </>
  );
}
