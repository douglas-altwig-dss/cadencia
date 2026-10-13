import { describe, expect, it } from 'vitest';

import type { SprintTimelineNode, TimelineState } from '../api/types';
import {
  axisOf,
  barOf,
  branchKeys,
  durationDays,
  activeAt,
  dueInstant,
  flatten,
  personLanes,
  position,
  sprintDay,
  summaryOf,
  ticksOf,
  weekends,
  type Filters,
} from './sprintTimeline';

const node = (
  key: string,
  over: Partial<SprintTimelineNode> & { level?: number; assignee?: string } = {},
  children: SprintTimelineNode[] = [],
): SprintTimelineNode => {
  const { level = 0, assignee, ...rest } = over;
  return {
    key,
    label: `Resumo de ${key}`,
    synthetic: false,
    missing: false,
    issue: { key, summary: '', type: 'Story', level, status: '', category: 'new', assignee: assignee ?? null, assignee_id: null, estimate: null, due_date: null, parent_key: null, labels: [], components: [], url: null } as SprintTimelineNode['issue'],
    member: true,
    progress: null,
    risk: null,
    blocked: false,
    carried: false,
    added: false,
    state: 'aberto' as TimelineState,
    start: null,
    end: null,
    children,
    ...rest,
  };
};

const filters = (over: Partial<Filters> = {}): Filters => ({ query: '', state: 'todos', subtasks: true, collapsed: new Set(), ...over });
const keys = (rows: ReturnType<typeof flatten>) => rows.map((r) => r.node.key);

// Mon 2026-08-31 09:00 → Fri 2026-09-11 18:00 (UTC, so the test does not depend on the runner's zone)
const window = { start: '2026-08-31T09:00:00Z', end: '2026-09-11T18:00:00Z', today: '2026-09-10T15:00:00Z' };

const tree = () => [
  node('EP-1', { level: 1, state: 'andamento' }, [
    node('ST-1', { state: 'concluido', assignee: 'Ana Souza' }, [node('SB-1', { level: -1, state: 'concluido' }), node('SB-2', { level: -1, state: 'bloqueado', blocked: true })]),
    node('ST-2', { state: 'bloqueado', blocked: true }),
    node('ST-3', { state: 'andamento' }),
  ]),
  node('__sem_epico__', { synthetic: true, issue: null, state: 'aberto' }, [node('BG-1', { state: 'aberto' })]),
];

describe('the axis and positions', () => {
  const midnight = (iso: string) => {
    const d = new Date(iso);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };

  it('is whole days: from the midnight that starts the first day to the one that ends the last', () => {
    const axis = axisOf(window);
    expect(axis.start).toBe(midnight(window.start));
    const end = new Date(axis.end);
    expect([end.getHours(), end.getMinutes()]).toEqual([0, 0]);
    expect(axis.end).toBeGreaterThan(new Date(window.end).getTime());
    expect(axis.end - new Date(window.end).getTime()).toBeLessThanOrEqual(86_400_000 + 3_600_000);
  });

  it('stretches to today when the sprint has run past its end', () => {
    const late = axisOf({ ...window, today: '2026-09-15T12:00:00Z' });
    expect(late.end).toBeGreaterThan(new Date('2026-09-15T12:00:00Z').getTime());
  });

  it('also covers an item that finished after the window', () => {
    const axis = axisOf(window, [node('X', { end: '2026-09-14T10:00:00Z' })]);
    expect(axis.end).toBeGreaterThan(new Date('2026-09-14T10:00:00Z').getTime());
  });

  it('holds a position inside 0–100', () => {
    const axis = axisOf(window);
    expect(position(axis.start - 10 * 86_400_000, axis)).toBe(0);
    expect(position(axis.end + 10 * 86_400_000, axis)).toBe(100);
    expect(position((axis.start + axis.end) / 2, axis)).toBeCloseTo(50, 5);
  });

  it('puts a due date at the end of its day', () => {
    expect(new Date(dueInstant('2026-09-10')).getHours()).toBe(23);
  });
});

describe('a bar', () => {
  const axis = axisOf(window);

  it('is nothing for what was never started', () => {
    expect(barOf({ start: null, end: null }, axis)).toBeNull();
  });

  it('runs from start to end for a finished item', () => {
    const bar = barOf({ start: '2026-09-01T09:00:00Z', end: '2026-09-04T09:00:00Z' }, axis)!;
    expect(bar.running).toBe(false);
    expect(bar.clipped).toBe(false);
    expect(bar.left).toBeGreaterThan(0);
    expect(bar.left + bar.width).toBeCloseTo(position(new Date('2026-09-04T09:00:00Z').getTime(), axis), 5);
  });

  it('runs to today for an item still open', () => {
    const bar = barOf({ start: '2026-09-07T09:00:00Z', end: null }, axis)!;
    expect(bar.running).toBe(true);
    expect(bar.left + bar.width).toBeCloseTo(position(axis.today, axis), 5);
  });

  it('is clipped when the work began before the sprint', () => {
    const bar = barOf({ start: '2026-08-20T09:00:00Z', end: null }, axis)!;
    expect(bar.clipped).toBe(true);
    expect(bar.left).toBe(0);
  });

  it('is always visible, even when the item finished in a moment', () => {
    const at = '2026-09-03T12:00:00Z';
    expect(barOf({ start: at, end: at }, axis)!.width).toBeGreaterThan(0);
  });
});

