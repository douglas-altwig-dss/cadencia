import { describe, expect, it } from 'vitest';

import { activeAt, filterGantt, planSpan, pointAt } from './gantt';

const groups = [
  { id: 'dev', label: 'Desenvolvimento', lanes: [{ id: 'dev:ana' }, { id: 'dev:bruno' }] },
  { id: 'qa', label: 'Qualidade', lanes: [{ id: 'qa:carla' }] },
];
const bars = [
  { key: '1', lane: 'dev:ana', start: 0, end: 8, title: 'API de pagamento', label: 'ANL-2 API de pagamento, Ana' },
  { key: '2', lane: 'dev:bruno', start: 4, end: 12, title: 'Tela de checkout', label: 'ANL-3 Tela de checkout, Bruno' },
  { key: '3', lane: 'qa:carla', start: 12, end: 20, title: 'Revisão do checkout', label: 'ANL-4 Revisão do checkout, Carla' },
];
const none = { query: '', hidden: new Set<string>() };

describe('filterGantt', () => {
  it('keeps everything with no filter', () => {
    const out = filterGantt(groups, bars, none);
    expect(out.groups.map((g) => g.id)).toEqual(['dev', 'qa']);
    expect(out.bars).toHaveLength(3);
  });

  it('searches titles and labels, accent-blind, and keeps only the lanes that match', () => {
    const out = filterGantt(groups, bars, { ...none, query: 'revisao' });
    expect(out.groups.map((g) => g.id)).toEqual(['qa']);
    expect(out.bars.map((b) => b.key)).toEqual(['3']);
    const byPerson = filterGantt(groups, bars, { ...none, query: 'bruno' });
    expect(byPerson.groups[0].lanes.map((l) => l.id)).toEqual(['dev:bruno']);
  });

  it('keeps a whole group whose name matches', () => {
    const out = filterGantt(groups, bars, { ...none, query: 'desenvolv' });
    expect(out.groups[0].lanes).toHaveLength(2);
    expect(out.bars.map((b) => b.key)).toEqual(['1', '2']);
  });

  it('drops hidden groups and groups left empty', () => {
    expect(filterGantt(groups, bars, { ...none, hidden: new Set(['dev']) }).groups.map((g) => g.id)).toEqual(['qa']);
    expect(filterGantt(groups, bars, { ...none, query: 'nada' }).groups).toEqual([]);
  });
});

describe('the axis', () => {
  it('measures the plan up to its last bar, in workdays rounded up', () => {
    expect(planSpan(bars, 8)).toEqual({ hours: 20, days: 3 });
    expect(planSpan([], 8)).toEqual({ hours: 0, days: 0 });
  });

  it('reads a point as week, weekday and hour of the workday', () => {
    // Two weeks of 8-hour days: 80 hours. A quarter in is hour 20: Wednesday, hour 5 of week 1.
    expect(pointAt(0.25, 2, 8)).toEqual({ week: 0, day: 2, hour: 5, at: 20 });
    expect(pointAt(0, 2, 8)).toMatchObject({ week: 0, day: 0, hour: 1 });
    // The very end is the last hour of the last Friday, not a sixth day.
    expect(pointAt(1, 2, 8)).toMatchObject({ week: 1, day: 4, hour: 8 });
  });

  it('counts what is running at an hour, end exclusive', () => {
    expect(activeAt(bars, 5)).toBe(2);
    expect(activeAt(bars, 8)).toBe(1);
    expect(activeAt(bars, 20)).toBe(0);
  });
});
