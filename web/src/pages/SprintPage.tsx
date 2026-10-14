import { Alert, Anchor, Group, Paper, Select, SimpleGrid, Stack, Table, Tabs, Text, Title } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';

import { useSprintForecast } from '../api/featureHooks';
import { useBoardSprints, useSprint, useSprintTimeline, useSprintTree } from '../api/hooks';
import type { CommitmentSet, SprintOverview } from '../api/types';
import {Empty, ErrorState, ExportMenu, Freshness, KeyList, KpiCard, Loading, Note, PageHeader, ProgressBars, Stat} from '../components/common';
import { ChangesPanel } from '../components/ChangesPanel';
import { ForecastCard } from '../components/ForecastCard';
import { RiskCountsInline } from '../components/risk';
import { RiskTable } from '../components/RiskTable';
import { SprintTimeline } from '../components/WorkTimeline';
import { TreeTable } from '../components/TreeTable';
import { WeeklyWindows } from '../components/WeeklyWindows';
import { useT } from '../i18n';
import { useFilters } from '../lib/filters';
import { HELP } from '../lib/indicatorHelp';
import { fmtDate, fmtPct } from '../lib/format';
import { AllocationTab } from './AllocationTab';

/** Numbers first, then the forecast, then the weeks that explain them. */
function OverviewTab({ data, forecast, onCommitment }: { data: SprintOverview; forecast: ReactNode; onCommitment: () => void }) {
  const totals = data.commitment.board;
  const m = useT().tracking.sprint;
  return (
    <Stack gap="md">
      {data.timeline.warnings.length > 0 && (
        <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={18} />} title={m.assumptions}>
          {data.timeline.warnings.join(' ')}
        </Alert>
      )}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        <KpiCard label={m.progress} help={HELP['sprint:progress']}>
          <ProgressBars progress={data.progress} />
        </KpiCard>
        <KpiCard label={m.riskByItem} help={HELP['sprint:risk']}>
          <RiskCountsInline counts={data.risk_counts} />
        </KpiCard>
        <KpiCard
          label={m.commitment}
          value={fmtPct(totals.adherence)}
          help={HELP['commitment:adherence']}
        >
          {m.commitmentLine(totals.delivered, totals.committed, totals.added)}
          {' · '}
          <Anchor component="button" type="button" size="xs" onClick={onCommitment}>
            {m.seeDetail}
          </Anchor>
        </KpiCard>
      </SimpleGrid>
      {forecast}
      <WeeklyWindows windows={data.timeline.windows} items={data.items} kind="sprint" />
    </Stack>
  );
}

const SETS: CommitmentSet[] = ['committed', 'delivered', 'remaining', 'removed', 'added', 'added_delivered'];

