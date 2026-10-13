import { Anchor, Group, Switch, Text } from '@mantine/core';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';

import type { PersonDetail, TimelineBar } from '../../api/types';
import { fmtDate } from '../../lib/format';

const STATE: Record<TimelineBar['state'], { label: string; color: string }> = {
  concluido: { label: 'concluído', color: 'var(--mantine-color-teal-6)' },
  andamento: { label: 'em andamento', color: 'var(--mantine-color-blue-6)' },
  bloqueado: { label: 'bloqueado', color: 'var(--mantine-color-red-6)' },
  aberto: { label: 'aberto', color: 'var(--mantine-color-gray-5)' },
};

const DAY = 86_400_000;

/**
 * One bar per item, from when it went in progress to when it was done (or to today). Positions are
 * percentages of the period, so the whole thing resizes with its card without measuring anything.
 * A blocked item's bar is striped as well as red: state is never told by colour alone.
 */
export function PersonTimeline({ timeline }: { timeline: PersonDetail['timeline'] }) {
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
        Nenhum item desta pessoa entrou em andamento nas últimas semanas.
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
              <Text size="xs">{STATE[state].label}</Text>
            </Group>
          ))}
        </Group>
        <Switch size="xs" label="Incluir subtarefas" checked={withSubtasks} onChange={(e) => setWithSubtasks(e.currentTarget.checked)} disabled={standard.length === 0 && withSubtasks} />
      </Group>
      <div className="tl" role="list" aria-label="Itens da pessoa ao longo do tempo">
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
          const description = `${bar.key}, ${STATE[bar.state].label}, de ${fmtDate(bar.began, true)} a ${bar.state === 'concluido' ? fmtDate(bar.end, true) : 'hoje'}`;
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
            <span className="tl-today" style={{ left: '100%' }}>hoje</span>
          </div>
        </div>
      </div>
      <Text size="xs" c="dimmed" mt="xs">
        Da primeira entrada em andamento até a conclusão. Últimas 8 semanas; uma ponta cortada à esquerda começou antes.
      </Text>
    </div>
  );
}
