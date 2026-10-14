import { Badge, Button, Group, SegmentedControl, Text, TextInput, Tooltip, UnstyledButton } from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
import { IconChevronDown, IconChevronRight, IconSearch } from '@tabler/icons-react';
import { type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode, useMemo, useRef, useState } from 'react';

import type { PlanWeek } from '../../api/types';
import { useT } from '../../i18n';
import { activeAt, filterGantt, planSpan, pointAt } from '../../lib/gantt';
import { onColor } from './shared';

export interface GanttBar {
  key: string;
  lane: string;
  /** Working hours since the start of the plan. */
  start: number;
  end: number;
  title: string;
  detail?: string;
  color: string;
  tooltip?: ReactNode;
  label: string;
  onClick?: () => void;
}

export interface GanttLane {
  id: string;
  label: ReactNode;
}

export interface GanttGroup {
  id: string;
  label: string;
  color: string;
  /** Always with its unit: "4 tarefas", "7 subtarefas". */
  count: string;
  lanes: GanttLane[];
}

const LABEL_WIDTH = 220;

/**
 * The weekly schedule: week → day (Mon–Fri) → hour of the workday on the axis, one row per lane,
 * lanes grouped (collapsibly) by role. Pure geometry — every start and end comes from the API.
 *
 * It follows the sprint timeline (`WorkTimeline`) wherever the idea carries over to a plan: the
 * group chips are the summary and filter like the sprint's state chips, there is a search and
 * expand/collapse, Ajustar/Dias/Horas is the zoom, the cursor reads the point of the plan and how
 * much runs then, and the arrow keys walk the bars. A plan has no calendar dates, so there is no
 * "today" and no weekend — the axis is working time only.
 */
