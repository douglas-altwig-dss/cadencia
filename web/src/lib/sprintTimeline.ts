import type { Situation, SprintTimelineNode, TimelineState } from '../api/types';

/**
 * The sprint timeline as pure functions: which rows to show, and where each bar goes.
 * `components/SprintTimeline.tsx` draws; nothing here knows React.
 */

const DAY = 86_400_000;

export interface Axis {
  start: number;
  end: number;
  today: number;
}

const startOfDay = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const nextMidnight = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return d.getTime();
};

/**
 * The days the axis covers: whole days, from the midnight that starts the sprint's first day to the one
 * that ends its last, stretched to today (or to the latest finish) when the work runs past the sprint.
 * Whole days keep the gridlines, the day labels and the weekends on the same boundaries.
 */
export function axisOf(window: { start: string; end: string; today: string }, nodes: SprintTimelineNode[] = []): Axis {
  const today = new Date(window.today).getTime();
  let last = Math.max(new Date(window.end).getTime(), today);
  const latest = (rows: SprintTimelineNode[]) => {
    for (const row of rows) {
      if (row.end) last = Math.max(last, new Date(row.end).getTime());
      latest(row.children);
    }
  };
  latest(nodes);
  const start = startOfDay(new Date(window.start).getTime());
  return { start, end: Math.max(nextMidnight(last), start + DAY), today };
}

/** Where an instant falls on the axis, in percent, held inside 0–100. */
export function position(instant: number, axis: Axis): number {
  return Math.min(Math.max(((instant - axis.start) / (axis.end - axis.start)) * 100, 0), 100);
}

export interface Bar {
  left: number;
  width: number;
  /** Started before the axis does. */
  clipped: boolean;
  /** Not done: the bar runs up to today. */
  running: boolean;
}

/** A row's bar, or null when nothing was started. A bar always has some width: an item finished in a moment is still seen. */
export function barOf(node: Pick<SprintTimelineNode, 'start' | 'end'>, axis: Axis): Bar | null {
  if (!node.start) return null;
  const from = new Date(node.start).getTime();
  const running = !node.end;
  const to = node.end ? new Date(node.end).getTime() : Math.min(Math.max(axis.today, from), axis.end);
  const left = position(from, axis);
  return { left, width: Math.max(position(to, axis) - left, 0.6), clipped: from < axis.start, running };
}

/** The end of the due day, so an item due today is not shown as late all day. */
export const dueInstant = (due: string): number => new Date(`${due}T23:59:59`).getTime();

export interface Tick {
  at: number;
  label: string;
}

/** One tick per day when there are few, one per Monday when there are many; each labels the day that starts there. */
export function ticksOf(axis: Axis, maxDaily = 16): Tick[] {
  const days = Math.round((axis.end - axis.start) / DAY);
  const out: Tick[] = [];
  for (let t = axis.start; t < axis.end; t = nextMidnight(t)) {
    const date = new Date(t);
    if (days > maxDaily && date.getDay() !== 1 && t !== axis.start) continue;
    out.push({ at: t, label: `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}` });
  }
  return out;
}

/** Saturdays and Sundays inside the axis, in percent, so the non-working days can be shaded. */
export function weekends(axis: Axis): { left: number; width: number }[] {
  const out: { left: number; width: number }[] = [];
  const cursor = new Date(axis.start);
  cursor.setHours(0, 0, 0, 0);
  for (let t = cursor.getTime(); t < axis.end; ) {
    const day = new Date(t);
    if (day.getDay() === 6) {
      const from = position(t, axis);
      const next = new Date(day);
      next.setDate(next.getDate() + 2); // Monday 00:00, held across a DST change by using the calendar
      const to = position(next.getTime(), axis);
      if (to > from) out.push({ left: from, width: to - from });
      t = next.getTime();
    } else if (day.getDay() === 0) {
      const to = position(new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime(), axis);
      const from = position(t, axis);
      if (to > from) out.push({ left: from, width: to - from });
      t = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
    } else {
      t = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
    }
  }
  return out;
}

