import type { ReactNode } from 'react';

import { plural } from '../../plural';
import type { Messages } from '../en-US';

const HOURS =
  'Die Schätzung jedes Vorgangs (Punkte × Stunden pro Punkt des Boards; ohne Schätzung gilt der Standardwert des Boards), summiert über die offenen Vorgänge. Nur Storys, Aufgaben und Bugs zählen: Unteraufgaben gehen mit ihrer Story.';

const CAPACITY =
  'Die verbleibende Kapazität ist: Arbeitstage von heute bis zum Ende des Sprints (oder der Woche, wenn kein Sprint aktiv ist oder sein Enddatum überschritten ist) × Stunden pro Tag × Fokusfaktor × Zeitanteil, abzüglich der Abwesenheiten. Stunden pro Tag und Zeitanteil jeder Person werden im Tab Kapazität eingestellt.';

const LOAD_STATES = 'Über 110% heißt „über der Kapazität“; unter 80% „mit Spielraum“ (Grenzwerte des Boards; dies sind die Standardwerte).';

const BLOCK =
  'Eine Blockade ist ein offener Vorgang — Unteraufgaben eingeschlossen —, der in Jira als Hindernis markiert ist, in einem blockierenden Status steht oder über einen Link „wird blockiert durch“ auf einen anderen offenen Vorgang wartet.\n\nDie Schwere ergibt sich aus der Standzeit: unter 2 Tagen niedrig, bis 5 mittel, darüber hoch. Ein blockierter und überfälliger Vorgang zählt hier, auch wenn eine andere Regel ihn als überfällig zeigt.';

const PERCENTILE =
  'P50/P85/P95 sind Rang-Perzentile: „85% der Vorgänge wurden in höchstens N Tagen fertig“, immer ein Wert, der tatsächlich vorkam, kein Durchschnitt. n ist die Stichprobengröße; unter 5 ist es nur ein Hinweis.';

