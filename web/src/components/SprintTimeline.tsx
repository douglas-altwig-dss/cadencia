import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Drawer,
  Group,
  Paper,
  Progress,
  SegmentedControl,
  Select,
  Slider,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import {
  IconBolt,
  IconBookmark,
  IconBug,
  IconCalendarEvent,
  IconChecklist,
  IconChevronDown,
  IconChevronRight,
  IconChevronUp,
  IconFolder,
  IconPlus,
  IconSearch,
  IconSubtask,
} from '@tabler/icons-react';
import { type KeyboardEvent, type MouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';

import type { Situation, SprintTimelineNode, SprintTimelineView, TimelineState } from '../api/types';
import { useFilters } from '../lib/filters';
import { fmtDate, plural } from '../lib/format';
import { HELP } from '../lib/indicatorHelp';
import {
  activeAt,
  type Axis,
  axisOf,
  barOf,
  branchKeys,
  durationDays,
  dueInstant,
  type Filters,
  type FlatRow,
  flatten,
  instantAt,
  isAtRisk,
  isItem,
  type Lane,
  personLanes,
  position,
  type StateFilter,
  sprintDay,
  summaryOf,
  ticksOf,
  weekends,
} from '../lib/sprintTimeline';
import { InfoTip } from './common';
import { EvidenceList, RiskBadge, SITUATIONS } from './risk';

const STATE: Record<TimelineState, { label: string; color: string; mantine: string }> = {
  concluido: { label: 'concluído', color: 'var(--mantine-color-teal-6)', mantine: 'teal' },
  andamento: { label: 'em andamento', color: 'var(--mantine-color-blue-6)', mantine: 'blue' },
  bloqueado: { label: 'bloqueado', color: 'var(--mantine-color-red-6)', mantine: 'red' },
  aberto: { label: 'não iniciado', color: 'var(--mantine-color-gray-5)', mantine: 'gray' },
};

const STATES = Object.keys(STATE) as TimelineState[];
const ZOOM_MAX = 4;

type View = 'hierarquia' | 'pessoa';

/** What kind of thing a row is, by its hierarchy level first (classification never depends on a type name). */
function kindOf(node: SprintTimelineNode) {
  const level = node.issue?.level ?? 1;
  const type = (node.issue?.type ?? '').toLowerCase();
  if (node.synthetic) return { icon: IconFolder, label: 'Grupo' };
  if (level > 0) return { icon: IconBolt, label: 'Épico' };
  if (level < 0) return { icon: IconSubtask, label: 'Subtarefa' };
  if (type.includes('bug')) return { icon: IconBug, label: 'Bug' };
  if (/task|tarefa/.test(type)) return { icon: IconChecklist, label: node.issue?.type ?? 'Tarefa' };
  return { icon: IconBookmark, label: node.issue?.type ?? 'História' };
}

const toggled = <T,>(set: ReadonlySet<T>, value: T): Set<T> => {
  const next = new Set(set);
  if (!next.delete(value)) next.add(value);
  return next;
};

/**
 * The sprint on a time axis, in two readings of the same items: by hierarchy (the work tree, an epic's
 * bar spanning what is under it) or by person (one lane each). Interaction is layered on top and never
 * the only way to a fact: the summary chips filter, the bars and rows open their details, the keyboard
 * walks the rows, and the cursor reads the date and how much was in progress that day.
 */
export function SprintTimeline({ view }: { view: SprintTimelineView }) {
  const { carry } = useFilters();
  const [mode, setMode] = useState<View>('hierarquia');
  const [zoom, setZoom] = useState(1);
  const [query, setQuery] = useState('');
  const [state, setState] = useState<StateFilter>('todos');
  const [situation, setSituation] = useState<Situation | null>(null);
  const [subtasks, setSubtasks] = useState(true);
  const [atRisk, setAtRisk] = useState(false);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [foldedLanes, setFoldedLanes] = useState<ReadonlySet<string>>(new Set());
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [scrollToToday, setScrollToToday] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const headTrackRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const axis = useMemo(() => axisOf(view.window, view.nodes), [view]);
  const ticks = useMemo(() => ticksOf(axis), [axis]);
  const off = useMemo(() => weekends(axis), [axis]);
  const filters: Filters = useMemo(
    () => ({ query, state, subtasks, collapsed, atRisk, situation: situation ?? undefined }),
    [query, state, subtasks, collapsed, atRisk, situation],
  );
  const rows = useMemo(() => (mode === 'hierarquia' ? flatten(view.nodes, filters) : []), [mode, view.nodes, filters]);
  const lanes = useMemo(() => (mode === 'pessoa' ? personLanes(view.nodes, filters) : []), [mode, view.nodes, filters]);
  const summary = useMemo(() => summaryOf(view.nodes), [view.nodes]);
  const day = useMemo(() => sprintDay(view.window, axis.today), [view.window, axis.today]);

  const byKey = useMemo(() => {
    const map = new Map<string, SprintTimelineNode>();
    const walk = (list: SprintTimelineNode[]) =>
      list.forEach((n) => {
        map.set(n.key, n);
        walk(n.children);
      });
    walk(view.nodes);
    return map;
  }, [view.nodes]);

  // The order the rows are drawn in, so the detail panel can step to the previous or next one.
  const order = useMemo(
    () => (mode === 'hierarquia' ? rows.map((r) => r.node.key) : lanes.flatMap((l) => (foldedLanes.has(l.name) ? [] : l.rows.map((r) => r.node.key)))),
    [mode, rows, lanes, foldedLanes],
  );

  const today = position(axis.today, axis);
  const sprintEnd = position(new Date(view.window.end).getTime(), axis);
  const beyondEnd = new Date(view.window.end).getTime() < axis.end;
  const filtered = query.trim() !== '' || state !== 'todos' || atRisk || situation !== null;
  const { counts } = view;
  const empty = mode === 'hierarquia' ? rows.length === 0 : lanes.length === 0;
  const doneItems = summary.states.concluido;
  const detail = detailKey ? byKey.get(detailKey) ?? null : null;
  const detailIndex = detailKey ? order.indexOf(detailKey) : -1;

  // Going to today needs the zoomed width first, so it waits for the commit that widens the track.
  useEffect(() => {
    if (!scrollToToday || !scrollRef.current) return;
    const el = scrollRef.current;
    el.scrollLeft = (today / 100) * el.scrollWidth - el.clientWidth / 2;
    setScrollToToday(false);
  }, [scrollToToday, today]);

  const pickState = (value: TimelineState) => setState((current) => (current === value ? 'todos' : value));
  const pickSituation = (value: Situation) => setSituation((current) => (current === value ? null : value));
  const toggle = (key: string) => setCollapsed((current) => toggled(current, key));
  const openDetail = (key: string) => setDetailKey(key);

  const onMove = (event: MouseEvent<HTMLDivElement>) => {
    const track = headTrackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const fraction = (event.clientX - rect.left) / rect.width;
    setCursor(fraction >= 0 && fraction <= 1 ? fraction : null);
  };

  // Arrow keys walk the rows; Enter or Space opens the one that has focus. Links keep their own keys.
  const onListKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const key = target.dataset.tlRow;
    if (!key) return;
    const focusables = [...(listRef.current?.querySelectorAll<HTMLElement>('[data-tl-row]') ?? [])];
    const at = focusables.indexOf(target);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = focusables[Math.min(focusables.length - 1, Math.max(0, at + (event.key === 'ArrowDown' ? 1 : -1)))];
      next?.focus();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openDetail(key);
    }
  };

  const onLabelClick = (event: MouseEvent<HTMLDivElement>, key: string) => {
    if ((event.target as HTMLElement).closest('a, button, [role="img"]')) return;
    openDetail(key);
  };

  const cursorDate = cursor != null ? instantAt(cursor, axis) : null;
  const cursorLive = cursorDate != null ? activeAt(view.nodes, cursorDate, axis.today) : 0;
  const cursorLeft = cursor != null ? cursor * 100 : null;

  return (
    <Stack gap="md">
      <Paper withBorder p="md">
        <Group justify="space-between" align="baseline" mb="xs" wrap="wrap" gap="xs">
          <Group gap={6} wrap="nowrap">
            <Text fw={600} size="sm">
              Resumo da sprint
            </Text>
            <InfoTip label={HELP['timeline:summary']} about="Resumo da sprint" />
          </Group>
          <Text size="sm" c="dimmed">
            {doneItems} de {plural(summary.items, 'item', 'itens')} concluído{doneItems === 1 ? '' : 's'}
          </Text>
        </Group>
        <Progress.Root size="lg" radius="sm" aria-label={`Itens por situação: ${STATES.map((s) => `${summary.states[s]} ${STATE[s].label}`).join(', ')}`}>
          {STATES.filter((s) => summary.states[s] > 0).map((s) => (
            <Progress.Section key={s} value={(summary.states[s] / summary.items) * 100} color={STATE[s].mantine} />
          ))}
        </Progress.Root>
        <Group justify="space-between" gap="md" mt="sm" wrap="wrap">
          <Group gap="xs" wrap="wrap">
            {STATES.map((s) => (
              <Button
                key={s}
                size="compact-xs"
                variant={state === s ? 'filled' : 'subtle'}
                color="gray"
                aria-pressed={state === s}
                onClick={() => pickState(s)}
                leftSection={<span className={`tl-swatch${s === 'bloqueado' ? ' is-striped' : ''}`} style={{ background: STATE[s].color }} aria-hidden />}
              >
                {summary.states[s]} {STATE[s].label}
              </Button>
            ))}
          </Group>
          <Group gap="xs" wrap="wrap">
            {SITUATIONS.filter((s) => s.key !== 'em_dia' && (summary.situations[s.key] ?? 0) > 0).map((s) => {
              const Icon = s.icon;
              const on = situation === s.key;
              return (
                <Badge
                  key={s.key}
                  component="button"
                  type="button"
                  size="sm"
                  variant={on ? 'filled' : 'light'}
                  color={s.color}
                  aria-pressed={on}
                  onClick={() => pickSituation(s.key)}
                  leftSection={<Icon size={12} stroke={2} aria-hidden />}
                  styles={{ label: { textTransform: 'none', fontWeight: 500 } }}
                >
                  {summary.situations[s.key]} {s.label.toLowerCase()}
                </Badge>
              );
            })}
          </Group>
        </Group>
        <Group gap="xs" mt="md" wrap="nowrap" align="center">
          <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
            Dia {day.day} de {day.total}
          </Text>
          <Progress value={day.share} size="xs" radius="sm" aria-label={`Dia ${day.day} de ${day.total} da sprint`} style={{ flex: 1 }} />
          <InfoTip label={HELP['timeline:time']} about="Tempo da sprint" />
        </Group>
      </Paper>

      <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
        <Group align="flex-end" wrap="wrap" gap="sm">
          <SegmentedControl
            aria-label="Agrupar por"
            value={mode}
            onChange={(value) => setMode(value as View)}
            size="xs"
            data={[
              { value: 'hierarquia', label: 'Por hierarquia' },
              { value: 'pessoa', label: 'Por pessoa' },
            ]}
          />
          <TextInput
            aria-label="Buscar item"
            placeholder="Chave, resumo ou responsável"
            leftSection={<IconSearch size={14} />}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            w={250}
          />
          <Select
            aria-label="Filtrar por situação"
            data={[
              { value: 'todos', label: 'Todas as situações' },
              { value: 'andamento', label: 'Em andamento' },
              { value: 'bloqueado', label: 'Bloqueados' },
              { value: 'concluido', label: 'Concluídos' },
              { value: 'aberto', label: 'Não iniciados' },
            ]}
            value={state}
            onChange={(value) => setState((value ?? 'todos') as StateFilter)}
            allowDeselect={false}
            w={180}
          />
          <Switch label="Só em risco" checked={atRisk} onChange={(e) => setAtRisk(e.currentTarget.checked)} mb={6} />
          <Switch label="Subtarefas" checked={subtasks} onChange={(e) => setSubtasks(e.currentTarget.checked)} mb={6} />
          {filtered && (
            <Button
              variant="subtle"
              size="xs"
              mb={4}
              onClick={() => {
                setQuery('');
                setState('todos');
                setSituation(null);
                setAtRisk(false);
              }}
            >
              Limpar filtros
            </Button>
          )}
        </Group>
        <Group gap="sm" wrap="nowrap" align="center">
          <Slider
            aria-label="Zoom do eixo do tempo"
            min={1}
            max={ZOOM_MAX}
            step={0.5}
            value={zoom}
            onChange={setZoom}
            label={(v) => `${v}×`}
            marks={[
              { value: 1, label: '1×' },
              { value: 2, label: '2×' },
              { value: ZOOM_MAX, label: `${ZOOM_MAX}×` },
            ]}
            w={150}
          />
          {mode === 'hierarquia' && (
            <>
              <Button variant="default" size="xs" onClick={() => setCollapsed(new Set())}>
                Expandir
              </Button>
              <Button variant="default" size="xs" onClick={() => setCollapsed(new Set(branchKeys(view.nodes)))}>
                Recolher
              </Button>
            </>
          )}
          <Button
            variant="default"
            size="xs"
            leftSection={<IconCalendarEvent size={14} aria-hidden />}
            onClick={() => {
              setZoom((z) => Math.max(z, 2));
              setScrollToToday(true);
            }}
          >
            Hoje
          </Button>
        </Group>
      </Group>

      <Paper withBorder p="md">
        <Group justify="space-between" mb="sm" wrap="wrap" gap="xs">
          <Text size="xs" c="dimmed">
            {counts.epicos} {counts.epicos === 1 ? 'épico' : 'épicos'} · {plural(counts.itens, 'item', 'itens')} · {plural(counts.subtarefas, 'subtarefa', 'subtarefas')}
          </Text>
          <Text size="xs" c="dimmed" component="span">
            <span className="tl-end-mark" aria-hidden /> fim da sprint
            {view.window.today && <> · hoje: {fmtDate(view.window.today)}</>}
          </Text>
        </Group>
        {empty ? (
          <Text size="sm" c="dimmed">
            {filtered ? 'Nenhum item com esses filtros.' : 'Nenhum item nesta sprint.'}
          </Text>
        ) : (
          <div ref={scrollRef} className={`tl-scroll${zoom > 1 ? ' is-wide' : ''}`}>
            <div
              ref={listRef}
              className="tl tl-sprint"
              role="list"
              aria-label={mode === 'pessoa' ? 'Itens da sprint por pessoa' : 'Itens da sprint ao longo do tempo'}
              onMouseMove={onMove}
              onMouseLeave={() => setCursor(null)}
              onKeyDown={onListKey}
              style={{
                ['--cursor' as string]: cursorLeft != null ? `${cursorLeft}%` : '-10px',
                minWidth: zoom > 1 ? `${zoom * 100}%` : undefined,
              }}
            >
              <div className="tl-row tl-head">
                <span />
                <div className="tl-track" ref={headTrackRef}>
                  {ticks.map((tick) => (
                    <span key={tick.at} className="tl-tick" style={{ left: `${position(tick.at, axis)}%` }}>
                      {tick.label}
                    </span>
                  ))}
                  {cursorLeft != null && cursorDate != null && (
                    <span className={`tl-cursor-label${cursorLeft > 75 ? ' is-left' : ''}`} style={{ left: `${cursorLeft}%` }} aria-hidden>
                      {fmtDate(new Date(cursorDate).toISOString())} · {plural(cursorLive, 'item', 'itens')} em andamento
                    </span>
                  )}
                </div>
              </div>
              {mode === 'hierarquia'
                ? rows.map((row) => (
                    <ItemRow
                      key={row.node.key}
                      row={row}
                      axis={axis}
                      off={off}
                      ticks={ticks}
                      today={today}
                      sprintEnd={sprintEnd}
                      beyondEnd={beyondEnd}
                      open={detailKey === row.node.key}
                      onToggle={toggle}
                      onOpen={openDetail}
                      onLabelClick={onLabelClick}
                    />
                  ))
                : lanes.map((lane) => (
                    <LaneBlock
                      key={lane.name}
                      lane={lane}
                      folded={foldedLanes.has(lane.name)}
                      onFold={() => setFoldedLanes((current) => toggled(current, lane.name))}
                      axis={axis}
                      off={off}
                      ticks={ticks}
                      today={today}
                      sprintEnd={sprintEnd}
                      beyondEnd={beyondEnd}
                      detailKey={detailKey}
                      onOpen={openDetail}
                      onLabelClick={onLabelClick}
                    />
                  ))}
            </div>
          </div>
        )}
      </Paper>

      <Text size="xs" c="dimmed" component="div">
        Clique numa barra ou num nome para ver o item ao lado. Setas sobem e descem entre as linhas, Enter abre a que estiver focada. Passe o
        mouse sobre o eixo para ler a data e quantos itens estavam em andamento nela. Cada barra vai de quando o item entrou em andamento até a
        conclusão, ou até hoje. A ponta cortada à esquerda começou antes da sprint, <IconPlus size={11} style={{ verticalAlign: '-1px' }} aria-hidden /> marca o
        que entrou depois do início, e a linha tracejada é o fim da sprint; o que passa dela aparece sombreado.
      </Text>

      <Drawer
        opened={detail != null}
        onClose={() => setDetailKey(null)}
        position="right"
        size="md"
        title={detail ? `${detail.key}` : ''}
        aria-label="Detalhes do item"
      >
        {detail && (
          <ItemDetail
            node={detail}
            axis={axis}
            link={carry(`/issues/${detail.key}`)}
            position={detailIndex >= 0 ? { index: detailIndex, total: order.length } : null}
            onPrev={detailIndex > 0 ? () => openDetail(order[detailIndex - 1]) : undefined}
            onNext={detailIndex >= 0 && detailIndex < order.length - 1 ? () => openDetail(order[detailIndex + 1]) : undefined}
          />
        )}
      </Drawer>
    </Stack>
  );
}

