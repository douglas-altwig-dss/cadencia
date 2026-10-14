import type { ReactNode } from 'react';

import { plural } from '../../plural';
import type { Messages } from '../en-US';

const HOURS =
  'A estimativa de cada item (pontos × horas por ponto do board; sem estimativa vale o padrão do board) somada para os itens abertos. Só histórias, tarefas e bugs contam: as subtarefas viajam com a história.';

const CAPACITY =
  'A capacidade que resta é: dias úteis de hoje até o fim da sprint (ou da semana, quando não há sprint ativa ou ela passou da data de fim) × horas por dia × fator de foco × dedicação, menos as ausências. Horas por dia e dedicação de cada pessoa se ajustam na aba Capacidade.';

const LOAD_STATES = 'Acima de 110% é “acima da capacidade”; abaixo de 80%, “com folga” (limites do board; estes são os padrões).';

const BLOCK =
  'Um bloqueio é um item aberto — subtarefas incluídas — sinalizado como impedimento no Jira, em status de bloqueio ou esperando outro item aberto por um link “é bloqueado por”.\n\nA gravidade vem do tempo parado: menos de 2 dias é baixa, até 5 é média, mais que isso é alta. Um item bloqueado e atrasado conta aqui mesmo que outra regra o mostre como atrasado.';

const PERCENTILE =
  'P50/P85/P95 são percentis por posição: “85% dos itens terminaram em até N dias”, sempre um valor que aconteceu de verdade, não uma média. n é o tamanho da amostra; abaixo de 5 é só um indício.';