describe('the ticks', () => {
  it('has a label per day for a short sprint, none at the very end', () => {
    const axis = axisOf(window);
    const ticks = ticksOf(axis);
    expect(ticks[0].at).toBe(axis.start);
    expect(ticks.length).toBe(Math.round((axis.end - axis.start) / 86_400_000));
    expect(ticks.every((t) => t.at < axis.end)).toBe(true);
    expect(new Set(ticks.map((t) => t.label)).size).toBe(ticks.length);
  });

  it('has a label per Monday, and the first day, for a long one', () => {
    const axis = { start: new Date(2026, 7, 3).getTime(), end: new Date(2026, 8, 30).getTime(), today: 0 };
    const ticks = ticksOf(axis);
    expect(ticks.length).toBeLessThanOrEqual(10);
    expect(ticks[0].at).toBe(axis.start);
    expect(ticks.slice(1).every((t) => new Date(t.at).getDay() === 1)).toBe(true);
    expect(ticks.every((t) => t.label.length === 5)).toBe(true);
  });
});

describe('which rows are shown', () => {
  it('lists everything in tree order: epic, its stories, their subtasks, then the group', () => {
    expect(keys(flatten(tree(), filters()))).toEqual(['EP-1', 'ST-1', 'SB-1', 'SB-2', 'ST-2', 'ST-3', '__sem_epico__', 'BG-1']);
  });

  it('gives each row its depth', () => {
    const depth = Object.fromEntries(flatten(tree(), filters()).map((r) => [r.node.key, r.depth]));
    expect(depth).toMatchObject({ 'EP-1': 0, 'ST-1': 1, 'SB-1': 2, 'BG-1': 1 });
  });

  it('hides subtasks on request without losing their parents', () => {
    expect(keys(flatten(tree(), filters({ subtasks: false })))).toEqual(['EP-1', 'ST-1', 'ST-2', 'ST-3', '__sem_epico__', 'BG-1']);
  });

  it('folds a branch, and says which rows have children', () => {
    const rows = flatten(tree(), filters({ collapsed: new Set(['EP-1']) }));
    expect(keys(rows)).toEqual(['EP-1', '__sem_epico__', 'BG-1']);
    expect(rows[0]).toMatchObject({ hasChildren: true, collapsed: true });
  });

  it('lists the keys of every branch, for "recolher tudo"', () => {
    expect(branchKeys(tree())).toEqual(['EP-1', 'ST-1', '__sem_epico__']);
  });

  it('filters by state and keeps the path to what matches', () => {
    const rows = keys(flatten(tree(), filters({ state: 'bloqueado' })));
    // SB-2 and ST-2 are blocked; their story and epic stay as the way there; the done siblings go.
    expect(rows).toEqual(['EP-1', 'ST-1', 'SB-2', 'ST-2']);
  });

  it('keeps a story that matches even when none of its subtasks do', () => {
    expect(keys(flatten(tree(), filters({ state: 'concluido', query: 'ST-1' })))).toEqual(['EP-1', 'ST-1', 'SB-1']);
    expect(keys(flatten(tree(), filters({ state: 'andamento' })))).toEqual(['EP-1', 'ST-3']);
  });

  it('searches by key, summary and assignee, ignoring case and accents', () => {
    expect(keys(flatten(tree(), filters({ query: 'ana souza' })))).toEqual(['EP-1', 'ST-1', 'SB-1', 'SB-2']);
    expect(keys(flatten(tree(), filters({ query: 'RESUMO DE bg-1' })))).toEqual(['__sem_epico__', 'BG-1']);
    expect(flatten(tree(), filters({ query: 'nada disso' }))).toEqual([]);
  });
});

describe('weekends', () => {
  it('shades one block per weekend, inside the axis', () => {
    // 3 Aug (Mon) to 21 Aug (Fri), local time: weekends on 8–9 and 15–16 Aug.
    const axis = { start: new Date(2026, 7, 3).getTime(), end: new Date(2026, 7, 21).getTime(), today: 0 };
    const blocks = weekends(axis);
    expect(blocks).toHaveLength(2);
    const day = 100 / 18;
    expect(blocks[0].left).toBeCloseTo(5 * day, 3);
    expect(blocks[0].width).toBeCloseTo(2 * day, 3);
    expect(blocks[1].left).toBeCloseTo(12 * day, 3);
  });

  it('cuts a weekend that starts before the axis, and has none in a weekday-only stretch', () => {
    const cut = weekends({ start: new Date(2026, 7, 9, 12).getTime(), end: new Date(2026, 7, 12).getTime(), today: 0 });
    expect(cut).toHaveLength(1);
    expect(cut[0].left).toBe(0);
    expect(weekends({ start: new Date(2026, 7, 3).getTime(), end: new Date(2026, 7, 7).getTime(), today: 0 })).toEqual([]);
  });
});

