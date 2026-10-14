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

import type { Situation, SprintTimelineNode, SprintTimelineView, TimelineCounts, TimelineState } from '../api/types';
import { type Messages, useT } from '../i18n';
import { useFilters } from '../lib/filters';
import { fmtDate, fmtDay } from '../lib/format';
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
} from '../lib/timeline';
import { InfoTip } from './common';
import { EvidenceList, RiskBadge, SITUATIONS } from './risk';

/** Colours only; the words are `tracking.timeline.states`, read at render time. */
const STATE: Record<TimelineState, { color: string; mantine: string }> = {
  concluido: { color: 'var(--mantine-color-teal-6)', mantine: 'teal' },
  andamento: { color: 'var(--mantine-color-blue-6)', mantine: 'blue' },
  bloqueado: { color: 'var(--mantine-color-red-6)', mantine: 'red' },
  aberto: { color: 'var(--mantine-color-gray-5)', mantine: 'gray' },
};

type TimelineText = Messages['tracking']['timeline'];

const STATES = Object.keys(STATE) as TimelineState[];
const ZOOM_MAX = 4;

type View = 'hierarquia' | 'pessoa';

/** What kind of thing a row is, by its hierarchy level first (classification never depends on a type name). */
function kindOf(node: SprintTimelineNode, m: TimelineText) {
  const level = node.issue?.level ?? 1;
  const type = (node.issue?.type ?? '').toLowerCase();
  if (node.synthetic) return { icon: IconFolder, label: m.kindGroup };
  if (level > 0) return { icon: IconBolt, label: m.kindEpic };
  if (level < 0) return { icon: IconSubtask, label: m.kindSubtask };
  if (type.includes('bug')) return { icon: IconBug, label: m.kindBug };
  if (/task|tarefa/.test(type)) return { icon: IconChecklist, label: node.issue?.type ?? m.kindTask };
  return { icon: IconBookmark, label: node.issue?.type ?? m.kindStory };
}

const toggled = <T,>(set: ReadonlySet<T>, value: T): Set<T> => {
  const next = new Set(set);
  if (!next.delete(value)) next.add(value);
  return next;
};

/** What a period timeline says instead of the sprint's own words. */
export interface PeriodText {
  summaryTitle: string;
  /** How the summary is counted, behind its "i". */
  summaryHelp: string;
  none: string;
  listAria: string;
  help: string;
}

/** The sprint's timeline: the reference every other timeline follows. */
export function SprintTimeline({ view }: { view: SprintTimelineView }) {
  return <WorkTimeline window={view.window} nodes={view.nodes} counts={view.counts} />;
}

/**
 * Work on a time axis. For a sprint (no `period`) there are two readings of the same items: by
 * hierarchy (the work tree, an epic's bar spanning what is under it) or by person (one lane each), plus
 * the sprint's own marks — its end, how far into it today is, what came in after the start. For a
 * `period` (a person's last weeks) it is the hierarchy alone, over the window, without those marks.
 * Interaction is the same for both and never the only way to a fact: the summary chips filter, the
 * bars and rows open their details, the keyboard walks the rows, and the cursor reads the date and
 * how much was in progress that day.
 */
