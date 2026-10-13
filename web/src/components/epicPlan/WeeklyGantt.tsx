import { Group, SegmentedControl, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useState, type CSSProperties, type ReactNode } from 'react';

import type { PlanWeek } from '../../api/types';
import { useT } from '../../i18n';
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
  const [scale, setScale] = useState<string>('ajustar');
  const { ref, width: available } = useElementSize();
  // "Ajustar" fits the whole plan in the card; "Dias" and "Horas" trade scrolling for detail.
  const fitted = available ? (available - LABEL_WIDTH - 2) / Math.max(weeks.length * 5 * workday, 1) : 12;
  const hourWidth = scale === 'horas' ? 24 : scale === 'dias' ? 12 : Math.max(4, Math.min(24, fitted));
  const showHours = hourWidth >= 14;
  const hoursPerDay = Math.ceil(workday);
  const dayWidth = workday * hourWidth;
  const weekWidth = 5 * dayWidth;
  const width = LABEL_WIDTH + weeks.length * weekWidth;
  const grid: CSSProperties = {
    backgroundImage: [
      `repeating-linear-gradient(to right, var(--gantt-day-line) 0 1px, transparent 1px ${dayWidth}px)`,
      `repeating-linear-gradient(to right, var(--gantt-hour-line) 0 1px, transparent 1px ${hourWidth}px)`,
    ].join(','),
  };
  const byLane = new Map<string, GanttBar[]>();
  for (const bar of bars) byLane.set(bar.lane, [...(byLane.get(bar.lane) ?? []), bar]);

  const toggle = (id: string) =>
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div ref={ref}>
    <Group justify="flex-end" mb="xs">
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
    <div className="gantt" role="figure" aria-label={caption}>
      <div style={{ width }}>
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
        {groups.map((group) => {
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
                    <div className="gantt-track" style={{ ...grid, width: weeks.length * weekWidth }}>
                      {(byLane.get(lane.id) ?? []).map((bar) => {
                        const left = bar.start * hourWidth;
                        const barWidth = Math.max((bar.end - bar.start) * hourWidth, 3);
                        return (
                          <Tooltip key={bar.key} label={bar.tooltip ?? bar.title} multiline w={300} withArrow openDelay={150}>
                            <button
                              type="button"
                              className="gantt-bar"
                              aria-label={bar.label}
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
    </div>
  );
}
