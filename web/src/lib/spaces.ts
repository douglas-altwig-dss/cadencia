import { collator } from '../i18n';
import { sortBySpace, type BoardLike } from './boards';

/**
 * Spaces (teams) as pure functions over the dashboard's board rows: which boards a team owns and
 * what they add up to. The Spaces page, a Space page's overview and the Home "Spaces" tile all read
 * these, so a team's number is the same wherever it is shown. Boards with no space are left out —
 * there is no team to put them under, and the Boards page still lists them.
 */

export interface SpaceRowLike extends BoardLike {
  risk_counts: Partial<Record<string, number>>;
  throughput: { current: number | null; previous: number | null };
  progress: { done: number; total: number } | null;
  sprint: unknown;
}

export interface SpaceSummary<T extends SpaceRowLike> {
  key: string;
  name: string;
  /** The space's tracked boards, by name. */
  rows: T[];
  /** Open items in any risk situation (each counted once, in its most severe one), summed over the boards. */
  atRisk: number;
  /** Items done in the current weekly window and in the one before, summed over the boards. */
  delivered: { current: number; previous: number };
  /** Done ÷ items over the running sprints of the space's boards, summed (not averaged); null with none running. */
  progress: number | null;
}

const ON_TRACK = 'em_dia';

export const atRiskOf = (counts: Partial<Record<string, number>>): number =>
  Object.entries(counts).reduce((sum, [situation, n]) => (situation === ON_TRACK ? sum : sum + (n ?? 0)), 0);

/** One summary per space that has a tracked board, alphabetical by name. */
export function spacesOf<T extends SpaceRowLike>(rows: readonly T[]): SpaceSummary<T>[] {
  const groups = new Map<string, T[]>();
  for (const row of sortBySpace(rows)) {
    const key = row.board.space_key;
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const out: SpaceSummary<T>[] = [];
  for (const [key, members] of groups) {
    let done = 0;
    let total = 0;
    for (const row of members) {
      if (row.sprint && row.progress && row.progress.total > 0) {
        done += row.progress.done;
        total += row.progress.total;
      }
    }
    out.push({
      key,
      name: members[0].board.space_name || key,
      rows: members,
      atRisk: members.reduce((sum, row) => sum + atRiskOf(row.risk_counts), 0),
      delivered: {
        current: members.reduce((sum, row) => sum + (row.throughput.current ?? 0), 0),
        previous: members.reduce((sum, row) => sum + (row.throughput.previous ?? 0), 0),
      },
      progress: total > 0 ? done / total : null,
    });
  }
  const compare = collator().compare;
  return out.sort((a, b) => compare(a.name, b.name) || compare(a.key, b.key));
}

/** The risk counts of a space, situation by situation, summed over its boards. */
export function riskCountsOf(rows: readonly SpaceRowLike[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) for (const [situation, n] of Object.entries(row.risk_counts)) out[situation] = (out[situation] ?? 0) + (n ?? 0);
  return out;
}
