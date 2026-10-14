import { Badge, Button, Drawer, Group, Paper, SegmentedControl, SimpleGrid, Stack, Switch, Table, Tabs, Text, TextInput, Title } from '@mantine/core';
import { IconCalendarOff, IconSearch, IconUserCog } from '@tabler/icons-react';
import { useLocalStorage } from '@mantine/hooks';
import { useMemo, useState } from 'react';
import { Navigate, useLocation, useParams, useSearchParams } from 'react-router';

import { usePeople, usePeopleOverview, usePerson, usePersonDetail } from '../api/hooks';
import { useMembers, useRoles } from '../api/planHooks';
import type { Person, PersonIndicators } from '../api/types';
import { Empty, ErrorState, InfoTip, KpiCard, Loading, Note, PageHeader, Percentiles, Stat } from '../components/common';
import { axisStyle, EChart } from '../components/EChart';
import { PersonCapacity } from '../components/people/PersonCapacity';
import { PersonCard } from '../components/people/PersonCard';
import { AbsenceEditor } from '../components/people/AbsenceEditor';
import { ME_KEY, MyWeekButton } from '../components/people/MyWeekButton';
import { PersonRoles } from '../components/people/PersonRoles';
import { PersonSummary } from '../components/people/PersonSummary';
import { PersonTimeline } from '../components/people/PersonTimeline';
import { PersonWeek } from '../components/people/PersonWeek';
import { PersonWork } from '../components/people/PersonWork';
import { RolesCatalog } from '../components/people/RolesCatalog';
import { useFilters } from '../lib/filters';
import { HELP } from '../lib/indicatorHelp';
import { useT } from '../i18n';
import { fmtNum } from '../lib/format';
import { myWeekPath } from '../lib/navigation';
import { visiblePeople } from '../lib/people';

export function PersonCards({ people, indicators, loading }: { people: Person[]; indicators: ReadonlyMap<string, PersonIndicators>; loading: boolean }) {
  const { carry } = useFilters();
  const members = useMembers();
  const roles = useRoles();
  const roleById = new Map((roles.data?.items ?? []).map((r) => [r.id, r]));
  const rolesOf = new Map(
    (members.data?.items ?? []).map((m) => [
      m.id,
      m.papeis.flatMap((p) => {
        const role = roleById.get(p.papel_id);
        return role ? [{ role, suffix: p.senioridade_rotulo }] : [];
      }),
    ]),
  );
  return (
    <SimpleGrid cols={{ base: 1, xs: 2, md: 3, xl: 4 }} spacing="sm">
      {people.map((p) => (
        <PersonCard
          key={p.account_id}
          to={carry(`/people/${encodeURIComponent(p.account_id)}`)}
          name={p.name}
          roles={rolesOf.get(p.account_id) ?? []}
          indicators={loading ? undefined : indicators.get(p.account_id)}
        />
      ))}
    </SimpleGrid>
  );
}

/**
 * A drawer that opens from the address (``?roles=1``), so a link from another page can open it. Closing it
 * takes the parameter back out, so the address is clean again.
 */
function useParamDrawer(key: string) {
  const [params, setParams] = useSearchParams();
  const opened = params.get(key) === '1';
  const setOpened = (value: boolean) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value) next.set(key, '1');
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  return [opened, setOpened] as const;
}

/** RF-23: people under the space (team) they work in. Someone who works in two teams is listed
 *  under both — the repetition is what makes a shared person visible as shared. */
/**
 * `/me`: your own week, at a link that does not change. Who you are is remembered in this browser
 * (People → "It's me"); until it is, the People page opens its picker. Filters on the link travel.
 */
export function MePage() {
  const { search } = useLocation();
  const target = myWeekPath();
  const extra = new URLSearchParams(search);
  const [path, query = ''] = target.split('?');
  const params = new URLSearchParams(query);
  for (const [key, value] of extra) if (!params.has(key)) params.set(key, value);
  return <Navigate to={`${path}?${params.toString()}`} replace />;
}

