import { describe, expect, it } from 'vitest';

import { atRiskOf, riskCountsOf, spacesOf } from './spaces';

const row = (
  id: number,
  name: string,
  space: [string, string] | null,
  extra: { risk?: Record<string, number>; current?: number | null; previous?: number | null; progress?: [number, number]; sprint?: boolean } = {},
) => ({
  board: { id, name, type: 'scrum', space_key: space?.[0] ?? null, space_name: space?.[1] ?? null },
  risk_counts: extra.risk ?? {},
  throughput: { current: extra.current ?? null, previous: extra.previous ?? null },
  progress: extra.progress ? { done: extra.progress[0], total: extra.progress[1] } : null,
  sprint: extra.sprint === false ? null : {},
});

describe('spacesOf', () => {
  const rows = [
    row(1, 'Plataforma', ['CAD', 'Produto Digital'], { risk: { atrasado: 2, em_dia: 9 }, current: 3, previous: 1, progress: [4, 10] }),
    row(2, 'Dados', ['DAD', 'Inteligência de Dados'], { risk: { bloqueado: 1 }, current: null, previous: 2 }),
    row(3, 'Suporte', ['CAD', 'Produto Digital'], { risk: { parado: 1 }, current: 2, previous: 2, progress: [1, 10], sprint: false }),
    row(4, 'Avulso', null, { risk: { atrasado: 5 } }),
  ];

  it('groups the boards under their space, alphabetically, leaving boards with no space out', () => {
    const spaces = spacesOf(rows);
    expect(spaces.map((s) => s.name)).toEqual(['Inteligência de Dados', 'Produto Digital']);
    expect(spaces[1].rows.map((r) => r.board.name)).toEqual(['Plataforma', 'Suporte']);
  });

  it('sums risk and deliveries over the boards, never counting on-track items', () => {
    const produto = spacesOf(rows).find((s) => s.key === 'CAD')!;
    expect(produto.atRisk).toBe(3);
    expect(produto.delivered).toEqual({ current: 5, previous: 3 });
  });

  it('measures progress over running sprints only, summing items rather than averaging boards', () => {
    const produto = spacesOf(rows).find((s) => s.key === 'CAD')!;
    // Suporte has no sprint running, so its progress does not count.
    expect(produto.progress).toBe(0.4);
    expect(spacesOf(rows).find((s) => s.key === 'DAD')!.progress).toBeNull();
  });

  it('names a space by its key when Jira gave no name', () => {
    expect(spacesOf([row(1, 'X', ['KEY', ''])])[0].name).toBe('KEY');
  });
});

describe('risk helpers', () => {
  it('counts the open items at risk', () => {
    expect(atRiskOf({ em_dia: 4, atrasado: 1, bloqueado: 2 })).toBe(3);
    expect(atRiskOf({})).toBe(0);
  });

  it('adds the situations up across boards', () => {
    expect(riskCountsOf([row(1, 'a', null, { risk: { atrasado: 1, em_dia: 2 } }), row(2, 'b', null, { risk: { atrasado: 2 } })])).toEqual({
      atrasado: 3,
      em_dia: 2,
    });
  });
});
