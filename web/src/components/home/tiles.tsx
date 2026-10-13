import { Anchor, Badge, Group, Paper, Progress, ScrollArea, Skeleton, Stack, Text } from '@mantine/core';
import { IconAlertTriangle, IconCalendarOff, IconCheck, IconHistory, IconLayoutKanban, IconPlus } from '@tabler/icons-react';
import type { ComponentType, ReactNode } from 'react';
import { Link } from 'react-router';

import { useHealthCheck } from '../../api/featureHooks';
import { useDashboard, usePeopleOverview } from '../../api/hooks';
import { usePulse } from '../../api/homeHooks';
import type { DashboardRow, PulseEvent } from '../../api/types';
import { useFilters } from '../../lib/filters';
import { fmtPct, fromNow, plural } from '../../lib/format';
import { tileHelp } from '../../lib/indicatorHelp';
import type { TileState } from '../../lib/mosaic';
import { ErrorState, KpiCard, Tipped } from '../common';
import { LoadGauge, SeverityBadge, StateBadge } from '../people/indicators';
import { BoardsTile, type BoardsConfig } from './BoardsTile';
import { alignedSums, Delta, Sparkline } from './parts';

export interface TileProps {
  tile: TileState;
  onConfig: (config: Record<string, unknown>) => void;
}

/** What a tile says when there is nothing to show: an icon and a sentence, centred in its space. */
function TileEmpty({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="tile-empty">
      {icon}
      <Text size="sm" c="dimmed" maw={320}>
        {children}
      </Text>
    </div>
  );
}

/** A tile still fetching: its label is known, its number is not. */
function Waiting({ label, help }: { label: string; help?: string }) {
  return <KpiCard label={label} value={<Skeleton h={28} w={64} />} help={help} />;
}

// ---- indicators over the boards' dashboard rows (what the old Home showed at the top)

function summary(rows: DashboardRow[]) {
  const healthy = rows.filter((r) => !r.error);
  const atRisk = healthy.reduce(
    (sum, r) => sum + Object.entries(r.risk_counts ?? {}).reduce((s, [k, n]) => (k === 'em_dia' ? s : s + (n ?? 0)), 0),
    0,
  );
  const current = healthy.reduce((s, r) => s + (r.throughput.current ?? 0), 0);
  const withPrevious = healthy.filter((r) => r.throughput.previous != null);
  const previous = withPrevious.length ? withPrevious.reduce((s, r) => s + (r.throughput.previous ?? 0), 0) : null;
  const progressed = healthy.filter((r) => r.progress?.count_ratio != null);
  const progress = progressed.length ? progressed.reduce((s, r) => s + (r.progress!.count_ratio ?? 0), 0) / progressed.length : null;
  const closedDelivered = alignedSums(healthy, (t) => (t.committed == null ? null : t.delivered), true);
  const closedCommitted = alignedSums(healthy, (t) => t.committed, true);
  const adherence = closedCommitted.map((c, i) => (c ? closedDelivered[i] / c : null)).filter((v): v is number => v != null);
  const added = healthy.reduce((s, r) => s + (r.trend.at(-1)?.open ? (r.trend.at(-1)?.added ?? 0) : 0), 0);
  return { healthy, atRisk, current, previous, progress, adherence, delivered: alignedSums(healthy, (t) => t.delivered), added };
}

function withDashboard(type: string, label: string, render: (s: ReturnType<typeof summary>) => ReactNode): ComponentType<TileProps> {
  return function DashboardTile() {
    const { data, isLoading, error } = useDashboard();
    if (isLoading) return <Waiting label={label} help={tileHelp(type)} />;
    if (error) return <ErrorState error={error} />;
    const s = summary(data?.rows ?? []);
    return s.healthy.length ? <>{render(s)}</> : <KpiCard label={label} value="—" help={tileHelp(type)}>sem boards com dados</KpiCard>;
  };
}

const RiskTile = withDashboard('kpi:risk', 'Itens em risco agora', (s) => (
  <KpiCard label="Itens em risco agora" value={s.atRisk} help={tileHelp('kpi:risk')}>
    em {plural(s.healthy.length, 'board', 'boards')}
  </KpiCard>
));

