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
import { SprintTimeline } from '../components/SprintTimeline';
import { TreeTable } from '../components/TreeTable';
import { WeeklyWindows } from '../components/WeeklyWindows';
import { useFilters } from '../lib/filters';
import { HELP } from '../lib/indicatorHelp';
import { fmtDate, fmtPct, plural } from '../lib/format';
import { PlanningTab } from './PlanningTab';

/** Numbers first, then the forecast, then the weeks that explain them. */
function OverviewTab({ data, forecast, onCommitment }: { data: SprintOverview; forecast: ReactNode; onCommitment: () => void }) {
  const totals = data.commitment.board;
  return (
    <Stack gap="md">
      {data.timeline.warnings.length > 0 && (
        <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={18} />} title="Suposições sobre esta sprint">
          {data.timeline.warnings.join(' ')}
        </Alert>
      )}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
        <KpiCard label="Progresso (itens e estimativa)" help={HELP['sprint:progress']}>
          <ProgressBars progress={data.progress} />
        </KpiCard>
        <KpiCard label="Itens por situação de risco" help={HELP['sprint:risk']}>
          <RiskCountsInline counts={data.risk_counts} />
        </KpiCard>
        <KpiCard
          label="Compromisso"
          value={fmtPct(totals.adherence)}
          help={HELP['commitment:adherence']}
        >
          {`${totals.delivered} de ${totals.committed} entregues · +${plural(totals.added, 'adicionado', 'adicionados')}`}
          {' · '}
          <Anchor component="button" type="button" size="xs" onClick={onCommitment}>
            ver detalhe
          </Anchor>
        </KpiCard>
      </SimpleGrid>
      {forecast}
      <WeeklyWindows windows={data.timeline.windows} items={data.items} kind="sprint" />
    </Stack>
  );
}

const SET_LABELS: [CommitmentSet, string][] = [
  ['committed', 'Comprometidos no início'],
  ['delivered', 'Entregues do compromisso'],
  ['remaining', 'Sobraram'],
  ['removed', 'Removidos da sprint'],
  ['added', 'Escopo adicionado depois do início'],
  ['added_delivered', 'Escopo adicionado já entregue'],
];

