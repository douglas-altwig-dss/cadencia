// Namespace `epicPlan`, owned by `components/epicPlan` (the epic page's Plan tab).
// en-US is the source of truth: this object's type is the shape pt-BR and de-DE must match.
// Plain strings, or functions for anything with parameters or plurals (never concatenate fragments).
// Do not add `as const`: values must widen to `string` so the other languages can differ.
// `**text**` marks bold inside a sentence; `shared.tsx`'s `rich()` draws it.

import { plural } from '../../plural';

export const epicPlan = {
  /** Counts with their unit, shared by several sections. */
  count: {
    tasks: (n: number) => plural(n, 'task', 'tasks'),
    subtasks: (n: number) => plural(n, 'subtask', 'subtasks'),
    days: (n: number) => plural(n, 'day', 'days'),
    workingDays: (n: number) => plural(n, 'working day', 'working days'),
    people: (n: number) => plural(n, 'person', 'people'),
    errors: (n: number) => plural(n, 'error', 'errors'),
    warnings: (n: number) => plural(n, 'warning', 'warnings'),
  },
  /** `shared.tsx`: section 8's texts that belong to the page. */
  tips: {
    floating: 'This person covers more than one role. Their hours appear under each role, but can only be spent once.',
    personHours:
      'Composite subtasks add the full hour to each role involved, which is why the sum per role is larger than the epic total.',
    baseline: 'Assumes one person per role, without optimizing the allocation. It is the reference for measuring what planning gains.',
  },
  floatingAria: 'Floating capacity',
  status: {
    otimo: 'Optimal',
    viavel: 'Feasible',
    sem_solucao: 'No solution within the time limit',
    heuristico: 'Heuristic',
    invalido: 'Invalid plan',
  },
  statusWithGap: (label: string, gap: string) => `${label} — gap ${gap}%`,
  gain: {
    faster: (days: number) => `⭐ ${plural(days, 'day', 'days')} faster`,
    same: 'same duration as the baseline schedule',
    slower: (days: number) => `${plural(days, 'day', 'days')} slower than the baseline schedule`,
  },
  /** `EpicPlanTab`: the index, the section headers and the Jira data problems. */
  tab: {
    groupPlan: 'Plan',
    groupConfig: 'Configuration',
    index: {
      'plano-resumo': 'Summary',
      'plano-capacidade': 'Hours available',
      'plano-estimativa': 'Estimate by role',
      'plano-pipeline': 'Dependency pipeline',
      'plano-cronograma': 'Weekly schedule',
      'plano-planejamento': 'Planning',
      'plano-cards': 'Detailed cards',
      'plano-subtarefas': 'Subtask roles',
      'plano-dados': 'Jira data',
      'plano-parametros': 'Parameters',
    },
    indexAria: 'Plan index',
    jump: 'Go to section',
    jumpAria: 'Go to plan section',
    emptyTitle: 'This epic has no collected tasks.',
    emptyBody:
      'The plan reads the epic’s child tasks and their subtasks, with the hours from the source chosen in the parameters (original estimate or estimate field).',
    sections: {
      summary: {
        title: 'Summary',
        description: 'What the epic costs, how long it takes, and how much planning gains over one person per role.',
      },
      capacity: {
        title: 'Hours available',
        description: 'Who is available for this epic and how much each role could take on.',
      },
      estimate: {
        title: 'Hours estimate by role',
        description: 'Planning and execution hours, overheads and the weight of each role.',
      },
      pipeline: { title: 'Dependency pipeline', description: 'What blocks what, from left to right.' },
      schedule: { title: 'Weekly schedule', description: 'The baseline schedule: one person per role, without optimizing the allocation.' },
      planning: { title: 'Planning', description: 'The real team, allocated by an algorithm, against the baseline schedule.' },
      cards: { title: 'Detailed cards', description: 'Each task with its business and technical context and its subtasks.' },
      subtasks: {
        title: 'Subtask roles',
        description: 'Where each subtask’s role came from, and the manual choice when nothing in Jira answers.',
      },
      data: { title: 'Jira data', description: 'What reading the epic found that looks wrong.' },
      parameters: {
        title: 'Parameters',
        description:
          'Workday, overheads, granularity and how Jira labels become a plan — they apply to every epic and are edited in Settings.',
      },
    },
    noProblemsTitle: 'No problems in the epic’s data',
    noProblemsBody: 'Every subtask has a role and an estimate, and the dependencies form a flow without cycles.',
    errorsTitle: (n: number) => (n === 1 ? '1 error blocks the schedule and the planning' : `${n} errors block the schedule and the planning`),
  },
  /** `PlanSummary`: the answer first. */
  summary: {
    hours: 'Epic hours',
    hoursHint: (planning: string, execution: string, jira: string) => `planning ${planning} · execution ${execution} · Jira ${jira}`,
    baseline: 'Baseline schedule',
    baselineHint: (planning: number, execution: number) => `${planning} d of planning + ${execution} d of execution`,
    baselineBlocked: 'blocked — see the data',
    plan: 'Generated plan',
    noPlan: 'no plan for the current team',
    team: 'Team',
    teamHint: (hoursPerWeek: string, floating: number) =>
      `${hoursPerWeek}h/week · ${plural(floating, 'covers', 'cover')} more than one role`,
    data: 'Jira data',
    noProblems: 'no problems',
  },
  /** `ParametersSummary`: the global parameters, read-only. */
  parametersSummary: {
    hoursFromField: 'hours from the estimate field',
    hoursFromOriginal: 'hours from the original estimate',
    workday: (h: string) => `workday ${h} h/day`,
    jira: (h: string) => `Jira ${h} h/subtask`,
    codeReview: (h: string) => `code review ${h} h`,
    cardCreation: (min: string) => `card creation ${min} min/card`,
    granularity: (h: string) => `scheduled in ${h} h steps`,
    solverLimit: (s: string) => `solvers up to ${s} s`,
    labels: 'Labels:',
    appliesToAll: 'Applies to every epic, not only this one.',
    edit: 'Edit in Settings',
  },
  /** `MemberSelection`: who is available for the epic. */
  members: {
    title: 'Team available for this epic',
    hint: 'Untick anyone currently allocated to another project or epic.',
    all: 'All',
    none: 'None',
    hidden: (n: number) =>
      n === 1 ? '1 person who is inactive or has no role is not shown here.' : `${n} people who are inactive or have no role are not shown here.`,
    nobody: 'Nobody has a role yet. Assign roles to people in the Roles section.',
  },
  /** `CapacitySection`. */
  capacity: {
    uncoveredTitle: 'Role with nobody selected',
    uncovered: (role: string, subtasks: string) => `**${role}**: ${subtasks} have nobody to do them.`,
    byRole: 'By role',
    perWeek: (h: string) => `${h}h/week`,
    peopleInRole: (n: number) => plural(n, 'person in this role', 'people in this role'),
    floatingTitle: 'Floating capacity',
    floatingNote: (people: string, tip: string, real: string) =>
      `${people} cover more than one role, which is why they appear with ⇄ in each. ${tip} The real capacity (${real}h/week) counts each person once; the cards per role show the most each area would get if all of these people’s capacity went to it.`,
    byMember: 'By member',
    member: 'Member',
    roles: 'Roles',
    capacity: 'Capacity',
    week: (week: number) => `Week ${week}`,
    perWeekShort: (h: string) => `${h}/wk`,
    loadTooltip: (hours: string, capacity: string) => `${hours} of ${capacity}`,
    over: (pct: string) => `${pct} · over 100%`,
    noPlan: 'The load per week appears once there is a plan — see what blocks it in the Planning section.',
    footer: (stored: boolean) =>
      `Load calculated from the ${stored ? 'last generated plan' : 'greedy plan for the current selection'}. Theoretical allocation by heuristic or solver: a starting point for conversation, not the truth.`,
  },
  /** `EstimateSection`. */
  estimate: {
    planning: 'Planning',
    execution: 'Execution',
    includesReview: 'includes code review',
    overhead: 'Overhead',
    jira: 'Jira',
    jiraHint: (subtasks: number, each: string) => `${plural(subtasks, 'subtask', 'subtasks')} × ${each}; epic cost, outside the roles`,
    codeReview: 'Code review',
    reviewHint: 'subset of execution',
    shareAria: (role: string, pct: string) => `${role}: ${pct} of person-hours`,
    share: (pct: string) => `${pct} of person-hours`,
    noteTitle: 'How person-hours add up',
    noteBody:
      'Calculated from each subtask’s hours in Jira. When a subtask is composite (“A + B”, for example a joint integration), each role involved adds the **full** hour, not half: both people work at the same time. That is why the sum per role is larger than the epic’s hours. The Jira overhead is a cost of the epic as a whole and goes into no role.',
    reconciles: 'reconciliation balances',
    doesNotReconcile: 'reconciliation does not balance',
    reconciliation: (personHours: string, composite: string, net: string, planning: string, execution: string, total: string) =>
      `Σ person-hours ${personHours} − ${composite} in composite subtasks = ${net} = planning ${planning} + execution ${execution} (${total}h)`,
    reconciliationGap: ' — some subtasks have no role; see the data problems.',
  },
  /** `PipelineSection`. */
  pipeline: {
    openDetails: (title: string, hours: string) => `${title}, ${hours}. Open details`,
    noRole: 'no role',
    tasks: 'Tasks',
    subtasks: 'Subtasks',
    tasksAria: 'Dependency pipeline between tasks',
    subtasksAria: 'Dependency pipeline between subtasks',
    edge: 'blocking dependency',
    clickHint: 'Click a card to see the task’s full details.',
    notesTitle: 'Dependency notes',
  },
  /** `ScheduleSection` and the header both schedules share. */
  schedule: {
    planningWeeks: (weeks: string[], roles: string[]) => {
      const list = weeks.length > 1 ? `${weeks.slice(0, -1).join(', ')} and ${weeks.at(-1)}` : weeks[0];
      return `${weeks.length > 1 ? 'Weeks' : 'Week'} ${list}: planning${roles.length ? ` — worked by ${roles.join(', ')}` : ''}`;
    },
    hoursPerWeek: (perWeek: string, workday: string) => `**${perWeek}h working/week** (5 days × ${workday}h, Monday to Friday)`,
    totalDuration: (duration: string) => `**Total duration:** ${duration}`,
    noBaseline: 'There is no baseline schedule yet',
    baseline: 'Baseline schedule',
    reference: '1 person (reference)',
    byTask: 'By task',
    bySubtask: 'By subtask',
    byTaskCaption: 'Baseline schedule by task',
    bySubtaskCaption: 'Baseline schedule by subtask',
    note:
      'Both tabs use the same baseline schedule — one person per role — so the total duration is always the same. In **By task**, a task with subtasks from more than one role appears as a bar in each role’s row, and each bar holds only that role’s hours; composite subtasks (“A + B”) add the full hour to each bar. If there is a gap in time between a role’s subtasks in the same task, the bar is split into parts instead of stretching across the gap, so its length shows time worked. Click a bar to see the task and the subtasks of that interval.',
  },
  /** `PlanningSection`. */
  planning: {
    noSolutionTitle: 'No solution within the time limit',
    noSolutionBody: (seconds: string) =>
      `The algorithm did not find a plan in ${seconds} s. The previous plan was kept; raise the time limit in the parameters or use another algorithm.`,
    invalidTitle: 'The returned plan did not pass validation',
    invalidKept: 'It was discarded; the previous plan was kept.',
    algorithm: 'Algorithm',
    exact: (seconds: string) => `exact, up to ${seconds} s`,
    instant: 'answers instantly',
    generate: 'Generate plan',
    solving: (seconds: string) => `Solving… up to ${seconds} s.`,
    errorKept: 'The previous plan was kept; the greedy algorithm is still available.',
    generated: 'Generated plan',
    baseline: 'Baseline schedule',
    onePerRole: '1 person per role',
    gain: 'Gain',
    generatedAt: (date: string) => `Generated on ${date}.`,
    generatedAtSolved: (date: string, seconds: string) => `Generated on ${date}, solved in ${seconds} s.`,
    lessThanTenth: 'less than 0.1',
    greedyNow: 'Greedy plan calculated on the spot for the current selection. Use “Generate plan” to record it as the latest plan.',
    noPlanTitle: 'There is no plan for this team yet',
    ganttCaption: 'Generated plan by role and member',
    note:
      'Each subtask is allocated to an available specialist — taking into account who covers more than one role — always respecting the prerequisites. Composite subtasks (“A + B”) reserve two different people at the same time. A member with several roles appears in each group, but each subtask only appears in the row of the role it was allocated to. The time gained comes from running independent subtasks of the same role in parallel; chains that depend on each other stay sequential, however many people are available.',
    footer:
      'All algorithms run on the backend and every plan goes through the validator before it is shown. If the MILP or CP-SAT solver is unavailable, those options show the error and the greedy one keeps working. New strategies join the picker without changing this screen.',
  },
  /** `PlanReadiness`: what is missing before a schedule can be built. */
  readiness: {
    switched: 'Hours source changed',
    switchedTo: {
      estimativa_original: 'Hours now come from the original estimate.',
      campo_estimativa: 'Hours now come from the estimate field.',
    },
    switchFailed: 'Could not change it',
    title: 'What the schedule still needs',
    intro: 'The schedule needs hours and a role on every subtask, and people who cover those roles.',
    state: { ok: 'ready', warn: 'attention', missing: 'missing' },
    hoursStep: 'Subtask hours',
    use: {
      estimativa_original: 'Use the original estimate',
      campo_estimativa: 'Use the estimate field',
    },
    noSubtasks: 'The epic has no collected subtasks.',
    hoursFound: (found: number, total: number, inField: boolean) =>
      `${found} of ${plural(total, 'subtask', 'subtasks')} have hours in Jira’s ${inField ? 'estimate field' : 'original estimate'}.`,
    otherHas: (field: boolean, n: number) => ` The ${field ? 'estimate field' : 'original estimate'} has a value in ${n}.`,
    roleStep: 'Role of each subtask',
    assignRoles: 'Assign roles',
    allHaveRole: (label: number, assignee: number, task: number, manual: number) =>
      `All have a role: ${label} by label, ${assignee} by assignee, ${task} by task, ${manual} chosen here.`,
    missingRole: (n: number) =>
      `${plural(n, 'subtask has', 'subtasks have')} no role. Setting each person’s role (in People) resolves those with an assignee; the rest are chosen here.`,
    teamStep: 'Team with roles',
    registerRoles: 'Set up roles in People',
    nobodyRole: 'Nobody has a role yet. The people already came from Jira; what is missing is each one’s role.',
    teamOk: (withRole: number, selected: number) =>
      `${plural(withRole, 'person', 'people')} with a role; ${selected} selected for this epic.`,
    cyclesStep: 'Dependencies without cycles',
  },
  /** `SubtaskRolesPanel`. */
  subtaskRoles: {
    origin: {
      manual: { label: 'chosen here', tip: 'Someone chose the role on this screen. It wins over labels and the assignee.' },
      rotulo: { label: 'Jira label', tip: 'A label or component of the subtask matches a role.' },
      responsavel: { label: 'assignee', tip: 'The role of the subtask’s assignee, set on their page in People.' },
      tarefa: { label: 'task', tip: 'Inherited from the task, which matches a single role.' },
    },
    saveFailed: (key: string) => `Role of ${key} not saved`,
    filterMissing: (n: number) => `No role · ${n}`,
    filterAll: (n: number) => `All · ${n}`,
    hint: 'One role, or two for a composite subtask (“A + B”). It is kept in Cadência; Jira does not change.',
    allHaveRole: 'Every subtask has a role.',
    columns: { subtask: 'Subtask', assignee: 'Assignee', hours: 'Hours', role: 'Role', origin: 'Origin' },
    roleAria: (key: string) => `Role of ${key}`,
    choose: 'Choose role',
    noRole: 'no role',
    revertTip: 'Return to the automatic role (label, assignee or task)',
    revertAria: (key: string) => `Return ${key} to the automatic role`,
  },
  /** `TaskCards` and `TaskModal`. */
  taskCards: {
    originWord: {
      manual: 'manual choice',
      rotulo: 'Jira label',
      responsavel: 'assignee',
      tarefa: 'task',
    },
    kind: {
      execucao: 'execution',
      code_review: 'code review',
      cadastro_jira: 'Jira card creation',
    },
    composite: 'composite',
    assignee: (name: string) => `assignee: ${name}`,
    roleBy: (origin: string) => `role by ${origin}`,
    noRole: 'no role',
    prerequisites: 'Prerequisites:',
    none: 'none',
    openInJira: (key: string) => `Open ${key} in Jira`,
    hoursWithReview: 'execution + code review',
    taskHours: 'task hours',
    planningPhase: 'planning',
    dependsOn: 'Depends on:',
    nothing: 'nothing — start of the pipeline',
    business: 'Business',
    technical: 'Technical',
    subtasks: 'Subtasks',
    clickHint: '(click for details)',
    noSubtasks: 'No subtasks in Jira.',
    modalTitle: (key: string) => `${key} · task details`,
  },
  /** `WeeklyGantt`. */
  gantt: {
    scaleAria: 'Schedule scale',
    fit: 'Fit',
    days: 'Days',
    hours: 'Hours',
    week: (week: number) => `Week ${week}`,
    weekPlanning: (week: number) => `Week ${week} · planning`,
    weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    groupsAria: 'Show or hide groups',
    groupChip: (label: string, n: number) => `${label} · ${n}`,
    summary: (items: number, days: number) => `${plural(items, 'bar', 'bars')} · ${plural(days, 'workday', 'workdays')} of plan`,
    search: 'Search the schedule',
    searchPlaceholder: 'Key, title or person',
    clearFilters: 'Clear filters',
    expand: 'Expand',
    collapse: 'Collapse',
    noneFiltered: 'Nothing in the schedule matches these filters.',
    cursor: (week: string, day: string, hour: number, n: number) => `${week} · ${day}, hour ${hour} · ${n} running`,
    help: 'Click a bar to open its task; the arrow keys move between bars (left and right along a row, up and down to the nearest bar of the next row). Hover over the chart to read the week, day and hour and how many bars run then. The chips show or hide a group; the axis is working time only, with no calendar dates.',
  },
  /** `PlanParametersSettings` (Settings → epic plan). */
  settings: {
    intro: 'They apply to the planning of every epic — this is not a setting per board or per epic.',
    numericTitle: 'Workday, overheads and limits',
    numeric: {
      jornada_h: {
        label: 'Planning workday',
        description:
          'Net hours per day already without meetings, for the epic schedule. Different from “Hours per day” in the board profile, which is gross and goes through the focus factor: that one is a number per board, this one is single for every epic. × 5 days = weekly capacity per person.',
        suffix: ' h/day',
      },
      overhead_jira_h: { label: 'Jira overhead', description: 'Per execution subtask of a task with code: reading the card and testing.', suffix: ' h' },
      code_review_h: { label: 'Code review', description: 'Per execution subtask; checks the hours of the code review subtask.', suffix: ' h' },
      cadastro_card_min: { label: 'Card creation', description: 'Per card; checks the hours of the Jira card creation subtask.', suffix: ' min' },
      granularidade_h: { label: 'Schedule granularity', description: 'Smallest unit of time of the schedule and the algorithms.', suffix: ' h' },
      limite_solver_s: { label: 'Solver time limit', description: 'MILP and CP-SAT.', suffix: ' s' },
    },
    labels: {
      rotulo_code_review: { label: 'Code review label', description: 'Marks the subtask as code review.' },
      rotulo_cadastro_jira: { label: 'Jira card creation label', description: 'Marks the subtask as creating the cards.' },
      rotulo_planejamento: { label: 'Planning phase label', description: 'On the task: it belongs to planning.' },
      rotulo_sem_codigo: { label: 'No-code task label', description: 'On the task: no Jira overhead and no code review.' },
    },
    jiraTitle: 'How Jira becomes a plan',
    source: 'Hours source',
    sourceDescription:
      'Where each subtask’s hours come from in Jira. Some teams fill in the original estimate; others use the estimate field (the same one as story points) with hours.',
    sourceOriginal: 'Original estimate (time tracking)',
    sourceField: 'Estimate field (story points)',
    explanation:
      'Tasks are the epic’s children; subtasks, their children. A subtask’s role is, in this order: the one chosen in the epic’s own “Subtask roles”; the one from the labels or components set on each role (People → Roles and team); the assignee’s, when they have a single role on the team; the task’s, when it has a single one. Two roles make a composite subtask. “Is blocked by” links are the prerequisites. Business, technical and dependency notes are sections of the task description, found by the headings “Negócio”, “Técnico” and “Dependências”.',
    save: 'Save parameters',
    discard: 'Discard',
    saved: 'Parameters saved',
    savedMessage: 'Every epic now uses the new numbers.',
    rejected: 'Parameters rejected',
  },
};