const ThroughputTile = withDashboard('kpi:throughput', 'Vazão da janela atual', (s) => (
  <KpiCard
    label="Vazão da janela atual"
    help={tileHelp('kpi:throughput')}
    value={s.current}
    aside={<Sparkline values={s.delivered} label={`Entregues por sprint: ${s.delivered.join(', ')}`} />}
  >
    <Delta value={s.previous == null ? null : s.current - s.previous} better="up" />
    {/* M26: the line is per sprint, not per window, so it says so beside the number it sits next to. */}
    <Text size="xs" c="dimmed" component="div">
      Linha: entregues em cada sprint
    </Text>
  </KpiCard>
));

const ProgressTile = withDashboard('kpi:progress', 'Progresso médio das sprints', (s) => (
  <KpiCard label="Progresso médio das sprints" value={fmtPct(s.progress)} help={tileHelp('kpi:progress')}>
    itens concluídos ÷ itens da sprint
  </KpiCard>
));

const AdherenceTile = withDashboard('kpi:adherence', 'Aderência ao compromisso', (s) => {
  const last = s.adherence.at(-1) ?? null;
  const prior = s.adherence.length > 1 ? s.adherence.at(-2)! : null;
  return (
    <KpiCard
      label="Aderência ao compromisso"
      help={tileHelp('kpi:adherence')}
      value={fmtPct(last)}
      aside={<Sparkline values={s.adherence.map((a) => Math.round(a * 100))} label={`Aderência por sprint: ${s.adherence.map((a) => fmtPct(a)).join(', ')}`} />}
    >
      <Delta value={last != null && prior != null ? Math.round((last - prior) * 100) : null} better="up" unit=" p.p." />
    </KpiCard>
  );
});

const ScopeTile = withDashboard('sprint:scope', 'Escopo adicionado', (s) => (
  <KpiCard label="Escopo adicionado" value={s.added} help={tileHelp('sprint:scope')}>
    itens entraram nas sprints em curso depois do início
  </KpiCard>
));

/** Time elapsed against work done, per board with a running sprint. */
function ElapsedTile() {
  const { data, isLoading, error } = useDashboard();
  const { carry } = useFilters();
  if (isLoading) return <Waiting label="Sprint em curso" help={tileHelp('sprint:elapsed')} />;
  if (error) return <ErrorState error={error} />;
  const now = data ? new Date(data.generated_at).getTime() : Date.now();
  const running = (data?.rows ?? []).filter((r) => !r.error && r.sprint?.state === 'active' && r.sprint.start && r.sprint.end);
  return (
    <Paper withBorder p="md" h="100%">
      <Stack gap="sm">
        <Text className="kpi-label">
          <Tipped help={tileHelp('sprint:elapsed')}>Sprint em curso</Tipped>
        </Text>
        {running.length === 0 && <TileEmpty icon={<IconCalendarOff size={22} aria-hidden />}>Nenhum board com sprint ativa.</TileEmpty>}
        {running.map((row) => {
          const start = new Date(row.sprint!.start!).getTime();
          const end = new Date(row.sprint!.end!).getTime();
          const elapsed = Math.round(Math.min(Math.max((now - start) / (end - start), 0), 1) * 100);
          const done = Math.round((row.progress?.count_ratio ?? 0) * 100);
          const behind = done < elapsed - 20;
          return (
            <Stack key={row.board.id} gap={4}>
              <Group justify="space-between" wrap="nowrap">
                <Anchor component={Link} to={carry(`/boards/${row.board.id}`)} size="sm" fw={600} lineClamp={1}>
                  {row.board.name}
                </Anchor>
                {behind && (
                  <Badge color="yellow" variant="light" size="xs" leftSection={<IconAlertTriangle size={10} />}>
                    atrás do tempo
                  </Badge>
                )}
              </Group>
              <Progress value={elapsed} size="xs" color="gray" aria-label={`${elapsed}% do tempo da sprint passou`} />
              <Progress value={done} size="xs" aria-label={`${done}% dos itens concluídos`} />
              <Text size="xs" c="dimmed">
                {row.sprint!.name}: {elapsed}% do tempo · {done}% dos itens concluídos
              </Text>
            </Stack>
          );
        })}
      </Stack>
    </Paper>
  );
}