function ItemDetail({
  node,
  axis,
  link,
  position: at,
  onPrev,
  onNext,
}: {
  node: SprintTimelineNode;
  axis: Axis;
  link: string;
  position: { index: number; total: number } | null;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const kind = kindOf(node);
  const Icon = kind.icon;
  const issue = node.issue;
  const days = node.start ? durationDays(node.start, node.end, axis.today) : null;
  const due = issue?.due_date && isItem(node) ? issue.due_date : null;
  const late = due != null && node.state !== 'concluido' && dueInstant(due) < axis.today;
  return (
    <Stack gap="md">
      <Group gap="xs" wrap="nowrap">
        <Icon size={16} color="var(--mantine-color-dimmed)" aria-hidden />
        <Text size="xs" c="dimmed">
          {kind.label}
        </Text>
        <Badge variant="light" color={STATE[node.state].mantine} size="sm">
          {STATE[node.state].label}
        </Badge>
        {node.risk && node.risk.situation !== 'em_dia' && isAtRisk(node) && <RiskBadge situation={node.risk.situation} />}
      </Group>
      <Text fw={600}>{node.label}</Text>
      <Stack gap={6}>
        <DetailLine label="Início" value={node.start ? fmtDate(node.start, true) : 'ainda não começou'} />
        <DetailLine label="Conclusão" value={node.end ? fmtDate(node.end, true) : node.start ? 'em aberto' : '—'} />
        <DetailLine label="Duração" value={days != null ? plural(days, 'dia', 'dias') : '—'} />
        {due && <DetailLine label="Prazo" value={`${fmtDate(due, true)}${late ? ' · vencido' : ''}`} />}
        <DetailLine label="Responsável" value={issue?.assignee ?? 'Sem responsável'} />
        {issue?.status && <DetailLine label="Status no Jira" value={issue.status} />}
        {issue?.estimate != null && <DetailLine label="Estimativa" value={`${issue.estimate} pts`} />}
        {node.carried && <DetailLine label="Na sprint" value="começou antes da sprint" />}
        {node.added && <DetailLine label="Na sprint" value="entrou depois do início" />}
      </Stack>
      {node.risk && node.risk.situation !== 'em_dia' && (
        <Stack gap="xs">
          <Text size="sm" fw={600}>
            Por que está nesta situação
          </Text>
          <EvidenceList risk={node.risk} />
        </Stack>
      )}
      <Group justify="space-between" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <ActionIcon variant="default" aria-label="Item anterior" disabled={!onPrev} onClick={onPrev}>
            <IconChevronUp size={16} />
          </ActionIcon>
          <ActionIcon variant="default" aria-label="Próximo item" disabled={!onNext} onClick={onNext}>
            <IconChevronDown size={16} />
          </ActionIcon>
          {at && (
            <Text size="xs" c="dimmed">
              {at.index + 1} de {at.total}
            </Text>
          )}
        </Group>
        <Anchor component={Link} to={link} size="sm">
          Abrir item <IconChevronRight size={12} style={{ verticalAlign: '-2px' }} aria-hidden />
        </Anchor>
      </Group>
    </Stack>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <Group gap="xs" wrap="nowrap" align="baseline">
      <Text size="sm" c="dimmed" style={{ width: 110, flex: '0 0 auto' }}>
        {label}
      </Text>
      <Text size="sm">{value}</Text>
    </Group>
  );
}

interface TrackProps {
  axis: Axis;
  off: { left: number; width: number }[];
  ticks: { at: number; label: string }[];
  today: number;
  sprintEnd: number;
  beyondEnd: boolean;
}

function LaneBlock({
  lane,
  folded,
  onFold,
  detailKey,
  onOpen,
  onLabelClick,
  ...track
}: TrackProps & {
  lane: Lane;
  folded: boolean;
  onFold: () => void;
  detailKey: string | null;
  onOpen: (key: string) => void;
  onLabelClick: (event: MouseEvent<HTMLDivElement>, key: string) => void;
}) {
  return (
    <div className="tl-lane" role="group" aria-label={`${lane.name}: ${plural(lane.items, 'item', 'itens')}`}>
      <div className="tl-row tl-lane-head" role="presentation">
        <div className="tl-label">
          <ActionIcon size="xs" variant="subtle" color="gray" aria-expanded={!folded} aria-label={`${folded ? 'Mostrar' : 'Ocultar'} itens de ${lane.name}`} onClick={onFold}>
            {folded ? <IconChevronRight size={14} /> : <IconChevronDown size={14} />}
          </ActionIcon>
          <Text size="sm" fw={600} lineClamp={1}>
            {lane.name}
          </Text>
          <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
            {plural(lane.items, 'item', 'itens')} · {lane.done} concluído{lane.done === 1 ? '' : 's'}
            {lane.atRisk > 0 && ` · ${lane.atRisk} em risco`}
          </Text>
        </div>
        <div className="tl-track tl-track-quiet">
          {track.off.map((w, i) => (
            <span key={`w${i}`} className="tl-weekend" style={{ left: `${w.left}%`, width: `${w.width}%` }} aria-hidden />
          ))}
          <span className="tl-todayline" style={{ left: `${track.today}%` }} aria-hidden />
          {track.beyondEnd && <span className="tl-beyond" style={{ left: `${track.sprintEnd}%` }} aria-hidden />}
          <span className="tl-sprint-end" style={{ left: `${track.sprintEnd}%` }} aria-hidden />
        </div>
      </div>
      {!folded &&
        lane.rows.map((row) => (
          <ItemRow
            key={row.node.key}
            row={row}
            {...track}
            open={detailKey === row.node.key}
            onToggle={() => undefined}
            onOpen={onOpen}
            onLabelClick={onLabelClick}
            showOwner={false}
          />
        ))}
    </div>
  );
}

interface RowProps extends TrackProps {
  row: FlatRow;
  open: boolean;
  onToggle: (key: string) => void;
  onOpen: (key: string) => void;
  onLabelClick: (event: MouseEvent<HTMLDivElement>, key: string) => void;
  showOwner?: boolean;
}

/** One row of either reading: its label on the left, its bar on the axis. Focusable, and clickable anywhere but its links. */
function ItemRow({ row, axis, off, ticks, today, sprintEnd, beyondEnd, open, onToggle, onOpen, onLabelClick, showOwner = true }: RowProps) {
  const { node, depth, hasChildren, collapsed: folded } = row;
  const kind = kindOf(node);
  const Icon = kind.icon;
  const container = node.synthetic || (node.issue?.level ?? 0) > 0;
  const bar = barOf(node, axis);
  const due = node.issue?.due_date && !container ? dueInstant(node.issue.due_date) : null;
  const late = due != null && node.state !== 'concluido' && due < axis.today;
  const from = node.start ? fmtDate(node.start, true) : null;
  const days = node.start ? durationDays(node.start, node.end, axis.today) : 0;
  const span = bar
    ? `${STATE[node.state].label}, de ${from} ${node.end ? `a ${fmtDate(node.end, true)}` : 'até hoje'}${node.carried ? ' (começou antes da sprint)' : ''}`
    : `${STATE[node.state].label}: sem início registrado`;
  const risky = isAtRisk(node) && !container;
  const interactive = !node.synthetic;

  return (
    <div
      className={`tl-row${open ? ' is-open' : ''}${interactive ? ' is-interactive' : ''}`}
      role="listitem"
      tabIndex={interactive ? 0 : undefined}
      data-tl-row={interactive ? node.key : undefined}
      aria-current={open ? 'true' : undefined}
      style={{ ['--depth' as string]: depth }}
    >
      <div className="tl-label" onClick={interactive ? (e) => onLabelClick(e, node.key) : undefined}>
        {hasChildren ? (
          <ActionIcon
            size="xs"
            variant="subtle"
            color="gray"
            aria-expanded={!folded}
            aria-label={`${folded ? 'Expandir' : 'Recolher'} ${node.key}`}
            onClick={() => onToggle(node.key)}
          >
            {folded ? <IconChevronRight size={14} /> : <IconChevronDown size={14} />}
          </ActionIcon>
        ) : (
          <span className="tl-caret" aria-hidden />
        )}
        <span title={kind.label} aria-label={kind.label} role="img" style={{ display: 'inline-flex', flex: '0 0 auto' }}>
          <Icon size={14} color="var(--mantine-color-dimmed)" aria-hidden />
        </span>
        {node.synthetic ? (
          <Text size="sm" fw={600} lineClamp={1}>
            {node.label}
          </Text>
        ) : (
          <Anchor component={Link} to={`/issues/${node.key}`} size="sm" className="tl-key" title={`${node.key} ${node.label}`}>
            <span className="mono">{node.key}</span>{' '}
            <Text span size="sm" c="dimmed" className="tl-summary" fw={container ? 600 : undefined}>
              {node.label}
            </Text>
          </Anchor>
        )}
        {node.added && (
          <span title="Entrou na sprint depois do início" aria-label="Entrou na sprint depois do início" role="img" style={{ display: 'inline-flex' }}>
            <IconPlus size={12} color="var(--mantine-color-blue-7)" aria-hidden />
          </span>
        )}
        {risky && node.risk && <RiskBadge situation={node.risk.situation} size="xs" />}
        {showOwner && node.issue?.assignee && (
          <Text size="xs" c="dimmed" className="tl-summary" lineClamp={1} style={{ flex: '0 0 auto', maxWidth: 110 }}>
            {node.issue.assignee}
          </Text>
        )}
      </div>
      <div className="tl-track">
        {off.map((w, i) => (
          <span key={`w${i}`} className="tl-weekend" style={{ left: `${w.left}%`, width: `${w.width}%` }} aria-hidden />
        ))}
        {ticks.map((tick) => (
          <span key={tick.at} className="tl-grid" style={{ left: `${position(tick.at, axis)}%` }} aria-hidden />
        ))}
        {beyondEnd && <span className="tl-beyond" style={{ left: `${sprintEnd}%` }} aria-hidden />}
        <span className="tl-sprint-end" style={{ left: `${sprintEnd}%` }} aria-hidden />
        <span className="tl-todayline" style={{ left: `${today}%` }} aria-hidden />
        {bar ? (
          <span
            className={`tl-bar${node.state === 'bloqueado' ? ' is-striped' : ''}${bar.clipped ? ' is-clipped' : ''}${container ? ' is-summary' : ''}${interactive ? ' is-clickable' : ''}`}
            style={{ left: `${bar.left}%`, width: `${bar.width}%`, background: STATE[node.state].color }}
            role="img"
            aria-label={`${node.key}: ${span}`}
            title={`${node.key}: ${span}`}
            onClick={interactive ? () => onOpen(node.key) : undefined}
          >
            {!container && bar.width >= 9 && (
              <span className="tl-bar-days" aria-hidden>
                {days} {days === 1 ? 'dia' : 'dias'}
              </span>
            )}
          </span>
        ) : (
          <span className="tl-note" title={span}>
            {node.issue?.status ?? STATE[node.state].label}
          </span>
        )}
        {due != null && due >= axis.start && due <= axis.end && (
          <span
            className={`tl-due${late ? ' is-late' : ''}`}
            style={{ left: `${position(due, axis)}%` }}
            role="img"
            aria-label={`${late ? 'Prazo vencido' : 'Prazo'}: ${fmtDate(node.issue!.due_date, true)}`}
            title={`${late ? 'Prazo vencido' : 'Prazo'}: ${fmtDate(node.issue!.due_date, true)}`}
          />
        )}
      </div>
    </div>
  );
}
