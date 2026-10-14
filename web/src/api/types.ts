// Shapes returned by the Cadência API (backend/cadencia/analytics/*, api/*).

export type Situation = 'em_dia' | 'envelhecendo' | 'estagnado' | 'bloqueado' | 'atrasado' | 'arrastado';
export type Category = 'new' | 'indeterminate' | 'done';

export interface Freshness {
  last_success_at: string | null;
  last_full_at?: string | null;
  last_error: string | null;
  last_error_at?: string | null;
  stale?: boolean;
}

export interface IssueBrief {
  key: string;
  summary: string;
  type: string;
  level: number;
  status: string;
  category: Category;
  assignee: string | null;
  assignee_id: string | null;
  estimate: number | null;
  due_date: string | null;
  parent_key: string | null;
  labels: string[];
  components: string[];
  url: string | null;
}

export interface Evidence {
  rule: string;
  rule_description: string;
  situation: Situation;
  label: string;
  message: string;
  /** The message's key: tells the messages apart without reading their (translated) text. */
  code?: string;
  days: number | null;
  last_transition: { at: string | null; author: string | null; from: string | null; to: string | null } | null;
  details: string[];
}

export interface Risk {
  situation: Situation;
  label: string;
  severity: number;
  column?: string | null;
  stalled_checkpoints?: number;
  carried_sprints?: number;
  wip_age_days?: number | null;
  evidence: Evidence[];
}

export interface Progress {
  total: number;
  done: number;
  remaining: number;
  estimated: number;
  unestimated: number;
  estimate_total: number;
  estimate_done: number;
  estimate_remaining: number;
  count_ratio: number | null;
  estimate_ratio: number | null;
  coverage: number | null;
  coverage_warning: string | null;
}

export interface Sprint {
  id: number;
  board_id: number;
  name: string;
  state: 'active' | 'future' | 'closed';
  start: string | null;
  end: string | null;
  complete: string | null;
  goal: string | null;
}

export interface WindowInfo {
  index: number;
  start: string;
  end: string;
  days: number;
  business_days: number;
  partial: boolean;
}

export interface WindowDiff {
  completed: string[];
  added: string[];
  removed: string[];
  unmoved: string[];
}

export type RiskCounts = Record<Situation, number>;

export interface TrendPoint {
  label: string;
  delivered: number;
  committed: number | null;
  added: number | null;
  open?: boolean;
}

export interface DashboardRow {
  board: { id: number; name: string; type: string; space_key?: string | null; space_name?: string | null };
  freshness: Freshness;
  sprint: Sprint | null;
  window: (WindowInfo & { total: number }) | null;
  progress: Progress | null;
  risk_counts: RiskCounts;
  throughput: { current: number | null; previous: number | null };
  trend: TrendPoint[];
  warnings: string[];
  error?: { cause: string; message: string };
}

export interface Dashboard {
  generated_at: string;
  rows: DashboardRow[];
}

export interface CommitmentLine {
  owner_id: string;
  owner_name: string;
  committed: number;
  delivered: number;
  remaining: number;
  removed: number;
  added: number;
  added_delivered: number;
  committed_estimate: number;
  delivered_estimate: number;
  added_estimate: number;
  adherence: number | null;
}

export type CommitmentSet = 'committed' | 'delivered' | 'remaining' | 'removed' | 'added' | 'added_delivered';

export interface Commitment {
  reference: string;
  closed: boolean;
  carryover_rate: number | null;
  board: CommitmentLine;
  people: CommitmentLine[];
  sets: Record<CommitmentSet, string[]>;
  items: Record<string, IssueBrief>;
}

export interface TimelineWindow extends WindowInfo {
  state: 'futura' | 'fechada' | 'aberta';
  diff?: WindowDiff;
  throughput?: number;
}

export interface SprintOverview {
  board: { id: number; name: string };
  sprint: Sprint;
  reference: string;
  timeline: {
    start: string | null;
    end: string | null;
    assumed_end: boolean;
    warnings: string[];
    windows: TimelineWindow[];
    current_window: number | null;
  };
  progress: Progress;
  risk_counts: RiskCounts;
  commitment: Commitment;
  items: Record<string, IssueBrief>;
  freshness: Freshness;
}

/** RF-113: `SprintOverview`'s own shape for a board with no sprint to carry it — calendar weeks
 * instead of a sprint's timeline, and no progress/commitment, which a kanban item never had. */
export interface BoardOverview {
  board: { id: number; name: string };
  reference: string;
  timeline: { windows: TimelineWindow[] };
  risk_counts: RiskCounts;
  items: Record<string, IssueBrief>;
  freshness: Freshness;
}

export interface BoardSprints {
  board: { id: number; name: string; type: string };
  current_sprint_id: number | null;
  sprints: (Sprint & { windows: WindowInfo[]; warnings: string[]; current: boolean })[];
  freshness: Freshness;
}

export interface TreeNode {
  key: string;
  label: string;
  synthetic: boolean;
  missing: boolean;
  issue: IssueBrief | null;
  risk: Risk | null;
  progress: Progress | null;
  estimate_rollup: number | null;
  children: TreeNode[];
}

export interface SprintTree {
  sprint: Sprint;
  nodes: TreeNode[];
  freshness: Freshness;
}

export interface BoardTree {
  nodes: TreeNode[];
  freshness: Freshness;
}

export type TimelineState = 'concluido' | 'andamento' | 'bloqueado' | 'aberto';

/** One row of the sprint timeline: an item (or an epic / group) with when it was worked on. */
export interface SprintTimelineNode {
  key: string;
  label: string;
  synthetic: boolean;
  missing: boolean;
  issue: IssueBrief | null;
  /** In the sprint itself, as opposed to an epic or a group shown for context. */
  member: boolean;
  progress: Progress | null;
  risk: Risk | null;
  blocked: boolean;
  /** Work started before the sprint did. */
  carried: boolean;
  /** Joined the sprint after it had started. */
  added: boolean;
  state: TimelineState;
  /** When work started (a group: when its first item did); null when nothing was started. */
  start: string | null;
  /** When it was done; null while it is still going (a group ends when everything under it has). */
  end: string | null;
  children: SprintTimelineNode[];
}

export interface SprintTimelineView {
  sprint: Sprint;
  window: { start: string; end: string; today: string };
  counts: { epicos: number; itens: number; subtarefas: number; total: number };
  nodes: SprintTimelineNode[];
  freshness: Freshness;
}

export interface RiskItem extends IssueBrief {
  risk: Risk;
}

export interface RiskList {
  items: RiskItem[];
  freshness: Freshness;
}

export interface EpicView {
  epic: IssueBrief;
  /** Plain text, headings kept as `#` lines. Empty when the Jira item has no description. */
  description: string;
  tree: TreeNode | null;
  risk_counts: RiskCounts;
  freshness: Freshness;
}

export interface IssueDetail {
  issue: IssueBrief;
  /** Plain text, headings kept as `#` lines. Empty when the Jira item has no description. */
  description: string;
  board: { id: number; name: string };
  risk: Risk;
  metrics: {
    lead_days: number | null;
    cycle_days: number | null;
    queue_days: number | null;
    blocked_days: number;
    active_days: number;
    flow_efficiency: number | null;
    backward_moves: number;
    reopened: boolean;
    started_at: string | null;
    done_at: string | null;
  };
  sprints: Sprint[];
  status_intervals: { status: string; category: Category; column: string | null; start: string; end: string | null; days: number }[];
  transitions: { at: string; field: string; from: string | null; to: string | null; author: string | null }[];
  parent: IssueBrief | null;
  children: IssueBrief[];
  freshness: Freshness;
}

export interface Distribution {
  n: number;
  p50: number | null;
  p85: number | null;
  p95: number | null;
  low_confidence: boolean;
}

