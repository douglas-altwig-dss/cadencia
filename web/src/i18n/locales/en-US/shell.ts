// Namespace `shell`, owned by the App shell: navigation, header, command palette, shortcuts, and
// the shared components in `components/*.tsx` and `lib/`.
// en-US is the source of truth: this object's type is the shape pt-BR and de-DE must match.
// Plain strings, or functions for anything with parameters or plurals (never concatenate fragments).
// Do not add `as const`: values must widen to `string` so the other languages can differ.

import type { ReactNode } from 'react';

import { plural } from '../../plural';

// Fragments shared by several indicator explanations below (`help`), written once per language.
const HOURS =
  'Each item’s estimate (points × the board’s hours per point; an unestimated item counts as the board’s default) summed over the open items. Only stories, tasks and bugs count: subtasks travel with their story.';

const CAPACITY =
  'Remaining capacity is: working days from today to the end of the sprint (or of the week, when there is no active sprint or it is past its end date) × hours per day × focus factor × allocation, minus absences. Each person’s hours per day and allocation are set on the Capacity tab.';

const LOAD_STATES = 'Over 110% is “over capacity”; under 80%, “with slack” (the board’s limits; these are the defaults).';

const BLOCK =
  'A block is an open item — subtasks included — flagged as an impediment in Jira, in a blocking status, or waiting on another open item through an “is blocked by” link.\n\nSeverity comes from how long it has been stuck: under 2 days is low, up to 5 is medium, more than that is high. An item that is both blocked and overdue counts here even if another rule shows it as overdue.';

const PERCENTILE =
  'P50/P85/P95 are nearest-rank percentiles: “85% of the items finished within N days”, always a value that really happened, not an average. n is the sample size; under 5 it is only a hint.';