/** Local-time instants, so the day arithmetic does not depend on the machine's zone. */
const at = (day: number, hour = 12) => new Date(2026, 8, day, hour).toISOString();
const NONE: Filters = { query: '', state: 'todos', subtasks: true, collapsed: new Set() };

describe('summaryOf', () => {
  it('counts standard-level items by state and their risk, leaving epics and subtasks out', () => {
    const epic = node('EP-1', { level: 1 }, [
      node('A-1', { state: 'concluido', start: at(7), end: at(8) }),
      node('A-2', { state: 'bloqueado', start: at(7), risk: { situation: 'bloqueado' } as SprintTimelineNode['risk'] }),
      node('A-3', { state: 'andamento', start: at(8), risk: { situation: 'atrasado' } as SprintTimelineNode['risk'] }),
    ]);
    const sub = node('A-4', { level: -1, state: 'andamento', start: at(8) });
    const summary = summaryOf([epic, sub]);
    expect(summary.items).toBe(3);
    expect(summary.states).toEqual({ concluido: 1, andamento: 1, bloqueado: 1, aberto: 0 });
    expect(summary.situations).toEqual({ bloqueado: 1, atrasado: 1 });
  });
});

describe('sprintDay', () => {
  it('numbers the day of the window and clamps before and after it', () => {
    const window = { start: at(7, 0), end: at(18, 0), today: at(10) };
    expect(sprintDay(window, new Date(2026, 8, 10, 15).getTime())).toEqual({ day: 4, total: 12, share: (4 / 12) * 100 });
    expect(sprintDay(window, new Date(2026, 8, 1).getTime()).day).toBe(0);
    expect(sprintDay(window, new Date(2026, 9, 1).getTime()).day).toBe(12);
  });
});

describe('durationDays', () => {
  it('counts whole days, an unfinished bar up to now, and never less than one', () => {
    expect(durationDays(at(7), at(10), 0)).toBe(3);
    expect(durationDays(at(7), null, new Date(2026, 8, 9, 12).getTime())).toBe(2);
    expect(durationDays(at(7, 9), at(7, 17), 0)).toBe(1);
  });
});

describe('personLanes', () => {
  const rows = [
    node('B-1', { assignee: 'Bia', state: 'andamento', start: at(8) }),
    node('A-1', { assignee: 'Ana', state: 'concluido', start: at(7), end: at(8) }),
    node('A-2', { assignee: 'Ana', state: 'bloqueado', start: at(9), risk: { situation: 'bloqueado' } as SprintTimelineNode['risk'] }),
    node('X-1', { state: 'aberto' }),
  ];

  it('makes one lane per assignee, alphabetical, with the unassigned last', () => {
    const lanes = personLanes(rows, NONE);
    expect(lanes.map((l) => l.name)).toEqual(['Ana', 'Bia', 'Sem responsável']);
    expect(lanes[0]).toMatchObject({ items: 2, done: 1, atRisk: 1 });
    expect(lanes[0].rows.map((r) => r.node.key)).toEqual(['A-1', 'A-2']);
  });

  it('narrows every lane with the same filters as the hierarchy', () => {
    const risky = personLanes(rows, { ...NONE, atRisk: true });
    expect(risky.map((l) => l.name)).toEqual(['Ana']);
    expect(risky[0].rows.map((r) => r.node.key)).toEqual(['A-2']);
  });
});

describe('flatten with the risk switch', () => {
  it('keeps only items whose risk names a situation, and the epic they sit under', () => {
    const epic = node('EP-1', { level: 1 }, [
      node('A-1', { state: 'andamento' }),
      node('A-2', { state: 'andamento', risk: { situation: 'estagnado' } as SprintTimelineNode['risk'] }),
    ]);
    const shown = flatten([epic], { ...NONE, atRisk: true }).map((r) => r.node.key);
    expect(shown).toEqual(['EP-1', 'A-2']);
  });
});

describe('activeAt', () => {
  it('counts the items started and not yet done at an instant, open ones running to today', () => {
    const nodes = [
      node('A-1', { state: 'concluido', start: at(7), end: at(9) }),
      node('A-2', { state: 'andamento', start: at(8) }),
      node('A-3', { state: 'aberto' }),
    ];
    expect(activeAt(nodes, new Date(at(8)).getTime(), new Date(at(10)).getTime())).toBe(2);
    expect(activeAt(nodes, new Date(at(9, 18)).getTime(), new Date(at(10)).getTime())).toBe(1);
  });
});

describe('flatten with a situation', () => {
  it('keeps only the items named by that situation', () => {
    const rows = [
      node('A-1', { state: 'andamento', risk: { situation: 'atrasado' } as SprintTimelineNode['risk'] }),
      node('A-2', { state: 'andamento', risk: { situation: 'bloqueado' } as SprintTimelineNode['risk'] }),
    ];
    expect(flatten(rows, { ...NONE, situation: 'bloqueado' }).map((r) => r.node.key)).toEqual(['A-2']);
  });
});
