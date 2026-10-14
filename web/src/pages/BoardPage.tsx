import { Anchor, Button, Group, Paper, SimpleGrid, Stack, Table, Tabs, Text, Title } from '@mantine/core';
import { IconArrowRight } from '@tabler/icons-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { useBoardForecast } from '../api/featureHooks';
import { useBoardOverview, useBoardSprints, useBoardTree } from '../api/hooks';
import type { BoardOverview, BoardSprints } from '../api/types';
import { BoardProfile, discardDialog } from '../components/BoardProfile';
import { Empty, ErrorState, Freshness, KpiCard, Loading, PageHeader, useConfirm } from '../components/common';
import { ChangesPanel } from '../components/ChangesPanel';
import { FlowSection } from '../components/FlowSection';
import { ForecastCard } from '../components/ForecastCard';
import { HealthPanel } from '../components/HealthPanel';
import { RiskCountsInline } from '../components/risk';
import { RiskTable } from '../components/RiskTable';
import { TreeTable } from '../components/TreeTable';
import { WeeklyWindows } from '../components/WeeklyWindows';
import { useT } from '../i18n';
import { useFilters } from '../lib/filters';
import { HELP } from '../lib/indicatorHelp';
import { fmtDate } from '../lib/format';

const TABS = ['overview', 'sprints', 'work-tree', 'risks', 'flow', 'changes', 'hygiene', 'settings'] as const;
type Tab = (typeof TABS)[number];

/** The running sprint, if there is one: the way into it from its board. */
function CurrentSprint({ boardId, sprints }: { boardId: number; sprints: BoardSprints }) {
  const m = useT().tracking.board;
  const { carry } = useFilters();
  const sprint = sprints.sprints.find((s) => s.id === sprints.current_sprint_id);
  if (!sprint) return null;
  return (
    <Paper withBorder p="md">
      <Group justify="space-between" wrap="wrap" gap="sm">
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Text className="kpi-label">{m.currentSprint}</Text>
          <Title order={4}>{sprint.name}</Title>
          <Text size="sm" c="dimmed">
            {fmtDate(sprint.start)} – {fmtDate(sprint.end)}
            {sprint.goal ? ` · ${sprint.goal}` : ''}
          </Text>
        </Stack>
        <Button component={Link} to={carry(`/boards/${boardId}/sprints/${sprint.id}`)} rightSection={<IconArrowRight size={16} />}>
          {m.openSprint}
        </Button>
      </Group>
    </Paper>
  );
}

/** RF-113: the board's own overview — the forecast and the weekly windows of the calendar, plus,
 * on a scrum board, the sprint that is running. */
function BoardOverviewTab({ boardId, data, sprints }: { boardId: number; data: BoardOverview; sprints: BoardSprints }) {
  const forecast = useBoardForecast(boardId);
  const t = useT();
  return (
    <Stack gap="md">
      <CurrentSprint boardId={boardId} sprints={sprints} />
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

function SprintsTab({ boardId, sprints }: { boardId: number; sprints: BoardSprints }) {
  const m = useT().tracking.board;
  const { carry } = useFilters();
  return (
    <Table>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>{m.colSprint}</Table.Th>
          <Table.Th>{m.colState}</Table.Th>
          <Table.Th>{m.colPeriod}</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {sprints.sprints.map((s) => (
          <Table.Tr key={s.id}>
            <Table.Td>
              <Anchor component={Link} to={carry(`/boards/${boardId}/sprints/${s.id}`)} size="sm" fw={s.current ? 600 : undefined}>
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
  );
}

/**
 * A board: the same page whether or not a sprint is running, so its tabs never depend on the
 * calendar. A running sprint is a card on the overview and the way into the sprint's own page;
 * flow, hygiene and the board's settings live here because they are the board's, not a sprint's.
 */
export function BoardPage() {
  const boardId = Number(useParams().boardId);
  const { get, set } = useFilters();
  const { data, isLoading, error } = useBoardSprints(boardId);
  const overview = useBoardOverview(boardId);
  const t = useT();
  const m = t.tracking.board;
  // Unsaved profile edits on the Settings tab: leaving the tab asks first.
  const [dirty, setDirty] = useState(false);
  const { confirm, dialog } = useConfirm();
  const goTo = async (value: string | null) => {
    if (!value || value === get('tab')) return;
    if (dirty && !(await confirm(discardDialog(t.tracking.settings)))) return;
    set({ tab: value });
  };

  if (isLoading) return <Loading rows={6} />;
  if (error) return <ErrorState error={error} />;
  if (!data) return null;

  const current = data.sprints.find((s) => s.id === data.current_sprint_id);
  const visible = TABS.filter((id) => id !== 'sprints' || data.sprints.length > 0);
  const requested = get('tab');
  const tab: Tab = visible.find((id) => id === requested) ?? 'overview';
  const space = data.board.space;
  const subtitle = data.board.type === 'kanban' ? m.kanbanSubtitle : current ? m.sprintRunning(current.name) : m.noActiveSprint;
  const labels: Record<Tab, string> = {
    overview: m.tabOverview,
    sprints: m.tabSprints,
    'work-tree': m.tabTree,
    risks: m.tabOpen,
    flow: m.tabFlow,
    changes: m.tabChanges,
    hygiene: m.tabHygiene,
    settings: m.tabSettings,
  };

  return (
    <>
      <PageHeader
        title={data.board.name}
        subtitle={subtitle}
        crumbs={[
          { label: t.tracking.crumbs.home, to: '/' },
          ...(space ? [{ label: space.name, to: `/spaces/${encodeURIComponent(space.key)}` }] : []),
          { label: data.board.name },
        ]}
      />
      <Freshness freshness={data.freshness} />
      <Tabs value={tab} onChange={(value) => void goTo(value)} keepMounted={false}>
        <Tabs.List mb="md" style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>
          {visible.map((id) => (
            <Tabs.Tab key={id} value={id}>
              {labels[id]}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <Tabs.Panel value="overview">
          {overview.isLoading && <Loading rows={6} />}
          {overview.error ? (
            <ErrorState error={overview.error} />
          ) : overview.data ? (
            <BoardOverviewTab boardId={boardId} data={overview.data} sprints={data} />
          ) : null}
        </Tabs.Panel>
        <Tabs.Panel value="sprints">
          <SprintsTab boardId={boardId} sprints={data} />
        </Tabs.Panel>
        <Tabs.Panel value="work-tree">
          <BoardTreeTab boardId={boardId} />
        </Tabs.Panel>
        <Tabs.Panel value="risks">
          <RiskTable boardId={boardId} />
        </Tabs.Panel>
        <Tabs.Panel value="flow">
          <FlowSection boardIds={[boardId]} />
        </Tabs.Panel>
        <Tabs.Panel value="changes">
          <ChangesPanel scope={{ boardId }} />
        </Tabs.Panel>
        <Tabs.Panel value="hygiene">
          <HealthPanel boardIds={[boardId]} />
        </Tabs.Panel>
        <Tabs.Panel value="settings">
          <BoardProfile boardId={boardId} onDirtyChange={setDirty} />
        </Tabs.Panel>
      </Tabs>
      {dialog}
    </>
  );
}
