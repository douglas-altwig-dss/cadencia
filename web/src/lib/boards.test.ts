import { describe, expect, it } from 'vitest';

import { boardKind, filterBoards, kindCounts, kindFilterOf, sortBySpace, spaceLabel } from './boards';

const row = (id: number, name: string, type: string, space_key: string | null = null, space_name: string | null = null) => ({
  board: { id, name, type, space_key, space_name },
});

const rows = [
  row(1, 'Plataforma', 'scrum', 'PLT', 'Plataforma'),
  row(2, 'Suporte', 'kanban', 'SUP', 'São Paulo Suporte'),
  row(3, 'Avulso', 'simple'),
  row(4, 'Análise', 'scrum', 'ANL', 'Análise de dados'),
  row(5, 'Apps', 'kanban', 'PLT', 'Plataforma'),
  row(6, 'apps legado', 'scrum', 'PLT', 'Plataforma'),
];
const names = (list: { board: { name: string } }[]) => list.map((r) => r.board.name);

describe('board kinds', () => {
  it('is kanban only when Jira says so', () => {
    expect(boardKind(row(1, 'a', 'kanban'))).toBe('kanban');
    expect(boardKind(row(1, 'a', 'scrum'))).toBe('scrum');
    expect(boardKind(row(1, 'a', 'simple'))).toBe('scrum');
  });

  it('counts every kind and the total', () => {
    expect(kindCounts(rows)).toEqual({ all: 6, scrum: 4, kanban: 2 });
    expect(kindCounts([])).toEqual({ all: 0, scrum: 0, kanban: 0 });
  });

  it('reads the URL value, falling back to every board', () => {
    expect(kindFilterOf('scrum')).toBe('scrum');
    expect(kindFilterOf('kanban')).toBe('kanban');
    expect(kindFilterOf(undefined)).toBe('all');
    expect(kindFilterOf('outro')).toBe('all');
  });
});

describe('filterBoards', () => {
  it('keeps one kind', () => {
    expect(names(filterBoards(rows, 'kanban', ''))).toEqual(['Suporte', 'Apps']);
    expect(names(filterBoards(rows, 'all', ''))).toHaveLength(6);
  });

  it('searches the board and the space, case- and accent-blind', () => {
    expect(names(filterBoards(rows, 'all', 'apps'))).toEqual(['Apps', 'apps legado']);
    expect(names(filterBoards(rows, 'all', 'sao paulo'))).toEqual(['Suporte']);
    expect(names(filterBoards(rows, 'all', 'analise'))).toEqual(['Análise']);
    expect(names(filterBoards(rows, 'all', 'plt'))).toEqual(['Plataforma', 'Apps', 'apps legado']);
    expect(names(filterBoards(rows, 'all', '  '))).toHaveLength(6);
  });

  it('combines the search with the kind', () => {
    expect(names(filterBoards(rows, 'scrum', 'apps'))).toEqual(['apps legado']);
    expect(filterBoards(rows, 'kanban', 'análise')).toEqual([]);
  });
});

describe('sortBySpace', () => {
  it('orders by space then board, alphabetically, with no space last', () => {
    expect(names(sortBySpace(rows))).toEqual(['Análise', 'Apps', 'apps legado', 'Plataforma', 'Suporte', 'Avulso']);
  });

  it('names a space by its key when the name is unknown, and sorts by that', () => {
    const sorted = sortBySpace([row(1, 'Z', 'scrum', null, 'Beta'), row(2, 'B', 'scrum', 'ALPHA'), row(3, 'A', 'scrum')]);
    expect(names(sorted)).toEqual(['B', 'Z', 'A']);
    expect(sorted.map(spaceLabel)).toEqual(['ALPHA', 'Beta', null]);
  });

  it('does not touch the list it was given', () => {
    const copy = [...rows];
    sortBySpace(rows);
    expect(rows).toEqual(copy);
    expect(sortBySpace([])).toEqual([]);
  });
});