export type StateFilter = 'todos' | TimelineState;

export interface Filters {
  query: string;
  state: StateFilter;
  subtasks: boolean;
  collapsed: ReadonlySet<string>;
  /** Only the items whose risk says something is wrong: anything but "em dia". */
  atRisk?: boolean;
  /** Only the items whose risk names this situation. Implies `atRisk`. */
  situation?: Situation;
}

export interface FlatRow {
  node: SprintTimelineNode;
  depth: number;
  hasChildren: boolean;
  collapsed: boolean;
}

const fold = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export const isSubtask = (node: SprintTimelineNode) => (node.issue?.level ?? 0) < 0;

/** An epic, an initiative or a group: a row that only spans what is under it. */
export const isContainer = (node: SprintTimelineNode) => node.synthetic || (node.issue?.level ?? 0) > 0;

/** A standard-level item (story, task, bug): what the summary counts. */
export const isItem = (node: SprintTimelineNode) => !node.synthetic && node.issue !== null && node.issue.level === 0;

/** Its risk says something is wrong. Done work carries no risk, so it never counts here. */
export const isAtRisk = (node: SprintTimelineNode) => !!node.risk && node.risk.situation !== 'em_dia';

const nameMatches = (node: SprintTimelineNode, needle: string) =>
  fold(`${node.key} ${node.label} ${node.issue?.assignee ?? ''}`).includes(needle);

/**
 * Does this row, or anything under it, pass the filters?
 *
 * A search that hits a row keeps everything under it — find a story and you see its subtasks — and the
 * path up to it. The state filter is about items, not epics or groups: an item stays if it has that
 * state or something under it does, while an epic or group stays only for what is under it (or, with
 * no state chosen, for its own name).
 */
function keeps(node: SprintTimelineNode, filters: Filters, inherited = false): boolean {
  if (!filters.subtasks && isSubtask(node)) return false;
  const needle = fold(filters.query.trim());
  const stateOn = filters.state !== 'todos';
  const wanted = filters.situation;
  const risky = !!filters.atRisk || !!wanted;
  if (!stateOn && !needle && !risky) return true;
  const hit = inherited || !needle || nameMatches(node, needle);
  const passes =
    (!stateOn || node.state === filters.state) &&
    (!risky || isAtRisk(node)) &&
    (!wanted || node.risk?.situation === wanted);
  const own = isContainer(node) ? !stateOn && !risky && hit : hit && passes;
  const pass = inherited || (needle !== '' && nameMatches(node, needle));
  return own || node.children.some((c) => keeps(c, filters, pass));
}

/** The rows to draw, in order, honouring the filters and the branches somebody folded. */
export function flatten(nodes: SprintTimelineNode[], filters: Filters, depth = 0, inherited = false): FlatRow[] {
  const needle = fold(filters.query.trim());
  const out: FlatRow[] = [];
  for (const node of nodes) {
    if (!keeps(node, filters, inherited)) continue;
    // A row that the search hit passes that on, so its children are judged as part of the hit.
    const pass = inherited || (needle !== '' && nameMatches(node, needle));
    const kids = node.children.filter((c) => keeps(c, filters, pass));
    const collapsed = filters.collapsed.has(node.key);
    out.push({ node, depth, hasChildren: kids.length > 0, collapsed });
    if (!collapsed) out.push(...flatten(node.children, filters, depth + 1, pass));
  }
  return out;
}

/** Keys of every row that has children: what "recolher tudo" folds. */
export function branchKeys(nodes: SprintTimelineNode[]): string[] {
  return nodes.flatMap((n) => (n.children.length ? [n.key, ...branchKeys(n.children)] : []));
}

const walk = (nodes: SprintTimelineNode[], visit: (node: SprintTimelineNode) => void) => {
  for (const node of nodes) {
    visit(node);
    walk(node.children, visit);
  }
};

export interface Summary {
  items: number;
  states: Record<TimelineState, number>;
  /** Items per situation, each counted on its own: an item can be late and blocked at once. */
  situations: Partial<Record<Situation, number>>;
}