export const shell = {
  /** The header's display preferences menu (`HeaderTools.PreferencesMenu`). */
  preferences: {
    title: 'Display preferences',
    language: 'Language',
    theme: 'Theme',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeSystem: 'System',
    density: 'Table density',
    densityComfortable: 'Comfortable',
    densityCompact: 'Compact',
    chartPatterns: 'Patterns in charts',
    chartPatternsHint: 'hatching as well as color, to tell series apart without relying on it',
    reduceMotion: 'Reduce motion',
    reduceMotionHint: 'the operating system setting is respected too',
    shortcuts: 'Keyboard shortcuts',
  },

  /** `lib/format.ts`: units that follow the language. */
  format: {
    /** The short day unit after a number ("3.5 d"). */
    dayUnit: 'd',
    days: (value: string) => `${value} d`,
    /** A calendar day without the year, from its two-digit parts (chart axes). */
    dayMonth: (day: string, month: string) => `${month}/${day}`,
  },

  /** `App.tsx`: the shell around every screen. */
  app: {
    skipToContent: 'Skip to content',
    openNavigation: 'Open navigation',
    expandMenu: 'Expand the menu',
    collapseMenu: 'Collapse the menu',
    expandSidebar: 'Expand the side menu',
    collapseSidebar: 'Collapse the side menu',
    brandHome: 'Cadência, go to home',
    mainNavigation: 'Main navigation',
    savedViews: 'Saved views',
    pressForShortcuts: (key: ReactNode): ReactNode[] => ['Press ', key, ' to see the shortcuts.'],
    notFoundTitle: 'Page not found',
    notFoundBody: 'Use the navigation on the side.',
    collectionDoneTitle: 'Collection finished',
    collectionDoneMessage: 'The dashboards were recalculated with the new data.',
    collectionDoneAnnounce: 'Collection finished. The dashboards were recalculated.',
  },

  /** `App.CollectionPill`: how fresh the data is, in the header. */
  pill: {
    collecting: 'Collecting…',
    collected: (when: string) => `Collected ${when}`,
    neverCollected: 'Never collected',
    openStatus: (label: string) => `${label}. See collection status`,
    tipCollecting: 'A collection is running.',
    tipOldest: (when: string) => `Oldest collection across boards: ${when}`,
    tipOldestFailed: (when: string) => `Oldest collection across boards: ${when}. A board failed in the last collection.`,
    tipNever: 'No board has been collected yet.',
  },

  /** `lib/navigation.ts`: the side menu and the palette's pages. */
  nav: {
    follow: 'Follow',
    deliver: 'Deliver',
    system: 'System',
    home: 'Home',
    spaces: 'Spaces',
    boards: 'Boards',
    people: 'People',
    focusTimeline: 'Focus timeline',
    presentation: 'Presentation',
    collectionStatus: 'Collection status',
    settings: 'Settings',
    myWeek: 'My week',
    dataHygiene: 'Data hygiene',
    notifications: 'Notifications',
    gettingStarted: 'Getting started',
    generations: 'Generations',
    variables: 'Deck variables',
  },

  /** `api/client.ts` and the hooks: failures the client words itself. */
  api: {
    requestFailed: 'request failed',
    unreachable: 'API unreachable',
    unreachableAction: 'Check that the API service is up (cadencia serve or make up).',
    invalidRequest: 'invalid request',
    homeNotSaved: 'Home not saved',
  },

  /** `components/common.tsx`: the pieces every screen shares. */
  common: {
    breadcrumbs: 'Breadcrumbs',
    collectedAt: (when: string) => `Data collected ${when}`,
    freshness: 'Data freshness',
    lastFailedTitle: 'This board’s last collection failed',
    lastFailedBody: (error: string) => `${error} — the numbers below are from the last successful collection.`,
    openStatus: 'Open Collection status',
    staleTitle: 'Data possibly out of date',
    staleBody: (when: string) => `The last successful collection was ${when}.`,
    loadFailed: 'Could not load',
    whatToDo: (action: string) => `What to do: ${action}`,
    loading: 'Loading',
    openInJira: (key: string) => `Open ${key} in Jira`,
    none: 'none',
    epic: 'epic',
    itemsDone: (pct: string) => `Items done: ${pct}`,
    sprintElapsed: (label: string, pct: number) => `${label}. Sprint time elapsed: ${pct}%`,
    itemsCount: (done: number, total: number) => `${done}/${total} items`,
    estimateDone: (pct: string) => `Estimate done: ${pct}`,
    points: (done: string, total: string) => `${done}/${total} pts`,
    coverage: (pct: string) => `coverage ${pct}`,
    coverageAbout: 'Coverage',
    noSample: 'no sample',
    lowConfidence: 'low confidence',
    sampleConfidence: 'Sample confidence',
    howCalculated: (about: string) => `How it is calculated: ${about}`,
    moreInfo: 'More information',
    cancel: 'Cancel',
    undo: 'Undo',
    export: 'Export',
    csv: 'CSV (Excel)',
  },

  /** `components/risk.tsx`: the six situations and their evidence. */
  risk: {
    /** The badge's name for each situation. */
    label: {
      arrastado: 'Carried over',
      atrasado: 'Overdue',
      bloqueado: 'Blocked',
      estagnado: 'Stalled',
      envelhecendo: 'Aging',
      em_dia: 'On track',
    },
    /** After a count, in running text: "2 blocked". */
    counted: {
      arrastado: 'carried over',
      atrasado: 'overdue',
      bloqueado: 'blocked',
      estagnado: 'stalled',
      envelhecendo: 'aging',
      em_dia: 'on track',
    },
    /** The short form for a table cell where space is what runs out. */
    short: {
      arrastado: 'carried',
      atrasado: 'overdue',
      bloqueado: 'blocked',
      estagnado: 'stalled',
      envelhecendo: 'aging',
      em_dia: 'on track',
    },
    noneAtRisk: 'no items at risk',
    noRuleFired: 'No risk rule fired for this item.',
    ruleApplied: (rule: string) => `Rule applied: ${rule}`,
    lastTransition: (from: string, to: string, at: string, author: string | null) =>
      `Last transition: ${from} → ${to} on ${at}${author ? ` by ${author}` : ''}`,
  },

  /** `components/TreeTable.tsx`. */
  tree: {
    item: 'Item',
    type: 'Type',
    status: 'Status',
    assignee: 'Assignee',
    situation: 'Situation',
    doneRemaining: 'Done / remaining',
    estimateRollup: 'Rolled-up estimate',
    collapse: (label: string) => `Collapse ${label}`,
    expand: (label: string) => `Expand ${label}`,
  },

  /** `components/ItemDescription.tsx`. */
  description: {
    title: 'Description',
    showLess: 'Show less',
    showAll: 'Show all',
    empty: 'No description in Jira.',
  },

  /** `components/OpenInJira.tsx`. */
  openInJira: {
    label: 'Open in Jira',
    tooltip: (n: number) => `Jira search with ${plural(n, 'item', 'items')}: key in (…)`,
  },

  /** `components/ShortcutsHelp.tsx` and `lib/shortcuts.ts`. */
  shortcuts: {
    title: 'Keyboard shortcuts',
    macNote: 'On a Mac, Ctrl is ⌘.',
    scrollKey: 'scroll',
    groups: {
      global: 'On any screen',
      focusTimeline: 'Focus timeline',
      editor: 'Presentation editor',
      present: 'Presentation mode',
    },
    search: 'Search and go anywhere',
    showShortcuts: 'Show these shortcuts',
    closeWindows: 'Close windows and menus',
    searchActivity: 'Search an activity or a switch',
    undo: 'Undo',
    redo: 'Redo (also Ctrl+Y)',
    saveNow: 'Save now (edits and mapping)',
    generate: 'Generate presentation',
    selectAll: 'Select all shapes',
    copy: 'Copy',
    paste: 'Paste',
    duplicate: 'Duplicate',
    group: 'Group',
    ungroup: 'Ungroup',
    copyFormat: 'Copy formatting',
    pasteFormat: 'Paste formatting onto the selection',
    lock: 'Lock or unlock the selection',
    findReplace: 'Find and replace',
    typeInShape: 'Type in the selected shape (also F2)',
    deleteSelection: 'Delete the selection',
    nudge: 'Move 1 mm (with Shift, 5 mm)',
    nextShape: 'Select the next shape',
    zoom: 'Zoom in and out',
    editorFullscreen: 'Editor full screen',
    nextSlide: 'Next slide (also space and Page Down)',
    previousSlide: 'Previous slide',
    allSlides: 'All slides',
    notes: 'Speaker notes',
    audience: 'Open the audience screen (two screens)',
    timer: 'Pause or resume the timer',
    pen: 'Pen: draw on the slide',
    laser: 'Laser: point at the slide',
    clearInk: 'Erase the marks on the slide',
    evidence: 'Items cited on the slide (evidence)',
    questions: 'Questions from the audience',
    fullscreen: 'Full screen',
    dropTool: 'Drop the pen or the laser; again, exit',
  },

  /** `components/CommandPalette.tsx`. */
  palette: {
    kinds: {
      acao: 'action',
      pagina: 'page',
      visao: 'saved view',
      board: 'board',
      sprint: 'sprint',
      item: 'item',
      epico: 'epic',
      iniciativa: 'initiative',
      pessoa: 'person',
      modelo: 'template',
      comando: 'on this screen',
    } as Record<string, string>,
    collectNow: 'Collect now',
    collectNowDetail: 'incremental collection of every board',
    collectionStarted: 'Collection started',
    collectionStartedMessage: 'Follow it in Collection status.',
    collectionNotStarted: 'Collection not started',
    showShortcuts: 'Show keyboard shortcuts',
    placeholder: 'Search a board, sprint, item (CAD-14), person, template or action…',
    search: 'Search',
    results: 'Results',
    searching: 'Searching…',
    nothingFound: 'Nothing found.',
    choose: 'choose',
    open: 'open',
  },

  /** `components/HeaderTools.tsx`: search and saved views. */
  header: {
    searchShortcut: 'Search (Ctrl+K)',
    searchPlaceholder: 'Search boards, sprints and items…',
    searchShort: 'Search boards, sprints and items',
    viewSaved: 'View saved',
    viewSavedPinned: 'It shows in the side menu.',
    viewSavedSearch: 'It shows in search (Ctrl+K).',
    deleteViewTitle: (name: string) => `Delete the view ${name}?`,
    deleteViewBody: 'It leaves the menu and search (Ctrl+K).',
    deleteViewConfirm: 'Delete view',
    viewDeleted: (name: string) => `View ${name} deleted`,
    savedViews: 'Saved views',
    saveThisView: 'Save this view…',
    saveThisViewTitle: 'Save this view',
    saveThisViewBody: 'Keeps the current screen with the chosen filters:',
    name: 'Name',
    namePlaceholder: 'e.g. Platform team risks',
    pinToSidebar: 'Pin to the side menu',
    save: 'Save',
    noViews: 'No saved views. Use “Save this view” to keep the current screen with its filters.',
    unpin: 'Unpin from the menu',
    pin: 'Pin to the menu',
    pinNamed: (name: string) => `Pin ${name} to the menu`,
    deleteNamed: (name: string) => `Delete the view ${name}`,
  },

  /** `components/CollectionProgress.tsx`. */
  progress: {
    phases: {
      configuracao: 'reading the board configuration',
      itens: 'fetching the items',
      historico: 'reading the item histories',
      gravando: 'saving and freezing checkpoints',
    } as Record<string, string>,
    starting: 'starting',
    underAMinute: 'under 1 min',
    minutes: (n: number) => `~${n} min`,
    full: 'full reconciliation',
    incremental: 'incremental collection',
    region: 'Collection in progress',
    collecting: 'collecting',
    started: (mode: string, when: string) => `${mode} · started ${when}`,
    cancelling: 'cancelling at the next step…',
    cancel: 'Cancel',
    done: 'done',
    cancelled: 'cancelled',
    failed: 'failed',
    boardProgress: (name: string) => `Progress of ${name}`,
  },

  /** `components/ChangesPanel.tsx`: what changed since a checkpoint. */
  changes: {
    sections: {
      new_risks: { title: 'New risks', hint: 'ended up in a worse situation than before' },
      resolved: { title: 'Resolved risks', hint: 'improved or were completed' },
      completed: { title: 'Completed', hint: 'entered a done category' },
      entered: { title: 'Entered', hint: 'were not in scope at the start' },
      left: { title: 'Left', hint: 'were in scope and no longer are' },
      moved: { title: 'Changed status', hint: '' },
      reassigned: { title: 'Changed assignee', hint: '' },
      reopened: { title: 'Reopened', hint: 'were done and came back' },
    },
    same: 'same',
    before: (delta: string, before: number) => `${delta} · before ${before}`,
    open: 'Open',
    done: 'Done',
    atRisk: 'At risk',
    openPoints: 'Open points',
    nobody: 'nobody',
    noCheckpointTitle: 'No frozen checkpoint yet',
    seeStatus: 'See collection status',
    noCheckpointBody:
      'The first checkpoint is saved at the board’s weekly time, after a collection. From then on this tab compares the week.',
    since: 'Since checkpoint',
    until: 'Until',
    now: 'now',
    sameWay: 'Both sides are read the same way checkpoints are frozen.',
    nothingChanged: (from: string | null, to: string | null) =>
      `Nothing changed between ${from ?? 'the start'} and ${to ?? 'now'}.`,
  },

  /** `components/ForecastCard.tsx`. */
  forecast: {
    afterAYear: 'after 1 year',
    businessDays: (n: number) => plural(n, 'business day', 'business days'),
    unavailable: 'Forecast unavailable',
    title: 'Delivery forecast',
    lowConfidence: 'low confidence',
    confidence: 'Forecast confidence',
    remainingInJira: 'Remaining in Jira',
    nothingLeft: {
      sprint: 'Nothing remaining: the sprint is done.',
      board: 'Nothing remaining: the board is done.',
      epic: 'Nothing remaining: the epic is done.',
    },
    chance: (count: ReactNode, end: string | null): ReactNode[] => [
      'Chance of finishing the ',
      count,
      ` remaining items by the end of the sprint${end ? ` (${end})` : ''}`,
    ],
    chanceAbout: 'chance of finishing on time',
    chanceLabel: (pct: string) => `Chance of finishing on time: ${pct}`,
    untilEnd: (n: number) => `${plural(n, 'business day', 'business days')} until the end.`,
    p50: '50% chance by',
    p85: '85% chance by',
    p95: '95% chance by',
    sample: (delivered: number, days: number) =>
      `Sample: ${plural(delivered, 'item done', 'items done')} in ${plural(days, 'business day', 'business days')}.`,
  },

  /** `components/FlowCharts.tsx`. */
  flowCharts: {
    noData: 'No data in the period',
    seeStatus: 'See collection status',
    noDataBody: 'Widen the period in the filters or check that this board’s last collection finished.',
    cfdLabel: (from: string, to: string, columns: string) => `Cumulative flow from ${from} to ${to} by column: ${columns}`,
    noneDone: 'No items done in the period',
    noneDoneBody: 'Widen the period in the filters: the chart needs items that have finished to show the cycle time.',
    scatterLabel: (n: number, p50: string, p85: string, p95: string) =>
      `Cycle time of ${plural(n, 'done item', 'done items')}; P50 ${p50} days, P85 ${p85}, P95 ${p95}`,
    scatterTip: (days: string, date: string) => `${days} days · done on ${date}`,
    days: 'days',
    noneInProgress: 'No items in progress',
    noneInProgressBody:
      'Nothing in this board’s in-progress columns right now. If that does not match Jira, check the columns in Settings → Board profile.',
    agingLabel: (n: number, p85: string) => `${plural(n, 'item', 'items')} in progress by column; historical P85 limit ${p85} days`,
    agingTip: (days: string) => `${days} days in progress`,
    noSprints: 'No sprints to compare',
    noSprintsBody: 'The comparison appears after the first sprint closed with a recorded commitment.',
    cvdLabel: (rows: string) => `Committed versus delivered: ${rows}`,
    cvdRow: (sprint: string, delivered: number, committed: number, added: number) =>
      `${sprint} ${delivered} of ${committed}, ${added} added`,
    committed: 'Committed at the start',
    delivered: 'Delivered from the commitment',
    added: 'Added scope',
    cfdTitle: 'Cumulative flow',
    cfdCaption: 'Items per column, day by day: bands that widen show a build-up.',
    cycleTitle: 'Cycle time',
    cycleCaption: 'Each dot is a done item; dashed lines are the 50th, 85th and 95th percentiles.',
    agingTitle: 'Aging of work in progress',
    agingCaption: 'Age of each open item by column; diamonds are past the type’s historical P85.',
    cvdTitle: 'Committed × delivered',
    cvdCaption: 'Scope that entered after the start is shown apart, so a commitment is not confused with new demand.',
  },

  /** `components/HealthPanel.tsx`: Jira hygiene. */
  health: {
    severity: { erro: 'error', aviso: 'warning', info: 'information' },
    andMore: (n: number) => ` and ${n} more`,
    fixHere: 'Fix it here',
    fixInJira: 'Fix in Jira',
    okTitle: 'Nothing that skews the numbers',
    okBody: 'The followed boards have no data hygiene errors or warnings.',
    problems: (n: number) => plural(n, 'point of attention', 'points of attention'),
    problemsBody: 'None of these stops collection, but each makes some indicator less reliable.',
    ok: 'ok',
    points: (n: number) => plural(n, 'point', 'points'),
    nothing: 'Nothing to point out.',
  },

  /** `components/NotificationsSettings.tsx`. */
  notifications: {
    kinds: { slack: 'Slack (webhook)', teams: 'Teams (webhook)', webhook: 'JSON webhook', email: 'E-mail' },
    linksTitle: 'Links in messages',
    linksBody: (variable: ReactNode): ReactNode[] => [
      'Set ',
      variable,
      ' (the address where people open Cadência) so messages carry a direct link to the presentation or the dashboard.',
    ],
    channels: 'Channels',
    addChannel: 'Add channel',
    noChannels: 'No channels. A Slack or Teams incoming webhook is the simplest way to start.',
    name: 'Name',
    type: 'Type',
    target: 'Target',
    events: 'Notify about',
    enabled: 'Active',
    lastSent: 'Last sent',
    namePlaceholder: 'e.g. #product-team',
    channelName: 'Channel name',
    channelType: 'Channel type',
    emailPlaceholder: 'ana@company.com, bia@company.com',
    smtpMissing: 'SMTP not configured (CADENCIA_SMTP_HOST)',
    channelEnabled: 'Channel active',
    delivered: 'delivered',
    failed: 'failed',
    sendTest: 'Send a test message',
    saveFirst: 'Save before testing',
    testChannel: 'Test channel',
    testSent: 'Test message sent',
    testFailed: 'The test failed',
    checkChannel: 'Check the channel.',
    removeChannel: 'Remove channel',
    notSaved: 'Channels not saved',
    saved: 'Channels saved',
    saveChannels: 'Save channels',
    digestTitle: 'Risk digest',
    digestBody:
      'One message per space with what became stalled, blocked or overdue since the last checkpoint. A space with nothing new gets no message.',
    autoSend: 'Send the digest automatically',
    days: 'Days',
    hour: 'Hour',
    timezone: 'Time zone',
    scheduleSaved: 'Schedule saved',
    scheduleSavedMessage: 'The collection service applies it within 5 minutes.',
    saveSchedule: 'Save schedule',
    todayPreview: 'Today’s preview',
    newRisks: (space: string, n: number) => `${space}: ${plural(n, 'new risk', 'new risks')}`,
    digestSent: 'Digest sent',
    nothingNew: 'Nothing new to send',
    nothingNewMessage: 'No space has a new risk since the last checkpoint.',
    sendNow: 'Send now',
    goesTo: (event: string) => `goes to the channels marked “${event}”`,
  },

  /** `components/RiskTable.tsx`. */
  riskTable: {
    noteTitle: 'Lateness is a signal to look into, not a verdict',
    noteBody:
      'Each mark describes a fact from the Jira history and shows the rule that produced it. Click “evidence” to see the last transition, its date and its author.',
    situation: 'Situation',
    board: 'Board',
    person: 'Person',
    all: 'All',
    type: 'Type',
    allTypes: 'All',
    emptyTitle: 'No items with these filters',
    clearFilters: 'Clear the filters',
    emptyBody: 'The situation, person and type filters live in the page address; clear them to see everything.',
    item: 'Item',
    column: 'Column',
    assignee: 'Assignee',
    whatHappened: 'What happened',
    due: 'Due',
    unassigned: 'Unassigned',
    otherRules: (n: number) => `+${plural(n, 'other rule', 'other rules')}`,
    evidence: 'evidence',
  },

  /** `components/ScheduleEditor.tsx`: a template's own generation time. */
  schedule: {
    ownTime: 'Generate at its own time',
    hour: 'Hour',
    minute: 'Minute',
    timezone: 'Time zone',
    dataNow: 'Current data',
    lastCheckpoint: 'Last checkpoint',
    audience: 'Audience',
    allSlides: 'all slides',
    appliesSoon: 'The collection service picks up the time within 5 minutes after the mapping is saved.',
    notify: 'Notify the channels when it generates on its own',
    notifyHint: 'goes to the notification channels that ask for “presentation generated” (Settings → Notifications)',
    emailSend: 'In the e-mail, send',
    linkOnly: 'Link only',
    attachPptx: '.pptx attachment',
    attachPdf: 'PDF attachment',
    attachNote:
      'Slack and Teams always get the link. Files over 20 MB, or a presentation that failed validation, go as a link only.',
  },

  /** `components/StatusPalette.tsx`: the deck's status colors. */
  statusPalette: {
    names: { concluido: 'Done', em_dia: 'On track', risco: 'At risk', atrasado: 'Overdue' } as Record<string, string>,
    color: (name: string) => `Color: ${name}`,
    label: (name: string) => `Label: ${name}`,
    lowContrast: (ratio: string) =>
      `Low contrast: the most legible text on this color reaches ${ratio}:1 (the recommended minimum is 4.5:1).`,
    inherited: 'inherited from the shared configuration',
  },

  /** `components/WeeklyWindows.tsx`. */
  windows: {
    state: { futura: 'upcoming', fechada: 'closed at the checkpoint', aberta: 'in progress' },
    diff: {
      sprint: {
        completed: 'Delivered in the window',
        added: 'Entered after the start',
        removed: 'Left the sprint',
        unmoved: 'No movement at all',
      },
      board: {
        completed: 'Delivered in the window',
        added: 'Entered the queue',
        removed: 'Left the queue',
        unmoved: 'No movement at all',
      },
    },
    title: 'Weekly windows',
    week: (n: number) => `Week ${n}`,
    partial: 'partial',
    range: (start: string, end: string, days: number) => `${start} → ${end} · ${plural(days, 'business day', 'business days')}`,
    notStarted: 'Not started yet.',
  },

  /** `lib/mosaic.ts`: the Home tiles, their groups and sizes. */
  mosaic: {
    sizes: {
      P: { label: 'S', hint: 'Small: a quarter of the width' },
      M: { label: 'M', hint: 'Medium: half the width' },
      G: { label: 'L', hint: 'Large: the full width' },
    },
    groups: {
      indicadores: 'Board indicators',
      pessoas: 'People',
      acontecendo: 'What is happening',
      boards: 'Boards and sprints',
      sistema: 'System',
    },
    tiles: {
      'kpi:risk': { label: 'Items at risk', description: 'How many items are at risk right now, across every board.' },
      'kpi:throughput': { label: 'Window throughput', description: 'Items done in the current window, against the previous one.' },
      'kpi:progress': { label: 'Average progress', description: 'Items done ÷ sprint items, averaged across boards (unweighted).' },
      'kpi:adherence': { label: 'Commitment adherence', description: 'How much of what was committed was delivered, sprint by sprint.' },
      'sprint:scope': { label: 'Added scope', description: 'Items that entered the sprints after they started.' },
      'team:load': { label: 'Team load', description: 'Open hours against the capacity left in the sprint.' },
      'team:overloaded': { label: 'People over capacity', description: 'Who has more open hours than capacity, to talk early.' },
      'team:blocks': { label: 'Active blocks', description: 'How many blocks there are, how severe and for how long.' },
      'team:delivered': { label: 'Sprint deliveries', description: 'What the team has delivered so far, against the commitment.' },
      'pulse:recent': { label: 'Recent deliveries', description: 'Deliveries per day over the last 7 days, against the 7 before.' },
      'pulse:feed': { label: 'Happening now', description: 'What was delivered, blocked or entered the sprint in the last 48 hours.' },
      'pulse:due': { label: 'Due in 7 days', description: 'Items due next week and the ones already overdue.' },
      spaces: { label: 'Spaces', description: 'One row per team: tracked boards, items at risk, deliveries this week and sprint progress.' },
      boards: { label: 'Boards table', description: 'One row per board: progress, risk, throughput, trend and collection.' },
      'saude:pontos': {
        label: 'Data hygiene',
        description: 'Hygiene points of attention on the followed boards: unestimated items, little done history and the like.',
      },
    } as Record<string, { label: string; description: string }>,
  },

  /**
   * `lib/indicatorHelp.ts`: how each indicator is calculated, in the words the "i" beside it shows.
   * Each states the rule the code follows — what counts, over what, and the thresholds. A blank line
   * starts a new paragraph.
   */
  help: {
    // ---- Home tiles (keyed `tile:<type>`, one per entry of the catalogue)
    'tile:kpi:risk':
      'Items not yet done that fire at least one risk rule — carried over from an earlier sprint, past due, blocked, stalled between checkpoints or aging (in progress beyond the type’s historical P85) —, summed across boards. Each item counts once, in its most severe situation. With no active sprint, it covers every open item on the board.',
    'tile:kpi:throughput':
      'Items done — stories, tasks and bugs, no subtasks — in the sprint’s current weekly window, summed across boards. “Done” is the status category, not its name. The arrow compares with the previous window; the line beside it is another measure: what was delivered in each recent sprint.',
    'tile:kpi:progress':
      'Simple average, across boards with a sprint, of items done ÷ sprint items (stories, tasks and bugs). It is not weighted by board size or by estimate.',
    'tile:kpi:adherence':
      'Of what was committed at the start of the sprint, how much was delivered: delivered ÷ committed, summing the boards sprint by sprint. Closed sprints only; what entered after the start is left out. The change is in percentage points against the previous sprint.',
    'tile:sprint:scope':
      'Items (stories, tasks and bugs) that entered the sprint after it started and are still in it, summed across boards with a running sprint. Those already done count too.',
    'tile:team:load': `Sum of open hours ÷ sum of the capacity left, for the people who have capacity in the period.\n\n${HOURS}\n\n${CAPACITY}\n\n${LOAD_STATES}`,
    'tile:team:overloaded':
      'People whose load is over 110% of the capacity left (the 10% tolerance is the board’s). It is a signal to talk early, not an evaluation: it depends on estimates existing and on each person’s availability being recorded.',
    'tile:team:blocks': BLOCK,
    'tile:team:delivered':
      'Delivered ÷ committed in the sprint, summing the people: items committed at the start that were done (the delivery belongs to whoever held the item at the start), plus those that entered later and are already done. On a board without a sprint, it counts what was done this week.',
    'tile:pulse:recent':
      'Items (stories, tasks and bugs) done in the last 7 days, summed across boards; each bar is a day. The comparison is with the 7 days before.',
    'tile:pulse:feed':
      'What happened in the last 48 hours: an item done, an item that entered a blocking status or was flagged as an impediment, and an item that entered a sprint after its first day. Most recent first, up to 30.',
    'tile:pulse:due':
      'Open items (stories, tasks and bugs) with a due date in the next 7 days. The smaller number is the open items whose due date has already passed.',
    'tile:spaces':
      'One row per space (team), over its tracked boards. At risk: open items in any risk situation, each once, in its most severe one. Delivered: stories, tasks and bugs done in the current weekly window, against the window before. Sprint progress: done ÷ items over the running sprints of the space’s boards, summing items rather than averaging boards; a board with no sprint running does not count.',
    'tile:boards': 'One row per followed board. Hover over or focus the column headers to see how each one is calculated.',
    'tile:saude:pontos':
      'Data hygiene points of attention on the followed boards — unestimated items, little done history and the like. None stops collection, but each makes some indicator less reliable. The detail, per board, is under Collection status → Data hygiene.',

    // ---- the boards table's columns
    'col:space': 'The Jira space the board belongs to: the team.',
    'col:sprint': 'The active (or most recent) sprint and the weekly window it is in, among the sprint’s windows.',
    'col:progress':
      'Done ÷ sprint items (stories, tasks and bugs), by count and by sum of estimates. The vertical mark on the items bar is how much of the sprint has passed: the bar behind it by more than 20 percentage points is “behind time”. Coverage is the share of items that have an estimate: with little of it, the estimate bar misleads.',
    'col:risk': 'Open items by situation, each in its most severe one: carried over, overdue, blocked, stalled or aging. Only the situations that exist are shown.',
    'col:throughput': 'Items done in the current weekly window and, beside it, in the previous window.',
    'col:trend': 'Per sprint: the filled bar is what was delivered; the outline is what was committed at the start of the sprint.',
    'col:data': 'When this board was last collected successfully. A warning shows if the last collection failed or was more than 26 hours ago.',

    // ---- a person's card and summary
    'person:load': `Open hours ÷ capacity left.\n\n${HOURS}\n\n${CAPACITY}\n\n${LOAD_STATES} If no item has an estimate, the number is only a guess and “no estimate” is shown.`,
    'person:timeline':
      'The items the person held — when done, or now — that were in progress at some point of the last 8 weeks, subtasks included, under their epics (and one group per board when there are several). Done, in progress, blocked and not started are each item’s state today; blocked means a block rule fired (flag, blocking status or an open “is blocked by” link). An item can be overdue and blocked at once, so the risk chips do not add up to the total.',
    'person:delivered':
      'Items done in the current sprint, out of how many were committed at the start. Commitment and delivery belong to whoever held the item at the start; items that entered later and are already done count too. With no active sprint, it counts what was done this week.',
    'person:blocks': BLOCK,
    'person:past':
      'Delivered per closed sprint, over the last 6 (filled bar), with the committed as an outline. Dashed line: the person had no items in that sprint. The arrow is the difference in deliveries between the last two.',

    // ---- the People page's filter
    'people:active':
      'Shows only who has something in the current sprint: open items, deliveries or commitment (on a board without a sprint, in the week). Whoever has only history from past sprints, or only blocks on items outside the sprint, is hidden. Turn it off to see the whole team.',

    // ---- a person's week
    'week:status':
      'Each signal has a level. Struggling: there is load over capacity, a high-severity block or an overdue item. Needs attention: there is a medium- or low-severity block, or a stalled item (in progress, without a status change for more than one checkpoint). On track: no signal. Due within 7 days is information only.',
    'week:in_progress': 'The person’s open items (subtasks included) that are in an in-progress status, out of all open ones.',
    'week:finished': 'The person’s items (subtasks included) done since Monday of this week.',

    // ---- a person's history
    'history:completed':
      'Stories, tasks and bugs done by the person in the period (subtasks do not count). The boards’ median is what each person completed, at the middle of the distribution.',
    'history:cycle': `The number is the P85 from start (in-progress status) to done, for what the person completed in the period. ${PERCENTILE}`,
    'history:lead': `The number is the P85 from the item’s creation to done, for what the person completed in the period. ${PERCENTILE}`,
    'history:unplanned': 'Items that entered the person’s sprints after they started, summed over the latest sprints.',

    // ---- a space (team)
    'space:risk': 'The open items of the space’s tracked boards by risk situation, each in its most severe one: carried over, overdue, blocked, stalled or aging. Summed over the boards.',
    'space:delivered':
      'Stories, tasks and bugs done in the current weekly window on the space’s tracked boards, and beside it how many in the window before. Subtasks do not count.',
    'space:progress':
      'Done ÷ items over the running sprints of the space’s boards (stories, tasks and bugs), summing the items of every board rather than averaging the boards, so a big board weighs more. A board with no sprint running is left out.',
    // ---- a sprint
    'sprint:progress':
      'Done ÷ sprint items (stories, tasks and bugs), by count and by sum of estimates. Coverage is the share of items that have an estimate.',
    'sprint:risk': 'Sprint items by risk situation, each in its most severe one: carried over, overdue, blocked, stalled or aging; those that fire no rule are on track.',
    'board:risk': 'The board’s open items by risk situation, each in its most severe one: carried over, overdue, blocked, stalled or aging. On a board without a sprint, it covers all open work, not just one sprint.',
    'commitment:committed': 'Items that were in the sprint at the start (the commitment frozen at the checkpoint, or what was in it when it began).',
    'commitment:delivered': 'Committed items that are done (at the end of the sprint, or today if it has not ended). The delivery belongs to whoever held the item at the start.',
    'commitment:remaining': 'Committed items that are still open and still in the sprint.',
    'commitment:removed': 'Committed items that left the sprint before its end.',
    'commitment:added': 'Items that entered after the start and are still in the sprint, delivered or not.',
    'commitment:adherence': 'Delivered ÷ committed at the start of the sprint (stories, tasks and bugs). Removed items count as committed; added scope is left out, so a sprint that received new items does not look like it failed on what it promised.',
    'commitment:carryover': 'Committed items left over ÷ committed, at the moment the sprint was closed. Exists only for a closed sprint.',

    // ---- flow
    'flow:completed': 'Stories, tasks and bugs done in the chosen period and filters. Subtasks do not count.',
    'flow:lead': `From the item’s creation until it is done. ${PERCENTILE}`,
    'flow:cycle': `From the item’s first moment in an in-progress status until it is done. ${PERCENTILE}`,
    'flow:wip':
      'Average, day by day over the period, of how many items (stories, tasks and bugs) were in an in-progress status, summing the boards.',
    'flow:efficiency':
      'Active time ÷ lead time, summed over the done items: how much of the total time the item spent in active columns, with no queue or block. Low efficiency means a lot of time waiting.',
    'flow:adherence': 'Median adherence (delivered ÷ committed) of the sprints closed in the period.',
    'flow:carryover': 'Median carry-over rate (committed left over ÷ committed) of the sprints closed in the period.',
    'flow:reopen':
      'Done items that were ever reopened ÷ done items. Below, how many moves back to an earlier column there were in total.',

    // ---- a board's card on the Boards page
    'boards:progress':
      'Done ÷ items in the running sprint (stories, tasks and bugs; subtasks and epics are left out), by count. The vertical mark is how much of the sprint’s time has passed, to read the bar against.',
    'boards:delivered':
      'Stories, tasks and bugs done in the current weekly window — the calendar week on a board with no sprint running — and, beside it, how many in the window before.',
    'boards:trend':
      'Items delivered in each of the last periods, oldest on the left: per sprint (the last four closed and the running one) when a sprint is running, otherwise per weekly window (the last four).',

    // ---- an issue
    'issue:lead': 'From creation until done. Exists only once the item is done.',
    'issue:cycle': 'From the first moment in an in-progress status until done. Exists only if the item was ever started.',
    'issue:queue': 'From creation until the item started (or until today, if it has not started yet).',
    'issue:blocked': 'Time flagged as an impediment in Jira plus time in a blocking status, since creation.',
    'issue:active': 'Time in active columns (the board’s in-progress ones, or those chosen in the settings), minus the time flagged as an impediment.',
    'issue:efficiency': 'Active time ÷ lead time, at most 100%. Exists only for a done item.',
    'issue:backward': 'How many times the item went to a column earlier than the one it was in, by the order of the board’s columns. A sign of rework.',
    'issue:reopened': 'Yes if the item was ever in a done category and went back to one that is not.',

    // ---- an epic
    'epic:progress': 'Done ÷ total among the epic’s direct children (stories, tasks and bugs), by count and by sum of estimates.',
    'epic:risk': 'The epic’s open items, at any level, by risk situation: each in its most severe one.',
    'epic:estimate': 'Sum of the estimates of the items under the epic, at any level: each item’s estimate or, when it has none, the sum of what is under it. In points, like Jira’s estimate field.',

    // ---- the rows of a work tree (TreeTable)
    'tree:done': 'Done ÷ total among this item’s direct children, by count and by sum of estimates (as in the epic). Shown only when the item has children.',
    'tree:estimate': 'The item’s own estimate or, when it has none, the sum of the estimates of the items under it.',

    // ---- what changed since a checkpoint
    'changes:open': 'Sprint items that were open at each moment: at the chosen checkpoint and now. Fewer is better.',
    'changes:done': 'Sprint items in a done category at each moment. More is better.',
    'changes:risk': 'Open items that fired some risk rule at each moment. Fewer is better.',
    'changes:points': 'Sum of the estimates of the open items at each moment. Fewer is better.',

    // ---- planning a sprint
    'planning:adherence':
      'Items where the allocation model predicted the same person who actually ended up with the item, ÷ items compared. It measures how much the real assignment resembles the one capacity and affinity suggested.',

    // ---- forecast
    'forecast:probability':
      'In how many of the 2,000 simulations the remaining items finished within the business days left until the end of the sprint. Each future day draws the throughput of a real business day among the last 60 (stories, tasks and bugs only). The bar is green from 85%, yellow from 50%, red below.',
    'forecast:percentiles':
      'In the business days the simulations needed: in 50% (or 85%, or 95%) of them the remaining items finished by this date. The 85% one is what usually serves as a commitment. The date counts business days only, from today.',

    'forecast:method':
      'Monte Carlo simulation: each future day draws the throughput of a real business day from the last 60, 2,000 times. The percentiles say by when a share of the simulations finished.',
    'forecast:low': 'Few days with deliveries in the sample: use it as a hint, not as a commitment.',
    'sample:low': 'Fewer than five items: use it as a hint, not as a conclusion.',

    // ---- the data behind a number
    'progress:coverage':
      'Coverage is the share of items that have an estimate. With little of it, the estimate bar misleads: the points sum holds only for the items that have them.',
    freshness:
      'The screen reads the local database, not Jira live. The date is this board’s last successful collection; a warning shows if the last collection failed or was more than 26 hours ago.',

    // ---- epic plan
    'plan:hours':
      'Planning + execution + Jira overhead. Planning and execution sum each subtask’s hours in Jira (the source of the hours is chosen in the parameters; execution includes code review). The Jira overhead is, for each execution subtask of a task with code, the registration hours from the parameters.',
    'plan:baseline':
      'Business days to finish with one person per role, without optimizing the allocation: planning + execution, respecting the dependencies. It is the reference for measuring the plan’s gain.',
    'plan:plan':
      'Business days of the last valid plan, with the real team, produced by the chosen algorithm (greedy, MILP or CP-SAT). The gain is the difference from the baseline schedule; the badge says whether the solver proved the optimum or what gap remained.',
    'plan:team': 'People selected for this epic, and the capacity in hours per week: people × hours per week from the parameters, each counted once.',
    'plan:data': 'The epic’s tasks and subtasks read from Jira. Errors block the schedule; warnings only inform.',
    'plan:planning_hours': 'Sum of the hours of the subtasks of the planning tasks: those carrying the planning label set in the parameters.',
    'plan:execution_hours': 'Sum of the hours of the subtasks of the other tasks, including the code review ones, which are execution like the rest.',
    'plan:overhead': 'Jira: for each execution subtask of a task with code, the registration hours from the parameters — a cost of the epic, not of a role. Code review: the part of execution that is review, shown apart.',
    // ---- the sprint timeline
    'timeline:summary':
      'The sprint’s items (epics, groups and subtasks are left out) by state: done, in progress, blocked and not started. Below, how many items are in each risk situation. An item can be overdue and blocked at the same time, so these numbers do not add up to the total.',
    'timeline:time':
      'Which day of the sprint it is, counting from the window’s first day. The bar shows how much of the time has passed: compare it with the items’ progress to see whether the sprint is ahead or behind.',
  },
};