export function PeoplePage() {
  const t = useT();
  const tl = t.people.list;
  const { get } = useFilters();
  // ?tab=my-week (the palette's "Minha semana") is the same flow as the header button, started at once.
  const startMyWeek = get('tab') === 'my-week';
  const { data, isLoading, error } = usePeople();
  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useParamDrawer('roles');
  const [absences, setAbsences] = useParamDrawer('absences');
  // On by default: a team page is about who is working in the sprint. Off shows everyone the boards know.
  const [onlyActive, setOnlyActive] = useLocalStorage({ key: 'cadencia-pessoas-so-ativos', defaultValue: true });
  const overview = usePeopleOverview();
  const indicators = useMemo(() => new Map((overview.data?.items ?? []).map((p) => [p.account_id, p])), [overview.data]);
  const active = useMemo(() => new Map([...indicators].map(([id, p]) => [id, p.active])), [indicators]);
  // Without the overview nobody can be told active from not, so the filter waits (or, if it failed, steps aside).
  const filtering = onlyActive && !overview.error;
  const waiting = filtering && overview.isLoading;
  const groups = useMemo(
    () =>
      (data?.spaces ?? [])
        .map((g) => ({ ...g, ...visiblePeople(g.people, active, query, filtering) }))
        .map(({ shown, ...g }) => ({ ...g, people: shown }))
        .filter((g) => g.people.length > 0),
    [data, active, query, filtering],
  );
  const loose = useMemo(() => visiblePeople(data?.unassigned ?? [], active, query, filtering), [data, active, query, filtering]);
  const unassigned = loose.shown;
  const found = groups.reduce((n, g) => n + g.people.length, 0) + unassigned.length;
  // Who the filter is hiding, once each: a person in two teams is listed under both but is one person.
  const hidden = useMemo(() => {
    const ids = new Set<string>();
    for (const g of data?.spaces ?? []) for (const p of visiblePeople(g.people, active, query, filtering).hidden) ids.add(p.account_id);
    for (const p of loose.hidden) ids.add(p.account_id);
    return ids.size;
  }, [data, active, query, filtering, loose]);

  return (
    <>
      <PageHeader
        title={tl.title}
        subtitle={tl.subtitle}
        actions={
          <Group gap="xs">
            <MyWeekButton startOpen={startMyWeek} />
            <Button variant="default" size="xs" leftSection={<IconCalendarOff size={14} />} onClick={() => setAbsences(true)}>
              {tl.absences}
            </Button>
            <Button variant="default" size="xs" leftSection={<IconUserCog size={14} />} onClick={() => setCatalog(true)}>
              {tl.rolesAndTeam}
            </Button>
          </Group>
        }
      />
      <Drawer opened={catalog} onClose={() => setCatalog(false)} position="right" size="xl" title={tl.rolesAndTeam}>
        <RolesCatalog />
      </Drawer>
      <Drawer opened={absences} onClose={() => setAbsences(false)} position="right" size="xl" title={tl.teamAbsences}>
        <AbsenceEditor />
      </Drawer>
        <Group align="flex-end" gap="lg" mb="md" wrap="wrap">
          <TextInput
            placeholder={tl.searchPlaceholder}
            aria-label={tl.searchLabel}
            leftSection={<IconSearch size={16} />}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            w={360}
            maw="100%"
          />
          <Group gap="xs" wrap="nowrap" mb={6}>
            <Switch
              label={tl.onlyActive}
              checked={onlyActive}
              onChange={(e) => setOnlyActive(e.currentTarget.checked)}
            />
            <InfoTip label={HELP['people:active']} about={tl.onlyActiveAbout} />
          </Group>
          {filtering && hidden > 0 && (
            <Text size="sm" c="dimmed" mb={6} aria-live="polite">
              {tl.hidden(hidden)}
            </Text>
          )}
        </Group>
        <Text size="sm" c="dimmed" mb="lg">
          {tl.note}
        </Text>
        {(isLoading || waiting) && <Loading />}
        {error && <ErrorState error={error} />}
        {data && !waiting && !found && hidden > 0 && (
          <Empty title={tl.noActiveTitle} action={{ label: tl.showWholeTeam, onClick: () => setOnlyActive(false) }}>
            {tl.noActiveBody(hidden)}
          </Empty>
        )}
        {data && !waiting && !found && hidden === 0 && <Empty title={tl.noneFoundTitle} action={{ label: tl.seeBoards, to: '/settings?tab=boards' }}>{tl.noneFoundBody}</Empty>}
        <Stack gap="lg">
          {groups.map((g) => (
            <Stack key={g.space.key ?? '__sem_espaco__'} gap="sm">
              <Group gap="xs" align="center">
                <Title order={4}>{g.space.name}</Title>
                {g.space.key && (
                  <Badge variant="default" size="sm" className="mono">
                    {g.space.key}
                  </Badge>
                )}
                <Text size="sm" c="dimmed">
                  {tl.count(g.people.length)}
                </Text>
              </Group>
              <PersonCards people={g.people} indicators={indicators} loading={overview.isLoading} />
            </Stack>
          ))}
          {unassigned.length > 0 && (
            <Stack gap={6}>
              <Title order={4}>{tl.noTeam}</Title>
              <Text size="xs" c="dimmed">
                {tl.noTeamBody}
              </Text>
              <PersonCards people={unassigned} indicators={indicators} loading={overview.isLoading} />
            </Stack>
          )}
        </Stack>
    </>
  );
}