/** A kanban board has no sprint to be "in progress": its own weekly vazão and open risk, per board. */
function KanbanTile() {
  const { data, isLoading, error } = useDashboard();
  const { carry } = useFilters();
  if (isLoading) return <Waiting label="Boards kanban" help={tileHelp('kanban:boards')} />;
  if (error) return <ErrorState error={error} />;
  const rows = (data?.rows ?? []).filter((r) => !r.error && r.board.type === 'kanban');
  return (
    <Paper withBorder p="md" h="100%">
      <Stack gap="sm">
        <Text className="kpi-label">
          <Tipped help={tileHelp('kanban:boards')}>Boards kanban</Tipped>
        </Text>
        {rows.length === 0 && <TileEmpty icon={<IconLayoutKanban size={22} aria-hidden />}>Nenhum board kanban acompanhado.</TileEmpty>}
        {rows.map((row) => {
          const atRisk = Object.entries(row.risk_counts ?? {}).reduce((s, [k, n]) => (k === 'em_dia' ? s : s + (n ?? 0)), 0);
          const delivered = row.trend.map((t) => t.delivered);
          const last = row.trend.at(-1) ?? null;
          const prior = row.trend.length > 1 ? row.trend.at(-2)! : null;
          return (
            <Stack key={row.board.id} gap={4}>
              <Group justify="space-between" wrap="nowrap">
                <Anchor component={Link} to={carry(`/boards/${row.board.id}`)} size="sm" fw={600} lineClamp={1}>
                  {row.board.name}
                </Anchor>
                {atRisk > 0 && (
                  <Badge color="yellow" variant="light" size="xs" leftSection={<IconAlertTriangle size={10} />}>
                    {atRisk} em risco
                  </Badge>
                )}
              </Group>
              <Group justify="space-between" wrap="nowrap">
                <Sparkline values={delivered} label={`Entregues por semana: ${delivered.join(', ')}`} />
                <Text size="xs" c="dimmed">
                  {last?.delivered ?? 0} na semana
                </Text>
              </Group>
              <Delta value={last && prior ? last.delivered - prior.delivered : null} better="up" />
            </Stack>
          );
        })}
      </Stack>
    </Paper>
  );
}

// ---- people

function withTeam(type: string, label: string, render: (s: NonNullable<ReturnType<typeof usePeopleOverview>['data']>['summary']) => ReactNode): ComponentType<TileProps> {
  return function TeamTile() {
    const { data, isLoading, error } = usePeopleOverview();
    if (isLoading) return <Waiting label={label} help={tileHelp(type)} />;
    if (error) return <ErrorState error={error} />;
    return data ? <>{render(data.summary)}</> : null;
  };
}

const LoadTile = withTeam('team:load', 'Carga do time', (s) => (
  <KpiCard label="Carga do time" help={tileHelp('team:load')}>
    <LoadGauge workload={{ ratio: s.ratio, state: s.state, hours: s.hours, capacity_hours: s.capacity_hours }} compact />
    <Group justify="center" mt={2}>
      <StateBadge state={s.state} />
    </Group>
  </KpiCard>
));

function PeopleLinks({ people }: { people: { account_id: string; name: string }[] }) {
  const { carry } = useFilters();
  return (
    <Group gap={6}>
      {people.slice(0, 4).map((p) => (
        <Anchor key={p.account_id} component={Link} to={carry(`/pessoas/${encodeURIComponent(p.account_id)}`)} size="xs">
          {p.name}
        </Anchor>
      ))}
      {people.length > 4 && <Text size="xs">+{people.length - 4}</Text>}
    </Group>
  );
}

const OverloadedTile = withTeam('team:overloaded', 'Pessoas acima da capacidade', (s) => (
  <KpiCard label="Pessoas acima da capacidade" value={s.above.length} help={tileHelp('team:overloaded')}>
    {s.above.length ? <PeopleLinks people={s.above} /> : 'Ninguém com mais horas abertas que capacidade.'}
  </KpiCard>
));

