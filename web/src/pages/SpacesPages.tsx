import { Anchor, Badge, Group, Paper, SimpleGrid, Stack, Tabs, Text, Title } from '@mantine/core';
import { useMemo } from 'react';
import { Link, useParams } from 'react-router';

import { useDashboard, usePeople, usePeopleOverview, useSpace } from '../api/hooks';
import type { DashboardRow } from '../api/types';
import { BoardsGrid, BoardsSkeleton } from '../components/boards/BoardsGrid';
import { Empty, ErrorState, KpiCard, Loading, Note, PageHeader } from '../components/common';
import { FlowSection } from '../components/FlowSection';
import { HealthPanel } from '../components/HealthPanel';
import { RiskCountsInline } from '../components/risk';
import { RiskTable } from '../components/RiskTable';
import { useT } from '../i18n';
import { useFilters } from '../lib/filters';
import { fmtPct } from '../lib/format';
import { HELP } from '../lib/indicatorHelp';
import { riskCountsOf, spacesOf, type SpaceSummary } from '../lib/spaces';
import { PersonCards } from './PeoplePages';

/** The three numbers a team is read by, the same on its card and on its own page. */
function SpaceNumbers({ space }: { space: SpaceSummary<DashboardRow> }) {
  const m = useT().tracking.spaces;
  return (
    <SimpleGrid cols={{ base: 1, sm: 3 }}>
      <KpiCard label={m.atRisk} help={HELP['space:risk']}>
        <RiskCountsInline counts={riskCountsOf(space.rows)} />
      </KpiCard>
      <KpiCard label={m.delivered} help={HELP['space:delivered']} value={space.delivered.current}>
        {m.deliveredBefore(space.delivered.previous)}
      </KpiCard>
      <KpiCard label={m.progress} help={HELP['space:progress']} value={space.progress === null ? '—' : fmtPct(space.progress)}>
        {space.progress === null ? m.noSprint : null}
      </KpiCard>
    </SimpleGrid>
  );
}

function SpaceCard({ space }: { space: SpaceSummary<DashboardRow> }) {
  const m = useT().tracking.spaces;
  const { carry } = useFilters();
  return (
    <Paper withBorder p="md" component="article" aria-label={space.name}>
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <Anchor component={Link} to={carry(`/spaces/${encodeURIComponent(space.key)}`)} fw={600} truncate="end" style={{ minWidth: 0 }}>
            {space.name}
          </Anchor>
          <Badge variant="default" size="sm" className="mono" style={{ flexShrink: 0 }}>
            {space.key}
          </Badge>
        </Group>
        <Text size="sm" c="dimmed" lineClamp={2}>
          {m.boardsLine(space.rows.map((r) => r.board.name))}
        </Text>
        <Group gap="lg" wrap="wrap">
          <Stack gap={0}>
            <Text className="kpi-label">{m.atRisk}</Text>
            <Text fw={600} className="num">
              {space.atRisk}
            </Text>
          </Stack>
          <Stack gap={0}>
            <Text className="kpi-label">{m.delivered}</Text>
            <Text fw={600} className="num">
              {space.delivered.current}
            </Text>
          </Stack>
          <Stack gap={0}>
            <Text className="kpi-label">{m.progress}</Text>
            <Text fw={600} className="num">
              {space.progress === null ? '—' : fmtPct(space.progress)}
            </Text>
          </Stack>
        </Group>
      </Stack>
    </Paper>
  );
}

/** Every team with a tracked board: the level between Home and a board. */
export function SpacesPage() {
  const m = useT().tracking.spaces;
  const dashboard = useDashboard();
  const spaces = useMemo(() => spacesOf(dashboard.data?.rows ?? []), [dashboard.data]);
  return (
    <>
      <PageHeader title={m.title} subtitle={m.subtitle} />
      {dashboard.isLoading && <BoardsSkeleton />}
      {dashboard.error && <ErrorState error={dashboard.error} />}
      {dashboard.data && !spaces.length && (
        <Empty title={m.emptyTitle} action={{ label: m.emptyAction, to: '/settings?tab=boards' }}>
          {m.emptyBody}
        </Empty>
      )}
      {spaces.length > 0 && (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md" component="section" aria-label={m.title}>
          {spaces.map((space) => (
            <SpaceCard key={space.key} space={space} />
          ))}
        </SimpleGrid>
      )}
    </>
  );
}

const TABS = ['overview', 'people', 'risks', 'flow', 'hygiene'] as const;
type Tab = (typeof TABS)[number];