function CommitmentTab({ data }: { data: SprintOverview }) {
  const c = data.commitment;
  const m = useT().tracking.sprint;
  return (
    <Stack gap="md">
      <Note>{m.commitmentNote}</Note>
      <SimpleGrid cols={{ base: 2, md: 4, lg: 7 }}>
        <Stat label={m.committed} help={HELP['commitment:committed']} value={c.board.committed} />
        <Stat label={m.delivered} help={HELP['commitment:delivered']} value={c.board.delivered} />
        <Stat label={m.remaining} help={HELP['commitment:remaining']} value={c.board.remaining} />
        <Stat label={m.removed} help={HELP['commitment:removed']} value={c.board.removed} />
        <Stat label={m.addedLater} help={HELP['commitment:added']} value={c.board.added} hint={m.addedDelivered(c.board.added_delivered)} />
        <Stat label={m.adherence} help={HELP['commitment:adherence']} value={fmtPct(c.board.adherence)} />
        <Stat label={m.carryoverRate} help={HELP['commitment:carryover']} value={c.closed ? fmtPct(c.carryover_rate) : '—'} hint={c.closed ? undefined : m.inProgress} />
      </SimpleGrid>
      <Group justify="space-between">
        <Title order={4}>{m.byPerson}</Title>
        <ExportMenu dataset="commitment" params={{ sprint_id: data.sprint.id }} />
      </Group>
      <Table.ScrollContainer minWidth={700}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{m.colPerson}</Table.Th>
              <Table.Th className="num">{m.committed}</Table.Th>
              <Table.Th className="num">{m.delivered}</Table.Th>
              <Table.Th className="num">{m.remaining}</Table.Th>
              <Table.Th className="num">{m.removed}</Table.Th>
              <Table.Th className="num">{m.colAdded}</Table.Th>
              <Table.Th className="num">{m.colAdherence}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {c.people.map((p) => (
              <Table.Tr key={p.owner_id}>
                <Table.Td>{p.owner_name}</Table.Td>
                <Table.Td className="num">{p.committed}</Table.Td>
                <Table.Td className="num">{p.delivered}</Table.Td>
                <Table.Td className="num">{p.remaining}</Table.Td>
                <Table.Td className="num">{p.removed}</Table.Td>
                <Table.Td className="num">{p.added}</Table.Td>
                <Table.Td className="num">{fmtPct(p.adherence)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <SimpleGrid cols={{ base: 1, md: 3 }}>
        {SETS.map((key) => (
          <Paper key={key} withBorder p="sm">
            <Text size="sm" fw={500} mb={4}>
              {m.setTitle(m.sets[key], c.sets[key].length)}
            </Text>
            <KeyList keys={c.sets[key]} items={c.items} />
          </Paper>
        ))}
      </SimpleGrid>
    </Stack>
  );
}

function TreeTab({ sprintId, boardId }: { sprintId: number; boardId: number }) {
  const { data, isLoading, error } = useSprintTree(sprintId);
  const t = useT();
  if (isLoading) return <Loading rows={8} />;
  if (error) return <ErrorState error={error} />;
  if (!data?.nodes.length) return <Empty title={t.tracking.sprint.emptyTitle} action={{ label: t.tracking.board.seeCollectionStatus, to: '/status' }}>{t.tracking.sprint.emptyBody}</Empty>;
  return (
    <Stack gap="xs">
      <Group justify="flex-end">
        <ExportMenu dataset="tree" params={{ sprint_id: sprintId }} />
      </Group>
      <TreeTable nodes={data.nodes} boardId={boardId} sprintId={sprintId} />
    </Stack>
  );
}

function TimelineTab({ sprintId }: { sprintId: number }) {
  const { data, isLoading, error } = useSprintTimeline(sprintId);
  const t = useT();
  if (isLoading) return <Loading rows={8} />;
  if (error) return <ErrorState error={error} />;
  if (!data?.nodes.length) return <Empty title={t.tracking.sprint.emptyTitle} action={{ label: t.tracking.board.seeCollectionStatus, to: '/status' }}>{t.tracking.sprint.emptyBody}</Empty>;
  return <SprintTimeline view={data} />;
}

export function SprintPage() {
  const params = useParams();
  const boardId = Number(params.boardId);
  const sprintId = Number(params.sprintId);
  const navigate = useNavigate();
  const { get, set, carry } = useFilters();
  const sprints = useBoardSprints(boardId);
  const overview = useSprint(sprintId);
  const forecast = useSprintForecast(sprintId);
  const t = useT();
  const m = t.tracking.sprint;
  const SPRINT_TABS = ['overview', 'work-tree', 'timeline', 'risks', 'changes', 'commitment', 'allocation'] as const;
  const requestedTab = get('tab');
  const tab = (SPRINT_TABS as readonly string[]).includes(requestedTab ?? '') ? requestedTab! : 'overview';

  const selector = (
    <Select
      aria-label={m.switchSprint}
      data={(sprints.data?.sprints ?? []).map((s) => ({
        value: String(s.id),
        label: m.sprintOption(s.name, s.state),
      }))}
      value={String(sprintId)}
      onChange={(value) => value && navigate(carry(`/boards/${boardId}/sprints/${value}`, { tab }))}
      w={240}
      allowDeselect={false}
    />
  );

  if (overview.isLoading) return <Loading rows={8} />;
  if (overview.error) return <ErrorState error={overview.error} />;
  const data = overview.data;
  if (!data) return null;
  const space = sprints.data?.board.space;

  return (
    <>
      <PageHeader
        title={data.sprint.name}
        subtitle={
          <>
            {m.period(data.board.name, fmtDate(data.timeline.start), fmtDate(data.timeline.end))}
            {data.sprint.goal ? m.goal(data.sprint.goal) : ''}
          </>
        }
        crumbs={[
          { label: t.tracking.crumbs.home, to: '/' },
          ...(space ? [{ label: space.name, to: `/spaces/${encodeURIComponent(space.key)}` }] : []),
          { label: data.board.name, to: `/boards/${boardId}` },
          { label: data.sprint.name },
        ]}
        actions={selector}
      />
      <Freshness freshness={data.freshness} />
      <Tabs value={tab} onChange={(value) => set({ tab: value })} keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="overview">{m.tabOverview}</Tabs.Tab>
          <Tabs.Tab value="work-tree">{m.tabTree}</Tabs.Tab>
          <Tabs.Tab value="timeline">{m.tabTimeline}</Tabs.Tab>
          <Tabs.Tab value="risks">{m.tabOpen}</Tabs.Tab>
          <Tabs.Tab value="changes">{m.tabChanges}</Tabs.Tab>
          <Tabs.Tab value="commitment">{m.tabCommitment}</Tabs.Tab>
          <Tabs.Tab value="allocation">{m.tabAllocation}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="overview">
          <OverviewTab data={data} forecast={<ForecastCard query={forecast} />} onCommitment={() => set({ tab: 'commitment' })} />
        </Tabs.Panel>
        <Tabs.Panel value="work-tree">
          <TreeTab sprintId={sprintId} boardId={boardId} />
        </Tabs.Panel>
        <Tabs.Panel value="timeline">
          <TimelineTab sprintId={sprintId} />
        </Tabs.Panel>
        <Tabs.Panel value="risks">
          <RiskTable sprintId={sprintId} />
        </Tabs.Panel>
        <Tabs.Panel value="changes">
          <ChangesPanel scope={{ sprintId }} />
        </Tabs.Panel>
        <Tabs.Panel value="commitment">
          <CommitmentTab data={data} />
        </Tabs.Panel>
        <Tabs.Panel value="allocation">
          <AllocationTab sprintId={sprintId} />
        </Tabs.Panel>
      </Tabs>
    </>
  );
}