function CommitmentTab({ data }: { data: SprintOverview }) {
  const c = data.commitment;
  return (
    <Stack gap="md">
      <Note>
        O compromisso é o conjunto que estava na sprint no início. O que entrou depois aparece separado: sem essa separação, todo board
        parece descumpridor.
      </Note>
      <SimpleGrid cols={{ base: 2, md: 4, lg: 7 }}>
        <Stat label="Comprometido" help={HELP['commitment:committed']} value={c.board.committed} />
        <Stat label="Entregue" help={HELP['commitment:delivered']} value={c.board.delivered} />
        <Stat label="Restante" help={HELP['commitment:remaining']} value={c.board.remaining} />
        <Stat label="Removido" help={HELP['commitment:removed']} value={c.board.removed} />
        <Stat label="Adicionado depois" help={HELP['commitment:added']} value={c.board.added} hint={`${c.board.added_delivered} entregues`} />
        <Stat label="Aderência ao compromisso" help={HELP['commitment:adherence']} value={fmtPct(c.board.adherence)} />
        <Stat label="Taxa de arrasto" help={HELP['commitment:carryover']} value={c.closed ? fmtPct(c.carryover_rate) : '—'} hint={c.closed ? undefined : 'sprint em andamento'} />
      </SimpleGrid>
      <Group justify="space-between">
        <Title order={4}>Por pessoa</Title>
        <ExportMenu dataset="commitment" params={{ sprint_id: data.sprint.id }} />
      </Group>
      <Table.ScrollContainer minWidth={700}>
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Pessoa (quem assumiu no início)</Table.Th>
              <Table.Th className="num">Comprometido</Table.Th>
              <Table.Th className="num">Entregue</Table.Th>
              <Table.Th className="num">Restante</Table.Th>
              <Table.Th className="num">Removido</Table.Th>
              <Table.Th className="num">Adicionado</Table.Th>
              <Table.Th className="num">Aderência</Table.Th>
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
        {SET_LABELS.map(([key, label]) => (
          <Paper key={key} withBorder p="sm">
            <Text size="sm" fw={500} mb={4}>
              {label} ({c.sets[key].length})
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
  if (isLoading) return <Loading rows={8} />;
  if (error) return <ErrorState error={error} />;
  if (!data?.nodes.length) return <Empty title="Nenhum item nesta sprint" action={{ label: 'Ver o status da coleta', to: '/status' }}>A sprint está vazia no Jira, ou os itens ainda não foram coletados.</Empty>;
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
  if (isLoading) return <Loading rows={8} />;
  if (error) return <ErrorState error={error} />;
  if (!data?.nodes.length) return <Empty title="Nenhum item nesta sprint" action={{ label: 'Ver o status da coleta', to: '/status' }}>A sprint está vazia no Jira, ou os itens ainda não foram coletados.</Empty>;
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
  const SPRINT_TABS = ['visao', 'arvore', 'timeline', 'riscos', 'mudancas', 'compromisso', 'planejamento'] as const;
  const requestedTab = get('tab');
  const tab = (SPRINT_TABS as readonly string[]).includes(requestedTab ?? '') ? requestedTab! : 'visao';

  const selector = (
    <Select
      aria-label="Trocar de sprint"
      data={(sprints.data?.sprints ?? []).map((s) => ({
        value: String(s.id),
        label: `${s.name}${s.state === 'active' ? ' (ativa)' : s.state === 'future' ? ' (futura)' : ''}`,
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
  // The board's own page opens its current sprint, so from that sprint the board crumb is just text.
  const onCurrentSprint = sprints.data?.current_sprint_id === sprintId;

  return (
    <>
      <PageHeader
        title={data.sprint.name}
        subtitle={
          <>
            {data.board.name} · {fmtDate(data.timeline.start)} a {fmtDate(data.timeline.end)}
            {data.sprint.goal ? ` · Objetivo: ${data.sprint.goal}` : ''}
          </>
        }
        crumbs={[
          { label: 'Painel', to: '/' },
          { label: data.board.name, to: onCurrentSprint ? undefined : `/boards/${boardId}` },
          { label: data.sprint.name },
        ]}
        actions={selector}
      />
      <Freshness freshness={data.freshness} />
      <Tabs value={tab} onChange={(value) => set({ tab: value })} keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="visao">Visão geral</Tabs.Tab>
          <Tabs.Tab value="arvore">Árvore de trabalho</Tabs.Tab>
          <Tabs.Tab value="timeline">Timeline</Tabs.Tab>
          <Tabs.Tab value="riscos">Itens em aberto</Tabs.Tab>
          <Tabs.Tab value="mudancas">O que mudou</Tabs.Tab>
          <Tabs.Tab value="compromisso">Comprometido × entregue</Tabs.Tab>
          <Tabs.Tab value="planejamento">Planejado × realizado</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="visao">
          <OverviewTab data={data} forecast={<ForecastCard query={forecast} />} onCommitment={() => set({ tab: 'compromisso' })} />
        </Tabs.Panel>
        <Tabs.Panel value="arvore">
          <TreeTab sprintId={sprintId} boardId={boardId} />
        </Tabs.Panel>
        <Tabs.Panel value="timeline">
          <TimelineTab sprintId={sprintId} />
        </Tabs.Panel>
        <Tabs.Panel value="riscos">
          <RiskTable sprintId={sprintId} />
        </Tabs.Panel>
        <Tabs.Panel value="mudancas">
          <ChangesPanel boardId={boardId} />
        </Tabs.Panel>
        <Tabs.Panel value="compromisso">
          <CommitmentTab data={data} />
        </Tabs.Panel>
        <Tabs.Panel value="planejamento">
          <PlanningTab sprintId={sprintId} />
        </Tabs.Panel>
      </Tabs>
    </>
  );
}