export const shell: Messages['shell'] = {
  preferences: {
    title: 'Preferências de exibição',
    language: 'Idioma',
    theme: 'Tema',
    themeLight: 'Claro',
    themeDark: 'Escuro',
    themeSystem: 'Sistema',
    density: 'Densidade das tabelas',
    densityComfortable: 'Confortável',
    densityCompact: 'Compacta',
    chartPatterns: 'Padrões nos gráficos',
    chartPatternsHint: 'hachuras além da cor, para distinguir séries sem depender dela',
    reduceMotion: 'Reduzir animações',
    reduceMotionHint: 'o sistema operacional também é respeitado',
    shortcuts: 'Atalhos de teclado',
  },

  format: {
    dayUnit: 'd',
    days: (value: string) => `${value} d`,
    dayMonth: (day: string, month: string) => `${day}/${month}`,
  },

  app: {
    skipToContent: 'Pular para o conteúdo',
    openNavigation: 'Abrir navegação',
    expandMenu: 'Expandir o menu',
    collapseMenu: 'Recolher o menu',
    expandSidebar: 'Expandir o menu lateral',
    collapseSidebar: 'Recolher o menu lateral',
    brandHome: 'Cadência, ir para o painel',
    mainNavigation: 'Navegação principal',
    savedViews: 'Visões salvas',
    pressForShortcuts: (key: ReactNode): ReactNode[] => ['Pressione ', key, ' para ver os atalhos.'],
    notFoundTitle: 'Página não encontrada',
    notFoundBody: 'Use a navegação ao lado.',
    collectionDoneTitle: 'Coleta concluída',
    collectionDoneMessage: 'Os painéis foram recalculados com os dados novos.',
    collectionDoneAnnounce: 'Coleta concluída. Os painéis foram recalculados.',
  },

  pill: {
    collecting: 'Coletando…',
    collected: (when: string) => `Coletado ${when}`,
    neverCollected: 'Nunca coletado',
    openStatus: (label: string) => `${label}. Ver status da coleta`,
    tipCollecting: 'Uma coleta está em andamento.',
    tipOldest: (when: string) => `Coleta mais antiga entre os boards: ${when}`,
    tipOldestFailed: (when: string) => `Coleta mais antiga entre os boards: ${when}. Algum board falhou na última coleta.`,
    tipNever: 'Nenhum board foi coletado ainda.',
  },

  nav: {
    follow: 'Acompanhar',
    deliver: 'Entregar',
    system: 'Sistema',
    home: 'Painel',
    spaces: 'Espaços',
    boards: 'Boards',
    people: 'Pessoas',
    focusTimeline: 'Timeline de foco',
    presentation: 'Apresentação',
    collectionStatus: 'Status da coleta',
    settings: 'Configuração',
    myWeek: 'Minha semana',
    dataHygiene: 'Saúde dos dados',
    notifications: 'Notificações',
    gettingStarted: 'Primeiros passos',
    generations: 'Gerações',
    variables: 'Variáveis da apresentação',
  },

  api: {
    requestFailed: 'falha na requisição',
    unreachable: 'API inacessível',
    unreachableAction: 'Confira se o serviço da API está no ar (cadencia serve ou make up).',
    invalidRequest: 'requisição inválida',
    homeNotSaved: 'Painel não salvo',
  },

  common: {
    breadcrumbs: 'Caminho percorrido',
    collectedAt: (when: string) => `Dados coletados ${when}`,
    freshness: 'Frescor dos dados',
    lastFailedTitle: 'A última coleta deste board falhou',
    lastFailedBody: (error: string) => `${error} — os números abaixo são da última coleta bem-sucedida.`,
    openStatus: 'Abrir Status da coleta',
    staleTitle: 'Dados possivelmente desatualizados',
    staleBody: (when: string) => `A última coleta bem-sucedida foi ${when}.`,
    loadFailed: 'Não foi possível carregar',
    whatToDo: (action: string) => `O que fazer: ${action}`,
    loading: 'Carregando',
    openInJira: (key: string) => `Abrir ${key} no Jira`,
    none: 'nenhum',
    epic: 'épico',
    itemsDone: (pct: string) => `Itens concluídos: ${pct}`,
    sprintElapsed: (label: string, pct: number) => `${label}. Tempo da sprint passado: ${pct}%`,
    itemsCount: (done: number, total: number) => `${done}/${total} itens`,
    estimateDone: (pct: string) => `Estimativa concluída: ${pct}`,
    points: (done: string, total: string) => `${done}/${total} pts`,
    coverage: (pct: string) => `cobertura ${pct}`,
    coverageAbout: 'Cobertura',
    noSample: 'sem amostra',
    lowConfidence: 'baixa confiança',
    sampleConfidence: 'Confiança da amostra',
    howCalculated: (about: string) => `Como é calculado: ${about}`,
    moreInfo: 'Mais informações',
    cancel: 'Cancelar',
    undo: 'Desfazer',
    export: 'Exportar',
    csv: 'CSV (Excel)',
  },

  risk: {
    label: {
      arrastado: 'Arrastado',
      atrasado: 'Atrasado',
      bloqueado: 'Bloqueado',
      estagnado: 'Estagnado',
      envelhecendo: 'Envelhecendo',
      em_dia: 'Em dia',
    },
    counted: {
      arrastado: 'arrastado',
      atrasado: 'atrasado',
      bloqueado: 'bloqueado',
      estagnado: 'estagnado',
      envelhecendo: 'envelhecendo',
      em_dia: 'em dia',
    },
    short: {
      arrastado: 'arrast.',
      atrasado: 'atras.',
      bloqueado: 'bloq.',
      estagnado: 'estag.',
      envelhecendo: 'envelh.',
      em_dia: 'em dia',
    },
    noneAtRisk: 'nenhum item em risco',
    noRuleFired: 'Nenhuma regra de risco disparou para este item.',
    ruleApplied: (rule: string) => `Regra aplicada: ${rule}`,
    lastTransition: (from: string, to: string, at: string, author: string | null) =>
      `Última transição: ${from} → ${to} em ${at}${author ? ` por ${author}` : ''}`,
  },

  tree: {
    item: 'Item',
    type: 'Tipo',
    status: 'Status',
    assignee: 'Responsável',
    situation: 'Situação',
    doneRemaining: 'Concluído / restante',
    estimateRollup: 'Estimativa acumulada',
    collapse: (label: string) => `Recolher ${label}`,
    expand: (label: string) => `Expandir ${label}`,
  },

  description: {
    title: 'Descrição',
    showLess: 'Mostrar menos',
    showAll: 'Mostrar tudo',
    empty: 'Sem descrição no Jira.',
  },

  openInJira: {
    label: 'Abrir no Jira',
    tooltip: (n: number) => `Busca no Jira com ${plural(n, 'item', 'itens')}: key in (…)`,
  },

  shortcuts: {
    title: 'Atalhos de teclado',
    macNote: 'No Mac, Ctrl é ⌘.',
    scrollKey: 'rolagem',
    groups: {
      global: 'Em qualquer tela',
      focusTimeline: 'Timeline de foco',
      editor: 'Editor da apresentação',
      present: 'Modo de apresentação',
    },
    search: 'Buscar e ir para qualquer lugar',
    showShortcuts: 'Mostrar estes atalhos',
    closeWindows: 'Fechar janelas e menus',
    searchActivity: 'Buscar atividade ou troca',
    undo: 'Desfazer',
    redo: 'Refazer (também Ctrl+Y)',
    saveNow: 'Salvar agora (edições e mapeamento)',
    generate: 'Gerar apresentação',
    selectAll: 'Selecionar todas as formas',
    copy: 'Copiar',
    paste: 'Colar',
    duplicate: 'Duplicar',
    group: 'Agrupar',
    ungroup: 'Desagrupar',
    copyFormat: 'Copiar formato',
    pasteFormat: 'Colar formato na seleção',
    lock: 'Bloquear ou desbloquear a seleção',
    findReplace: 'Localizar e substituir',
    typeInShape: 'Escrever na forma selecionada (também F2)',
    deleteSelection: 'Excluir a seleção',
    nudge: 'Mover 1 mm (com Shift, 5 mm)',
    nextShape: 'Selecionar a próxima forma',
    zoom: 'Aproximar e afastar',
    editorFullscreen: 'Tela cheia do editor',
    nextSlide: 'Próximo slide (também espaço e Page Down)',
    previousSlide: 'Slide anterior',
    allSlides: 'Todos os slides',
    notes: 'Notas do apresentador',
    audience: 'Abrir a tela da plateia (duas telas)',
    timer: 'Pausar ou retomar o cronômetro',
    pen: 'Caneta: desenhar sobre o slide',
    laser: 'Laser: apontar no slide',
    clearInk: 'Apagar os traços do slide',
    evidence: 'Itens citados no slide (evidências)',
    questions: 'Perguntas da plateia',
    fullscreen: 'Tela cheia',
    dropTool: 'Largar a caneta ou o laser; de novo, sair',
  },

  palette: {
    kinds: {
      acao: 'ação',
      pagina: 'página',
      visao: 'visão salva',
      board: 'board',
      sprint: 'sprint',
      item: 'item',
      epico: 'épico',
      iniciativa: 'iniciativa',
      pessoa: 'pessoa',
      modelo: 'modelo',
      comando: 'nesta tela',
    },
    collectNow: 'Coletar agora',
    collectNowDetail: 'coleta incremental de todos os boards',
    collectionStarted: 'Coleta iniciada',
    collectionStartedMessage: 'Acompanhe em Status da coleta.',
    collectionNotStarted: 'Coleta não iniciada',
    showShortcuts: 'Mostrar atalhos de teclado',
    placeholder: 'Buscar board, sprint, item (CAD-14), pessoa, modelo ou ação…',
    search: 'Buscar',
    results: 'Resultados',
    searching: 'Buscando…',
    nothingFound: 'Nada encontrado.',
    choose: 'escolher',
    open: 'abrir',
  },

  header: {
    searchShortcut: 'Buscar (Ctrl+K)',
    searchPlaceholder: 'Buscar boards, sprints e itens…',
    searchShort: 'Buscar boards, sprints e itens',
    viewSaved: 'Visão salva',
    viewSavedPinned: 'Ela aparece no menu lateral.',
    viewSavedSearch: 'Ela aparece na busca (Ctrl+K).',
    deleteViewTitle: (name: string) => `Excluir a visão ${name}?`,
    deleteViewBody: 'Ela sai do menu e da busca (Ctrl+K).',
    deleteViewConfirm: 'Excluir visão',
    viewDeleted: (name: string) => `Visão ${name} excluída`,
    savedViews: 'Visões salvas',
    saveThisView: 'Salvar esta visão…',
    saveThisViewTitle: 'Salvar esta visão',
    saveThisViewBody: 'Guarda a tela atual com os filtros escolhidos:',
    name: 'Nome',
    namePlaceholder: 'ex.: Riscos do time Plataforma',
    pinToSidebar: 'Fixar no menu lateral',
    save: 'Salvar',
    noViews: 'Nenhuma visão salva. Use “Salvar esta visão” para guardar a tela atual com os filtros.',
    unpin: 'Desafixar do menu',
    pin: 'Fixar no menu',
    pinNamed: (name: string) => `Fixar ${name} no menu`,
    deleteNamed: (name: string) => `Excluir a visão ${name}`,
  },

  progress: {
    phases: {
      configuracao: 'lendo a configuração do board',
      itens: 'buscando os itens',
      historico: 'lendo o histórico dos itens',
      gravando: 'gravando e congelando checkpoints',
    },
    starting: 'começando',
    underAMinute: 'menos de 1 min',
    minutes: (n: number) => `~${n} min`,
    full: 'reconciliação completa',
    incremental: 'coleta incremental',
    region: 'Coleta em andamento',
    collecting: 'coletando',
    started: (mode: string, when: string) => `${mode} · começou ${when}`,
    cancelling: 'cancelando no próximo passo…',
    cancel: 'Cancelar',
    done: 'concluído',
    cancelled: 'cancelado',
    failed: 'falhou',
    boardProgress: (name: string) => `Progresso de ${name}`,
  },

  changes: {
    sections: {
      new_risks: { title: 'Novos riscos', hint: 'ficaram em situação pior do que estavam' },
      resolved: { title: 'Riscos resolvidos', hint: 'melhoraram ou foram concluídos' },
      completed: { title: 'Concluídos', hint: 'entraram numa categoria de concluído' },
      entered: { title: 'Entraram', hint: 'não estavam no escopo no início' },
      left: { title: 'Saíram', hint: 'estavam no escopo e não estão mais' },
      moved: { title: 'Mudaram de status', hint: '' },
      reassigned: { title: 'Mudaram de responsável', hint: '' },
      reopened: { title: 'Reabertos', hint: 'estavam concluídos e voltaram' },
    },
    same: 'igual',
    before: (delta: string, before: number) => `${delta} · antes ${before}`,
    open: 'Em aberto',
    done: 'Concluídos',
    atRisk: 'Em risco',
    openPoints: 'Pontos em aberto',
    nobody: 'ninguém',
    noCheckpointTitle: 'Ainda não há checkpoint congelado',
    seeStatus: 'Ver o status da coleta',
    noCheckpointBody:
      'O primeiro checkpoint é gravado no horário semanal do board, depois de uma coleta. A partir dele esta aba compara a semana.',
    since: 'Desde o checkpoint',
    until: 'Até',
    now: 'agora',
    sameWay: 'Os dois lados são lidos do mesmo jeito que os checkpoints são congelados.',
    nothingChanged: (from: string | null, to: string | null) =>
      `Nada mudou entre ${from ?? 'o início'} e ${to ?? 'agora'}.`,
  },

  forecast: {
    afterAYear: 'depois de 1 ano',
    businessDays: (n: number) => plural(n, 'dia útil', 'dias úteis'),
    unavailable: 'Previsão indisponível',
    title: 'Previsão de entrega',
    lowConfidence: 'baixa confiança',
    confidence: 'Confiança da previsão',
    remainingInJira: 'Restantes no Jira',
    nothingLeft: {
      sprint: 'Nada restante: a sprint está concluída.',
      board: 'Nada restante: o board está concluído.',
      epic: 'Nada restante: o épico está concluído.',
    },
    chance: (count: ReactNode, end: string | null): ReactNode[] => [
      'Chance de terminar os ',
      count,
      ` itens restantes até o fim da sprint${end ? ` (${end})` : ''}`,
    ],
    chanceAbout: 'chance de terminar a tempo',
    chanceLabel: (pct: string) => `Chance de terminar a tempo: ${pct}`,
    untilEnd: (n: number) => `${plural(n, 'dia útil', 'dias úteis')} até o fim.`,
    p50: '50% de chance até',
    p85: '85% de chance até',
    p95: '95% de chance até',
    sample: (delivered: number, days: number) =>
      `Amostra: ${plural(delivered, 'item concluído', 'itens concluídos')} em ${plural(days, 'dia útil', 'dias úteis')}.`,
  },

  flowCharts: {
    noData: 'Sem dados no período',
    seeStatus: 'Ver o status da coleta',
    noDataBody: 'Amplie o período nos filtros ou confira se a última coleta deste board terminou.',
    cfdLabel: (from: string, to: string, columns: string) => `Fluxo cumulativo de ${from} a ${to} por coluna: ${columns}`,
    noneDone: 'Nenhum item concluído no período',
    noneDoneBody: 'Amplie o período nos filtros: o gráfico precisa de itens que já terminaram para mostrar o tempo de ciclo.',
    scatterLabel: (n: number, p50: string, p85: string, p95: string) =>
      `Cycle time de ${plural(n, 'item concluído', 'itens concluídos')}; P50 ${p50} dias, P85 ${p85}, P95 ${p95}`,
    scatterTip: (days: string, date: string) => `${days} dias · concluído em ${date}`,
    days: 'dias',
    noneInProgress: 'Nenhum item em andamento',
    noneInProgressBody:
      'Nada nas colunas de andamento deste board agora. Se isso não bate com o Jira, confira as colunas em Configuração → Perfil do board.',
    agingLabel: (n: number, p85: string) => `${plural(n, 'item', 'itens')} em andamento por coluna; limite P85 histórico ${p85} dias`,
    agingTip: (days: string) => `${days} dias em andamento`,
    noSprints: 'Sem sprints para comparar',
    noSprintsBody: 'O comparativo aparece depois da primeira sprint encerrada com compromisso registrado.',
    cvdLabel: (rows: string) => `Comprometido versus entregue: ${rows}`,
    cvdRow: (sprint: string, delivered: number, committed: number, added: number) =>
      `${sprint} ${delivered} de ${committed}, ${added} adicionados`,
    committed: 'Comprometido no início',
    delivered: 'Entregue do compromisso',
    added: 'Escopo adicionado',
    cfdTitle: 'Fluxo cumulativo',
    cfdCaption: 'Itens por coluna, dia a dia: faixas que engordam mostram acúmulo.',
    cycleTitle: 'Cycle time',
    cycleCaption: 'Cada ponto é um item concluído; linhas tracejadas são os percentis 50, 85 e 95.',
    agingTitle: 'Envelhecimento do trabalho em andamento',
    agingCaption: 'Idade de cada item aberto por coluna; losangos passaram do P85 histórico do tipo.',
    cvdTitle: 'Comprometido × entregue',
    cvdCaption: 'Escopo que entrou depois do início aparece à parte, para não confundir compromisso com demanda nova.',
  },

  health: {
    severity: { erro: 'erro', aviso: 'aviso', info: 'informação' },
    andMore: (n: number) => ` e mais ${n}`,
    fixHere: 'Corrigir aqui',
    fixInJira: 'Corrigir no Jira',
    okTitle: 'Nada que distorça os números',
    okBody: 'Os boards acompanhados não têm erros nem avisos de higiene de dados.',
    problems: (n: number) => plural(n, 'ponto de atenção', 'pontos de atenção'),
    problemsBody: 'Nenhum destes impede a coleta, mas cada um deixa algum indicador menos confiável.',
    ok: 'ok',
    points: (n: number) => plural(n, 'ponto', 'pontos'),
    nothing: 'Nada a apontar.',
  },

  notifications: {
    kinds: { slack: 'Slack (webhook)', teams: 'Teams (webhook)', webhook: 'Webhook JSON', email: 'E-mail' },
    linksTitle: 'Links nas mensagens',
    linksBody: (variable: ReactNode): ReactNode[] => [
      'Defina ',
      variable,
      ' (o endereço em que as pessoas abrem a Cadência) para as mensagens trazerem um link direto para a apresentação ou o painel.',
    ],
    channels: 'Canais',
    addChannel: 'Adicionar canal',
    noChannels: 'Nenhum canal. Um webhook de entrada do Slack ou do Teams é o jeito mais simples de começar.',
    name: 'Nome',
    type: 'Tipo',
    target: 'Destino',
    events: 'Avisar sobre',
    enabled: 'Ativo',
    lastSent: 'Último envio',
    namePlaceholder: 'ex.: #time-produto',
    channelName: 'Nome do canal',
    channelType: 'Tipo do canal',
    emailPlaceholder: 'ana@empresa.com, bia@empresa.com',
    smtpMissing: 'SMTP não configurado (CADENCIA_SMTP_HOST)',
    channelEnabled: 'Canal ativo',
    delivered: 'entregue',
    failed: 'falhou',
    sendTest: 'Enviar uma mensagem de teste',
    saveFirst: 'Salve antes de testar',
    testChannel: 'Testar canal',
    testSent: 'Mensagem de teste enviada',
    testFailed: 'O teste falhou',
    checkChannel: 'Confira o canal.',
    removeChannel: 'Remover canal',
    notSaved: 'Canais não salvos',
    saved: 'Canais salvos',
    saveChannels: 'Salvar canais',
    digestTitle: 'Resumo de riscos',
    digestBody:
      'Uma mensagem por espaço com o que ficou estagnado, bloqueado ou atrasado desde o último checkpoint. Espaço sem novidade não recebe mensagem.',
    autoSend: 'Enviar o resumo automaticamente',
    days: 'Dias',
    hour: 'Hora',
    timezone: 'Fuso horário',
    scheduleSaved: 'Agendamento salvo',
    scheduleSavedMessage: 'O serviço de coleta aplica em até 5 minutos.',
    saveSchedule: 'Salvar agendamento',
    todayPreview: 'Prévia de hoje',
    newRisks: (space: string, n: number) => `${space}: ${plural(n, 'novo risco', 'novos riscos')}`,
    digestSent: 'Resumo enviado',
    nothingNew: 'Nada novo para enviar',
    nothingNewMessage: 'Nenhum espaço tem risco novo desde o último checkpoint.',
    sendNow: 'Enviar agora',
    goesTo: (event: string) => `vai para os canais marcados com “${event}”`,
  },

  riskTable: {
    noteTitle: 'Atraso é um sinal para investigar, não um veredito',
    noteBody:
      'Cada marcação descreve um fato do histórico do Jira e mostra a regra que a gerou. Clique em “evidência” para ver a última transição, a data e o autor.',
    situation: 'Situação',
    board: 'Board',
    person: 'Pessoa',
    all: 'Todas',
    type: 'Tipo',
    allTypes: 'Todos',
    emptyTitle: 'Nenhum item com esses filtros',
    clearFilters: 'Limpar os filtros',
    emptyBody: 'Os filtros de situação, pessoa e tipo ficam no endereço da página; limpe-os para ver tudo.',
    item: 'Item',
    column: 'Coluna',
    assignee: 'Responsável',
    whatHappened: 'O que aconteceu',
    due: 'Prazo',
    unassigned: 'Sem responsável',
    otherRules: (n: number) => `+${plural(n, 'outra regra', 'outras regras')}`,
    evidence: 'evidência',
  },

  schedule: {
    ownTime: 'Gerar em horário próprio',
    hour: 'Hora',
    minute: 'Minuto',
    timezone: 'Fuso',
    dataNow: 'Dados de agora',
    lastCheckpoint: 'Último checkpoint',
    audience: 'Público',
    allSlides: 'todos os slides',
    appliesSoon: 'O serviço de coleta registra o horário em até 5 minutos depois de salvar o mapeamento.',
    notify: 'Avisar os canais ao gerar sozinho',
    notifyHint: 'vai para os canais de notificação que pedem “apresentação gerada” (Configuração → Notificações)',
    emailSend: 'No e-mail, enviar',
    linkOnly: 'Só o link',
    attachPptx: 'Anexo .pptx',
    attachPdf: 'Anexo PDF',
    attachNote:
      'Slack e Teams recebem sempre o link. Arquivos acima de 20 MB, ou uma apresentação reprovada na validação, seguem só como link.',
  },

  statusPalette: {
    names: { concluido: 'Concluído', em_dia: 'Em dia', risco: 'Em risco', atrasado: 'Atrasado' },
    color: (name: string) => `Cor: ${name}`,
    label: (name: string) => `Rótulo: ${name}`,
    lowContrast: (ratio: string) =>
      `Contraste baixo: o texto mais legível sobre esta cor fica em ${ratio}:1 (o mínimo recomendado é 4,5:1).`,
    inherited: 'herdado da configuração comum',
  },

  windows: {
    state: { futura: 'futura', fechada: 'fechada no checkpoint', aberta: 'em andamento' },
    diff: {
      sprint: {
        completed: 'Entregues na janela',
        added: 'Entraram depois do início',
        removed: 'Saíram da sprint',
        unmoved: 'Sem nenhuma movimentação',
      },
      board: {
        completed: 'Entregues na janela',
        added: 'Entraram na fila',
        removed: 'Saíram da fila',
        unmoved: 'Sem nenhuma movimentação',
      },
    },
    title: 'Janelas semanais',
    week: (n: number) => `Semana ${n}`,
    partial: 'parcial',
    range: (start: string, end: string, days: number) => `${start} → ${end} · ${days} dias úteis`,
    notStarted: 'Ainda não começou.',
  },

  mosaic: {
    sizes: {
      P: { label: 'P', hint: 'Pequeno: um quarto da largura' },
      M: { label: 'M', hint: 'Médio: metade da largura' },
      G: { label: 'G', hint: 'Grande: a largura toda' },
    },
    groups: {
      indicadores: 'Indicadores dos boards',
      pessoas: 'Pessoas',
      acontecendo: 'O que está acontecendo',
      boards: 'Boards e sprints',
      sistema: 'Sistema',
    },
    tiles: {
      'kpi:risk': { label: 'Itens em risco', description: 'Quantos itens estão em risco agora, somando todos os boards.' },
      'kpi:throughput': { label: 'Vazão da janela', description: 'Itens concluídos na janela atual, contra a anterior.' },
      'kpi:progress': { label: 'Progresso médio', description: 'Itens concluídos ÷ itens da sprint, média entre boards (sem ponderar).' },
      'kpi:adherence': { label: 'Aderência ao compromisso', description: 'O que foi entregue do que se comprometeu, sprint a sprint.' },
      'sprint:scope': { label: 'Escopo adicionado', description: 'Itens que entraram nas sprints depois do início.' },
      'team:load': { label: 'Carga do time', description: 'Horas abertas contra a capacidade que resta na sprint.' },
      'team:overloaded': { label: 'Pessoas acima da capacidade', description: 'Quem tem mais horas abertas que capacidade, para conversar cedo.' },
      'team:blocks': { label: 'Bloqueios ativos', description: 'Quantos bloqueios há, com que gravidade e há quanto tempo.' },
      'team:delivered': { label: 'Entregas na sprint', description: 'O que o time entregou até agora, contra o comprometido.' },
      'pulse:recent': { label: 'Entregas recentes', description: 'Entregas por dia nos últimos 7 dias, contra os 7 anteriores.' },
      'pulse:feed': { label: 'Acontecendo agora', description: 'O que foi entregue, bloqueado ou entrou na sprint nas últimas 48 horas.' },
      'pulse:due': { label: 'Vencendo em 7 dias', description: 'Itens com prazo na próxima semana e os que já venceram.' },
      spaces: { label: 'Espaços', description: 'Uma linha por time: boards acompanhados, itens em risco, entregas da semana e progresso da sprint.' },
      boards: { label: 'Tabela de boards', description: 'Uma linha por board: progresso, risco, vazão, tendência e coleta.' },
      'saude:pontos': {
        label: 'Saúde dos dados',
        description: 'Pontos de atenção de higiene nos boards acompanhados: itens sem estimativa, pouco histórico concluído e afins.',
      },
    },
  },

  help: {
    'tile:kpi:risk':
      'Itens que ainda não foram concluídos e disparam ao menos uma regra de risco — arrastado de sprint anterior, prazo vencido, bloqueado, parado entre checkpoints ou envelhecido (em andamento além do P85 histórico do tipo) —, somados nos boards. Cada item conta uma vez, na situação mais grave. Sem sprint ativa, vale para todos os itens abertos do board.',
    'tile:kpi:throughput':
      'Itens concluídos — histórias, tarefas e bugs, sem subtarefas — na janela semanal atual da sprint, somados nos boards. “Concluído” é a categoria do status, não o nome. A seta compara com a janela anterior; a linha ao lado é outra medida: o entregue em cada sprint recente.',
    'tile:kpi:progress':
      'Média simples, entre os boards com sprint, de itens concluídos ÷ itens da sprint (histórias, tarefas e bugs). Não pondera pelo tamanho do board nem pela estimativa.',
    'tile:kpi:adherence':
      'Do que se comprometeu no início da sprint, quanto foi entregue: entregues ÷ comprometidos, somando os boards sprint a sprint. Só sprints encerradas; o que entrou depois do início fica de fora. A variação é em pontos percentuais contra a sprint anterior.',
    'tile:sprint:scope':
      'Itens (histórias, tarefas e bugs) que entraram na sprint depois do início e continuam nela, somados nos boards com sprint em curso. Os que já foram concluídos também contam.',
    'tile:team:load': `Soma das horas abertas ÷ soma da capacidade que resta, para as pessoas que têm capacidade no período.\n\n${HOURS}\n\n${CAPACITY}\n\n${LOAD_STATES}`,
    'tile:team:overloaded':
      'Pessoas cuja carga passa de 110% da capacidade que resta (a tolerância de 10% é a do board). É um sinal para conversar cedo, não uma avaliação: depende de as estimativas existirem e de a disponibilidade de cada um estar registrada.',
    'tile:team:blocks': BLOCK,
    'tile:team:delivered':
      'Entregues ÷ comprometidos na sprint, somando as pessoas: itens comprometidos no início que foram concluídos (a entrega fica com quem estava com o item no início), mais os que entraram depois e já foram concluídos. Em board sem sprint, conta o que foi concluído na semana.',
    'tile:pulse:recent':
      'Itens (histórias, tarefas e bugs) concluídos nos últimos 7 dias, somados nos boards; cada barra é um dia. A comparação é com os 7 dias anteriores.',
    'tile:pulse:feed':
      'O que aconteceu nas últimas 48 horas: item concluído, item que entrou em status de bloqueio ou foi sinalizado como impedimento, e item que entrou numa sprint depois do primeiro dia dela. Os mais recentes primeiro, até 30.',
    'tile:pulse:due':
      'Itens abertos (histórias, tarefas e bugs) com data limite nos próximos 7 dias. O número menor é o dos itens abertos cuja data limite já passou.',
    'tile:spaces':
      'Uma linha por espaço (time), sobre os boards acompanhados dele. Em risco: itens abertos em alguma situação de risco, cada um uma vez, na mais grave. Entregues: histórias, tarefas e bugs concluídos na janela semanal atual, contra a anterior. Progresso da sprint: concluídos ÷ itens nas sprints em andamento dos boards do espaço, somando itens em vez de fazer média dos boards; board sem sprint em andamento não conta.',
    'tile:boards': 'Uma linha por board acompanhado. Passe o mouse ou foque nos títulos das colunas para ver como cada uma é calculada.',
    'tile:saude:pontos':
      'Pontos de atenção de higiene de dados nos boards acompanhados — itens sem estimativa, pouco histórico concluído e afins. Nenhum impede a coleta, mas cada um deixa algum indicador menos confiável. O detalhe, por board, fica em Status da coleta → Saúde dos dados.',

    'col:space': 'O espaço do Jira a que o board pertence: o time.',
    'col:sprint': 'A sprint ativa (ou a mais recente) e a janela semanal em que ela está, entre as janelas que a sprint tem.',
    'col:progress':
      'Concluídos ÷ itens da sprint (histórias, tarefas e bugs), pela contagem e pela soma das estimativas. A marca vertical na barra de itens é quanto da sprint já passou: a barra atrás dela, com mais de 20 pontos percentuais de diferença, é “atrás do tempo”. A cobertura é a parte dos itens que tem estimativa: com pouca, a barra de estimativa engana.',
    'col:risk': 'Itens abertos por situação, cada um na mais grave: arrastado, atrasado, bloqueado, parado ou envelhecido. Só aparecem as situações que existem.',
    'col:throughput': 'Itens concluídos na janela semanal atual e, ao lado, na janela anterior.',
    'col:trend': 'Por sprint: barra cheia é o entregue; o contorno é o que estava comprometido no início da sprint.',
    'col:data': 'Quando este board foi coletado com sucesso pela última vez. Aparece um alerta se a última coleta falhou ou se passou de 26 horas.',

    'person:load': `Horas abertas ÷ capacidade que resta.\n\n${HOURS}\n\n${CAPACITY}\n\n${LOAD_STATES} Se nenhum item tem estimativa, o número é só um palpite e aparece “sem estimativa”.`,
    'person:delivered':
      'Itens concluídos na sprint atual, de quantos foram comprometidos no início. Compromisso e entrega ficam com quem tinha o item no início; itens que entraram depois e já foram concluídos também contam. Sem sprint ativa, conta o que foi concluído na semana.',
    'person:blocks': BLOCK,
    'person:past':
      'Entregues por sprint encerrada, nas últimas 6 (barra cheia), com o comprometido como contorno. Traço tracejado: a pessoa não teve itens naquela sprint. A seta é a diferença de entregues entre as duas últimas.',

    'people:active':
      'Mostra só quem tem algo na sprint atual: itens abertos, entregas ou compromisso (num board sem sprint, na semana). Quem só tem histórico de sprints passadas, ou só bloqueios de itens fora da sprint, fica escondido. Desligue para ver o time todo.',

    'week:status':
      'Cada sinal tem um nível. Com dificuldades: há carga acima da capacidade, bloqueio de gravidade alta ou item atrasado. Pede atenção: há bloqueio de gravidade média ou baixa, ou item parado (em andamento, sem mudar de status há mais de um checkpoint). Em ordem: nenhum sinal. Vencer em 7 dias é só informação.',
    'week:in_progress': 'Itens abertos da pessoa (subtarefas incluídas) que estão em status de andamento, do total de abertos.',
    'week:finished': 'Itens da pessoa (subtarefas incluídas) concluídos desde segunda-feira desta semana.',

    'history:completed':
      'Histórias, tarefas e bugs concluídos pela pessoa no período (subtarefas não contam). A mediana dos boards é o que cada pessoa concluiu, no meio da distribuição.',
    'history:cycle': `O número é o P85 do início (status de andamento) à conclusão, para o que a pessoa concluiu no período. ${PERCENTILE}`,
    'history:lead': `O número é o P85 da criação do item à conclusão, para o que a pessoa concluiu no período. ${PERCENTILE}`,
    'history:unplanned': 'Itens que entraram nas sprints da pessoa depois do início, somados nas últimas sprints.',

    'space:risk': 'Itens abertos dos boards acompanhados do espaço por situação de risco, cada um na mais grave: carregado, atrasado, bloqueado, parado ou envelhecendo. Somados entre os boards.',
    'space:delivered':
      'Histórias, tarefas e bugs concluídos na janela semanal atual nos boards acompanhados do espaço e, ao lado, quantos na janela anterior. Subtarefas não contam.',
    'space:progress':
      'Concluídos ÷ itens nas sprints em andamento dos boards do espaço (histórias, tarefas e bugs), somando os itens de todos os boards em vez de fazer média dos boards, então um board grande pesa mais. Board sem sprint em andamento fica de fora.',
    'sprint:progress':
      'Concluídos ÷ itens da sprint (histórias, tarefas e bugs), pela contagem e pela soma das estimativas. A cobertura é a parte dos itens que tem estimativa.',
    'sprint:risk': 'Itens da sprint por situação de risco, cada um na mais grave: arrastado, atrasado, bloqueado, parado ou envelhecido; os que não disparam regra ficam em dia.',
    'board:risk': 'Itens abertos do board por situação de risco, cada um na mais grave: arrastado, atrasado, bloqueado, parado ou envelhecido. Num board sem sprint, vale para todo o trabalho aberto, não só para uma sprint.',
    'commitment:committed': 'Itens que estavam na sprint no início (o compromisso congelado no checkpoint, ou o que estava nela quando começou).',
    'commitment:delivered': 'Comprometidos que estão concluídos (ao fim da sprint, ou hoje se ela não terminou). A entrega fica com quem tinha o item no início.',
    'commitment:remaining': 'Comprometidos que continuam abertos e ainda estão na sprint.',
    'commitment:removed': 'Comprometidos que saíram da sprint antes do fim.',
    'commitment:added': 'Itens que entraram depois do início e ainda estão na sprint, entregues ou não.',
    'commitment:adherence': 'Entregues ÷ comprometidos no início da sprint (histórias, tarefas e bugs). Os removidos contam como comprometidos; o escopo adicionado fica de fora, para uma sprint que recebeu itens novos não parecer ter falhado no que prometeu.',
    'commitment:carryover': 'Comprometidos que sobraram ÷ comprometidos, no momento em que a sprint foi encerrada. Só existe para sprint encerrada.',

    'flow:completed': 'Histórias, tarefas e bugs concluídos no período e nos filtros escolhidos. Subtarefas não contam.',
    'flow:lead': `Da criação do item até a conclusão. ${PERCENTILE}`,
    'flow:cycle': `Do primeiro momento do item em status de andamento até a conclusão. ${PERCENTILE}`,
    'flow:wip':
      'Média, dia a dia no período, de quantos itens (histórias, tarefas e bugs) estavam em status de andamento, somando os boards.',
    'flow:efficiency':
      'Tempo ativo ÷ lead time, somados nos itens concluídos: quanto do tempo total o item passou em colunas ativas, sem fila nem bloqueio. Baixa eficiência quer dizer muito tempo esperando.',
    'flow:adherence': 'Mediana da aderência (entregues ÷ comprometidos) das sprints encerradas no período.',
    'flow:carryover': 'Mediana da taxa de arrasto (comprometidos que sobraram ÷ comprometidos) das sprints encerradas no período.',
    'flow:reopen':
      'Itens concluídos que já foram reabertos alguma vez ÷ itens concluídos. Abaixo, quantas mudanças para uma coluna anterior houve no total.',

    'boards:progress':
      'Concluídos ÷ itens da sprint em andamento (histórias, tarefas e bugs; subtarefas e épicos ficam de fora), pela contagem. A marca vertical é quanto do tempo da sprint já passou, para ler a barra contra ela.',
    'boards:delivered':
      'Histórias, tarefas e bugs concluídos na janela semanal atual — a semana do calendário num board sem sprint em andamento — e, ao lado, quantos na janela anterior.',
    'boards:trend':
      'Itens entregues em cada um dos últimos períodos, do mais antigo à esquerda: por sprint (as quatro últimas encerradas e a em andamento) quando há sprint em andamento; senão, por janela semanal (as quatro últimas).',

    'issue:lead': 'Da criação até a conclusão. Só existe depois de o item concluir.',
    'issue:cycle': 'Do primeiro momento em status de andamento até a conclusão. Só existe se o item chegou a começar.',
    'issue:queue': 'Da criação até o item começar (ou até hoje, se ainda não começou).',
    'issue:blocked': 'Tempo sinalizado como impedimento no Jira somado ao tempo em status de bloqueio, desde a criação.',
    'issue:active': 'Tempo em colunas ativas (as de andamento do board, ou as escolhidas nas configurações), menos o tempo sinalizado como impedimento.',
    'issue:efficiency': 'Tempo ativo ÷ lead time, no máximo 100%. Só existe para item concluído.',
    'issue:backward': 'Quantas vezes o item foi para uma coluna anterior à que estava, pela ordem das colunas do board. Sinal de retrabalho.',
    'issue:reopened': 'Sim se o item já esteve numa categoria de concluído e voltou para uma que não é.',

    'epic:progress': 'Concluídos ÷ total entre os filhos diretos do épico (histórias, tarefas e bugs), pela contagem e pela soma das estimativas.',
    'epic:risk': 'Itens abertos do épico, em qualquer nível, por situação de risco: cada um na mais grave.',
    'epic:estimate': 'Soma das estimativas dos itens abaixo do épico, em qualquer nível: a estimativa de cada item ou, quando ele não tem uma, a soma do que está abaixo dele. Em pontos, como o campo de estimativa do Jira.',

    'tree:done': 'Concluídos ÷ total entre os filhos diretos deste item, pela contagem e pela soma das estimativas (como no épico). Só aparece quando o item tem filhos.',
    'tree:estimate': 'A estimativa do próprio item ou, quando ele não tem uma, a soma das estimativas dos itens abaixo dele.',

    'changes:open': 'Itens da sprint que estavam abertos em cada momento: no checkpoint escolhido e agora. Menos é melhor.',
    'changes:done': 'Itens da sprint em categoria de concluído em cada momento. Mais é melhor.',
    'changes:risk': 'Itens abertos que disparavam alguma regra de risco em cada momento. Menos é melhor.',
    'changes:points': 'Soma das estimativas dos itens abertos em cada momento. Menos é melhor.',

    'planning:adherence':
      'Itens em que o modelo de alocação previu a mesma pessoa que de fato ficou com o item, ÷ itens comparados. Mede quanto a atribuição real se parece com a que a capacidade e a afinidade sugeriam.',

    'forecast:probability':
      'Em quantas das 2.000 simulações os itens restantes terminaram dentro dos dias úteis que faltam até o fim da sprint. Cada dia futuro sorteia a vazão de um dia útil real entre os últimos 60 (só histórias, tarefas e bugs). A barra fica verde a partir de 85%, amarela a partir de 50%, vermelha abaixo.',
    'forecast:percentiles':
      'Nos dias úteis de que as simulações precisaram: em 50% (ou 85%, ou 95%) delas os itens restantes terminaram até essa data. O 85% é o que costuma servir de compromisso. A data conta só dias úteis, a partir de hoje.',

    'forecast:method':
      'Simulação de Monte Carlo: cada dia futuro sorteia a vazão de um dia útil real dos últimos 60, 2.000 vezes. Os percentis dizem até quando uma fração das simulações terminou.',
    'forecast:low': 'Poucos dias com entrega na amostra: use como indício, não como compromisso.',
    'sample:low': 'Menos de cinco itens: use como indício, não como conclusão.',

    'progress:coverage':
      'A cobertura é a parte dos itens que tem estimativa. Com pouca, a barra de estimativa engana: a conta de pontos vale só para os itens que os têm.',
    freshness:
      'A tela lê o banco local, não o Jira ao vivo. A data é da última coleta bem-sucedida deste board; um alerta aparece se a última coleta falhou ou se passou de 26 horas.',

    'plan:hours':
      'Planejamento + execução + overhead de Jira. Planejamento e execução somam as horas de cada subtarefa no Jira (a fonte das horas é escolhida nos parâmetros; a execução inclui o code review). O overhead de Jira é, para cada subtarefa de execução de uma tarefa com código, as horas de cadastro dos parâmetros.',
    'plan:baseline':
      'Dias úteis até concluir com uma pessoa por papel, sem otimizar a alocação: planejamento + execução, respeitando as dependências. É a referência para medir o ganho do plano.',
    'plan:plan':
      'Dias úteis do último plano válido, com a equipe real, gerado pelo algoritmo escolhido (guloso, MILP ou CP-SAT). O ganho é a diferença para o cronograma base; o selo diz se o solver provou o ótimo ou qual o gap que sobrou.',
    'plan:team': 'Pessoas selecionadas para este épico, e a capacidade em horas por semana: pessoas × horas por semana dos parâmetros, cada uma contada uma vez.',
    'plan:data': 'Tarefas e subtarefas do épico lidas do Jira. Erros bloqueiam o cronograma; avisos só informam.',
    'plan:planning_hours': 'Soma das horas das subtarefas das tarefas de planejamento: as que levam o rótulo de planejamento definido nos parâmetros.',
    'plan:execution_hours': 'Soma das horas das subtarefas das demais tarefas, incluindo as de code review, que são execução como as outras.',
    'plan:overhead': 'Jira: para cada subtarefa de execução de uma tarefa com código, as horas de cadastro dos parâmetros — custo do épico, não de um papel. Code review: a parte da execução que é revisão, mostrada à parte.',
    'timeline:summary':
      'Os itens da sprint (épicos, grupos e subtarefas ficam de fora) por situação: concluído, em andamento, bloqueado e não iniciado. Abaixo, quantos itens estão em cada situação de risco. Um item pode estar atrasado e bloqueado ao mesmo tempo, então esses números não somam o total.',
    'timeline:time':
      'Em qual dia da sprint estamos, contando do primeiro dia da janela. A barra mostra quanto do tempo já passou: compare com o avanço dos itens para ver se a sprint está adiantada ou atrasada.',
  },
};