/** The space's people, with their numbers measured on the space's boards only. */
function SpacePeople({ spaceKey, boardIds }: { spaceKey: string; boardIds: number[] }) {
  const m = useT().tracking.spaces;
  const people = usePeople();
  const overview = usePeopleOverview(boardIds);
  const indicators = useMemo(() => new Map((overview.data?.items ?? []).map((p) => [p.account_id, p])), [overview.data]);
  if (people.isLoading) return <Loading />;
  if (people.error) return <ErrorState error={people.error} />;
  const members = people.data?.spaces.find((g) => g.space.key === spaceKey)?.people ?? [];
  if (!members.length) return <Empty title={m.noPeopleTitle}>{m.noPeopleBody}</Empty>;
  return (
    <Stack gap="sm">
      <Note>{m.peopleNote}</Note>
      <PersonCards people={members} indicators={indicators} loading={overview.isLoading} />
    </Stack>
  );
}

/**
 * A space (team): its boards and what they add up to, its people, its risks across boards, its flow
 * and its data hygiene. Everything is read from the boards Cadência tracks for it; the sprint detail
 * stays on each board.
 */
export function SpacePage() {
  const key = useParams().spaceKey!;
  const t = useT();
  const m = t.tracking.spaces;
  const { get, set } = useFilters();
  const detail = useSpace(key);
  const dashboard = useDashboard();
  const rows = useMemo(() => (dashboard.data?.rows ?? []).filter((r) => r.board.space_key === key), [dashboard.data, key]);
  const summary = useMemo(() => spacesOf(rows)[0], [rows]);
  const boardIds = useMemo(() => rows.map((r) => r.board.id), [rows]);
  const requested = get('tab');
  const tab: Tab = TABS.find((id) => id === requested) ?? 'overview';

  if (detail.isLoading) return <Loading rows={6} />;
  if (detail.error) return <ErrorState error={detail.error} />;
  if (!detail.data) return null;
  const name = detail.data.space.name;
  const untracked = detail.data.boards.filter((b) => !b.selected).length;
  const labels: Record<Tab, string> = {
    overview: m.tabOverview,
    people: m.tabPeople,
    risks: m.tabRisks,
    flow: m.tabFlow,
    hygiene: m.tabHygiene,
  };

  return (
    <>
      <PageHeader
        title={name}
        subtitle={m.spaceSubtitle(key, rows.length)}
        crumbs={[{ label: t.tracking.crumbs.home, to: '/' }, { label: m.title, to: '/spaces' }, { label: name }]}
      />
      {dashboard.data && !rows.length ? (
        <Empty title={m.noTrackedTitle} action={{ label: m.emptyAction, to: '/settings?tab=boards' }}>
          {m.noTrackedBody}
        </Empty>
      ) : (
        <Tabs key={key} value={tab} onChange={(value) => set({ tab: value })} keepMounted={false}>
          <Tabs.List mb="md" style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>
            {TABS.map((id) => (
              <Tabs.Tab key={id} value={id}>
                {labels[id]}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          <Tabs.Panel value="overview">
            {dashboard.isLoading && <BoardsSkeleton />}
            {dashboard.error && <ErrorState error={dashboard.error} />}
            {summary && (
              <Stack gap="lg">
                <SpaceNumbers space={summary} />
                <Stack gap="xs">
                  <Title order={4}>{m.boardsTitle}</Title>
                  <BoardsGrid rows={rows} />
                  {untracked > 0 && (
                    <Text size="xs" c="dimmed">
                      {m.untracked(untracked)}{' '}
                      <Anchor component={Link} to="/settings?tab=boards" size="xs">
                        {m.emptyAction}
                      </Anchor>
                    </Text>
                  )}
                </Stack>
              </Stack>
            )}
          </Tabs.Panel>
          <Tabs.Panel value="people">{boardIds.length > 0 && <SpacePeople spaceKey={key} boardIds={boardIds} />}</Tabs.Panel>
          <Tabs.Panel value="risks">
            <RiskTable spaceKey={key} />
          </Tabs.Panel>
          <Tabs.Panel value="flow">{boardIds.length > 0 && <FlowSection boardIds={boardIds} />}</Tabs.Panel>
          <Tabs.Panel value="hygiene">{boardIds.length > 0 && <HealthPanel boardIds={boardIds} />}</Tabs.Panel>
        </Tabs>
      )}
    </>
  );
}
