import { collator } from '../i18n';

/**
 * The Boards page's list, as pure functions: which kind a board is, how many of each kind there are,
 * which boards a search and a kind filter keep, and their order by space. Generic over the row so
 * a test does not have to build a whole dashboard row.
 */

export type BoardKind = 'scrum' | 'kanban';
export type KindFilter = BoardKind | 'all';

export interface BoardLike {
  board: { id: number; name: string; type: string; space_key?: string | null; space_name?: string | null };
}

/** A board is Kanban when Jira says so; everything else plans in sprints. */
export const boardKind = (row: BoardLike): BoardKind => (row.board.type === 'kanban' ? 'kanban' : 'scrum');

/** The `?kind=` value as a filter: anything that is not a known kind means every board. */
export const kindFilterOf = (value: string | null | undefined): KindFilter => (value === 'scrum' || value === 'kanban' ? value : 'all');

export function kindCounts(rows: readonly BoardLike[]): Record<KindFilter, number> {
  const counts = { all: rows.length, scrum: 0, kanban: 0 };
  for (const row of rows) counts[boardKind(row)] += 1;
  return counts;
}

/** Case- and accent-blind, so "sao" finds "São Paulo". */
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();

/** The boards a kind and a search keep; the search looks at the board's name and its space's name and key. */
export function filterBoards<T extends BoardLike>(rows: readonly T[], kind: KindFilter, query: string): T[] {
  const needle = fold(query.trim());
  return rows.filter((row) => {
    if (kind !== 'all' && boardKind(row) !== kind) return false;
    if (!needle) return true;
    const { name, space_name, space_key } = row.board;
    return [name, space_name, space_key].some((text) => !!text && fold(text).includes(needle));
  });
}

/** The space a card names: its name, else its key, else `null` (a board with no space). */
export const spaceLabel = (row: BoardLike): string | null => row.board.space_name || row.board.space_key || null;

/** Boards in one list, by space name then board name, both alphabetical; boards with no space last. */
export function sortBySpace<T extends BoardLike>(rows: readonly T[]): T[] {
  const compare = collator().compare;
  return [...rows].sort((a, b) => {
    const sa = spaceLabel(a);
    const sb = spaceLabel(b);
    if (sa === null || sb === null) {
      if (sa !== sb) return sa === null ? 1 : -1;
    } else {
      const bySpace = compare(sa, sb);
      if (bySpace) return bySpace;
    }
    return compare(a.board.name, b.board.name) || a.board.id - b.board.id;
  });
}
