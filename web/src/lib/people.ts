import type { Person } from '../api/types';
import { currentLocale } from '../i18n';

const fold = (text: string) => text.toLocaleLowerCase(currentLocale());

/**
 * Who to list: the people whose name has the search text in it and — when asked — only those with
 * activity in the sprint. Someone the overview knows nothing about has none. `hidden` lists the
 * people the search found but the activity filter is hiding, which is what turning it off would add.
 * They are the people, not the entries: someone in two teams is one person, hidden once.
 */
export function visiblePeople(
  people: Person[],
  active: ReadonlyMap<string, boolean>,
  query: string,
  onlyActive: boolean,
): { shown: Person[]; hidden: Person[] } {
  const found = people.filter((p) => fold(p.name).includes(fold(query)));
  if (!onlyActive) return { shown: found, hidden: [] };
  return {
    shown: found.filter((p) => active.get(p.account_id) === true),
    hidden: found.filter((p) => active.get(p.account_id) !== true),
  };
}

export type Severity = 'alta' | 'media' | 'baixa';

/**
 * How bad a block is, from the days it has stood still: under two days is low, up to five is medium,
 * more is high. These are the thresholds the "Bloqueios" explanation (HELP `person:blocks`) states, and
 * the backend's own `people_overview.BLOCK_DAYS`; keep the three in step.
 */
export function blockSeverity(days: number): Severity {
  if (days < 2) return 'baixa';
  return days <= 5 ? 'media' : 'alta';
}