export function WeeklyGantt({
  groups,
  bars,
  weeks,
  workday,
  caption,
}: {
  groups: GanttGroup[];
  bars: GanttBar[];
  weeks: PlanWeek[];
  workday: number;
  caption: string;
}) {
  const t = useT();
  const m = t.epicPlan.gantt;
  const DAYS = m.weekdays;
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState('');
  const [scale, setScale] = useState<string>('ajustar');
  const [cursor, setCursor] = useState<number | null>(null);
  const { ref, width: available } = useElementSize();
  const chartRef = useRef<HTMLDivElement>(null);

  // "Ajustar" fits the whole plan in the card; "Dias" and "Horas" trade scrolling for detail.
  const fitted = available ? (available - LABEL_WIDTH - 2) / Math.max(weeks.length * 5 * workday, 1) : 12;
  const hourWidth = scale === 'horas' ? 24 : scale === 'dias' ? 12 : Math.max(4, Math.min(24, fitted));
  const showHours = hourWidth >= 14;
  const hoursPerDay = Math.ceil(workday);
  const dayWidth = workday * hourWidth;
  const weekWidth = 5 * dayWidth;
  const trackWidth = weeks.length * weekWidth;
  const width = LABEL_WIDTH + trackWidth;
  const grid: CSSProperties = {
    backgroundImage: [
      `repeating-linear-gradient(to right, var(--gantt-day-line) 0 1px, transparent 1px ${dayWidth}px)`,
      `repeating-linear-gradient(to right, var(--gantt-hour-line) 0 1px, transparent 1px ${hourWidth}px)`,
    ].join(','),
  };

  const filtered = useMemo(() => filterGantt(groups, bars, { query, hidden }), [groups, bars, query, hidden]);
  const byLane = useMemo(() => {
    const map = new Map<string, GanttBar[]>();
    for (const bar of filtered.bars) map.set(bar.lane, [...(map.get(bar.lane) ?? []), bar]);
    return map;
  }, [filtered.bars]);
  const perGroup = useMemo(() => {
    const laneGroup = new Map(groups.flatMap((g) => g.lanes.map((l) => [l.id, g.id] as const)));
    const out = new Map<string, number>();
    for (const bar of bars) {
      const group = laneGroup.get(bar.lane);
      if (group) out.set(group, (out.get(group) ?? 0) + 1);
    }
    return out;
  }, [groups, bars]);
  const span = planSpan(bars, workday);
  const filtering = query.trim() !== '' || hidden.size > 0;

  const toggle = (id: string) =>
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleGroup = (id: string) =>
    setHidden((previous) => {
      const next = new Set(previous);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const onMove = (event: MouseEvent<HTMLDivElement>) => {
    const chart = chartRef.current;
    if (!chart) return;
    const rect = chart.getBoundingClientRect();
    const fraction = (event.clientX - rect.left - LABEL_WIDTH) / trackWidth;
    setCursor(fraction >= 0 && fraction <= 1 ? fraction : null);
  };
  const point = cursor != null ? pointAt(cursor, weeks.length, workday) : null;
  const pointWeek = point ? weeks[point.week] : undefined;
  const cursorText =
    point && pointWeek
      ? m.cursor(pointWeek.planejamento ? m.weekPlanning(pointWeek.semana) : m.week(pointWeek.semana), DAYS[point.day], point.hour, activeAt(filtered.bars, point.at))
      : null;

  // Left/Right walk the bars of a lane, Up/Down move to the nearest bar of the lane above or below.
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (!target.dataset.ganttBar || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const all = [...(chartRef.current?.querySelectorAll<HTMLElement>('[data-gantt-bar]') ?? [])];
    const lanes = [...new Set(all.map((b) => b.dataset.lane))];
    const lane = target.dataset.lane;
    const inLane = all.filter((b) => b.dataset.lane === lane);
    let next: HTMLElement | undefined;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      next = inLane[inLane.indexOf(target) + (event.key === 'ArrowRight' ? 1 : -1)];
    } else {
      const other = lanes[lanes.indexOf(lane) + (event.key === 'ArrowDown' ? 1 : -1)];
      const x = target.getBoundingClientRect().left;
      next = all
        .filter((b) => b.dataset.lane === other)
        .sort((a, b) => Math.abs(a.getBoundingClientRect().left - x) - Math.abs(b.getBoundingClientRect().left - x))[0];
    }
    if (next) {
      event.preventDefault();
      next.focus();
      next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  };

  return (
    <div ref={ref}>
      <Group justify="space-between" align="center" mb="xs" wrap="wrap" gap="xs">
        <Group gap={6} wrap="wrap" role="group" aria-label={m.groupsAria}>
          {groups.map((group) => {
            const on = !hidden.has(group.id);
            return (
              <Badge
                key={group.id}
                component="button"
                type="button"
                size="sm"
                variant={on ? 'light' : 'outline'}
                color="gray"
                aria-pressed={on}
                onClick={() => toggleGroup(group.id)}
                leftSection={<span className="tl-swatch" style={{ background: group.color, opacity: on ? 1 : 0.35 }} aria-hidden />}
                styles={{ label: { textTransform: 'none', fontWeight: 500 } }}
              >
                {m.groupChip(group.label, perGroup.get(group.id) ?? 0)}
              </Badge>
            );
          })}
        </Group>
        <Text size="xs" c="dimmed">
          {m.summary(bars.length, span.days)}
        </Text>
      </Group>
      <Group justify="space-between" align="flex-end" mb="xs" wrap="wrap" gap="sm">
        <Group gap="sm" wrap="wrap" align="flex-end">
          <TextInput
            size="xs"
            aria-label={m.search}
            placeholder={m.searchPlaceholder}
            leftSection={<IconSearch size={14} />}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            w={240}
          />
          {filtering && (
            <Button
              variant="subtle"
              size="xs"
              onClick={() => {
                setQuery('');
                setHidden(new Set());
              }}
            >
              {m.clearFilters}
            </Button>
          )}
        </Group>
        <Group gap="xs" wrap="nowrap">
          <Button variant="default" size="xs" onClick={() => setCollapsed(new Set())}>
            {m.expand}
          </Button>
          <Button variant="default" size="xs" onClick={() => setCollapsed(new Set(groups.map((g) => g.id)))}>
            {m.collapse}
          </Button>
          <SegmentedControl
            size="xs"
            value={scale}
            onChange={setScale}
            aria-label={m.scaleAria}
            data={[
              { value: 'ajustar', label: m.fit },
              { value: 'dias', label: m.days },
              { value: 'horas', label: m.hours },
            ]}
          />
        </Group>
      </Group>
      {filtered.groups.length === 0 ? (
        <Text size="sm" c="dimmed" py="md">
          {m.noneFiltered}
        </Text>
      ) : (
        <div className="gantt" role="figure" aria-label={caption}>
          <div
            ref={chartRef}
            className="gantt-chart"
            style={{ width, ['--gantt-cursor' as string]: cursor != null ? `${LABEL_WIDTH + cursor * trackWidth}px` : '-10px' }}
            onMouseMove={onMove}
            onMouseLeave={() => setCursor(null)}
            onKeyDown={onKey}
          >
            {cursorText && cursor != null && (
              <span className={`gantt-cursor-label${cursor > 0.75 ? ' is-left' : ''}`} style={{ left: LABEL_WIDTH + cursor * trackWidth }} aria-hidden>
                {cursorText}
              </span>
            )}
            <div className="gantt-row gantt-head">
              <div className="gantt-label" />
              {weeks.map((week) => (
                <div key={week.indice} className={week.planejamento ? 'gantt-week is-planning' : 'gantt-week'} style={{ width: weekWidth }}>
                  {week.planejamento ? m.weekPlanning(week.semana) : m.week(week.semana)}
                </div>
              ))}
            </div>
            <div className="gantt-row gantt-head">
              <div className="gantt-label" />
              {weeks.flatMap((week) =>
                DAYS.map((day) => (
                  <div key={`${week.indice}-${day}`} className="gantt-day" style={{ width: dayWidth }}>
                    {day}
                  </div>
                )),
              )}
            </div>
            {showHours && (
              <div className="gantt-row gantt-head">
                <div className="gantt-label" />
                {weeks.flatMap((week) =>
                  DAYS.flatMap((day) =>
                    Array.from({ length: hoursPerDay }, (_, hour) => (
                      <div
                        key={`${week.indice}-${day}-${hour}`}
                        className="gantt-hour"
                        style={{ width: Math.min(hourWidth, (workday - hour) * hourWidth) }}
                      >
                        {hour + 1}
                      </div>
                    )),
                  ),
                )}
              </div>
            )}
            {filtered.groups.map((group) => {
              const isCollapsed = collapsed.has(group.id);
              return (
                <div key={group.id} role="group" aria-label={`${group.label}, ${group.count}`}>
                  <div className="gantt-row gantt-group">
                    <div className="gantt-label" style={{ borderLeft: `4px solid ${group.color}` }}>
                      <UnstyledButton
                        onClick={() => toggle(group.id)}
                        aria-expanded={!isCollapsed}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%' }}
                      >
                        {isCollapsed ? <IconChevronRight size={14} /> : <IconChevronDown size={14} />}
                        <Text size="xs" fw={700} tt="uppercase" lineClamp={2} style={{ flex: 1 }}>
                          {group.label}
                        </Text>
                        <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                          {group.count}
                        </Text>
                      </UnstyledButton>
                    </div>
                    <div className="gantt-track is-group" style={grid} />
                  </div>
                  {!isCollapsed &&
                    group.lanes.map((lane) => (
                      <div key={lane.id} className="gantt-row">
                        <div className="gantt-label gantt-lane-label">{lane.label}</div>
                        <div className="gantt-track" style={{ ...grid, width: trackWidth }}>
                          {(byLane.get(lane.id) ?? []).map((bar) => {
                            const left = bar.start * hourWidth;
                            const barWidth = Math.max((bar.end - bar.start) * hourWidth, 3);
                            return (
                              <Tooltip key={bar.key} label={bar.tooltip ?? bar.title} multiline w={300} withArrow openDelay={150}>
                                <button
                                  type="button"
                                  className="gantt-bar"
                                  aria-label={bar.label}
                                  data-gantt-bar={bar.key}
                                  data-lane={lane.id}
                                  onClick={bar.onClick}
                                  style={{ left, width: barWidth, background: bar.color, color: onColor(bar.color) }}
                                >
                                  <span className="gantt-bar-title">{bar.title}</span>
                                  {bar.detail && barWidth > 90 && <span className="gantt-bar-detail">{bar.detail}</span>}
                                </button>
                              </Tooltip>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
      <Text size="xs" c="dimmed" mt="xs">
        {m.help}
      </Text>
    </div>
  );
}