/** The sprint's items (standard level only) by state, and by the situation their risk names. */
export function summaryOf(nodes: SprintTimelineNode[]): Summary {
  const out: Summary = {
    items: 0,
    states: { concluido: 0, andamento: 0, bloqueado: 0, aberto: 0 },
    situations: {},
  };
  walk(nodes, (node) => {
    if (!isItem(node)) return;
    out.items += 1;
    out.states[node.state] += 1;
    if (node.risk && node.risk.situation !== 'em_dia') {
      out.situations[node.risk.situation] = (out.situations[node.risk.situation] ?? 0) + 1;
    }
  });
  return out;
}

export interface SprintDay {
  /** 1 on the first day of the window, `total` on the last; 0 before it starts. */
  day: number;
  total: number;
  /** How much of the window has gone by, in percent, held inside 0–100. */
  share: number;
}

/** Which day of the sprint it is, counted in whole days from the window's first day. */
export function sprintDay(window: { start: string; end: string }, now: number): SprintDay {
  const start = startOfDay(new Date(window.start).getTime());
  const end = startOfDay(new Date(window.end).getTime());
  const total = Math.max(1, Math.round((end - start) / DAY) + 1);
  const day = Math.min(total, Math.max(0, Math.round((startOfDay(now) - start) / DAY) + 1));
  return { day, total, share: Math.min(100, Math.max(0, (day / total) * 100)) };
}

/** Whole days a bar covers, counting an unfinished one up to `now`; never less than one day. */
export function durationDays(start: string, end: string | null, now: number): number {
  const from = new Date(start).getTime();
  const to = end ? new Date(end).getTime() : Math.max(now, from);
  return Math.max(1, Math.round((to - from) / DAY));
}

export interface Lane {
  name: string;
  rows: FlatRow[];
  items: number;
  done: number;
  atRisk: number;
}

const NO_OWNER = 'Sem responsável';

/**
 * The same rows regrouped by who holds them: one lane per assignee, alphabetical, the unassigned last.
 * Each lane keeps the filters, so a search or "só em risco" narrows every lane the same way.
 */
export function personLanes(nodes: SprintTimelineNode[], filters: Filters): Lane[] {
  const lanes = new Map<string, Lane>();
  walk(nodes, (node) => {
    if (isContainer(node) || !node.issue || !keeps(node, filters)) return;
    const name = node.issue.assignee ?? NO_OWNER;
    const lane = lanes.get(name) ?? { name, rows: [], items: 0, done: 0, atRisk: 0 };
    lane.rows.push({ node, depth: 0, hasChildren: false, collapsed: false });
    if (isItem(node)) lane.items += 1;
    if (node.state === 'concluido') lane.done += 1;
    if (isAtRisk(node)) lane.atRisk += 1;
    lanes.set(name, lane);
  });
  const ordered = [...lanes.values()];
  for (const lane of ordered) {
    lane.rows.sort((a, b) => (a.node.start ?? '~').localeCompare(b.node.start ?? '~') || a.node.key.localeCompare(b.node.key));
  }
  return ordered.sort((a, b) => {
    if (a.name === NO_OWNER) return 1;
    if (b.name === NO_OWNER) return -1;
    return a.name.localeCompare(b.name, 'pt-BR');
  });
}

/** Items being worked on at an instant: started by then, and not yet done (open ones run up to `today`). */
export function activeAt(nodes: SprintTimelineNode[], instant: number, today: number): number {
  let count = 0;
  walk(nodes, (node) => {
    if (!isItem(node) || !node.start) return;
    const from = new Date(node.start).getTime();
    const to = node.end ? new Date(node.end).getTime() : Math.max(today, from);
    if (from <= instant && instant <= to) count += 1;
  });
  return count;
}

/** The instant at a fraction (0–1) of the axis. */
export const instantAt = (fraction: number, axis: Axis): number => axis.start + fraction * (axis.end - axis.start);
