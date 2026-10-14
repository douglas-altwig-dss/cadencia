/**
 * The epic plan's Gantt as pure functions: what a search and the group chips keep, how long the plan
 * runs, and what the cursor reads at a point of the axis. `components/epicPlan/WeeklyGantt.tsx`
 * draws; nothing here knows React. The axis is working hours from the plan's first Monday, five
 * workdays a week — there are no calendar dates, so there is no "today" either.
 */

export interface GanttBarLike {
  key: string;
  lane: string;
  start: number;
  end: number;
  title: string;
  label: string;
}

export interface GanttGroupLike<L extends { id: string } = { id: string }> {
  id: string;
  label: string;
  lanes: L[];
}

export interface GanttFilters {
  query: string;
  /** Groups switched off with their chip. */
  hidden: ReadonlySet<string>;
}

/** Case- and accent-blind, so "revisao" finds "Revisão". */
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();

/**
 * The groups, lanes and bars a search and the chips keep. A search matches a bar's title or its
 * spoken label (key, title, who); a lane stays when one of its bars matches, and a group whose own
 * name matches keeps everything in it. Hidden groups go entirely; empty groups go too.
 */
export function filterGantt<G extends GanttGroupLike, B extends GanttBarLike>(
  groups: readonly G[],
  bars: readonly B[],
  { query, hidden }: GanttFilters,
): { groups: G[]; bars: B[] } {
  const needle = fold(query.trim());
  const keptGroups: G[] = [];
  const keptBars: B[] = [];
  for (const group of groups) {
    if (hidden.has(group.id)) continue;
    const laneIds = new Set(group.lanes.map((l) => l.id));
    const inGroup = bars.filter((b) => laneIds.has(b.lane));
    const whole = !needle || fold(group.label).includes(needle);
    const matching = whole ? inGroup : inGroup.filter((b) => fold(b.title).includes(needle) || fold(b.label).includes(needle));
    if (!matching.length) continue;
    const lanes = new Set(matching.map((b) => b.lane));
    keptGroups.push({ ...group, lanes: group.lanes.filter((l) => lanes.has(l.id)) });
    keptBars.push(...matching);
  }
  return { groups: keptGroups, bars: keptBars };
}

/** The plan's length: from hour 0 to the last bar's end, in working hours and in workdays (rounded up). */
export function planSpan(bars: readonly GanttBarLike[], workday: number): { hours: number; days: number } {
  const hours = bars.reduce((max, b) => Math.max(max, b.end), 0);
  return { hours, days: workday > 0 ? Math.ceil(hours / workday) : 0 };
}

export interface GanttPoint {
  /** Index into the plan's weeks (0-based). */
  week: number;
  /** 0 = Monday … 4 = Friday. */
  day: number;
  /** Hour of the workday, 1-based, as the axis labels it. */
  hour: number;
  /** The working hour since the plan's start. */
  at: number;
}

/** What a fraction of the axis stands for, held inside the plan's weeks. */
export function pointAt(fraction: number, weeks: number, workday: number): GanttPoint {
  const total = weeks * 5 * workday;
  const at = Math.min(Math.max(fraction, 0), 1) * total;
  const clamped = Math.min(at, Math.max(total - 1e-9, 0));
  const week = Math.floor(clamped / (5 * workday));
  const inWeek = clamped - week * 5 * workday;
  const day = Math.floor(inWeek / workday);
  const hour = Math.floor(inWeek - day * workday) + 1;
  return { week, day, hour, at };
}

/** How many bars are running at a working hour (start inclusive, end exclusive). */
export const activeAt = (bars: readonly GanttBarLike[], at: number): number => bars.filter((b) => b.start <= at && at < b.end).length;