export function WorkTimeline({
  window,
  nodes,
  counts,
  period,
}: {
  window: SprintTimelineView['window'];
  nodes: SprintTimelineNode[];
  counts: TimelineCounts;
  period?: PeriodText;
}) {
  const { carry } = useFilters();
  const m = useT().tracking.timeline;
  const sprint = period === undefined;
  const view = { window, nodes, counts };
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
              {period?.summaryTitle ?? m.summaryTitle}
            </Text>
            <InfoTip label={period?.summaryHelp ?? HELP['timeline:summary']} about={period?.summaryTitle ?? m.summaryTitle} />
          </Group>
          <Text size="sm" c="dimmed">
            {m.summaryDone(doneItems, summary.items)}
          </Text>
        </Group>
        <Progress.Root size="lg" radius="sm" aria-label={m.byState(STATES.map((s) => m.stateCount(summary.states[s], m.states[s])).join(', '))}>
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
                {m.stateCount(summary.states[s], m.states[s])}
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
                  {m.situationCount(summary.situations[s.key] ?? 0, s.label)}
                </Badge>
              );
            })}
          </Group>
        </Group>
        {sprint && (
          <Group gap="xs" mt="md" wrap="nowrap" align="center">
            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
              {m.day(day.day, day.total)}
            </Text>
            <Progress value={day.share} size="xs" radius="sm" aria-label={m.dayAria(day.day, day.total)} style={{ flex: 1 }} />
            <InfoTip label={HELP['timeline:time']} about={m.sprintTime} />
          </Group>
        )}
      </Paper>

      <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
        <Group align="flex-end" wrap="wrap" gap="sm">
          {sprint && (
            <SegmentedControl
              aria-label={m.groupBy}
              value={mode}
              onChange={(value) => setMode(value as View)}
              size="xs"
              data={[
                { value: 'hierarquia', label: m.byHierarchy },
                { value: 'pessoa', label: m.byPerson },
              ]}
            />
          )}
          <TextInput
            aria-label={m.search}
            placeholder={m.searchPlaceholder}
            leftSection={<IconSearch size={14} />}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            w={250}
          />
          <Select
            aria-label={m.filterState}
            data={[
              { value: 'todos', label: m.allStates },
              { value: 'andamento', label: m.inProgress },
              { value: 'bloqueado', label: m.blocked },
              { value: 'concluido', label: m.done },
              { value: 'aberto', label: m.notStarted },
            ]}
            value={state}
            onChange={(value) => setState((value ?? 'todos') as StateFilter)}
            allowDeselect={false}
            w={180}
          />
          <Switch label={m.onlyAtRisk} checked={atRisk} onChange={(e) => setAtRisk(e.currentTarget.checked)} mb={6} />
          <Switch label={m.subtasks} checked={subtasks} onChange={(e) => setSubtasks(e.currentTarget.checked)} mb={6} />
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
              {m.clearFilters}
            </Button>
          )}
        </Group>
        <Group gap="sm" wrap="nowrap" align="center">
          <Slider
            aria-label={m.zoom}
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
                {m.expand}
              </Button>
              <Button variant="default" size="xs" onClick={() => setCollapsed(new Set(branchKeys(view.nodes)))}>
                {m.collapse}
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
            {m.today}
          </Button>
        </Group>
      </Group>

      <Paper withBorder p="md">
        <Group justify="space-between" mb="sm" wrap="wrap" gap="xs">
          <Text size="xs" c="dimmed">
            {m.counts(counts.epicos, counts.itens, counts.subtarefas)}
          </Text>
          <Text size="xs" c="dimmed" component="span">
            {sprint && (
              <>
                <span className="tl-end-mark" aria-hidden /> {m.sprintEnd}
              </>
            )}
            {view.window.today && (sprint ? m.todayOn(fmtDate(view.window.today)) : m.todayIs(fmtDate(view.window.today)))}
          </Text>
        </Group>
        {empty ? (
          <Text size="sm" c="dimmed">
            {filtered ? m.noneFiltered : (period?.none ?? m.none)}
          </Text>
        ) : (
          <div ref={scrollRef} className={`tl-scroll${zoom > 1 ? ' is-wide' : ''}`}>
            <div
              ref={listRef}
              className="tl tl-sprint"
              role="list"
              aria-label={mode === 'pessoa' ? m.listByPerson : (period?.listAria ?? m.listOverTime)}
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
                      {m.cursor(fmtDate(new Date(cursorDate).toISOString()), cursorLive)}
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
                      sprint={sprint}
                      open={detailKey === row.node.key}
                      onToggle={toggle}
                      onOpen={openDetail}
                      onLabelClick={onLabelClick}
                      showOwner={sprint}
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
                      sprint={sprint}
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
        {period ? (
          period.help
        ) : (
          <>
            {m.helpBefore} <IconPlus size={11} style={{ verticalAlign: '-1px' }} aria-hidden /> {m.helpAfter}
          </>
        )}
      </Text>

      <Drawer
        opened={detail != null}
        onClose={() => setDetailKey(null)}
        position="right"
        size="md"
        title={detail ? `${detail.key}` : ''}
        aria-label={m.detailAria}
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
  const m = useT().tracking.timeline;
  const kind = kindOf(node, m);
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
          {m.states[node.state]}
        </Badge>
        {node.risk && node.risk.situation !== 'em_dia' && isAtRisk(node) && <RiskBadge situation={node.risk.situation} />}
      </Group>
      <Text fw={600}>{node.label}</Text>
      <Stack gap={6}>
        <DetailLine label={m.start} value={node.start ? fmtDate(node.start, true) : m.notStartedYet} />
        <DetailLine label={m.end} value={node.end ? fmtDate(node.end, true) : node.start ? m.open : '—'} />
        <DetailLine label={m.duration} value={days != null ? m.days(days) : '—'} />
        {due && <DetailLine label={m.due} value={m.dueValue(fmtDay(due), late)} />}
        <DetailLine label={m.assignee} value={issue?.assignee ?? m.unassigned} />
        {issue?.status && <DetailLine label={m.jiraStatus} value={issue.status} />}
        {issue?.estimate != null && <DetailLine label={m.estimate} value={m.points(issue.estimate)} />}
        {node.carried && <DetailLine label={m.inSprint} value={m.carried} />}
        {node.added && <DetailLine label={m.inSprint} value={m.added} />}
      </Stack>
      {node.risk && node.risk.situation !== 'em_dia' && (
        <Stack gap="xs">
          <Text size="sm" fw={600}>
            {m.why}
          </Text>
          <EvidenceList risk={node.risk} />
        </Stack>
      )}
      <Group justify="space-between" wrap="nowrap">
        <Group gap="xs" wrap="nowrap">
          <ActionIcon variant="default" aria-label={m.previous} disabled={!onPrev} onClick={onPrev}>
            <IconChevronUp size={16} />
          </ActionIcon>
          <ActionIcon variant="default" aria-label={m.next} disabled={!onNext} onClick={onNext}>
            <IconChevronDown size={16} />
          </ActionIcon>
          {at && (
            <Text size="xs" c="dimmed">
              {m.position(at.index + 1, at.total)}
            </Text>
          )}
        </Group>
        <Anchor component={Link} to={link} size="sm">
          {m.openItem} <IconChevronRight size={12} style={{ verticalAlign: '-2px' }} aria-hidden />
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
  /** A sprint draws its end and what went past it; a period has neither. */
  sprint: boolean;
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
  const m = useT().tracking.timeline;
  return (
    <div className="tl-lane" role="group" aria-label={m.lane(lane.name, lane.items)}>
      <div className="tl-row tl-lane-head" role="presentation">
        <div className="tl-label">
          <ActionIcon size="xs" variant="subtle" color="gray" aria-expanded={!folded} aria-label={folded ? m.showLane(lane.name) : m.hideLane(lane.name)} onClick={onFold}>
            {folded ? <IconChevronRight size={14} /> : <IconChevronDown size={14} />}
          </ActionIcon>
          <Text size="sm" fw={600} lineClamp={1}>
            {lane.name}
          </Text>
          <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
            {m.laneSummary(lane.items, lane.done, lane.atRisk)}
          </Text>
        </div>
        <div className="tl-track tl-track-quiet">
          {track.off.map((w, i) => (
            <span key={`w${i}`} className="tl-weekend" style={{ left: `${w.left}%`, width: `${w.width}%` }} aria-hidden />
          ))}
          <span className="tl-todayline" style={{ left: `${track.today}%` }} aria-hidden />
          {track.sprint && track.beyondEnd && <span className="tl-beyond" style={{ left: `${track.sprintEnd}%` }} aria-hidden />}
          {track.sprint && <span className="tl-sprint-end" style={{ left: `${track.sprintEnd}%` }} aria-hidden />}
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
function ItemRow({ row, axis, off, ticks, today, sprintEnd, beyondEnd, sprint, open, onToggle, onOpen, onLabelClick, showOwner = true }: RowProps) {
  const { node, depth, hasChildren, collapsed: folded } = row;
  const m = useT().tracking.timeline;
  const kind = kindOf(node, m);
  const Icon = kind.icon;
  const container = node.synthetic || (node.issue?.level ?? 0) > 0;
  const bar = barOf(node, axis);
  const due = node.issue?.due_date && !container ? dueInstant(node.issue.due_date) : null;
  const late = due != null && node.state !== 'concluido' && due < axis.today;
  const from = node.start ? fmtDate(node.start, true) : null;
  const days = node.start ? durationDays(node.start, node.end, axis.today) : 0;
  const span = bar
    ? m.span(m.states[node.state], from ?? '', node.end ? fmtDate(node.end, true) : null, node.carried)
    : m.noStart(m.states[node.state]);
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
            aria-label={folded ? m.expandKey(node.key) : m.collapseKey(node.key)}
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
          <span title={m.addedAfterStart} aria-label={m.addedAfterStart} role="img" style={{ display: 'inline-flex' }}>
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
        {sprint && beyondEnd && <span className="tl-beyond" style={{ left: `${sprintEnd}%` }} aria-hidden />}
        {sprint && <span className="tl-sprint-end" style={{ left: `${sprintEnd}%` }} aria-hidden />}
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
                {m.days(days)}
              </span>
            )}
          </span>
        ) : (
          <span className="tl-note" title={span}>
            {node.issue?.status ?? m.states[node.state]}
          </span>
        )}
        {due != null && due >= axis.start && due <= axis.end && (
          <span
            className={`tl-due${late ? ' is-late' : ''}`}
            style={{ left: `${position(due, axis)}%` }}
            role="img"
            aria-label={m.dueMark(fmtDay(node.issue!.due_date), late)}
            title={m.dueMark(fmtDay(node.issue!.due_date), late)}
          />
        )}
      </div>
    </div>
  );
}