export const shell: Messages['shell'] = {
  preferences: {
    title: 'Anzeigeeinstellungen',
    language: 'Sprache',
    theme: 'Design',
    themeLight: 'Hell',
    themeDark: 'Dunkel',
    themeSystem: 'System',
    density: 'Tabellendichte',
    densityComfortable: 'Komfortabel',
    densityCompact: 'Kompakt',
    chartPatterns: 'Muster in Diagrammen',
    chartPatternsHint: 'Schraffuren zusätzlich zur Farbe, damit sich Reihen auch ohne Farbe unterscheiden lassen',
    reduceMotion: 'Animationen reduzieren',
    reduceMotionHint: 'die Einstellung des Betriebssystems wird ebenfalls berücksichtigt',
    shortcuts: 'Tastenkürzel',
  },

  format: {
    dayUnit: 'T',
    days: (value: string) => `${value} T`,
    dayMonth: (day: string, month: string) => `${day}.${month}.`,
  },

  app: {
    skipToContent: 'Zum Inhalt springen',
    openNavigation: 'Navigation öffnen',
    expandMenu: 'Menü ausklappen',
    collapseMenu: 'Menü einklappen',
    expandSidebar: 'Seitenmenü ausklappen',
    collapseSidebar: 'Seitenmenü einklappen',
    brandHome: 'Cadência, zur Startseite',
    mainNavigation: 'Hauptnavigation',
    savedViews: 'Gespeicherte Ansichten',
    pressForShortcuts: (key: ReactNode): ReactNode[] => ['Drücken Sie ', key, ', um die Tastenkürzel zu sehen.'],
    notFoundTitle: 'Seite nicht gefunden',
    notFoundBody: 'Nutzen Sie die Navigation an der Seite.',
    collectionDoneTitle: 'Datenabruf abgeschlossen',
    collectionDoneMessage: 'Die Übersichten wurden mit den neuen Daten neu berechnet.',
    collectionDoneAnnounce: 'Datenabruf abgeschlossen. Die Übersichten wurden neu berechnet.',
  },

  pill: {
    collecting: 'Rufe ab…',
    collected: (when: string) => `Abgerufen ${when}`,
    neverCollected: 'Nie abgerufen',
    openStatus: (label: string) => `${label}. Status des Datenabrufs ansehen`,
    tipCollecting: 'Ein Datenabruf läuft.',
    tipOldest: (when: string) => `Ältester Datenabruf aller Boards: ${when}`,
    tipOldestFailed: (when: string) => `Ältester Datenabruf aller Boards: ${when}. Bei einem Board ist der letzte Datenabruf fehlgeschlagen.`,
    tipNever: 'Es wurde noch kein Board abgerufen.',
  },

  nav: {
    follow: 'Verfolgen',
    deliver: 'Liefern',
    system: 'System',
    home: 'Start',
    flow: 'Fluss',
    people: 'Personen',
    focusTimeline: 'Fokus-Zeitleiste',
    presentation: 'Präsentation',
    collectionStatus: 'Status des Datenabrufs',
    settings: 'Einstellungen',
    myWeek: 'Meine Woche',
    dataHygiene: 'Datenpflege',
    notifications: 'Benachrichtigungen',
    gettingStarted: 'Erste Schritte',
  },

  api: {
    requestFailed: 'Anfrage fehlgeschlagen',
    unreachable: 'API nicht erreichbar',
    unreachableAction: 'Prüfen Sie, ob der API-Dienst läuft (cadencia serve oder make up).',
    invalidRequest: 'ungültige Anfrage',
    homeNotSaved: 'Startseite nicht gespeichert',
  },

  common: {
    breadcrumbs: 'Navigationspfad',
    collectedAt: (when: string) => `Daten abgerufen ${when}`,
    freshness: 'Aktualität der Daten',
    lastFailedTitle: 'Der letzte Datenabruf dieses Boards ist fehlgeschlagen',
    lastFailedBody: (error: string) => `${error} — die Zahlen unten stammen aus dem letzten erfolgreichen Datenabruf.`,
    openStatus: 'Status des Datenabrufs öffnen',
    staleTitle: 'Daten möglicherweise veraltet',
    staleBody: (when: string) => `Der letzte erfolgreiche Datenabruf war ${when}.`,
    loadFailed: 'Konnte nicht geladen werden',
    whatToDo: (action: string) => `Was zu tun ist: ${action}`,
    loading: 'Wird geladen',
    openInJira: (key: string) => `${key} in Jira öffnen`,
    none: 'keine',
    epic: 'Epic',
    itemsDone: (pct: string) => `Erledigte Vorgänge: ${pct}`,
    sprintElapsed: (label: string, pct: number) => `${label}. Vergangene Sprintzeit: ${pct}%`,
    itemsCount: (done: number, total: number) => `${done}/${total} Vorgänge`,
    estimateDone: (pct: string) => `Erledigte Schätzung: ${pct}`,
    points: (done: string, total: string) => `${done}/${total} Pkt.`,
    coverage: (pct: string) => `Abdeckung ${pct}`,
    coverageAbout: 'Abdeckung',
    noSample: 'keine Stichprobe',
    lowConfidence: 'geringe Aussagekraft',
    sampleConfidence: 'Aussagekraft der Stichprobe',
    howCalculated: (about: string) => `So wird berechnet: ${about}`,
    moreInfo: 'Weitere Informationen',
    cancel: 'Abbrechen',
    undo: 'Rückgängig',
    export: 'Exportieren',
    csv: 'CSV (Excel)',
  },

  risk: {
    label: {
      arrastado: 'Übertragen',
      atrasado: 'Überfällig',
      bloqueado: 'Blockiert',
      estagnado: 'Stillstand',
      envelhecendo: 'Alternd',
      em_dia: 'Im Plan',
    },
    counted: {
      arrastado: 'übertragen',
      atrasado: 'überfällig',
      bloqueado: 'blockiert',
      estagnado: 'im Stillstand',
      envelhecendo: 'alternd',
      em_dia: 'im Plan',
    },
    short: {
      arrastado: 'übertr.',
      atrasado: 'überf.',
      bloqueado: 'blockiert',
      estagnado: 'Stillst.',
      envelhecendo: 'alternd',
      em_dia: 'im Plan',
    },
    noneAtRisk: 'keine Vorgänge mit Risiko',
    noRuleFired: 'Für diesen Vorgang hat keine Risikoregel ausgelöst.',
    ruleApplied: (rule: string) => `Angewandte Regel: ${rule}`,
    lastTransition: (from: string, to: string, at: string, author: string | null) =>
      `Letzter Übergang: ${from} → ${to} am ${at}${author ? ` durch ${author}` : ''}`,
  },

  tree: {
    item: 'Vorgang',
    type: 'Typ',
    status: 'Status',
    assignee: 'Zuständig',
    situation: 'Lage',
    doneRemaining: 'Erledigt / offen',
    estimateRollup: 'Kumulierte Schätzung',
    collapse: (label: string) => `${label} einklappen`,
    expand: (label: string) => `${label} ausklappen`,
  },

  description: {
    title: 'Beschreibung',
    showLess: 'Weniger anzeigen',
    showAll: 'Alles anzeigen',
    empty: 'Keine Beschreibung in Jira.',
  },

  openInJira: {
    label: 'In Jira öffnen',
    tooltip: (n: number) => `Jira-Suche mit ${plural(n, 'Vorgang', 'Vorgängen')}: key in (…)`,
  },

  shortcuts: {
    title: 'Tastenkürzel',
    macNote: 'Auf dem Mac ist Ctrl ⌘.',
    scrollKey: 'Mausrad',
    groups: {
      global: 'Auf jeder Seite',
      focusTimeline: 'Fokus-Zeitleiste',
      editor: 'Präsentationseditor',
      present: 'Präsentationsmodus',
    },
    search: 'Suchen und überallhin springen',
    showShortcuts: 'Diese Tastenkürzel anzeigen',
    closeWindows: 'Fenster und Menüs schließen',
    searchActivity: 'Aktivität oder Wechsel suchen',
    undo: 'Rückgängig',
    redo: 'Wiederholen (auch Ctrl+Y)',
    saveNow: 'Jetzt speichern (Bearbeitungen und Zuordnung)',
    generate: 'Präsentation erstellen',
    selectAll: 'Alle Formen auswählen',
    copy: 'Kopieren',
    paste: 'Einfügen',
    duplicate: 'Duplizieren',
    group: 'Gruppieren',
    ungroup: 'Gruppierung aufheben',
    copyFormat: 'Format kopieren',
    pasteFormat: 'Format auf die Auswahl übertragen',
    lock: 'Auswahl sperren oder entsperren',
    findReplace: 'Suchen und ersetzen',
    typeInShape: 'In die ausgewählte Form schreiben (auch F2)',
    deleteSelection: 'Auswahl löschen',
    nudge: '1 mm verschieben (mit Shift 5 mm)',
    nextShape: 'Nächste Form auswählen',
    zoom: 'Vergrößern und verkleinern',
    editorFullscreen: 'Editor im Vollbild',
    nextSlide: 'Nächste Folie (auch Leertaste und Bild ab)',
    previousSlide: 'Vorherige Folie',
    allSlides: 'Alle Folien',
    notes: 'Notizen für Vortragende',
    audience: 'Publikumsansicht öffnen (zwei Bildschirme)',
    timer: 'Timer anhalten oder fortsetzen',
    pen: 'Stift: auf der Folie zeichnen',
    laser: 'Laser: auf der Folie zeigen',
    clearInk: 'Markierungen der Folie löschen',
    evidence: 'Auf der Folie genannte Vorgänge (Belege)',
    questions: 'Fragen aus dem Publikum',
    fullscreen: 'Vollbild',
    dropTool: 'Stift oder Laser ablegen; erneut: beenden',
  },

  palette: {
    kinds: {
      acao: 'Aktion',
      pagina: 'Seite',
      visao: 'gespeicherte Ansicht',
      board: 'Board',
      sprint: 'Sprint',
      item: 'Vorgang',
      epico: 'Epic',
      iniciativa: 'Initiative',
      pessoa: 'Person',
      modelo: 'Vorlage',
      comando: 'auf dieser Seite',
    },
    collectNow: 'Jetzt abrufen',
    collectNowDetail: 'inkrementeller Datenabruf aller Boards',
    collectionStarted: 'Datenabruf gestartet',
    collectionStartedMessage: 'Verfolgen Sie ihn unter Status des Datenabrufs.',
    collectionNotStarted: 'Datenabruf nicht gestartet',
    showShortcuts: 'Tastenkürzel anzeigen',
    placeholder: 'Board, Sprint, Vorgang (CAD-14), Person, Vorlage oder Aktion suchen…',
    search: 'Suchen',
    results: 'Ergebnisse',
    searching: 'Suche läuft…',
    nothingFound: 'Nichts gefunden.',
    choose: 'auswählen',
    open: 'öffnen',
  },

  header: {
    searchShortcut: 'Suchen (Ctrl+K)',
    searchPlaceholder: 'Boards, Sprints und Vorgänge suchen…',
    searchShort: 'Boards, Sprints und Vorgänge suchen',
    viewSaved: 'Ansicht gespeichert',
    viewSavedPinned: 'Sie erscheint im Seitenmenü.',
    viewSavedSearch: 'Sie erscheint in der Suche (Ctrl+K).',
    deleteViewTitle: (name: string) => `Ansicht ${name} löschen?`,
    deleteViewBody: 'Sie verschwindet aus dem Menü und der Suche (Ctrl+K).',
    deleteViewConfirm: 'Ansicht löschen',
    viewDeleted: (name: string) => `Ansicht ${name} gelöscht`,
    savedViews: 'Gespeicherte Ansichten',
    saveThisView: 'Diese Ansicht speichern…',
    saveThisViewTitle: 'Diese Ansicht speichern',
    saveThisViewBody: 'Speichert die aktuelle Seite mit den gewählten Filtern:',
    name: 'Name',
    namePlaceholder: 'z. B. Risiken Team Plattform',
    pinToSidebar: 'Im Seitenmenü anheften',
    save: 'Speichern',
    noViews: 'Keine gespeicherten Ansichten. Mit „Diese Ansicht speichern“ sichern Sie die aktuelle Seite mit ihren Filtern.',
    unpin: 'Vom Menü lösen',
    pin: 'Im Menü anheften',
    pinNamed: (name: string) => `${name} im Menü anheften`,
    deleteNamed: (name: string) => `Ansicht ${name} löschen`,
  },

  progress: {
    phases: {
      configuracao: 'liest die Board-Konfiguration',
      itens: 'ruft die Vorgänge ab',
      historico: 'liest den Verlauf der Vorgänge',
      gravando: 'speichert und friert Checkpoints ein',
    },
    starting: 'startet',
    underAMinute: 'unter 1 Min.',
    minutes: (n: number) => `~${n} Min.`,
    full: 'vollständiger Abgleich',
    incremental: 'inkrementeller Datenabruf',
    region: 'Datenabruf läuft',
    collecting: 'ruft ab',
    started: (mode: string, when: string) => `${mode} · gestartet ${when}`,
    cancelling: 'wird beim nächsten Schritt abgebrochen…',
    cancel: 'Abbrechen',
    done: 'abgeschlossen',
    cancelled: 'abgebrochen',
    failed: 'fehlgeschlagen',
    boardProgress: (name: string) => `Fortschritt von ${name}`,
  },

  changes: {
    sections: {
      new_risks: { title: 'Neue Risiken', hint: 'sind in eine schlechtere Lage geraten als zuvor' },
      resolved: { title: 'Behobene Risiken', hint: 'haben sich verbessert oder wurden erledigt' },
      completed: { title: 'Erledigt', hint: 'sind in eine Erledigt-Kategorie gewechselt' },
      entered: { title: 'Hinzugekommen', hint: 'waren zu Beginn nicht im Umfang' },
      left: { title: 'Entfernt', hint: 'waren im Umfang und sind es nicht mehr' },
      moved: { title: 'Status geändert', hint: '' },
      reassigned: { title: 'Zuständigkeit geändert', hint: '' },
      reopened: { title: 'Wieder geöffnet', hint: 'waren erledigt und kamen zurück' },
    },
    same: 'gleich',
    before: (delta: string, before: number) => `${delta} · vorher ${before}`,
    open: 'Offen',
    done: 'Erledigt',
    atRisk: 'Mit Risiko',
    openPoints: 'Offene Punkte',
    nobody: 'niemand',
    noCheckpointTitle: 'Noch kein eingefrorener Checkpoint',
    seeStatus: 'Status des Datenabrufs ansehen',
    noCheckpointBody:
      'Der erste Checkpoint wird zur wöchentlichen Zeit des Boards nach einem Datenabruf gespeichert. Ab dann vergleicht dieser Tab die Woche.',
    since: 'Seit Checkpoint',
    until: 'Bis',
    now: 'jetzt',
    sameWay: 'Beide Seiten werden so gelesen, wie Checkpoints eingefroren werden.',
    nothingChanged: (from: string | null, to: string | null) =>
      `Zwischen ${from ?? 'dem Beginn'} und ${to ?? 'jetzt'} hat sich nichts geändert.`,
  },

  forecast: {
    afterAYear: 'nach mehr als 1 Jahr',
    businessDays: (n: number) => plural(n, 'Arbeitstag', 'Arbeitstage'),
    unavailable: 'Prognose nicht verfügbar',
    title: 'Lieferprognose',
    lowConfidence: 'geringe Aussagekraft',
    confidence: 'Aussagekraft der Prognose',
    remainingInJira: 'Offene in Jira',
    nothingLeft: {
      sprint: 'Nichts mehr offen: Der Sprint ist erledigt.',
      board: 'Nichts mehr offen: Das Board ist erledigt.',
      epic: 'Nichts mehr offen: Das Epic ist erledigt.',
    },
    chance: (count: ReactNode, end: string | null): ReactNode[] => [
      'Wahrscheinlichkeit, die ',
      count,
      ` offenen Vorgänge bis zum Sprintende${end ? ` (${end})` : ''} abzuschließen`,
    ],
    chanceAbout: 'Wahrscheinlichkeit, rechtzeitig fertig zu werden',
    chanceLabel: (pct: string) => `Wahrscheinlichkeit, rechtzeitig fertig zu werden: ${pct}`,
    untilEnd: (n: number) => `${plural(n, 'Arbeitstag', 'Arbeitstage')} bis zum Ende.`,
    p50: '50% Wahrscheinlichkeit bis',
    p85: '85% Wahrscheinlichkeit bis',
    p95: '95% Wahrscheinlichkeit bis',
    sample: (delivered: number, days: number) =>
      `Stichprobe: ${plural(delivered, 'erledigter Vorgang', 'erledigte Vorgänge')} in ${plural(days, 'Arbeitstag', 'Arbeitstagen')}.`,
  },

  flowCharts: {
    noData: 'Keine Daten im Zeitraum',
    seeStatus: 'Status des Datenabrufs ansehen',
    noDataBody: 'Erweitern Sie den Zeitraum in den Filtern oder prüfen Sie, ob der letzte Datenabruf dieses Boards abgeschlossen ist.',
    cfdLabel: (from: string, to: string, columns: string) => `Kumulativer Fluss von ${from} bis ${to} nach Spalte: ${columns}`,
    noneDone: 'Keine erledigten Vorgänge im Zeitraum',
    noneDoneBody: 'Erweitern Sie den Zeitraum in den Filtern: Das Diagramm braucht abgeschlossene Vorgänge, um die Durchlaufzeit zu zeigen.',
    scatterLabel: (n: number, p50: string, p85: string, p95: string) =>
      `Durchlaufzeit von ${plural(n, 'erledigtem Vorgang', 'erledigten Vorgängen')}; P50 ${p50} Tage, P85 ${p85}, P95 ${p95}`,
    scatterTip: (days: string, date: string) => `${days} Tage · erledigt am ${date}`,
    days: 'Tage',
    noneInProgress: 'Keine Vorgänge in Arbeit',
    noneInProgressBody:
      'Gerade nichts in den In-Arbeit-Spalten dieses Boards. Wenn das nicht zu Jira passt, prüfen Sie die Spalten unter Einstellungen → Board-Profil.',
    agingLabel: (n: number, p85: string) => `${plural(n, 'Vorgang', 'Vorgänge')} in Arbeit nach Spalte; historische P85-Grenze ${p85} Tage`,
    agingTip: (days: string) => `${days} Tage in Arbeit`,
    noSprints: 'Keine Sprints zum Vergleichen',
    noSprintsBody: 'Der Vergleich erscheint nach dem ersten abgeschlossenen Sprint mit erfasster Zusage.',
    cvdLabel: (rows: string) => `Zugesagt gegenüber geliefert: ${rows}`,
    cvdRow: (sprint: string, delivered: number, committed: number, added: number) =>
      `${sprint} ${delivered} von ${committed}, ${added} hinzugefügt`,
    committed: 'Zu Beginn zugesagt',
    delivered: 'Von der Zusage geliefert',
    added: 'Hinzugefügter Umfang',
    cfdTitle: 'Kumulativer Fluss',
    cfdCaption: 'Vorgänge pro Spalte, Tag für Tag: Bänder, die breiter werden, zeigen einen Stau.',
    cycleTitle: 'Durchlaufzeit',
    cycleCaption: 'Jeder Punkt ist ein erledigter Vorgang; gestrichelte Linien sind die Perzentile 50, 85 und 95.',
    agingTitle: 'Alterung der laufenden Arbeit',
    agingCaption: 'Alter jedes offenen Vorgangs nach Spalte; Rauten liegen über dem historischen P85 des Typs.',
    cvdTitle: 'Zugesagt × geliefert',
    cvdCaption: 'Umfang, der nach dem Start hinzukam, wird getrennt gezeigt, damit Zusage und neue Nachfrage nicht verwechselt werden.',
  },

  health: {
    severity: { erro: 'Fehler', aviso: 'Warnung', info: 'Information' },
    andMore: (n: number) => ` und ${n} weitere`,
    fixHere: 'Hier beheben',
    fixInJira: 'In Jira beheben',
    okTitle: 'Nichts, was die Zahlen verzerrt',
    okBody: 'Die verfolgten Boards haben keine Fehler oder Warnungen zur Datenpflege.',
    problems: (n: number) => plural(n, 'Hinweis', 'Hinweise'),
    problemsBody: 'Keiner davon verhindert den Datenabruf, aber jeder macht einen Indikator weniger verlässlich.',
    ok: 'ok',
    points: (n: number) => plural(n, 'Hinweis', 'Hinweise'),
    nothing: 'Nichts zu beanstanden.',
  },

  notifications: {
    kinds: { slack: 'Slack (Webhook)', teams: 'Teams (Webhook)', webhook: 'JSON-Webhook', email: 'E-Mail' },
    linksTitle: 'Links in Nachrichten',
    linksBody: (variable: ReactNode): ReactNode[] => [
      'Setzen Sie ',
      variable,
      ' (die Adresse, unter der Cadência geöffnet wird), damit Nachrichten einen direkten Link zur Präsentation oder zur Übersicht enthalten.',
    ],
    channels: 'Kanäle',
    addChannel: 'Kanal hinzufügen',
    noChannels: 'Keine Kanäle. Ein eingehender Webhook von Slack oder Teams ist der einfachste Einstieg.',
    name: 'Name',
    type: 'Typ',
    target: 'Ziel',
    events: 'Benachrichtigen bei',
    enabled: 'Aktiv',
    lastSent: 'Letzter Versand',
    namePlaceholder: 'z. B. #produkt-team',
    channelName: 'Name des Kanals',
    channelType: 'Typ des Kanals',
    emailPlaceholder: 'ana@firma.de, bia@firma.de',
    smtpMissing: 'SMTP nicht konfiguriert (CADENCIA_SMTP_HOST)',
    channelEnabled: 'Kanal aktiv',
    delivered: 'zugestellt',
    failed: 'fehlgeschlagen',
    sendTest: 'Testnachricht senden',
    saveFirst: 'Vor dem Testen speichern',
    testChannel: 'Kanal testen',
    testSent: 'Testnachricht gesendet',
    testFailed: 'Der Test ist fehlgeschlagen',
    checkChannel: 'Prüfen Sie den Kanal.',
    removeChannel: 'Kanal entfernen',
    notSaved: 'Kanäle nicht gespeichert',
    saved: 'Kanäle gespeichert',
    saveChannels: 'Kanäle speichern',
    digestTitle: 'Risikoübersicht',
    digestBody:
      'Eine Nachricht pro Bereich mit dem, was seit dem letzten Checkpoint in Stillstand geraten, blockiert oder überfällig ist. Ein Bereich ohne Neuigkeiten erhält keine Nachricht.',
    autoSend: 'Übersicht automatisch senden',
    days: 'Tage',
    hour: 'Stunde',
    timezone: 'Zeitzone',
    scheduleSaved: 'Zeitplan gespeichert',
    scheduleSavedMessage: 'Der Abrufdienst übernimmt ihn innerhalb von 5 Minuten.',
    saveSchedule: 'Zeitplan speichern',
    todayPreview: 'Vorschau für heute',
    newRisks: (space: string, n: number) => `${space}: ${plural(n, 'neues Risiko', 'neue Risiken')}`,
    digestSent: 'Übersicht gesendet',
    nothingNew: 'Nichts Neues zu senden',
    nothingNewMessage: 'Kein Bereich hat seit dem letzten Checkpoint ein neues Risiko.',
    sendNow: 'Jetzt senden',
    goesTo: (event: string) => `geht an die Kanäle mit „${event}“`,
  },

  riskTable: {
    noteTitle: 'Verzug ist ein Signal zum Nachsehen, kein Urteil',
    noteBody:
      'Jede Markierung beschreibt eine Tatsache aus dem Jira-Verlauf und zeigt die Regel, die sie erzeugt hat. Klicken Sie auf „Beleg“, um den letzten Übergang, das Datum und die Person zu sehen.',
    situation: 'Lage',
    person: 'Person',
    all: 'Alle',
    type: 'Typ',
    allTypes: 'Alle',
    emptyTitle: 'Keine Vorgänge mit diesen Filtern',
    clearFilters: 'Filter zurücksetzen',
    emptyBody: 'Die Filter für Lage, Person und Typ stehen in der Adresse der Seite; setzen Sie sie zurück, um alles zu sehen.',
    item: 'Vorgang',
    column: 'Spalte',
    assignee: 'Zuständig',
    whatHappened: 'Was passiert ist',
    due: 'Fällig',
    unassigned: 'Nicht zugewiesen',
    otherRules: (n: number) => `+${plural(n, 'weitere Regel', 'weitere Regeln')}`,
    evidence: 'Beleg',
  },

  schedule: {
    ownTime: 'Zu eigener Zeit erstellen',
    hour: 'Stunde',
    minute: 'Minute',
    timezone: 'Zeitzone',
    dataNow: 'Aktuelle Daten',
    lastCheckpoint: 'Letzter Checkpoint',
    audience: 'Publikum',
    allSlides: 'alle Folien',
    appliesSoon: 'Der Abrufdienst übernimmt die Zeit innerhalb von 5 Minuten nach dem Speichern der Zuordnung.',
    notify: 'Kanäle benachrichtigen, wenn automatisch erstellt wird',
    notifyHint: 'geht an die Benachrichtigungskanäle mit „Präsentation erstellt“ (Einstellungen → Benachrichtigungen)',
    emailSend: 'Per E-Mail senden',
    linkOnly: 'Nur Link',
    attachPptx: '.pptx-Anhang',
    attachPdf: 'PDF-Anhang',
    attachNote:
      'Slack und Teams erhalten immer den Link. Dateien über 20 MB oder eine Präsentation, die die Prüfung nicht bestanden hat, gehen nur als Link.',
  },

  statusPalette: {
    names: { concluido: 'Erledigt', em_dia: 'Im Plan', risco: 'Mit Risiko', atrasado: 'Überfällig' },
    color: (name: string) => `Farbe: ${name}`,
    label: (name: string) => `Beschriftung: ${name}`,
    lowContrast: (ratio: string) =>
      `Geringer Kontrast: Der am besten lesbare Text auf dieser Farbe erreicht ${ratio}:1 (empfohlenes Minimum 4,5:1).`,
    inherited: 'aus der gemeinsamen Konfiguration übernommen',
  },

  windows: {
    state: { futura: 'kommend', fechada: 'am Checkpoint geschlossen', aberta: 'läuft' },
    diff: {
      sprint: {
        completed: 'Im Fenster geliefert',
        added: 'Nach dem Start hinzugekommen',
        removed: 'Aus dem Sprint entfernt',
        unmoved: 'Keinerlei Bewegung',
      },
      board: {
        completed: 'Im Fenster geliefert',
        added: 'In die Warteschlange gekommen',
        removed: 'Aus der Warteschlange entfernt',
        unmoved: 'Keinerlei Bewegung',
      },
    },
    title: 'Wochenfenster',
    week: (n: number) => `Woche ${n}`,
    partial: 'teilweise',
    range: (start: string, end: string, days: number) => `${start} → ${end} · ${plural(days, 'Arbeitstag', 'Arbeitstage')}`,
    notStarted: 'Noch nicht begonnen.',
  },

  mosaic: {
    sizes: {
      P: { label: 'K', hint: 'Klein: ein Viertel der Breite' },
      M: { label: 'M', hint: 'Mittel: die halbe Breite' },
      G: { label: 'G', hint: 'Groß: die ganze Breite' },
    },
    groups: {
      indicadores: 'Board-Kennzahlen',
      pessoas: 'Personen',
      acontecendo: 'Was gerade passiert',
      boards: 'Boards und Sprints',
      sistema: 'System',
    },
    tiles: {
      'kpi:risk': { label: 'Vorgänge mit Risiko', description: 'Wie viele Vorgänge gerade ein Risiko haben, über alle Boards.' },
      'kpi:throughput': { label: 'Durchsatz im Fenster', description: 'Erledigte Vorgänge im aktuellen Fenster, verglichen mit dem vorherigen.' },
      'kpi:progress': { label: 'Mittlerer Fortschritt', description: 'Erledigte ÷ Sprint-Vorgänge, Mittel über die Boards (ungewichtet).' },
      'kpi:adherence': { label: 'Zusagetreue', description: 'Wie viel vom Zugesagten geliefert wurde, Sprint für Sprint.' },
      'sprint:scope': { label: 'Hinzugefügter Umfang', description: 'Vorgänge, die nach dem Start in die Sprints kamen.' },
      'team:load': { label: 'Auslastung des Teams', description: 'Offene Stunden gegenüber der im Sprint verbleibenden Kapazität.' },
      'team:overloaded': { label: 'Personen über Kapazität', description: 'Wer mehr offene Stunden als Kapazität hat, um früh zu sprechen.' },
      'team:blocks': { label: 'Aktive Blockaden', description: 'Wie viele Blockaden es gibt, wie schwer und seit wann.' },
      'team:delivered': { label: 'Lieferungen im Sprint', description: 'Was das Team bisher geliefert hat, gegenüber der Zusage.' },
      'pulse:recent': { label: 'Letzte Lieferungen', description: 'Lieferungen pro Tag in den letzten 7 Tagen, gegenüber den 7 davor.' },
      'pulse:feed': { label: 'Gerade passiert', description: 'Was in den letzten 48 Stunden geliefert, blockiert oder in den Sprint aufgenommen wurde.' },
      'pulse:due': { label: 'Fällig in 7 Tagen', description: 'Vorgänge, die nächste Woche fällig sind, und die bereits überfälligen.' },
      'sprint:elapsed': { label: 'Laufender Sprint', description: 'Wie viel vom Sprint vergangen und wie viel erledigt ist, pro Board.' },
      'kanban:boards': { label: 'Kanban-Boards', description: 'Durchsatz der Woche und Vorgänge mit Risiko, pro verfolgtem Kanban-Board.' },
      boards: { label: 'Board-Tabelle', description: 'Eine Zeile pro Board: Fortschritt, Risiko, Durchsatz, Trend und Datenabruf.' },
      'saude:pontos': {
        label: 'Datenpflege',
        description: 'Hinweise zur Datenpflege in den verfolgten Boards: Vorgänge ohne Schätzung, wenig erledigte Historie und Ähnliches.',
      },
    },
  },

  help: {
    'tile:kpi:risk':
      'Noch nicht erledigte Vorgänge, die mindestens eine Risikoregel auslösen — aus einem früheren Sprint übertragen, überfällig, blockiert, im Stillstand zwischen Checkpoints oder alternd (in Arbeit über das historische P85 des Typs hinaus) —, summiert über die Boards. Jeder Vorgang zählt einmal, in seiner schwersten Lage. Ohne aktiven Sprint gilt es für alle offenen Vorgänge des Boards.',
    'tile:kpi:throughput':
      'Erledigte Vorgänge — Storys, Aufgaben und Bugs, ohne Unteraufgaben — im aktuellen Wochenfenster des Sprints, summiert über die Boards. „Erledigt“ ist die Statuskategorie, nicht der Name. Der Pfeil vergleicht mit dem vorherigen Fenster; die Linie daneben ist ein anderes Maß: das Gelieferte in jedem der letzten Sprints.',
    'tile:kpi:progress':
      'Einfacher Mittelwert über die Boards mit Sprint aus erledigten ÷ Sprint-Vorgängen (Storys, Aufgaben und Bugs). Nicht gewichtet nach Boardgröße oder Schätzung.',
    'tile:kpi:adherence':
      'Wie viel vom zu Sprintbeginn Zugesagten geliefert wurde: geliefert ÷ zugesagt, Sprint für Sprint über die Boards summiert. Nur abgeschlossene Sprints; was nach dem Start hinzukam, bleibt außen vor. Die Veränderung ist in Prozentpunkten gegenüber dem vorherigen Sprint.',
    'tile:sprint:scope':
      'Vorgänge (Storys, Aufgaben und Bugs), die nach dem Start in den Sprint kamen und noch darin sind, summiert über die Boards mit laufendem Sprint. Bereits erledigte zählen ebenfalls.',
    'tile:sprint:elapsed':
      'Zeit: (heute − Start) ÷ (Ende − Start) des Sprints. Vorgänge: erledigt ÷ Sprint-Vorgänge. „Hinter der Zeit“ erscheint, wenn die erledigten Vorgänge mehr als 20 Prozentpunkte unter der bereits vergangenen Zeit liegen.',
    'tile:kanban:boards':
      'Ein Kanban-Board hat keinen Sprint und erscheint daher hier statt unter "Laufender Sprint": Das Fenster ist die Kalenderwoche (Checkpoint zu Checkpoint), nicht Start und Ende eines Sprints. "In der Woche" ist, was im aktuellen Fenster erledigt wurde (Storys, Aufgaben und Bugs); der Pfeil vergleicht mit der Vorwoche. "Mit Risiko" summiert die offenen Vorgänge des Boards in jeder Risikolage — übertragen, überfällig, blockiert, Stillstand oder alternd.',
    'tile:team:load': `Summe der offenen Stunden ÷ Summe der verbleibenden Kapazität, für die Personen mit Kapazität im Zeitraum.\n\n${HOURS}\n\n${CAPACITY}\n\n${LOAD_STATES}`,
    'tile:team:overloaded':
      'Personen, deren Auslastung über 110% der verbleibenden Kapazität liegt (die Toleranz von 10% ist die des Boards). Ein Signal, früh zu sprechen, keine Bewertung: Es setzt voraus, dass Schätzungen existieren und die Verfügbarkeit jeder Person erfasst ist.',
    'tile:team:blocks': BLOCK,
    'tile:team:delivered':
      'Geliefert ÷ zugesagt im Sprint, über die Personen summiert: zu Beginn zugesagte Vorgänge, die erledigt wurden (die Lieferung zählt für die Person, die den Vorgang zu Beginn hatte), plus später hinzugekommene, die bereits erledigt sind. Auf einem Board ohne Sprint zählt, was in der Woche erledigt wurde.',
    'tile:pulse:recent':
      'In den letzten 7 Tagen erledigte Vorgänge (Storys, Aufgaben und Bugs), summiert über die Boards; jeder Balken ist ein Tag. Verglichen wird mit den 7 Tagen davor.',
    'tile:pulse:feed':
      'Was in den letzten 48 Stunden passiert ist: erledigter Vorgang, Vorgang, der in einen blockierenden Status kam oder als Hindernis markiert wurde, und Vorgang, der nach dem ersten Sprinttag in einen Sprint kam. Die neuesten zuerst, bis zu 30.',
    'tile:pulse:due':
      'Offene Vorgänge (Storys, Aufgaben und Bugs) mit Fälligkeitsdatum in den nächsten 7 Tagen. Die kleinere Zahl sind die offenen Vorgänge, deren Fälligkeitsdatum schon vorbei ist.',
    'tile:boards': 'Eine Zeile pro verfolgtem Board. Zeigen Sie auf die Spaltenköpfe oder fokussieren Sie sie, um zu sehen, wie jede berechnet wird.',
    'tile:saude:pontos':
      'Hinweise zur Datenpflege in den verfolgten Boards — Vorgänge ohne Schätzung, wenig erledigte Historie und Ähnliches. Keiner verhindert den Datenabruf, aber jeder macht einen Indikator weniger verlässlich. Die Details pro Board stehen unter Status des Datenabrufs → Datenpflege.',

    'col:space': 'Der Jira-Bereich, zu dem das Board gehört: das Team.',
    'col:sprint': 'Der aktive (oder letzte) Sprint und das Wochenfenster, in dem er sich befindet, unter den Fenstern des Sprints.',
    'col:progress':
      'Erledigt ÷ Sprint-Vorgänge (Storys, Aufgaben und Bugs), nach Anzahl und nach Summe der Schätzungen. Die senkrechte Marke auf dem Vorgangsbalken zeigt, wie viel vom Sprint vergangen ist: Liegt der Balken mehr als 20 Prozentpunkte dahinter, ist er „hinter der Zeit“. Die Abdeckung ist der Anteil der Vorgänge mit Schätzung: Bei wenig Abdeckung täuscht der Schätzungsbalken.',
    'col:risk': 'Offene Vorgänge nach Lage, jeder in seiner schwersten: übertragen, überfällig, blockiert, Stillstand oder alternd. Nur vorhandene Lagen werden gezeigt.',
    'col:throughput': 'Erledigte Vorgänge im aktuellen Wochenfenster und daneben im vorherigen Fenster.',
    'col:trend': 'Pro Sprint: Der volle Balken ist das Gelieferte; die Kontur ist das zu Sprintbeginn Zugesagte.',
    'col:data': 'Wann dieses Board zuletzt erfolgreich abgerufen wurde. Eine Warnung erscheint, wenn der letzte Datenabruf fehlschlug oder mehr als 26 Stunden zurückliegt.',

    'person:load': `Offene Stunden ÷ verbleibende Kapazität.\n\n${HOURS}\n\n${CAPACITY}\n\n${LOAD_STATES} Hat kein Vorgang eine Schätzung, ist die Zahl nur eine Vermutung und es erscheint „ohne Schätzung“.`,
    'person:delivered':
      'Im aktuellen Sprint erledigte Vorgänge, von wie vielen zu Beginn zugesagt wurden. Zusage und Lieferung zählen für die Person, die den Vorgang zu Beginn hatte; später hinzugekommene, bereits erledigte Vorgänge zählen auch. Ohne aktiven Sprint zählt, was in der Woche erledigt wurde.',
    'person:blocks': BLOCK,
    'person:past':
      'Geliefert pro abgeschlossenem Sprint, über die letzten 6 (voller Balken), mit dem Zugesagten als Kontur. Gestrichelte Linie: Die Person hatte in diesem Sprint keine Vorgänge. Der Pfeil ist der Unterschied der Lieferungen zwischen den letzten beiden.',

    'people:active':
      'Zeigt nur, wer etwas im aktuellen Sprint hat: offene Vorgänge, Lieferungen oder Zusagen (auf einem Board ohne Sprint: in der Woche). Wer nur Historie aus früheren Sprints oder nur Blockaden bei Vorgängen außerhalb des Sprints hat, wird ausgeblendet. Schalten Sie es aus, um das ganze Team zu sehen.',

    'week:status':
      'Jedes Signal hat eine Stufe. Unter Druck: Auslastung über der Kapazität, Blockade hoher Schwere oder überfälliger Vorgang. Braucht Aufmerksamkeit: Blockade mittlerer oder niedriger Schwere oder Vorgang im Stillstand (in Arbeit, seit mehr als einem Checkpoint ohne Statuswechsel). In Ordnung: kein Signal. In 7 Tagen fällig ist nur eine Information.',
    'week:in_progress': 'Offene Vorgänge der Person (Unteraufgaben eingeschlossen) in einem In-Arbeit-Status, von allen offenen.',
    'week:finished': 'Vorgänge der Person (Unteraufgaben eingeschlossen), die seit Montag dieser Woche erledigt wurden.',

    'history:completed':
      'Storys, Aufgaben und Bugs, die die Person im Zeitraum erledigt hat (Unteraufgaben zählen nicht). Der Median der Boards ist, was jede Person erledigt hat, in der Mitte der Verteilung.',
    'history:cycle': `Die Zahl ist das P85 vom Start (In-Arbeit-Status) bis zur Erledigung, für das, was die Person im Zeitraum erledigt hat. ${PERCENTILE}`,
    'history:lead': `Die Zahl ist das P85 von der Erstellung des Vorgangs bis zur Erledigung, für das, was die Person im Zeitraum erledigt hat. ${PERCENTILE}`,
    'history:unplanned': 'Vorgänge, die nach dem Start in die Sprints der Person kamen, summiert über die letzten Sprints.',

    'sprint:progress':
      'Erledigt ÷ Sprint-Vorgänge (Storys, Aufgaben und Bugs), nach Anzahl und nach Summe der Schätzungen. Die Abdeckung ist der Anteil der Vorgänge mit Schätzung.',
    'sprint:risk': 'Sprint-Vorgänge nach Risikolage, jeder in seiner schwersten: übertragen, überfällig, blockiert, Stillstand oder alternd; die ohne ausgelöste Regel sind im Plan.',
    'board:risk': 'Offene Vorgänge des Boards nach Risikolage, jeder in seiner schwersten: übertragen, überfällig, blockiert, Stillstand oder alternd. Auf einem Board ohne Sprint gilt es für die gesamte offene Arbeit, nicht nur für einen Sprint.',
    'commitment:committed': 'Vorgänge, die zu Beginn im Sprint waren (die am Checkpoint eingefrorene Zusage oder was beim Start darin war).',
    'commitment:delivered': 'Zugesagte Vorgänge, die erledigt sind (am Sprintende oder heute, wenn er nicht beendet ist). Die Lieferung zählt für die Person, die den Vorgang zu Beginn hatte.',
    'commitment:remaining': 'Zugesagte Vorgänge, die noch offen und noch im Sprint sind.',
    'commitment:removed': 'Zugesagte Vorgänge, die den Sprint vor dem Ende verlassen haben.',
    'commitment:added': 'Vorgänge, die nach dem Start hinzukamen und noch im Sprint sind, geliefert oder nicht.',
    'commitment:adherence': 'Geliefert ÷ zu Sprintbeginn zugesagt (Storys, Aufgaben und Bugs). Entfernte zählen als zugesagt; hinzugefügter Umfang bleibt außen vor, damit ein Sprint mit neuen Vorgängen nicht so aussieht, als hätte er sein Versprechen verfehlt.',
    'commitment:carryover': 'Übrig gebliebene zugesagte ÷ zugesagte Vorgänge, zum Zeitpunkt des Sprintabschlusses. Gibt es nur für abgeschlossene Sprints.',

    'flow:completed': 'Im gewählten Zeitraum und mit den gewählten Filtern erledigte Storys, Aufgaben und Bugs. Unteraufgaben zählen nicht.',
    'flow:lead': `Von der Erstellung des Vorgangs bis zur Erledigung. ${PERCENTILE}`,
    'flow:cycle': `Vom ersten Moment des Vorgangs in einem In-Arbeit-Status bis zur Erledigung. ${PERCENTILE}`,
    'flow:wip':
      'Mittelwert, Tag für Tag im Zeitraum, wie viele Vorgänge (Storys, Aufgaben und Bugs) in einem In-Arbeit-Status waren, über die Boards summiert.',
    'flow:efficiency':
      'Aktive Zeit ÷ Lead Time, über die erledigten Vorgänge summiert: wie viel der Gesamtzeit der Vorgang in aktiven Spalten verbrachte, ohne Warteschlange oder Blockade. Niedrige Effizienz bedeutet viel Wartezeit.',
    'flow:adherence': 'Median der Zusagetreue (geliefert ÷ zugesagt) der im Zeitraum abgeschlossenen Sprints.',
    'flow:carryover': 'Median der Übertragungsquote (übrig gebliebene zugesagte ÷ zugesagte) der im Zeitraum abgeschlossenen Sprints.',
    'flow:reopen':
      'Erledigte Vorgänge, die jemals wieder geöffnet wurden ÷ erledigte Vorgänge. Darunter, wie viele Wechsel in eine frühere Spalte es insgesamt gab.',

    'issue:lead': 'Von der Erstellung bis zur Erledigung. Gibt es erst, wenn der Vorgang erledigt ist.',
    'issue:cycle': 'Vom ersten Moment in einem In-Arbeit-Status bis zur Erledigung. Gibt es nur, wenn der Vorgang begonnen wurde.',
    'issue:queue': 'Von der Erstellung bis zum Start des Vorgangs (oder bis heute, wenn er noch nicht begonnen hat).',
    'issue:blocked': 'In Jira als Hindernis markierte Zeit plus Zeit in einem blockierenden Status, seit der Erstellung.',
    'issue:active': 'Zeit in aktiven Spalten (den In-Arbeit-Spalten des Boards oder den in den Einstellungen gewählten), abzüglich der als Hindernis markierten Zeit.',
    'issue:efficiency': 'Aktive Zeit ÷ Lead Time, höchstens 100%. Gibt es nur für erledigte Vorgänge.',
    'issue:backward': 'Wie oft der Vorgang in eine Spalte vor der aktuellen gewechselt ist, nach der Reihenfolge der Board-Spalten. Ein Zeichen für Nacharbeit.',
    'issue:reopened': 'Ja, wenn der Vorgang schon einmal in einer Erledigt-Kategorie war und in eine andere zurückgekehrt ist.',

    'epic:progress': 'Erledigt ÷ gesamt unter den direkten Kindern des Epics (Storys, Aufgaben und Bugs), nach Anzahl und nach Summe der Schätzungen.',
    'epic:risk': 'Offene Vorgänge des Epics, auf jeder Ebene, nach Risikolage: jeder in seiner schwersten.',
    'epic:estimate': 'Summe der Schätzungen der Vorgänge unter dem Epic, auf jeder Ebene: die Schätzung jedes Vorgangs oder, wenn er keine hat, die Summe dessen, was darunter liegt. In Punkten, wie das Schätzungsfeld von Jira.',

    'tree:done': 'Erledigt ÷ gesamt unter den direkten Kindern dieses Vorgangs, nach Anzahl und nach Summe der Schätzungen (wie beim Epic). Erscheint nur, wenn der Vorgang Kinder hat.',
    'tree:estimate': 'Die eigene Schätzung des Vorgangs oder, wenn er keine hat, die Summe der Schätzungen der Vorgänge darunter.',

    'changes:open': 'Sprint-Vorgänge, die zum jeweiligen Zeitpunkt offen waren: am gewählten Checkpoint und jetzt. Weniger ist besser.',
    'changes:done': 'Sprint-Vorgänge in einer Erledigt-Kategorie zum jeweiligen Zeitpunkt. Mehr ist besser.',
    'changes:risk': 'Offene Vorgänge, die zum jeweiligen Zeitpunkt eine Risikoregel auslösten. Weniger ist besser.',
    'changes:points': 'Summe der Schätzungen der offenen Vorgänge zum jeweiligen Zeitpunkt. Weniger ist besser.',

    'planning:adherence':
      'Vorgänge, bei denen das Zuordnungsmodell dieselbe Person vorhergesagt hat, die den Vorgang tatsächlich übernommen hat, ÷ verglichene Vorgänge. Misst, wie sehr die tatsächliche Zuweisung der ähnelt, die Kapazität und Affinität nahegelegt hatten.',

    'forecast:probability':
      'In wie vielen der 2.000 Simulationen die offenen Vorgänge innerhalb der bis zum Sprintende verbleibenden Arbeitstage fertig wurden. Jeder künftige Tag zieht den Durchsatz eines echten Arbeitstags aus den letzten 60 (nur Storys, Aufgaben und Bugs). Der Balken ist ab 85% grün, ab 50% gelb, darunter rot.',
    'forecast:percentiles':
      'In den Arbeitstagen, die die Simulationen brauchten: In 50% (oder 85% oder 95%) davon wurden die offenen Vorgänge bis zu diesem Datum fertig. Die 85% dienen üblicherweise als Zusage. Das Datum zählt nur Arbeitstage, ab heute.',

    'forecast:method':
      'Monte-Carlo-Simulation: Jeder künftige Tag zieht den Durchsatz eines echten Arbeitstags aus den letzten 60, 2.000-mal. Die Perzentile sagen, bis wann ein Anteil der Simulationen fertig wurde.',
    'forecast:low': 'Wenige Tage mit Lieferungen in der Stichprobe: als Hinweis nutzen, nicht als Zusage.',
    'sample:low': 'Weniger als fünf Vorgänge: als Hinweis nutzen, nicht als Schlussfolgerung.',

    'progress:coverage':
      'Die Abdeckung ist der Anteil der Vorgänge mit Schätzung. Bei wenig Abdeckung täuscht der Schätzungsbalken: Die Punkterechnung gilt nur für die Vorgänge, die welche haben.',
    freshness:
      'Die Seite liest die lokale Datenbank, nicht Jira live. Das Datum ist der letzte erfolgreiche Datenabruf dieses Boards; eine Warnung erscheint, wenn der letzte Datenabruf fehlschlug oder mehr als 26 Stunden zurückliegt.',

    'plan:hours':
      'Planung + Ausführung + Jira-Overhead. Planung und Ausführung summieren die Stunden jeder Unteraufgabe in Jira (die Quelle der Stunden wird in den Parametern gewählt; die Ausführung schließt das Code-Review ein). Der Jira-Overhead sind für jede Ausführungs-Unteraufgabe einer Aufgabe mit Code die Erfassungsstunden aus den Parametern.',
    'plan:baseline':
      'Arbeitstage bis zum Abschluss mit einer Person pro Rolle, ohne die Zuordnung zu optimieren: Planung + Ausführung unter Beachtung der Abhängigkeiten. Die Referenz, an der der Gewinn des Plans gemessen wird.',
    'plan:plan':
      'Arbeitstage des letzten gültigen Plans mit dem echten Team, erzeugt vom gewählten Algorithmus (Greedy, MILP oder CP-SAT). Der Gewinn ist die Differenz zum Basisplan; das Abzeichen zeigt, ob der Solver das Optimum bewiesen hat oder welche Lücke blieb.',
    'plan:team': 'Für dieses Epic ausgewählte Personen und die Kapazität in Stunden pro Woche: Personen × Stunden pro Woche aus den Parametern, jede einmal gezählt.',
    'plan:data': 'Aus Jira gelesene Aufgaben und Unteraufgaben des Epics. Fehler blockieren den Zeitplan; Warnungen informieren nur.',
    'plan:planning_hours': 'Summe der Stunden der Unteraufgaben der Planungsaufgaben: derjenigen mit dem in den Parametern festgelegten Planungslabel.',
    'plan:execution_hours': 'Summe der Stunden der Unteraufgaben der übrigen Aufgaben, einschließlich der Code-Reviews, die Ausführung sind wie die anderen.',
    'plan:overhead': 'Jira: für jede Ausführungs-Unteraufgabe einer Aufgabe mit Code die Erfassungsstunden aus den Parametern — Kosten des Epics, nicht einer Rolle. Code-Review: der Teil der Ausführung, der Prüfung ist, separat gezeigt.',
    'timeline:summary':
      'Die Vorgänge des Sprints (Epics, Gruppen und Unteraufgaben ausgenommen) nach Zustand: erledigt, in Arbeit, blockiert und nicht begonnen. Darunter, wie viele Vorgänge in jeder Risikolage sind. Ein Vorgang kann gleichzeitig überfällig und blockiert sein, daher ergeben diese Zahlen nicht die Summe.',
    'timeline:time':
      'Welcher Sprinttag heute ist, gezählt ab dem ersten Tag des Fensters. Der Balken zeigt, wie viel der Zeit vergangen ist: Vergleichen Sie ihn mit dem Fortschritt der Vorgänge, um zu sehen, ob der Sprint vorn oder hinten liegt.',
  },
};