const BlocksTile = withTeam('team:blocks', 'Bloqueios ativos', (s) => (
  <KpiCard label="Bloqueios ativos" value={s.blocks.count} help={tileHelp('team:blocks')}>
    {s.blocks.count ? (
      <Stack gap={4}>
        <Group gap={4}>
          {s.blocks.alta > 0 && <SeverityBadge level="alta">{s.blocks.alta} alta</SeverityBadge>}
          {s.blocks.media > 0 && <SeverityBadge level="media">{s.blocks.media} média</SeverityBadge>}
          {s.blocks.baixa > 0 && <SeverityBadge level="baixa">{s.blocks.baixa} baixa</SeverityBadge>}
        </Group>
        <Text size="xs" c="dimmed">
          em {s.blocks.people} {s.blocks.people === 1 ? 'pessoa' : 'pessoas'} · o mais antigo, {s.blocks.oldest_days} d
        </Text>
      </Stack>
    ) : (
      'Nenhum item bloqueado.'
    )}
  </KpiCard>
));

const DeliveredTile = withTeam('team:delivered', 'Entregas na sprint', (s) => (
  <KpiCard label="Entregas na sprint" value={s.delivered} help={tileHelp('team:delivered')}>
    {s.committed ? `de ${s.committed} comprometidas` : 'até agora'}
  </KpiCard>
));

// ---- what is happening

function withPulse(type: string, label: string, render: (p: NonNullable<ReturnType<typeof usePulse>['data']>) => ReactNode): ComponentType<TileProps> {
  return function PulseTile() {
    const { data, isLoading, error } = usePulse();
    if (isLoading) return <Waiting label={label} help={tileHelp(type)} />;
    if (error) return <ErrorState error={error} />;
    return data ? <>{render(data)}</> : null;
  };
}

function DayBars({ days }: { days: { date: string; delivered: number }[] }) {
  const max = Math.max(1, ...days.map((d) => d.delivered));
  const label = `Entregas por dia nos últimos 7 dias: ${days.map((d) => `${d.date.slice(8)}/${d.date.slice(5, 7)} ${d.delivered}`).join('; ')}`;
  return (
    <svg width={days.length * 10} height={30} role="img" aria-label={label}>
      <title>{label}</title>
      {days.map((d, i) => {
        const h = (d.delivered / max) * 28;
        return <rect key={d.date} x={i * 10} y={30 - h} width={7} height={Math.max(h, d.delivered ? 2 : 1)} fill={d.delivered ? 'var(--mantine-primary-color-filled)' : 'var(--border-soft)'} />;
      })}
    </svg>
  );
}

const RecentTile = withPulse('pulse:recent', 'Entregas nos últimos 7 dias', (p) => (
  <KpiCard label="Entregas nos últimos 7 dias" value={p.recent.total} aside={<DayBars days={p.recent.days} />} help={tileHelp('pulse:recent')}>
    <Delta value={p.recent.total - p.recent.previous_total} better="up" />
  </KpiCard>
));

const DueTile = withPulse('pulse:due', 'Vencendo em 7 dias', (p) => (
  <KpiCard label="Vencendo em 7 dias" value={p.due.soon} help={tileHelp('pulse:due')}>
    {p.due.overdue > 0 ? `${p.due.overdue} com prazo já vencido` : 'nenhum prazo vencido'}
  </KpiCard>
));

const EVENT: Record<PulseEvent['kind'], { icon: ReactNode; verb: (e: PulseEvent) => string }> = {
  entregue: { icon: <IconCheck size={14} color="var(--mantine-color-teal-7)" aria-hidden />, verb: (e) => `${e.who ?? 'Alguém'} entregou` },
  bloqueado: { icon: <IconAlertTriangle size={14} color="var(--mantine-color-red-7)" aria-hidden />, verb: (e) => `${e.who ? `${e.who}: ` : ''}bloqueado` },
  escopo: { icon: <IconPlus size={14} color="var(--mantine-color-blue-7)" aria-hidden />, verb: () => 'Entrou na sprint' },
};