/** RF-23: trend, items at risk, work composition and comparison with the median of the boards. */
function PersonHistory({ accountId }: { accountId: string }) {
  const t = useT();
  const th = t.people.history;
  const [weeks, setWeeks] = useState('12');
  const { data, isLoading, error } = usePerson(accountId, Number(weeks));
  if (isLoading) return <Loading rows={6} />;
  if (error) return <ErrorState error={error} />;
  if (!data) return null;
  const reference = data.boards;
  return (
    <Stack gap="lg">
      <Group justify="space-between" wrap="wrap">
        <Text size="sm" c="dimmed">
          {th.lastWeeks(data.period.weeks)}
        </Text>
        <SegmentedControl
          aria-label={t.people.common.period}
          value={weeks}
          onChange={setWeeks}
          data={[
            { value: '6', label: th.weeksShort(6) },
            { value: '12', label: th.weeksShort(12) },
            { value: '26', label: th.weeksShort(26) },
          ]}
        />
      </Group>
      <Note title={th.contextNote}>{data.note}</Note>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        <Stat
          label={th.completed}
          help={HELP['history:completed']}
          value={data.summary.completed}
          hint={reference.median_completed_per_person != null ? th.boardsMedian(fmtNum(reference.median_completed_per_person)) : undefined}
        />
        <KpiCard
          label={th.cycleP85}
          help={HELP['history:cycle']}
          value={data.summary.cycle_time.n ? t.people.common.days(fmtNum(data.summary.cycle_time.p85)) : '—'}
        >
          <Percentiles dist={data.summary.cycle_time} />
          {th.boardsCycle(fmtNum(reference.cycle_time.p50), reference.cycle_time.n)}
        </KpiCard>
        <KpiCard
          label={th.leadP85}
          help={HELP['history:lead']}
          value={data.summary.lead_time.n ? t.people.common.days(fmtNum(data.summary.lead_time.p85)) : '—'}
        >
          <Percentiles dist={data.summary.lead_time} />
          {th.boardsLead(fmtNum(reference.lead_time.p50))}
        </KpiCard>
        <Stat label={th.unplanned} help={HELP['history:unplanned']} value={data.composition.unplanned_items} hint={th.unplannedHint} />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <Paper withBorder p="md">
          <Title order={4}>{th.trendTitle}</Title>
          {data.trend.length ? (
            <EChart
              label={th.trendLabel(data.trend.map((s) => th.trendPoint(s.sprint.name, s.delivered, s.committed)).join('; '))}
              deps={[data]}
              height={260}
              build={(p) => ({
                tooltip: { trigger: 'axis' },
                legend: { top: 0, textStyle: { color: p.text } },
                xAxis: { type: 'category', data: data.trend.map((s) => s.sprint.name), ...axisStyle(p) },
                yAxis: [
                  { type: 'value', minInterval: 1, ...axisStyle(p) },
                  { type: 'value', name: th.axisDays, ...axisStyle(p), splitLine: { show: false } },
                ],
                series: [
                  { name: t.people.common.committed, type: 'bar', itemStyle: { color: p.todo }, data: data.trend.map((s) => s.committed) },
                  { name: t.people.common.delivered, type: 'bar', itemStyle: { color: p.done }, data: data.trend.map((s) => s.delivered) },
                  { name: th.unplannedSeries, type: 'bar', itemStyle: { color: p.added }, data: data.trend.map((s) => s.added) },
                  { name: th.cycleP50, type: 'line', yAxisIndex: 1, itemStyle: { color: p.warn }, data: data.trend.map((s) => s.cycle_time.p50) },
                ],
              })}
            />
          ) : (
            <Text size="sm" c="dimmed">
              {th.noSprints}
            </Text>
          )}
        </Paper>
        <Paper withBorder p="md">
          <Title order={4}>{th.mixTitle}</Title>
          <Table mt="xs">
            <Table.Tbody>
              {Object.entries(data.composition.work_mix).map(([type, count]) => (
                <Table.Tr key={type}>
                  <Table.Td>{type}</Table.Td>
                  <Table.Td className="num">{count}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      </SimpleGrid>
    </Stack>
  );
}

/** The four groups a card shows, at a glance, above the person's tabs. */
const TABS = ['week', 'timeline', 'capacity', 'history', 'role'] as const;

/** A person: the numbers of their card, then their week (and their open/recent work — RF-85's
 *  "Minha semana" is this same tab, not a second implementation), timeline, capacity, history and role. */
export function PersonPage() {
  const t = useT();
  const accountId = useParams().accountId!;
  const { get, set } = useFilters();
  const [catalog, setCatalog] = useState(false);
  const detail = usePersonDetail(accountId);
  const [me, setMe] = useLocalStorage<string | null>({ key: ME_KEY, defaultValue: null, getInitialValueInEffect: false });
  const tab = TABS.some((id) => id === get('tab')) ? get('tab')! : 'week';

  if (detail.isLoading) return <Loading rows={8} />;
  if (detail.error) return <ErrorState error={detail.error} />;
  const data = detail.data;
  if (!data) return null;
  const name = data.person.name;

  return (
    <>
      <PageHeader
        title={name}
        subtitle={data.indicators?.boards.map((b) => b.name).join(' · ') || t.people.page.noBoards}
        crumbs={[{ label: t.people.list.title, to: '/people' }, { label: name }]}
        actions={
          // "Sou eu" is how "Minha semana" learns who you are, from the one page that knows the account id.
          me === accountId ? (
            <Badge variant="light">{t.people.page.thisIsYou}</Badge>
          ) : (
            <Button variant="subtle" size="xs" onClick={() => setMe(accountId)}>
              {t.people.page.itsMe}
            </Button>
          )
        }
      />
      <Drawer opened={catalog} onClose={() => setCatalog(false)} position="right" size="xl" title={t.people.list.rolesAndTeam}>
        <RolesCatalog />
      </Drawer>
      <Stack gap="lg">
        {data.indicators && <PersonSummary indicators={data.indicators} />}
        <Tabs key={accountId} value={tab} onChange={(value) => set({ tab: value })} keepMounted={false}>
          <Tabs.List mb="md" style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>
            {TABS.map((id) => (
              <Tabs.Tab key={id} value={id}>
                {t.people.page.tabs[id]}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          <Tabs.Panel value="week">
            <Stack gap="lg">
              <PersonWeek detail={data} />
              <PersonWork detail={data} />
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="timeline">
            <PersonTimeline timeline={data.timeline} />
          </Tabs.Panel>
          <Tabs.Panel value="capacity">
            <PersonCapacity accountId={accountId} sprints={data.capacity.sprints} />
          </Tabs.Panel>
          <Tabs.Panel value="history">
            <PersonHistory accountId={accountId} />
          </Tabs.Panel>
          <Tabs.Panel value="role">
            <PersonRoles accountId={accountId} name={name} onManage={() => setCatalog(true)} />
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </>
  );
}
