import { Badge, Button, Drawer, Group, Paper, SegmentedControl, SimpleGrid, Stack, Switch, Table, Tabs, Text, TextInput, Title } from '@mantine/core';
import { IconCalendarOff, IconSearch, IconUserCog } from '@tabler/icons-react';
import { useLocalStorage } from '@mantine/hooks';
import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';

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
import { fmtNum, plural } from '../lib/format';
import { visiblePeople } from '../lib/people';

function PersonCards({ people, indicators, loading }: { people: Person[]; indicators: ReadonlyMap<string, PersonIndicators>; loading: boolean }) {
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
          to={carry(`/pessoas/${encodeURIComponent(p.account_id)}`)}
          name={p.name}
          roles={rolesOf.get(p.account_id) ?? []}
          indicators={loading ? undefined : indicators.get(p.account_id)}
        />
      ))}
    </SimpleGrid>
  );
}

/**
 * A drawer that opens from the address (``?funcoes=1``), so a link from another page can open it. Closing it
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
export function PeoplePage() {
  const { get } = useFilters();
  // ?tab=minha-semana (the palette's "Minha semana") is the same flow as the header button, started at once.
  const startMyWeek = get('tab') === 'minha-semana';
  const { data, isLoading, error } = usePeople();
  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useParamDrawer('funcoes');
  const [absences, setAbsences] = useParamDrawer('ausencias');
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
        title="Pessoas"
        subtitle="Agrupadas pelo time (espaço) em que trabalham. Visão individual com contexto, para conversas — não para avaliação."
        actions={
          <Group gap="xs">
            <MyWeekButton startOpen={startMyWeek} />
            <Button variant="default" size="xs" leftSection={<IconCalendarOff size={14} />} onClick={() => setAbsences(true)}>
              Ausências
            </Button>
            <Button variant="default" size="xs" leftSection={<IconUserCog size={14} />} onClick={() => setCatalog(true)}>
              Funções e equipe
            </Button>
          </Group>
        }
      />
      <Drawer opened={catalog} onClose={() => setCatalog(false)} position="right" size="xl" title="Funções e equipe">
        <RolesCatalog />
      </Drawer>
      <Drawer opened={absences} onClose={() => setAbsences(false)} position="right" size="xl" title="Ausências do time">
        <AbsenceEditor />
      </Drawer>
        <Group align="flex-end" gap="lg" mb="md" wrap="wrap">
          <TextInput
            placeholder="Buscar pessoa pelo nome"
            aria-label="Buscar pessoa"
            leftSection={<IconSearch size={16} />}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            w={360}
            maw="100%"
          />
          <Group gap="xs" wrap="nowrap" mb={6}>
            <Switch
              label="Só quem tem atividade na sprint"
              checked={onlyActive}
              onChange={(e) => setOnlyActive(e.currentTarget.checked)}
            />
            <InfoTip label={HELP['people:active']} about="filtro de atividade na sprint" />
          </Group>
          {filtering && hidden > 0 && (
            <Text size="sm" c="dimmed" mb={6} aria-live="polite">
              {plural(hidden, 'pessoa oculta', 'pessoas ocultas')} sem atividade na sprint
            </Text>
          )}
        </Group>
        <Text size="sm" c="dimmed" mb="lg">
          Números para conversar, não para avaliar: estimativas imprecisas e horas fora do Jira distorcem qualquer um. Toque no i de cada número para ver a conta.
        </Text>
        {(isLoading || waiting) && <Loading />}
        {error && <ErrorState error={error} />}
        {data && !waiting && !found && hidden > 0 && (
          <Empty title="Ninguém com atividade na sprint" action={{ label: 'Mostrar todo o time', onClick: () => setOnlyActive(false) }}>
            {plural(hidden, 'pessoa está oculta', 'pessoas estão ocultas')} por não ter itens abertos, entregas nem compromisso na sprint.
          </Empty>
        )}
        {data && !waiting && !found && hidden === 0 && <Empty title="Ninguém encontrado" action={{ label: 'Ver os boards acompanhados', to: '/configuracao?tab=boards' }}>As pessoas vêm dos responsáveis pelos itens dos boards acompanhados.</Empty>}
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
                  {plural(g.people.length, 'pessoa')}
                </Text>
              </Group>
              <PersonCards people={g.people} indicators={indicators} loading={overview.isLoading} />
            </Stack>
          ))}
          {unassigned.length > 0 && (
            <Stack gap={6}>
              <Title order={4}>Sem time identificado</Title>
              <Text size="xs" c="dimmed">
                Ninguém lhes atribuiu itens nos boards acompanhados, então não há espaço a que associá-las.
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
          Últimas {data.period.weeks} semanas
        </Text>
        <SegmentedControl
          aria-label="Período"
          value={weeks}
          onChange={setWeeks}
          data={[
            { value: '6', label: '6 sem' },
            { value: '12', label: '12 sem' },
            { value: '26', label: '26 sem' },
          ]}
        />
      </Group>
      <Note title="Contexto antes do número">{data.note}</Note>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
        <Stat
          label="Itens concluídos"
          help={HELP['history:completed']}
          value={data.summary.completed}
          hint={reference.median_completed_per_person != null ? `mediana dos boards: ${fmtNum(reference.median_completed_per_person)} por pessoa` : undefined}
        />
        <KpiCard
          label="Cycle time · P85"
          help={HELP['history:cycle']}
          value={data.summary.cycle_time.n ? `${fmtNum(data.summary.cycle_time.p85)} d` : '—'}
        >
          <Percentiles dist={data.summary.cycle_time} />
          Boards: P50 {fmtNum(reference.cycle_time.p50)} d (n={reference.cycle_time.n})
        </KpiCard>
        <KpiCard
          label="Lead time · P85"
          help={HELP['history:lead']}
          value={data.summary.lead_time.n ? `${fmtNum(data.summary.lead_time.p85)} d` : '—'}
        >
          <Percentiles dist={data.summary.lead_time} />
          Boards: P50 {fmtNum(reference.lead_time.p50)} d
        </KpiCard>
        <Stat label="Trabalho não planejado" help={HELP['history:unplanned']} value={data.composition.unplanned_items} hint="itens que entraram na sprint depois do início" />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, lg: 2 }}>
        <Paper withBorder p="md">
          <Title order={4}>Tendência por sprint</Title>
          {data.trend.length ? (
            <EChart
              label={`Por sprint: ${data.trend.map((t) => `${t.sprint.name} ${t.delivered} de ${t.committed}`).join('; ')}`}
              deps={[data]}
              height={260}
              build={(p) => ({
                tooltip: { trigger: 'axis' },
                legend: { top: 0, textStyle: { color: p.text } },
                xAxis: { type: 'category', data: data.trend.map((t) => t.sprint.name), ...axisStyle(p) },
                yAxis: [
                  { type: 'value', minInterval: 1, ...axisStyle(p) },
                  { type: 'value', name: 'dias', ...axisStyle(p), splitLine: { show: false } },
                ],
                series: [
                  { name: 'Comprometido', type: 'bar', itemStyle: { color: p.todo }, data: data.trend.map((t) => t.committed) },
                  { name: 'Entregue', type: 'bar', itemStyle: { color: p.done }, data: data.trend.map((t) => t.delivered) },
                  { name: 'Não planejado', type: 'bar', itemStyle: { color: p.added }, data: data.trend.map((t) => t.added) },
                  { name: 'Cycle time P50', type: 'line', yAxisIndex: 1, itemStyle: { color: p.warn }, data: data.trend.map((t) => t.cycle_time.p50) },
                ],
              })}
            />
          ) : (
            <Text size="sm" c="dimmed">
              Sem sprints com itens desta pessoa.
            </Text>
          )}
        </Paper>
        <Paper withBorder p="md">
          <Title order={4}>Composição do trabalho concluído</Title>
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
const TABS = [
  ['semana', 'Semana'],
  ['timeline', 'Timeline'],
  ['capacidade', 'Capacidade'],
  ['historico', 'Histórico'],
  ['funcao', 'Função'],
] as const;

/** A person: the numbers of their card, then their week (and their open/recent work — RF-85's
 *  "Minha semana" is this same tab, not a second implementation), timeline, capacity, history and role. */