const FeedTile = withPulse('pulse:feed', 'Acontecendo agora', (p) => (
  <Paper withBorder p="md" h="100%">
    <Stack gap="xs">
      <Group justify="space-between">
        <Text className="kpi-label">
          <Tipped help={tileHelp('pulse:feed')}>Acontecendo agora</Tipped>
        </Text>
        <Text size="xs" c="dimmed">
          últimas 48 horas
        </Text>
      </Group>
      {p.feed.length === 0 ? (
        <TileEmpty icon={<IconHistory size={22} aria-hidden />}>Nada foi entregue, bloqueado nem entrou nas sprints nas últimas 48 horas.</TileEmpty>
      ) : (
        <ScrollArea.Autosize mah={260} type="auto" offsetScrollbars>
          <Stack gap={8} component="ul" m={0} p={0} style={{ listStyle: 'none' }}>
            {p.feed.map((e) => (
              <Group key={`${e.kind}-${e.key}-${e.at}`} component="li" gap={8} wrap="nowrap" align="flex-start">
                <span style={{ marginTop: 3 }}>{EVENT[e.kind].icon}</span>
                <Text size="sm" style={{ minWidth: 0 }}>
                  <Text span c="dimmed">
                    {EVENT[e.kind].verb(e)}{' '}
                  </Text>
                  <Anchor component={Link} to={`/issues/${e.key}`} className="mono" size="sm">
                    {e.key}
                  </Anchor>{' '}
                  <Text span lineClamp={1}>
                    {e.summary}
                  </Text>{' '}
                  <Text span size="xs" c="dimmed">
                    · {fromNow(e.at)}
                  </Text>
                </Text>
              </Group>
            ))}
          </Stack>
        </ScrollArea.Autosize>
      )}
    </Stack>
  </Paper>
));

/** How healthy the boards' own Jira hygiene is (RF-78): the same count `/status → Saúde dos dados` leads with. */
function HealthTile() {
  const { data, isLoading, error } = useHealthCheck();
  if (isLoading) return <Waiting label="Saúde dos dados" help={tileHelp('saude:pontos')} />;
  if (error) return <ErrorState error={error} />;
  if (!data) return null;
  const troubled = data.items.filter((i) => !i.ok).length;
  return (
    <KpiCard label="Saúde dos dados" value={data.problems} help={tileHelp('saude:pontos')}>
      <Anchor component={Link} to="/status?tab=saude" size="xs">
        {data.ok ? 'nada que distorça os números' : plural(troubled, 'board com ponto de atenção', 'boards com pontos de atenção')}
      </Anchor>
    </KpiCard>
  );
}

function BoardsView({ tile, onConfig }: TileProps) {
  const { data, isLoading, error } = useDashboard();
  if (isLoading) return <Skeleton h={220} />;
  if (error) return <ErrorState error={error} />;
  return <BoardsTile rows={data?.rows ?? []} config={(tile.config ?? {}) as BoardsConfig} onConfig={(next) => onConfig({ ...next })} />;
}

/** A tile from a newer version of Cadência: kept, so nothing is lost, and easy to remove. */
export function UnknownTile({ tile }: TileProps) {
  return (
    <Paper withBorder p="md" h="100%">
      <Text size="sm" c="dimmed">
        O tile “{tile.type}” não existe nesta versão. Remova-o em Personalizar.
      </Text>
    </Paper>
  );
}

export const TILE_VIEWS: Record<string, ComponentType<TileProps>> = {
  'kpi:risk': RiskTile,
  'kpi:throughput': ThroughputTile,
  'kpi:progress': ProgressTile,
  'kpi:adherence': AdherenceTile,
  'sprint:scope': ScopeTile,
  'sprint:elapsed': ElapsedTile,
  'kanban:boards': KanbanTile,
  'team:load': LoadTile,
  'team:overloaded': OverloadedTile,
  'team:blocks': BlocksTile,
  'team:delivered': DeliveredTile,
  'pulse:recent': RecentTile,
  'pulse:feed': FeedTile,
  'pulse:due': DueTile,
  boards: BoardsView,
  'saude:pontos': HealthTile,
};