export interface FlowSummary {
  completed: number;
  lead_time: Distribution;
  cycle_time: Distribution;
  flow_efficiency: number | null;
  reopen_rate: number | null;
  backward_moves: number;
  blocked_days: number;
  work_mix: Record<string, number>;
}

export interface FlowView {
  period: { start: string; end: string };
  summary: FlowSummary;
  throughput: { start: string; end: string; count: number }[];
  wip_average: number;
  commitment_adherence: number | null;
  carryover_rate: number | null;
  sprints: { board: string; sprint: Sprint; committed: number; delivered: number; added: number; adherence: number | null; carryover_rate: number | null }[];
  people: { account_id: string | null; name: string; completed: number; cycle_time: Distribution; lead_time: Distribution }[];
  items: Record<string, unknown>[];
  note: string;
}

export interface Cfd {
  dates: string[];
  columns: { name: string; counts: number[] }[];
}

export interface Scatter {
  points: { key: string; summary: string; type: string; done_at: string; cycle_days: number; url: string | null }[];
  percentiles: Distribution;
}

export interface Aging {
  items: { key: string; summary: string; type: string; column: string; age_days: number; assignee: string | null; threshold_days: number | null }[];
  thresholds: Record<string, number>;
  percentiles: Distribution;
  columns: string[];
}

export interface CvdRow {
  sprint: Sprint;
  committed: number;
  delivered: number;
  remaining: number;
  removed: number;
  added: number;
  added_delivered: number;
  adherence: number | null;
  carryover_rate: number | null;
}

export interface PersonView {
  person: { account_id: string; name: string };
  period: { start: string; end: string; weeks: number };
  summary: FlowSummary;
  boards: { cycle_time: Distribution; lead_time: Distribution; median_completed_per_person: number | null };
  composition: { work_mix: Record<string, number>; unplanned_items: number };
  trend: { board: string; sprint: Sprint; committed: number; delivered: number; added: number; cycle_time: Distribution }[];
  risks: RiskItem[];
  note: string;
}

export interface Person {
  account_id: string;
  name: string;
}

export interface CapacityRow {
  account_id: string;
  display_name: string;
  working_days: number;
  absence_days: number;
  available_days: number;
  hours_per_day: number;
  focus_factor: number;
  hours: number;
}

export interface PersonLoad {
  account_id: string;
  display_name: string;
  capacity_hours: number;
  planned_hours: number;
  actual_hours: number;
  deviation: number | null;
  state: 'sobrecarga' | 'ociosidade' | 'equilibrado' | 'sem_capacidade';
}

export interface PlanView {
  id?: number;
  created_at?: string;
  simulated?: boolean;
  plan: {
    assignments: { key: string; account_id: string | null; rule: string; cost_hours: number }[];
    capacity: Record<string, number>;
    load: Record<string, number>;
    residual: Record<string, number>;
    parameters: Record<string, unknown>;
    warnings: string[];
    disclaimer: string;
  };
  capacity: CapacityRow[];
  items: { key: string; summary: string; cost_hours: number; rule: string; planned_id: string | null; planned: string | null; actual_id: string | null; actual: string | null; match: boolean }[];
  comparison: { adherence: number | null; compared: number; matches: number; people: PersonLoad[]; disclaimer: string };
  disclaimer: string;
}

export interface Absence {
  id: number;
  account_id: string;
  name: string;
  start: string;
  end: string;
  note: string | null;
}

/** A Jira space: the team, one level above the board. */
export interface Space {
  key: string | null;
  name: string;
}

export interface BoardListItem {
  id: number;
  name: string;
  type: string;
  space_key: string | null;
  space_name: string | null;
  selected: boolean;
  last_success_at: string | null;
  last_error: string | null;
}

/** Boards under the space that owns them. */
export interface SpaceGroup {
  space: Space;
  boards: BoardListItem[];
}

export interface PeopleView {
  items: Person[];
  /** The same people grouped by space; someone shared between teams appears more than once. */
  spaces: { space: Space; people: Person[] }[];
  unassigned: Person[];
}

/** Where a person's load stands against the capacity they have left; the words are the state, never a grade. */
export type WorkloadState = 'ok' | 'acima' | 'folga' | 'sem_estimativa' | 'sem_capacidade';

export interface BlockCounts {
  count: number;
  baixa: number;
  media: number;
  alta: number;
  oldest_days: number | null;
}

/** One person's numbers for the current sprint, across the boards in view. Numbers only, no items. */
export interface PersonIndicators {
  account_id: string;
  name: string;
  /** Has something in the sprint (or the week, without one): open work, a delivery or a commitment. */
  active: boolean;
  boards: { id: number; name: string; space_key: string | null; space_name: string | null }[];
  workload: {
    hours: number;
    capacity_hours: number | null;
    ratio: number | null;
    state: WorkloadState;
    open_items: number;
    unestimated: number;
    /** `sprint` while the board has an active sprint, else the working `semana`. */
    window: 'sprint' | 'semana';
    ends_on: string;
    /** How far above 100% still counts as "ok" (the board's overload threshold). */
    threshold: number;
  };
  delivered: { count: number; committed: number | null; window: 'sprint' | 'semana' };
  blocks: BlockCounts;
  past: {
    /** The last sprints, oldest first; `delivered` is null where the person had nothing in it. */
    points: { label: string | null; delivered: number | null; committed: number | null }[];
    delta: number | null;
    adherence: number | null;
  };
  availability: { hours_per_day: number | null; allocation: number };
}

export interface TeamSummary {
  people: number;
  hours: number;
  capacity_hours: number;
  ratio: number | null;
  state: WorkloadState;
  above: { account_id: string; name: string; ratio: number | null }[];
  blocks: BlockCounts & { people: number };
  delivered: number;
  committed: number;
}

export interface PeopleOverview {
  generated_at: string;
  items: PersonIndicators[];
  summary: TeamSummary;
}

/** #7 of the People page: the time a person gives to the tracked boards. Absences are separate. */
export interface PersonAvailability {
  account_id: string;
  /** null = the board's day length. */
  hours_per_day: number | null;
  /** Percent of their time given to the tracked boards. */
  allocation: number;
  board_hours_per_day: number;
  board_focus_factor: number;
}

export type WeekStatus = 'ok' | 'atencao' | 'dificuldades';

export interface WeekSignal {
  kind: 'sobrecarga' | 'bloqueios' | 'atrasados' | 'parados' | 'vencendo';
  level: 'alto' | 'medio' | 'baixo';
  count?: number;
  ratio?: number;
  alta?: number;
  media?: number;
  baixa?: number;
}

export interface PersonItem extends Omit<WeekItem, 'risk' | 'done_at'> {
  epic: { key: string; summary: string } | null;
  open: boolean;
  done_at: string | null;
  estimate_hours: number | null;
  // Only on open items.
  risk?: WeekItem['risk'];
  blocked?: boolean;
  blocked_days?: number | null;
  block_reason?: string | null;
  due_in_days?: number | null;
  in_progress?: boolean;
}

export interface PersonEpic {
  key: string;
  summary: string;
  open: number;
  finished: number;
  blocked: number;
  boards: string[];
}

export interface TimelineBar {
  key: string;
  summary: string;
  level: number;
  board: { id: number; name: string };
  /** Clipped to the timeline's start. */
  start: string;
  /** When it really began, even before the window. */
  began: string;
  end: string;
  state: 'concluido' | 'andamento' | 'bloqueado' | 'aberto';
}

export interface CapacitySprint {
  board: { id: number; name: string };
  sprint: { id: number; name: string; state: string };
  capacity_hours: number;
  absence_days: number;
  committed_hours: number;
  delivered_hours: number;
  committed: number;
  delivered: number;
}

