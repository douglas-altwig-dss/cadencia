import { Anchor, Group, Switch, Text } from '@mantine/core';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';

import type { PersonDetail, TimelineBar } from '../../api/types';
import { useT } from '../../i18n';
import { fmtDate } from '../../lib/format';

/** Each state's colour; its word comes from the catalogue (`people.timeline.state`). */
const STATE: Record<TimelineBar['state'], { color: string }> = {
  concluido: { color: 'var(--mantine-color-teal-6)' },
  andamento: { color: 'var(--mantine-color-blue-6)' },
  bloqueado: { color: 'var(--mantine-color-red-6)' },
  aberto: { color: 'var(--mantine-color-gray-5)' },
};

const DAY = 86_400_000;

/**
 * One bar per item, from when it went in progress to when it was done (or to today). Positions are
 * percentages of the period, so the whole thing resizes with its card without measuring anything.
 * A blocked item's bar is striped as well as red: state is never told by colour alone.
 */
export function PersonTimeline({ timeline }: { timeline: PersonDetail['timeline'] }) {
  const t = useT();
  const tt = t.people.timeline;
  const standard = timeline.items.filter((b) => b.level === 0);
  // Teams that estimate and finish subtasks would see an empty chart if only stories counted.
  const [withSubtasks, setWithSubtasks] = useState(standard.length === 0);
  const bars = withSubtasks ? timeline.items : standard;
  const start = new Date(timeline.start).getTime();
  const end = new Date(timeline.end).getTime();
  const span = end - start;
  const pct = (ms: number) => Math.min(Math.max(((ms - start) / span) * 100, 0), 100);

  // Mondays inside the period: the grid, and the labels along the top.
  const weeks = useMemo(() => {
    const out: number[] = [];
    const first = new Date(start);
    first.setHours(0, 0, 0, 0);
    first.setDate(first.getDate() + ((8 - first.getDay()) % 7));
    for (let t = first.getTime(); t < end; t += 7 * DAY) out.push(t);
    return out;
  }, [start, end]);

  if (!timeline.items.length) {
    return (
      <Text size="sm" c="dimmed">
        {tt.empty}
      </Text>
    );
  }
  return (
    <div>
      <Group justify="space-between" mb="sm" wrap="wrap">
        <Group gap="md">
          {(Object.keys(STATE) as TimelineBar['state'][]).map((state) => (
            <Group key={state} gap={6} wrap="nowrap">
              <span className={`tl-swatch${state === 'bloqueado' ? ' is-striped' : ''}`} style={{ background: STATE[state].color }} aria-hidden />
              <Text size="xs">{tt.state[state]}</Text>
            </Group>
          ))}
        </Group>
        <Switch size="xs" label={tt.withSubtasks} checked={withSubtasks} onChange={(e) => setWithSubtasks(e.currentTarget.checked)} disabled={standard.length === 0 && withSubtasks} />
      </Group>
      <div className="tl" role="list" aria-label={tt.listAria}>
        <div className="tl-row tl-head">
          <span />
          <div className="tl-track">
            {weeks.map((week) => (
              <span key={week} className="tl-tick" style={{ left: `${pct(week)}%` }}>
                {fmtDate(new Date(week).toISOString())}
              </span>
            ))}
          </div>
        </div>
        {bars.map((bar) => {
          const from = new Date(bar.start).getTime();
          const to = new Date(bar.end).getTime();
          const left = pct(from);
          const width = Math.max(pct(to) - left, 0.8);
          const clipped = new Date(bar.began).getTime() < start;
          const description = tt.bar(bar.key, tt.state[bar.state], fmtDate(bar.began, true), bar.state === 'concluido' ? fmtDate(bar.end, true) : tt.today);
          return (
            <div key={bar.key} className="tl-row" role="listitem">
              <Anchor component={Link} to={`/issues/${bar.key}`} size="sm" lineClamp={1} title={`${bar.key} ${bar.summary}`}>
                <span className="mono">{bar.key}</span> <Text span size="sm" c="dimmed" className="tl-summary">{bar.summary}</Text>
              </Anchor>
              <div className="tl-track">
                {weeks.map((week) => (
                  <span key={week} className="tl-grid" style={{ left: `${pct(week)}%` }} aria-hidden />
                ))}
                <span
                  className={`tl-bar${bar.state === 'bloqueado' ? ' is-striped' : ''}${clipped ? ' is-clipped' : ''}`}
                  style={{ left: `${left}%`, width: `${width}%`, background: STATE[bar.state].color }}
                  role="img"
                  aria-label={description}
                  title={description}
                />
              </div>
            </div>
          );
        })}
        <div className="tl-row tl-foot" aria-hidden>
          <span />
          <div className="tl-track">
            <span className="tl-today" style={{ left: '100%' }}>{tt.today}</span>
          </div>
        </div>
      </div>
      <Text size="xs" c="dimmed" mt="xs">
        {tt.foot}
      </Text>
    </div>
  );
}