export function PersonPage() {
  const accountId = useParams().accountId!;
  const { get, set } = useFilters();
  const [catalog, setCatalog] = useState(false);
  const detail = usePersonDetail(accountId);
  const [me, setMe] = useLocalStorage<string | null>({ key: ME_KEY, defaultValue: null, getInitialValueInEffect: false });
  const tab = TABS.some(([id]) => id === get('tab')) ? get('tab')! : 'semana';

  if (detail.isLoading) return <Loading rows={8} />;
  if (detail.error) return <ErrorState error={detail.error} />;
  const data = detail.data;
  if (!data) return null;
  const name = data.person.name;

  return (
    <>
      <PageHeader
        title={name}
        subtitle={data.indicators?.boards.map((b) => b.name).join(' · ') || 'Sem itens nos boards acompanhados'}
        crumbs={[{ label: 'Pessoas', to: '/pessoas' }, { label: name }]}
        actions={
          // "Sou eu" is how "Minha semana" learns who you are, from the one page that knows the account id.
          me === accountId ? (
            <Badge variant="light">Esta é você</Badge>
          ) : (
            <Button variant="subtle" size="xs" onClick={() => setMe(accountId)}>
              Sou eu
            </Button>
          )
        }
      />
      <Drawer opened={catalog} onClose={() => setCatalog(false)} position="right" size="xl" title="Funções e equipe">
        <RolesCatalog />
      </Drawer>
      <Stack gap="lg">
        {data.indicators && <PersonSummary indicators={data.indicators} />}
        <Tabs value={tab} onChange={(value) => set({ tab: value })} keepMounted={false}>
          <Tabs.List mb="md" style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>
            {TABS.map(([id, label]) => (
              <Tabs.Tab key={id} value={id}>
                {label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          <Tabs.Panel value="semana">
            <Stack gap="lg">
              <PersonWeek detail={data} />
              <PersonWork detail={data} />
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="timeline">
            <Paper withBorder p="md">
              <PersonTimeline timeline={data.timeline} />
            </Paper>
          </Tabs.Panel>
          <Tabs.Panel value="capacidade">
            <PersonCapacity accountId={accountId} sprints={data.capacity.sprints} />
          </Tabs.Panel>
          <Tabs.Panel value="historico">
            <PersonHistory accountId={accountId} />
          </Tabs.Panel>
          <Tabs.Panel value="funcao">
            <PersonRoles accountId={accountId} name={name} onManage={() => setCatalog(true)} />
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </>
  );
}