export interface PersonDetail {
  generated_at: string;
  person: Person;
  indicators: PersonIndicators | null;
  week: {
    status: WeekStatus;
    signals: WeekSignal[];
    counts: { open: number; in_progress: number; finished: number; overdue: number; due_soon: number };
    week_start: string;
  };
  items: PersonItem[];
  epics: PersonEpic[];
  blocks: PersonItem[];
  timeline: { start: string; end: string; items: TimelineBar[] };
  capacity: { sprints: CapacitySprint[] };
}

export type PulseKind = 'entregue' | 'bloqueado' | 'escopo';

export interface PulseEvent {
  kind: PulseKind;
  at: string;
  key: string;
  summary: string;
  who: string | null;
  board: { id: number; name: string };
}

/** What is happening across the boards in view: recent deliveries, what is due and the last 48 hours. */
export interface Pulse {
  generated_at: string;
  recent: { days: { date: string; delivered: number }[]; total: number; previous_total: number };
  due: {
    soon: number;
    overdue: number;
    items: { key: string; summary: string; due_in_days: number; who: string | null; board: { id: number; name: string } }[];
  };
  feed: PulseEvent[];
}

/** A stored Home layout; `shared` is true when nobody is signed in and the layout is the same for everyone. */
export interface HomeLayoutResponse {
  layout: { version: number; tiles: { id: string; type: string; size: 'P' | 'M' | 'G'; config?: Record<string, unknown> }[] } | null;
  user: string | null;
  shared: boolean;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

/** A page of boards, also handed over already grouped under their spaces. */
export interface BoardPage extends Paged<BoardListItem> {
  spaces: SpaceGroup[];
}

export interface BoardSettings {
  wip_columns: string[] | null;
  active_columns: string[] | null;
  blocked_status_names: string[];
  timezone: string;
  checkpoint_weekday: number;
  checkpoint_hour: number;
  default_sprint_weeks: number;
  stagnation_checkpoints: number;
  aging_percentile: number;
  hours_per_day: number;
  focus_factor: number;
  hours_per_point: number;
  unestimated_item_hours: number;
  max_items_per_person: number;
  overload_threshold: number;
  idle_threshold: number;
  members: string[];
  affinity: Record<string, string[]>;
  holidays: string[];
}

export interface BoardDetail extends BoardListItem {
  columns: { name: string; status_ids: string[] }[];
  settings: BoardSettings;
  overridden: string[];
}

export interface FieldMap {
  story_points: string[];
  sprint: string | null;
  epic_link: string | null;
  flagged: string | null;
  rank: string | null;
}

export interface FieldsView {
  discovered: FieldMap;
  overrides: Partial<FieldMap>;
  effective: FieldMap;
  missing: string[];
}

/** docs/config-store.md: how a runtime setting is entered and validated. */
export type ConfigKind = 'string' | 'url' | 'email' | 'secret' | 'int' | 'float' | 'bool' | 'timezone' | 'locale' | 'weekday' | 'hour';

/** Where the effective value came from: saved in the app, the env/.env/secret file, or the built-in default. */
export type ConfigSource = 'database' | 'environment' | 'default';

export type ConfigValue = string | number | boolean | null;

export interface ConfigField {
  key: string;
  kind: ConfigKind;
  /** Always null for a secret; `is_set` says whether one exists. */
  value: ConfigValue;
  is_set: boolean;
  source: ConfigSource;
  default: ConfigValue;
  min: number | null;
  max: number | null;
  env_value_differs: boolean;
}

export interface ConfigGroup {
  id: 'jira' | 'calendar' | 'collection' | 'notifications' | 'ai' | 'general' | (string & {});
  fields: ConfigField[];
}

/** A setting only the deployment can change (env only), shown read-only. */
export interface BootstrapEntry {
  key: string;
  /** Already masked by the server; `api_token`/`secret_key` say only whether they are set. */
  value: ConfigValue | string[];
  source: ConfigSource | (string & {});
}

/** `GET /config` (and the answer of every config write). */
export interface ConfigView {
  groups: ConfigGroup[];
  bootstrap: BootstrapEntry[];
  jira_configured: boolean;
  /** Runtime fields whose value still comes from the environment. */
  importable: string[];
  /** Only on `POST /config/import-env`: the keys copied into the database. */
  imported?: string[];
}

/** `POST /config/jira/test`: draft credentials laid over the effective ones. */
export interface JiraDraftTest {
  jira_base_url?: string;
  jira_email?: string;
  jira_api_token?: string;
}

export interface Health {
  status: string;
  version: string;
  database: string;
  jira_configured: boolean;
  jira_base_url: string | null;
  timezone: string;
}

export interface ApiErrorDetail {
  error?: string;
  cause?: string;
  action?: string;
  message?: string;
  status?: number | null;
}

export interface ConnectionResult {
  ok: boolean;
  identity?: { account_id: string; name: string; email?: string | null; timezone?: string | null };
  permissions?: Record<string, boolean>;
  error?: ApiErrorDetail;
}

export interface Discovery {
  identity: { account_id: string; name: string };
  field_map: FieldMap;
  effective_field_map: FieldMap;
  missing_fields: string[];
  spaces: { key: string; name: string }[];
  boards: { id: number; name: string; type: string; space_key: string | null }[];
  statuses: { id: string; name: string; category: Category }[];
}

export interface RunInfo {
  id: string;
  mode: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  counters: Record<string, unknown>;
  error: string | null;
}

export interface BoardRun {
  run_id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  counters: Record<string, unknown>;
  error: string | null;
  cause: string | null;
  action: string | null;
}

export interface BoardStatus {
  board: BoardListItem;
  last_success_at: string | null;
  last_full_at: string | null;
  last_run: BoardRun | null;
}

/** One row of the collection table: a space, followed by each of its boards. */
export interface StatusEntity {
  entity: 'space' | 'board';
  id: string;
  name: string;
  space: Space;
  board: BoardListItem | null;
  /** Space rows only: how many boards the roll-up covers. */
  boards?: number;
  last_success_at: string | null;
  last_full_at: string | null;
  last_run: Partial<BoardRun> | null;
}

export interface StatusView {
  jira_configured: boolean;
  collecting: boolean;
  /** RF-82: the collection holding the lease, board by board. */
  current: CurrentRun | null;
  runs: RunInfo[];
  boards: BoardStatus[];
  entities: StatusEntity[];
}

// ---- deck

export type BindingMode =
  | 'text'
  | 'number'
  | 'status_text'
  | 'bullet_list'
  | 'inline_list'
  | 'grouped_list'
  | 'table_rows'
  | 'grouped_rows'
  | 'status_fill'
  | 'chart'
  /** RF-63: the value rendered as a QR code and placed over the area. */
  | 'qr_code';
export type FieldKind = 'text' | 'number' | 'groups' | 'rows' | 'row_groups' | 'status' | 'series';
export type SortKey = 'modelo' | 'chave' | 'resumo' | 'responsavel' | 'prazo' | 'situacao' | 'epico' | 'estimativa';
export type TextCase = 'original' | 'maiuscula' | 'minuscula' | 'capitular';
export type TextAlign = 'modelo' | 'esquerda' | 'centro' | 'direita' | 'justificado';
export type NumberFormat = 'inteiro' | 'decimal' | 'percentual' | 'percentual_decimal' | 'moeda';

export interface CatalogField {
  key: string;
  kind: FieldKind;
  scope: 'deck' | 'board';
  label: string;
  columns: string[];
  /** How the field picker groups this entry, as words in the request's language. */
  group?: string;
  /** The group's stable id (`report`, `sprint`…), to group and sort by; null for a group the server does not know. */
  group_id?: string | null;
  hint?: string;
  /** RF-56: `jira` for a catalogue field, `variavel` for a registered variable. */
  origin?: 'jira' | 'variavel';
}

/** RF-56: a name the manager could not resolve to exactly one thing. Reported, never merged. */
export interface VariableConflict {
  kind: 'sombreada' | 'colide_com_campo';
  name: string;
  message: string;
  winner_template_id: number | null;
}

// ---- variables (RF-45, RF-52)

export type VariableScope = 'global' | 'space' | 'board' | 'slide';

export interface VariableValue {
  scope: VariableScope;
  scope_key: string;
  value: string;
  updated_at: string | null;
}

export interface Variable {
  id: number;
  name: string;
  label: string;
  description: string;
  /** null means every template may use it; an id binds it to that template alone. */
  template_id: number | null;
  /**
   * The registration's fallback, and the only place a variable may have one. `null` means it has
   * none, so a target that says nothing makes generation fail instead of printing a blank.
   */
  default: string | null;
  /**
   * RF-58: a Jira catalogue key this variable reads from when no target filled it in. `null` means
   * it is a variable somebody writes values for. Never another `texto.*` — the API refuses that,
   * so a variable cannot be pointed at itself.
   */
  source_field: string | null;
  /**
   * RF-59: derived from `source_field`, never stored. `text` when hand-filled; otherwise the kind
   * of the field it reads, which is what decides the binding modes it can fill.
   */
  kind: FieldKind;
  placeholder: string;
  created_at: string | null;
  values: VariableValue[];
}

export interface VariablesView {
  items: Variable[];
  /** RF-56: the Jira field catalogue, browsed from the manager. Kinds are carried through intact. */
  catalog: CatalogField[];
  conflicts: VariableConflict[];
  /** RF-58: names whose value on this target came from their Jira field rather than being typed. */
  from_source: string[];
  /** What each name answers for the asked target, narrowest scope first. */
  resolved: Record<string, string>;
  scope: { template_id: number | null; space_key: string | null; board_id: number | null; slide_id: number | null };
  scopes: VariableScope[];
}

export interface ManifestTarget {
  id: string;
  label: string;
  accepts: BindingMode[];
}

/** EMU (914400 per inch), measured from the top-left of the slide. */
export interface Bbox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ManifestArea {
  id: string;
  shape_id: number;
  name: string;
  kind: 'group' | 'table' | 'chart' | 'picture' | 'text' | 'shape';
  parent: string | null;
  bbox: Bbox;
  fill?: string | null;
  targets: ManifestTarget[];
  markers: string[];
  placeholder?: { idx: number; type: string };
  paragraphs?: ManifestParagraph[];
  frame?: {
    anchor: 'top' | 'middle' | 'bottom';
    wrap: boolean;
    columns: number;
    insets: { l: number; r: number; t: number; b: number };
    rotation: number;
  };
  table?: {
    rows: number;
    cols: number;
    header: string[];
    cells: string[][];
    fills: (string | null)[][];
    col_widths?: number[];
    row_heights?: number[];
    first_row_header?: boolean;
    typography?: Typography[][];
  };
  chart?: { chart_type: string; series: string[]; categories: string[] };
}

/** Enough of a paragraph's look for the preview to be believable, not merely correct. */
export interface Typography {
  size_pt: number | null;
  bold: boolean | null;
  italic: boolean | null;
  font: string | null;
  color: string | null;
  align: 'left' | 'center' | 'right' | 'justify' | null;
}

export interface ManifestParagraph extends Typography {
  index: number;
  text: string;
  level: number;
  bullet: boolean;
  runs: number;
}

export interface ManifestSlide {
  index: number;
  slide_id: number;
  layout: string;
  headline: string;
  notes: string;
  areas: ManifestArea[];
}

export interface Manifest {
  template: { filename: string; sha256: string; slides: number; slide_width: number; slide_height: number };
  theme: { colors: Record<string, string>; fonts: Record<string, string> };
  slides: ManifestSlide[];
}

export interface Binding {
  target: string;
  mode: BindingMode;
  /**
   * RF-59: the registered variable this area shows, by bare name — the way a binding should be
   * written now. `field` is the legacy catalogue path and still resolves.
   */
  variable?: string | null;
  field?: string | null;
  value?: string | null;
  /** Table modes: which data column goes in each table column. */
  columns?: (string | null)[] | null;
  header_rows?: number;
  status_column?: number | null;
  group_row?: number | null;
  item_row?: number | null;
  header_paragraph?: number | null;
  item_paragraph?: number | null;
  // ---- layout: every one optional, each defaulting to "leave the template alone".
  max_items?: number | null;
  max_chars?: number | null;
  sort?: SortKey;
  descending?: boolean;
  only_status?: string[];
  empty_text?: string;
  text_case?: TextCase;
  prefix?: string;
  suffix?: string;
  separator?: string;
  bullet?: string;
  number_format?: NumberFormat;
  decimals?: number;
  text_columns?: number;
  align?: TextAlign;
  shrink_to_fit?: boolean;
  /** RF-92: conditional formatting, first match wins. */
  rules?: FormatRule[];
  /** #18: table columns drawn as bars, arrows or a colour scale. */
  scales?: CellScale[];
  /** #15: what a screen reader says for a chart or QR; empty describes the data itself. */
  alt_text?: string;
}

/** #18: a table column read as a quantity and drawn as one. */
export interface CellScale {
  column: number;
  kind: 'barra' | 'icone' | 'cor';
  min?: number | null;
  max?: number | null;
  inverted?: boolean;
  low_color?: string;
  high_color?: string;
}

export type RuleOp = 'maior' | 'maior_igual' | 'menor' | 'menor_igual' | 'igual' | 'diferente' | 'contem' | 'vazio' | 'nao_vazio';

/** An extra AND'd condition of a compound rule, table modes only, its own column per condition. */
export interface FormatCondition {
  when: RuleOp;
  value: string;
  column?: number | null;
}

export interface FormatRule {
  when: RuleOp;
  value: string;
  color: string;
  apply: 'texto' | 'preenchimento';
  /** Table modes: the column whose text is tested; empty tests the status column. */
  column?: number | null;
  whole_row?: boolean;
  /** RF-92 compound rules: every extra condition must also hold ("atrasado E prioridade alta"). */
  also?: FormatCondition[];
}

/** RF-77: a template's own generation time, independent of the boards' checkpoints. */
export interface DeckSchedule {
  enabled: boolean;
  weekdays: number[];
  hour: number;
  minute: number;
  timezone: string;
  reference: 'agora' | 'ultimo_checkpoint';
  notify: boolean;
  /** #13: e-mail attaches the file in this format; webhooks always get the link. */
  attach?: 'link' | 'pptx' | 'pdf';
  /** #25: generate for this audience only; empty = every slide. */
  audience?: string;
}

export interface SlideMapping {
  action: 'keep' | 'remove';
  scope: 'deck' | 'board' | 'repeat';
  board_id?: number | null;
  overflow?: 'clone' | 'truncate';
  repeat_by?: 'board' | 'espaco';
  hide_when_empty?: string | null;
  /** RF-65: a name given to this slide. Empty falls back to the template's own headline. */
  name?: string;
  /**
   * RF-55: which spaces/boards this slide belongs to. **Empty means every one of them** — the
   * default a new slide gets, and what every mapping saved before scoping existed already says,
   * so an old presentation keeps emitting the slides it always did. The two are ANDed.
   */
  only_spaces?: string[];
  only_boards?: number[];
  /** #25: audience variants this slide belongs to; empty = every audience. */
  only_audiences?: string[];
  /** #26: minutes planned for this slide in the meeting. */
  minutes?: number | null;
  /** How Cadência's own presenter moves into this slide; never written into the .pptx file. */
  transition?: 'nenhuma' | 'fade' | 'deslizar';
  bindings: Binding[];
}

/**
 * RF-59: the catalogue key a binding resolves, whichever way it was written. Mirrors
 * `Binding.key` on the backend so the two cannot disagree about what a binding points at.
 */
export const bindingKey = (binding: Binding): string | null =>
  binding.variable ? `texto.${binding.variable}` : (binding.field ?? null);

/** RF-66: what would be wrong with a slide's content, before anything is generated. */
export interface SlideReadiness {
  slide_id: number;
  index: number;
  name: string;
  variables: string[];
  problems: { kind: 'nao_registrada' | 'sem_valor'; variable: string; boards: string[] }[];
  unbound_targets: string[];
  ok: boolean;
}

export interface TemplateReadiness {
  template_id: number;
  reference: string;
  boards: string[];
  slides: SlideReadiness[];
  ok: boolean;
}

/** What to call a slide in the rail: its given name, else the template's headline, else its number. */
export const slideTitle = (slide: SlideMapping | undefined, headline: string, index: number) =>
  slide?.name?.trim() || headline.trim() || `Slide ${index}`;

/** A slide narrowed to some spaces/boards: what the thumbnail badge marks. */
export const isConditional = (slide?: SlideMapping | null) =>
  Boolean(slide?.only_spaces?.length || slide?.only_boards?.length || slide?.only_audiences?.length);

/** RF-62: the shared status configuration, owned by the variable manager. */
export interface DeckPalette {
  palette: Record<string, string>;
  status_labels: Record<string, string>;
  statuses: string[];
}

export interface DeckMapping {
  slides: Record<string, SlideMapping>;
  palette: Record<string, string>;
  status_labels: Record<string, string>;
  anonymize: boolean;
  board_ids: number[];
  /** RF-55: spaces the presentation covers. Empty means all of them; a space narrows `board_ids`. */
  space_keys?: string[];
  auto_generate: boolean;
  schedule?: DeckSchedule;
  /** #12: decks from this template download (without force) only once approved. */
  require_approval?: boolean;
  /** #25: named audience variants. */
  audiences?: string[];
}

export interface TemplateSummary {
  id: number;
  name: string;
  filename: string;
  sha256: string;
  uploaded_at: string;
  slides: number;
  has_mapping: boolean;
  has_edits: boolean;
  /** Decks already generated from it; deleting the template keeps them. */
  runs: number;
  size: number | null;
  missing_file: boolean;
}

export interface TemplateDeleted {
  deleted: boolean;
  id: number;
  name: string;
  runs_kept: number;
  files: string[];
}

export interface TemplateDetail {
  id: number;
  name: string;
  filename: string;
  sha256: string;
  manifest: Manifest;
  mapping: DeckMapping | null;
  mapping_sha256: string | null;
  mapping_outdated: boolean;
  missing_targets: string[];
  suggestion: DeckMapping & { notes: string[] };
  boards: DeckBoard[];
}

export interface DeckBoard {
  id: number;
  name: string;
  space_key: string | null;
  space_name: string | null;
  selected?: boolean;
}

export interface TemplatePreviews {
  rendered: boolean;
  images: string[];
  reason?: string;
}

/** What one catalogue field holds for a board right now, shown beside the field picker. */
export interface FieldPreview {
  kind: FieldKind | null;
  empty: boolean;
  count: number | null;
  lines: string[];
  truncated: boolean;
}

export interface PreviewValues {
  board: { id: number; name: string; space_key?: string | null; space_name?: string | null } | null;
  reference: string | null;
  fields: Record<string, FieldPreview>;
}

// ---- resolved slide preview: what the slide will actually say

export interface PreviewRow {
  values: Record<string, string>;
  status: string | null;
  status_label: string;
  color: string | null;
}

export interface PreviewItem {
  target: string;
  mode: BindingMode;
  field: string | null;
  literal: boolean;
  kind: FieldKind | null;
  empty?: boolean;
  unknown?: boolean;
  unbound?: boolean;
  /** A registered variable with no value for this target and no default in its registration. */
  unfilled?: boolean;
  /** The literal text as typed, before its placeholders were resolved. */
  raw?: string;
  /** Names inside a literal the variable manager has never heard of: register them or fix the typo. */
  unregistered_texts?: string[];
  /** Names inside a literal that are registered but have nothing to say for this target. */
  missing_texts?: string[];
  text?: string;
  lines?: string[];
  groups?: { title: string; items: string[] }[];
  rows?: PreviewRow[];
  row_groups?: { title: string; rows: PreviewRow[] }[];
  columns?: (string | null)[];
  status_column?: number | null;
  header_rows?: number;
  fill?: string | null;
  status?: string | null;
  series?: { categories: string[]; series: Record<string, number[]> } | null;
  layout?: { align: TextAlign; text_columns: number; bullet: string; shrink_to_fit: boolean };
  /** #18: per row, per table column: the bar/arrow text and the colour-scale fill. */
  scales?: Record<string, { text?: string; fill?: string }>[];
}

export interface SlidePreview {
  slide_id: number;
  scope: SlideMapping['scope'];
  action: SlideMapping['action'];
  items: PreviewItem[];
  markers: { area: string; name: string; known: boolean; unfilled: boolean; text: string }[];
  warnings: string[];
  unresolved_markers: string[];
  board: { id: number; name: string; space_key: string | null; space_name: string | null } | null;
  reference: string;
}

export interface ValidationItem {
  kind: string;
  message: string;
  slide?: number | null;
  target?: string | null;
  field?: string | null;
}

export interface ReportRun {
  id: string;
  template_id: number;
  template_sha256: string;
  created_at: string;
  reference_at: string;
  board_ids: number[];
  sprint_ids: number[];
  status: 'ok' | 'invalid';
  anonymized: boolean;
  validation: {
    ok: boolean;
    errors: ValidationItem[];
    warnings: ValidationItem[];
    info: string[];
    slides: number;
    preview: { rendered: boolean; pdf?: string | null; images?: string[]; reason?: string };
    /** Output slide number (1-based `index`) -> the template slide and board it came from. */
    produced?: { index: number; origin_slide_id: number; board_id: number | null; page: number }[];
  };
  /** RF-71: present when the generation was also sent to the delivery channels. */
  delivery?: DeliveryResult[];
  kind?: 'entrega' | 'previa' | 'parcial';
  parent_run_id?: string | null;
  audience?: string;
  review?: RunReview;
  seconds?: number;
}

export type ReviewStatus = 'rascunho' | 'em_revisao' | 'aprovado' | 'reprovado';

export interface ReviewEvent {
  action: 'enviar' | 'aprovar' | 'reprovar' | 'reabrir';
  by: string | null;
  at: string;
  note: string;
}

export interface RunReview {
  status: ReviewStatus;
  by: string | null;
  at: string | null;
  note: string;
  /** Every decision kept, oldest first — the current `status`/`by`/`note` above is only the last one. */
  history: ReviewEvent[];
}

export interface RunComparison {
  before: ReportRun;
  after: ReportRun;
  same: boolean;
  slides: {
    key: string;
    board: string;
    before_index: number | null;
    after_index: number | null;
    change: 'novo' | 'removido' | 'alterado';
    removed?: string[];
    added?: string[];
  }[];
}

export interface DeckShare {
  token: string;
  run_id: string;
  created_at: string;
  expires_at: string;
  created_by: string | null;
  revoked: boolean;
  views: number;
  path: string;
  url: string | null;
}

/** Slides' audience Q&A: a question asked against a run while it is being presented. */
export interface DeckQuestion {
  id: number;
  run_id: string;
  text: string;
  author: string | null;
  asked_at: string;
  answered_at: string | null;
}

export interface A11yFinding {
  kind: 'sem_texto_alternativo' | 'contraste_baixo' | 'ordem_de_leitura';
  slide: number;
  shape: string | null;
  message: string;
}

export interface A11yReport {
  summary: Record<string, number>;
  findings: A11yFinding[];
}

export interface DeckBlock {
  id: number;
  name: string;
  description: string;
  author: string | null;
  shapes: Record<string, ShapeEdit>;
  width: number;
  height: number;
  created_at: string;
  usage_count: number;
  last_used_at: string | null;
}

export interface LibraryAsset {
  id: string;
  filename: string;
  label: string;
  tags: string[];
  content_type: string;
  width: number;
  height: number;
  uploaded_at: string;
  url: string;
}

export interface PresenceEntry {
  author: string;
  slide_key: string;
  seen_at: string;
}

export interface SlideHistoryEntry {
  version_id: number;
  label: string;
  auto: boolean;
  author: string | null;
  at: string;
  removed: boolean;
}

export interface TemplateDiagnostics {
  template_id: number;
  size_mb: number | null;
  slides: number;
  checks: { id: string; severity: 'erro' | 'aviso' | 'info'; message: string; count: number; items: unknown[] }[];
}

export interface TemplateUsage {
  runs: number;
  ok: number;
  seconds_avg: number | null;
  seconds_max: number | null;
  problems: { kind: string; count: number }[];
  dropped: { slide_id: number; name: string; count: number }[];
  presented: { slide_id: number; name: string; avg_seconds: number; times: number }[];
  suggestions: string[];
}

export interface SharedDeck {
  scene: DeckScene & { image_base: string };
  reference_at: string;
  template: string;
  boards: string[];
  fonts: { families: { family: string; face: string | null; variants: string[]; metric_compatible: boolean }[]; faces: string[] };
  images: string[];
}

export interface NarrativeDraft {
  texto: string;
  fatos: Record<string, string | number>;
  modelo: string;
}


// ---- the editor: the generated deck as an editable scene (RF-46, RF-47)

/** Geometry in EMU, exactly as the .pptx holds it. */
export interface ShapeFrame {
  x: number;
  y: number;
  cx: number;
  cy: number;
  rotation: number;
  flip_h?: boolean;
  flip_v?: boolean;
}

export interface ShadowEdit {
  enabled: boolean;
  color: string;
  alpha: number;
  blur_pt: number;
  distance_pt: number;
  angle: number;
}

export interface GradientStop {
  color: string;
  alpha: number;
  at: number;
}

export interface SceneFill {
  type: 'solid' | 'none' | 'inherit' | 'gradient' | 'picture';
  color?: string | null;
  alpha?: number | null;
  stops?: GradientStop[];
  angle?: number;
}

export interface SceneLine {
  type: 'solid' | 'none' | 'inherit';
  color?: string | null;
  alpha?: number | null;
  width_pt?: number | null;
  dash?: string | null;
}

export interface RunStyle {
  font?: string | null;
  size_pt?: number | null;
  bold?: boolean | null;
  italic?: boolean | null;
  underline?: boolean | null;
  color?: string | null;
  /** The text-marker colour (`<a:highlight>`), RRGGBB. `''` clears it; `undefined`/`null` leaves it. */
  highlight?: string | null;
  /** A URL this run jumps to when clicked. `''` clears an existing link; `undefined`/`null` leaves it. */
  link?: string | null;
}

export interface SceneParagraph {
  text: string;
  level: number;
  align: 'left' | 'center' | 'right' | 'justify' | null;
  line_spacing: number | null;
  space_before_pt: number | null;
  space_after_pt: number | null;
  bullet: { kind: 'inherit' | 'none' | 'char' | 'number'; char?: string };
  style: RunStyle;
  runs: ({ text: string } & RunStyle)[];
}

export interface SceneText {
  paragraphs: SceneParagraph[];
  anchor: 'top' | 'middle' | 'bottom';
  word_wrap: boolean;
  autofit: 'none' | 'shrink' | 'resize';
  columns: number;
  insets_pt: { l: number; r: number; t: number; b: number };
}

export type SceneShapeKind = 'textbox' | 'shape' | 'image' | 'table' | 'chart' | 'group' | 'line' | 'smartart';

export interface SceneShape {
  key: string;
  shape_id: number;
  name: string;
  kind: SceneShapeKind;
  z: number;
  parent: string | null;
  frame: ShapeFrame;
  geometry: string | null;
  fill: SceneFill;
  line: SceneLine;
  placeholder: { idx: number; type: string } | null;
  /** Nesting depth inside groups; the frame above is already absolute. */
  depth: number;
  flip: { h: boolean; v: boolean };
  /** SVG path in a 0..1 box: the shape's real outline, not a rectangle. */
  path: string;
  /** A connector: stroked corner to corner, never filled. */
  stroke_only: boolean;
  /** False for charts and SmartArt: the canvas crops the rendered slide instead of guessing. */
  renderable: boolean;
  /** A group: selectable, never painted. */
  container: boolean;
  /** Outer shadow in EMU, when the shape has one. */
  shadow?: { blur: number; dx: number; dy: number; color: string; alpha: number } | null;
  /** True when the next run will overwrite this shape's content from the data. */
  bound: boolean;
  bound_field: string | null;
  text?: SceneText;
  image?: { content_type?: string; size?: number[]; crop?: Record<string, number>; asset_id?: string } | null;
  table?: {
    rows: number;
    cols: number;
    col_widths: number[];
    row_heights: number[];
    cells: string[][];
    fills: (string | null)[][];
    styles?: RunStyle[][];
  };
  chart?: { chart_type: string };
  /** #15: the alternative text the file carries for this shape. */
  alt?: string;
}

export interface SceneSlide {
  key: string;
  index: number;
  origin_slide_id: number;
  board_id: number | null;
  page: number;
  layout: string;
  notes: string;
  /** The slide's own background, if it has one; `null` means it inherits the layout/master. */
  background: { type: 'solid'; color: string } | null;
  shapes: SceneShape[];
  edited: boolean;
  /** Set on a slide the editor duplicated; it is not in the generated file yet. */
  duplicate_of?: string;
}

export interface DeckScene {
  /** RF-61: null for a template scene — the same shape, read from a file nothing has filled yet. */
  run_id: string | null;
  template_id: number;
  template_name?: string;
  reference_at?: string;
  /** #12: its own template was deleted — the deck still opens, without theme or bound-field marks. */
  template_deleted?: boolean;
  slide_width: number;
  slide_height: number;
  theme: { colors: Record<string, string>; fonts: Record<string, string | null>; background?: string };
  slides: SceneSlide[];
  /** #14: a shared (public) scene fetches its pictures here instead of by run id. */
  image_base?: string;
}

// ---- the edit document, mirrored from cadencia/report/edits.py

export interface RunEdit {
  text: string;
  style?: RunStyle;
}

export interface ParagraphEdit {
  text: string;
  /** When present, the paragraph is written run by run and `text` is only a summary. */
  runs?: RunEdit[] | null;
  align?: 'left' | 'center' | 'right' | 'justify' | null;
  level?: number;
  line_spacing?: number | null;
  space_before_pt?: number | null;
  space_after_pt?: number | null;
  bullet?: 'none' | 'char' | 'number' | null;
  bullet_char?: string;
  style?: RunStyle;
}

export interface TextEdit {
  paragraphs?: ParagraphEdit[] | null;
  word_wrap?: boolean | null;
  autofit?: 'none' | 'shrink' | 'resize' | null;
  anchor?: 'top' | 'middle' | 'bottom' | null;
  insets_pt?: { l: number; r: number; t: number; b: number } | null;
  columns?: number | null;
}

export interface ShapeEdit {
  op?: 'update' | 'insert' | 'delete';
  kind?: 'textbox' | 'shape' | 'image' | null;
  preset?: string | null;
  frame?: Partial<ShapeFrame> | null;
  z?: number | null;
  fill?: SceneFill | null;
  line?: SceneLine | null;
  shadow?: ShadowEdit | null;
  corner_radius?: number | null;
  text?: TextEdit | null;
  image?: { asset_id?: string | null; crop?: Record<string, number> | null } | null;
  /** #15: what a screen reader says for this shape; "" clears it. */
  alt_text?: string | null;
}

/** #22: a named look applied with one click; editor-only, never in the file. */
export interface NamedStyle {
  name: string;
  run?: RunStyle;
  align?: 'left' | 'center' | 'right' | 'justify' | null;
  fill?: string | null;
}

export interface SlideEditDoc {
  shapes: Record<string, ShapeEdit>;
  /** Speaker notes, replaced wholesale when set. */
  notes?: string | null;
  /** Table cell text overrides, keyed `"<shape key>:<row>:<col>"`. */
  cells?: Record<string, string>;
  /** Groups to dissolve, so their children can be edited one by one. */
  ungrouped?: string[];
  /**
   * Selection groups: an editor-invented name -> the shape keys that select, move and style as one.
   *
   * They carry no geometry on purpose. A real `<p:grpSp>` gives its children coordinates relative
   * to the group, and this document is absolute overrides (a relative one drifts on the second
   * replay), so members keep their own absolute frames and this never reaches the .pptx.
   */
  groups?: Record<string, string[]>;
  /** RF-89: shapes the canvas will not move or delete, and shapes hidden while editing. Never in the file. */
  locked?: string[];
  hidden?: string[];
  /** RF-91: column widths (EMU) and per-cell styles keyed `"row:col"`, by table shape key. */
  tables?: Record<string, TableEdit>;
  /** The slide's own background (Slides' "Background" button). `undefined`/`null` means
   * untouched; a real fill — including `{ type: 'none' }`, an explicit "inherit" — replays. */
  background?: SceneFill | null;
}

export interface DeckEdits {
  version: number;
  slides: Record<string, SlideEditDoc>;
  order: string[];
  deleted: string[];
  duplicates: Record<string, string>;
  /** #22: the template's named styles. */
  styles?: Record<string, NamedStyle>;
}

export interface EditsView {
  edits: DeckEdits;
  revision: number;
  updated_at: string | null;
}

export interface AssetSummary {
  id: string;
  filename: string;
  content_type: string;
  width: number;
  height: number;
  url: string;
}

// ---- RF-71 … RF-100

export interface CellStyle {
  fill?: string | null;
  bold?: boolean | null;
  italic?: boolean | null;
  color?: string | null;
  size_pt?: number | null;
  align?: 'left' | 'center' | 'right' | 'justify' | null;
}

export interface TableEdit {
  col_widths?: number[] | null;
  cells?: Record<string, CellStyle>;
}

export interface CurrentRun {
  run_id: string;
  mode: string | null;
  started_at: string | null;
  cancel_requested: boolean;
  boards: {
    board_id: number;
    name: string;
    status: string;
    phase: 'configuracao' | 'itens' | 'historico' | 'gravando' | null;
    done: number | null;
    total: number | null;
    started_at: string;
    eta_seconds: number | null;
  }[];
}

export interface ForecastResult {
  remaining: number;
  sample_days: number;
  delivered_in_sample: number;
  p50_days: number | null;
  p85_days: number | null;
  p95_days: number | null;
  p50_date: string | null;
  p85_date: string | null;
  p95_date: string | null;
  horizon_days: number | null;
  probability: number | null;
  low_confidence: boolean;
  reason: string | null;
}

export interface ForecastView {
  scope: 'sprint' | 'epic' | 'board';
  sprint?: { id: number; name: string; state: string };
  epic?: { key: string; summary: string };
  end?: string | null;
  closed?: boolean;
  caveat?: string;
  forecast: ForecastResult;
  remaining_keys: string[];
}

export interface ChangeEntry {
  key: string;
  summary: string;
  url: string | null;
  status: string;
  category: string;
  assignee: string | null;
  estimate: number | null;
  situation: string;
  label: string;
  reason: string | null;
  from?: string | null;
  from_status?: string;
  from_assignee?: string | null;
}

export interface ChangeTotals {
  items: number;
  done: number;
  open: number;
  open_estimate: number;
  situations: Record<string, number>;
}

export interface ChangesView {
  board: { id: number; name: string };
  since: { id: number; at: string } | null;
  until: { id: number | null; at: string };
  checkpoints: { id: number; at: string; sprint_id: number | null }[];
  entered: ChangeEntry[];
  left: ChangeEntry[];
  completed: ChangeEntry[];
  reopened: ChangeEntry[];
  new_risks: ChangeEntry[];
  resolved: ChangeEntry[];
  moved: ChangeEntry[];
  reassigned: ChangeEntry[];
  before: ChangeTotals;
  after: ChangeTotals;
}

export interface DigestView {
  generated_at: string;
  total_new_risks: number;
  spaces: {
    space: { key: string | null; name: string };
    boards: { board: { id: number; name: string }; since: { id: number; at: string } | null; new_risks: ChangeEntry[]; resolved: ChangeEntry[] }[];
  }[];
}

export interface HealthCheck {
  id: string;
  severity: 'erro' | 'aviso' | 'info';
  title: string;
  count: number;
  examples: string[];
  all: string[];
  action: string;
  link: string | null;
}

export interface HealthView {
  ok: boolean;
  problems: number;
  items: { board: { id: number; name: string; space_name: string | null }; ok: boolean; checks: HealthCheck[] }[];
}

export interface SearchItem {
  type: 'board' | 'sprint' | 'item' | 'epico' | 'pessoa' | 'modelo';
  id: string;
  label: string;
  detail: string;
  path: string;
}

export interface WeekItem extends IssueBrief {
  board: { id: number; name: string };
  risk?: Risk;
  due_in_days?: number | null;
  done_at?: string;
}

export interface WeekView {
  person: { account_id: string; name: string | null };
  open: WeekItem[];
  at_risk: WeekItem[];
  due_soon: WeekItem[];
  done: WeekItem[];
  counts: { open: number; at_risk: number; due_soon: number; done: number };
}

export interface SavedView {
  id: number;
  name: string;
  path: string;
  query: string;
  pinned: boolean;
  url: string;
  created_at: string;
}

export type NotifyEvent = 'deck' | 'digest' | 'collection_failed';

export interface NotifyChannel {
  id?: string;
  name: string;
  kind: 'slack' | 'teams' | 'webhook' | 'email';
  target: string;
  events: NotifyEvent[];
  enabled: boolean;
  last?: DeliveryResult | null;
}

export interface DeliveryResult {
  channel: string;
  name: string;
  kind: string;
  ok: boolean;
  error?: string;
  at: string;
  event: string;
}

export interface DigestSchedule {
  enabled: boolean;
  weekdays: number[];
  hour: number;
  timezone: string;
}

export interface NotificationsView {
  channels: NotifyChannel[];
  digest: DigestSchedule;
  events: { id: NotifyEvent; label: string }[];
  smtp_configured: boolean;
  public_url: string | null;
}

export interface DeckVersion {
  id: number;
  template_id: number;
  kind: 'edits' | 'mapping';
  label: string;
  auto: boolean;
  author: string | null;
  created_at: string;
  updated_at: string;
}

export interface VersionDiff {
  slides: { slide: string; shapes?: string[]; other?: string[]; bindings?: number; current_bindings?: number }[];
  deck: string[];
  same: boolean;
}

export interface DeckVersionDetail extends DeckVersion {
  document: unknown;
  diff: VersionDiff;
}

export interface DeckComment {
  id: number;
  origin_slide_id: number;
  shape_key: string | null;
  parent_id: number | null;
  author: string;
  body: string;
  created_at: string;
  resolved_at: string | null;
}

export interface ReplaceMatch {
  variable: string;
  scope: string;
  scope_key: string;
  before: string;
  after: string;
}

// ---- Epic plan (roles, capacity, estimates, pipeline, schedules). Keys are Portuguese on the
// wire because the planning contract (POST /planejamento) was specified that way.

export interface PlanRole {
  id: number;
  nome: string;
  descricao: string;
  cor: string;
  ordem: number;
  rotulos: string[];
  /** Only on GET /roles: who covers it. */
  membros?: string[];
}

export interface PlanMemberRole {
  papel_id: number;
  senioridade: 'junior' | 'pleno' | 'senior';
  senioridade_rotulo: string;
}

export interface PlanMember {
  id: string;
  nome: string;
  ativo: boolean;
  papeis: PlanMemberRole[];
  flutuante: boolean;
}

export interface PlanMembersView {
  items: PlanMember[];
  /** Jira people not enrolled yet. */
  pessoas: { id: string; nome: string }[];
}

export interface PlanParameters {
  jornada_h: number;
  overhead_jira_h: number;
  code_review_h: number;
  cadastro_card_min: number;
  granularidade_h: number;
  limite_solver_s: number;
  rotulo_code_review: string;
  rotulo_cadastro_jira: string;
  rotulo_planejamento: string;
  rotulo_sem_codigo: string;
  fonte_horas: HoursSource;
  horas_semana: number;
}

export type HoursSource = 'estimativa_original' | 'campo_estimativa';

/** Where a subtask's roles came from; null when nothing answered. */
export type RoleOrigin = 'manual' | 'rotulo' | 'responsavel' | 'tarefa';

export interface PlanProblem {
  nivel: 'erro' | 'aviso';
  codigo: string;
  mensagem: string;
  subtarefas: string[];
}

export interface PlanTask {
  id: string;
  titulo: string;
  fase: 'planejamento' | 'execucao';
  tem_codigo: boolean;
  negocio: string;
  tecnico: string;
  observacao_dependencia: string;
  resumo: string;
  status: string;
  concluida: boolean;
  horas_execucao: number;
  horas_code_review: number;
  horas: number;
  rotulo_horas: string;
  papeis: number[];
  depende_de: string[];
  subtarefas: string[];
  url: string | null;
}

export interface PlanSubtask {
  id: string;
  tarefa_id: string;
  titulo: string;
  horas: number;
  rotulo_horas: string;
  papeis: number[];
  tipo: 'execucao' | 'code_review' | 'cadastro_jira';
  composta: boolean;
  prerequisitos: string[];
  status: string;
  concluida: boolean;
  origem_papel: RoleOrigin | null;
  responsavel: string | null;
  url: string | null;
}

/** ``inicio``/``fim`` are working hours since the start of the plan. */
export interface PlanAllocation {
  subtarefa_id: string;
  membro_id: string;
  papel_id: number;
  inicio: number;
  fim: number;
}

export interface PlanDuration {
  planejamento_dias: number;
  execucao_dias: number;
  total_dias: number;
  rotulo: string;
}

export interface PlanWeek {
  indice: number;
  semana: number;
  planejamento: boolean;
  papeis: string[];
}

export interface PlanSchedule {
  alocacoes: PlanAllocation[];
  makespan_horas: number;
  makespan_dias: number;
  duracao: PlanDuration;
  semanas: PlanWeek[];
  violacoes: string[];
}

export interface TaskSegment {
  tarefa_id: string;
  papel_id: number;
  inicio: number;
  fim: number;
  horas: number;
  rotulo: string;
  subtarefas: string[];
}

export interface BaselineSchedule extends PlanSchedule {
  segmentos_tarefa: TaskSegment[];
}

export type PlanStatus = 'otimo' | 'viavel' | 'sem_solucao' | 'heuristico' | 'invalido';

export interface GeneratedPlan extends PlanSchedule {
  algoritmo: string;
  algoritmo_nome: string;
  status: PlanStatus;
  gap: number | null;
  origem: 'armazenado' | 'automatico';
  gerado_em: string | null;
  tempo_s: number;
  ganho_dias?: number;
}

export interface PlanGraph {
  nos: { id: string; camada: number }[];
  arestas: { de: string; para: string }[];
}

export interface EpicPlanView {
  epico: { key: string; titulo: string; url: string | null };
  parametros: PlanParameters;
  papeis: PlanRole[];
  membros: PlanMember[];
  selecao: string[];
  tarefas: PlanTask[];
  subtarefas: PlanSubtask[];
  problemas: PlanProblem[];
  bloqueios_base: PlanProblem[];
  bloqueios_plano: PlanProblem[];
  horas: { planejamento: number; execucao: number; code_review: number; jira: number; jira_subtarefas: number; total: number };
  por_papel: { papel_id: number; horas_pessoa: number; percentual: number | null; subtarefas: number; tarefas: number }[];
  reconciliacao: {
    horas_pessoa: number;
    horas_compostas: number;
    horas_planejamento: number;
    horas_execucao: number;
    fecha: boolean;
  };
  capacidade: {
    pessoas: number;
    real: number;
    flutuantes: string[];
    por_papel: { papel_id: number; potencial: number; membros: string[]; sem_membro: boolean; subtarefas_afetadas: string[] }[];
    por_membro: {
      membro_id: string;
      capacidade_semanal: number;
      semanas: { semana: number; horas: number; ocupacao: number | null }[];
      horas_total: number;
    }[];
  };
  pipeline: {
    tarefas: PlanGraph;
    subtarefas: PlanGraph;
    notas: { tarefa_id: string; titulo: string; texto: string }[];
  };
  diagnostico: {
    fonte_horas: HoursSource;
    horas_encontradas: Record<HoursSource, number>;
    subtarefas: number;
    sem_papel: string[];
    papel_por_origem: Record<RoleOrigin, number>;
    membros_com_papel: number;
  };
  base: BaselineSchedule | null;
  plano: GeneratedPlan | null;
}

export interface PlanAlgorithm {
  id: string;
  nome: string;
  descricao: string;
  exato: boolean;
  padrao: boolean;
}

export interface PlanResult {
  id?: number;
  algoritmo: string;
  status: PlanStatus;
  gap: number | null;
  tempo_s: number;
  makespan_dias: number | null;
  alocacoes: PlanAllocation[];
  violacoes: string[];
  duracao: PlanDuration | null;
}


// ---- Timeline de foco: isolada do Jira (routes_focus_log.py, cadencia/focus_log)
export interface FocusLogPerson {
  id: string;
  nome: string;
  cargo: string;
  cor: string;
}

export interface FocusLogTheme {
  nome: string;
  cor: string;
  palavras: string;
}

export interface FocusLogEntry {
  uid: string;
  tipo: 'tarefa' | 'troca';
  nome: string;
  /** ISO date (yyyy-mm-dd). */
  data: string;
  registro: string;
  de_tema: string | null;
  para_tema: string | null;
  icone: string | null;
  cor_destaque: string | null;
  estilo_linha: 'borda-gradiente' | 'borda-tracejada' | 'borda-dupla' | 'borda-solida' | null;
}

export interface FocusLogSignal {
  nome: string;
  cor: string;
  /** Comma-separated words; a line whose text holds one of them carries the signal. */
  palavras: string;
  /** What the signal means, in the team's words. Shown on the signal, not matched. */
  gatilho: string;
}

export interface FocusLogDocument {
  revision: number;
  pessoas: FocusLogPerson[];
  temas: FocusLogTheme[];
  sinais: FocusLogSignal[];
  registros: FocusLogEntry[];
}
