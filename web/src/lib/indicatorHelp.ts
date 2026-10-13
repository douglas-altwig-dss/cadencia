/**
 * How each indicator is calculated, in the words the "i" beside it shows.
 *
 * They live here, not next to each number, so the wording is written once, reads as one voice, and a
 * test can check that no indicator on the Home page was added without one. Each states the rule the
 * code follows — what counts, over what, and the thresholds — so a number can be argued with.
 */

const HOURS =
  'A estimativa de cada item (pontos × horas por ponto do board; sem estimativa vale o padrão do board) somada para os itens abertos. Só histórias, tarefas e bugs contam: as subtarefas viajam com a história.';

const CAPACITY =
  'A capacidade que resta é: dias úteis de hoje até o fim da sprint (ou da semana, quando não há sprint ativa ou ela passou da data de fim) × horas por dia × fator de foco × dedicação, menos as ausências. Horas por dia e dedicação de cada pessoa se ajustam na aba Capacidade.';

const LOAD_STATES = 'Acima de 110% é “acima da capacidade”; abaixo de 80%, “com folga” (limites do board; estes são os padrões).';

const BLOCK =
  'Um bloqueio é um item aberto — subtarefas incluídas — sinalizado como impedimento no Jira, em status de bloqueio ou esperando outro item aberto por um link “é bloqueado por”.\n\nA gravidade vem do tempo parado: menos de 2 dias é baixa, até 5 é média, mais que isso é alta. Um item bloqueado e atrasado conta aqui mesmo que outra regra o mostre como atrasado.';

const PERCENTILE =
  'P50/P85/P95 são percentis por posição: “85% dos itens terminaram em até N dias”, sempre um valor que aconteceu de verdade, não uma média. n é o tamanho da amostra; abaixo de 5 é só um indício.';

export const HELP = {
  // ---- Home tiles (keyed `tile:<type>`, one per entry of the catalogue)
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
  'tile:sprint:elapsed':
    'Tempo: (hoje − início) ÷ (fim − início) da sprint. Itens: concluídos ÷ itens da sprint. “Atrás do tempo” aparece quando os itens concluídos estão mais de 20 pontos percentuais abaixo do tempo que já passou.',
  'tile:kanban:boards':
    'Um board kanban não tem sprint, então aparece aqui em vez de em "Sprint em curso": a janela é a semana de calendário (checkpoint a checkpoint), não um início e fim de sprint. "Na semana" é o que foi concluído na janela atual (histórias, tarefas e bugs); a seta compara com a semana anterior. "Em risco" soma os itens abertos do board em qualquer situação de risco — arrastado, atrasado, bloqueado, parado ou envelhecido.',
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
  'tile:boards': 'Uma linha por board acompanhado. Passe o mouse ou foque nos títulos das colunas para ver como cada uma é calculada.',
  'tile:saude:pontos':
    'Pontos de atenção de higiene de dados nos boards acompanhados — itens sem estimativa, pouco histórico concluído e afins. Nenhum impede a coleta, mas cada um deixa algum indicador menos confiável. O detalhe, por board, fica em Status da coleta → Saúde dos dados.',

  // ---- the boards table's columns
  'col:space': 'O espaço do Jira a que o board pertence: o time.',
  'col:sprint': 'A sprint ativa (ou a mais recente) e a janela semanal em que ela está, entre as janelas que a sprint tem.',
  'col:progress':
    'Concluídos ÷ itens da sprint (histórias, tarefas e bugs), pela contagem e pela soma das estimativas. A marca vertical na barra de itens é quanto da sprint já passou: a barra atrás dela, com mais de 20 pontos percentuais de diferença, é “atrás do tempo”. A cobertura é a parte dos itens que tem estimativa: com pouca, a barra de estimativa engana.',
  'col:risk': 'Itens abertos por situação, cada um na mais grave: arrastado, atrasado, bloqueado, parado ou envelhecido. Só aparecem as situações que existem.',
  'col:throughput': 'Itens concluídos na janela semanal atual e, ao lado, na janela anterior.',
  'col:trend': 'Por sprint: barra cheia é o entregue; o contorno é o que estava comprometido no início da sprint.',
  'col:data': 'Quando este board foi coletado com sucesso pela última vez. Aparece um alerta se a última coleta falhou ou se passou de 26 horas.',

  // ---- a person's card and summary
  'person:load': `Horas abertas ÷ capacidade que resta.\n\n${HOURS}\n\n${CAPACITY}\n\n${LOAD_STATES} Se nenhum item tem estimativa, o número é só um palpite e aparece “sem estimativa”.`,
  'person:delivered':
    'Itens concluídos na sprint atual, de quantos foram comprometidos no início. Compromisso e entrega ficam com quem tinha o item no início; itens que entraram depois e já foram concluídos também contam. Sem sprint ativa, conta o que foi concluído na semana.',
  'person:blocks': BLOCK,
  'person:past':
    'Entregues por sprint encerrada, nas últimas 6 (barra cheia), com o comprometido como contorno. Traço tracejado: a pessoa não teve itens naquela sprint. A seta é a diferença de entregues entre as duas últimas.',

  // ---- the People page's filter
  'people:active':
    'Mostra só quem tem algo na sprint atual: itens abertos, entregas ou compromisso (num board sem sprint, na semana). Quem só tem histórico de sprints passadas, ou só bloqueios de itens fora da sprint, fica escondido. Desligue para ver o time todo.',

  // ---- a person's week
  'week:status':
    'Cada sinal tem um nível. Com dificuldades: há carga acima da capacidade, bloqueio de gravidade alta ou item atrasado. Pede atenção: há bloqueio de gravidade média ou baixa, ou item parado (em andamento, sem mudar de status há mais de um checkpoint). Em ordem: nenhum sinal. Vencer em 7 dias é só informação.',
  'week:in_progress': 'Itens abertos da pessoa (subtarefas incluídas) que estão em status de andamento, do total de abertos.',
  'week:finished': 'Itens da pessoa (subtarefas incluídas) concluídos desde segunda-feira desta semana.',

  // ---- a person's history
  'history:completed':
    'Histórias, tarefas e bugs concluídos pela pessoa no período (subtarefas não contam). A mediana dos boards é o que cada pessoa concluiu, no meio da distribuição.',
  'history:cycle': `O número é o P85 do início (status de andamento) à conclusão, para o que a pessoa concluiu no período. ${PERCENTILE}`,
  'history:lead': `O número é o P85 da criação do item à conclusão, para o que a pessoa concluiu no período. ${PERCENTILE}`,
  'history:unplanned': 'Itens que entraram nas sprints da pessoa depois do início, somados nas últimas sprints.',

  // ---- a sprint
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

  // ---- flow
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

  // ---- an issue
  'issue:lead': 'Da criação até a conclusão. Só existe depois de o item concluir.',
  'issue:cycle': 'Do primeiro momento em status de andamento até a conclusão. Só existe se o item chegou a começar.',
  'issue:queue': 'Da criação até o item começar (ou até hoje, se ainda não começou).',
  'issue:blocked': 'Tempo sinalizado como impedimento no Jira somado ao tempo em status de bloqueio, desde a criação.',
  'issue:active': 'Tempo em colunas ativas (as de andamento do board, ou as escolhidas nas configurações), menos o tempo sinalizado como impedimento.',
  'issue:efficiency': 'Tempo ativo ÷ lead time, no máximo 100%. Só existe para item concluído.',
  'issue:backward': 'Quantas vezes o item foi para uma coluna anterior à que estava, pela ordem das colunas do board. Sinal de retrabalho.',
  'issue:reopened': 'Sim se o item já esteve numa categoria de concluído e voltou para uma que não é.',

  // ---- an epic
  'epic:progress': 'Concluídos ÷ total entre os filhos diretos do épico (histórias, tarefas e bugs), pela contagem e pela soma das estimativas.',
  'epic:risk': 'Itens abertos do épico, em qualquer nível, por situação de risco: cada um na mais grave.',
  'epic:estimate': 'Soma das estimativas dos itens abaixo do épico, em qualquer nível: a estimativa de cada item ou, quando ele não tem uma, a soma do que está abaixo dele. Em pontos, como o campo de estimativa do Jira.',

  // ---- the rows of a work tree (TreeTable)
  'tree:done': 'Concluídos ÷ total entre os filhos diretos deste item, pela contagem e pela soma das estimativas (como no épico). Só aparece quando o item tem filhos.',
  'tree:estimate': 'A estimativa do próprio item ou, quando ele não tem uma, a soma das estimativas dos itens abaixo dele.',

  // ---- what changed since a checkpoint
  'changes:open': 'Itens da sprint que estavam abertos em cada momento: no checkpoint escolhido e agora. Menos é melhor.',
  'changes:done': 'Itens da sprint em categoria de concluído em cada momento. Mais é melhor.',
  'changes:risk': 'Itens abertos que disparavam alguma regra de risco em cada momento. Menos é melhor.',
  'changes:points': 'Soma das estimativas dos itens abertos em cada momento. Menos é melhor.',

  // ---- planning a sprint
  'planning:adherence':
    'Itens em que o modelo de alocação previu a mesma pessoa que de fato ficou com o item, ÷ itens comparados. Mede quanto a atribuição real se parece com a que a capacidade e a afinidade sugeriam.',

  // ---- forecast
  'forecast:probability':
    'Em quantas das 2.000 simulações os itens restantes terminaram dentro dos dias úteis que faltam até o fim da sprint. Cada dia futuro sorteia a vazão de um dia útil real entre os últimos 60 (só histórias, tarefas e bugs). A barra fica verde a partir de 85%, amarela a partir de 50%, vermelha abaixo.',
  'forecast:percentiles':
    'Nos dias úteis de que as simulações precisaram: em 50% (ou 85%, ou 95%) delas os itens restantes terminaram até essa data. O 85% é o que costuma servir de compromisso. A data conta só dias úteis, a partir de hoje.',

  'forecast:method':
    'Simulação de Monte Carlo: cada dia futuro sorteia a vazão de um dia útil real dos últimos 60, 2.000 vezes. Os percentis dizem até quando uma fração das simulações terminou.',
  'forecast:low': 'Poucos dias com entrega na amostra: use como indício, não como compromisso.',
  'sample:low': 'Menos de cinco itens: use como indício, não como conclusão.',

  // ---- the data behind a number
  'progress:coverage':
    'A cobertura é a parte dos itens que tem estimativa. Com pouca, a barra de estimativa engana: a conta de pontos vale só para os itens que os têm.',
  'freshness':
    'A tela lê o banco local, não o Jira ao vivo. A data é da última coleta bem-sucedida deste board; um alerta aparece se a última coleta falhou ou se passou de 26 horas.',

  // ---- epic plan
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
  // ---- timeline da sprint
  'timeline:summary':
    'Os itens da sprint (épicos, grupos e subtarefas ficam de fora) por situação: concluído, em andamento, bloqueado e não iniciado. Abaixo, quantos itens estão em cada situação de risco. Um item pode estar atrasado e bloqueado ao mesmo tempo, então esses números não somam o total.',
  'timeline:time':
    'Em qual dia da sprint estamos, contando do primeiro dia da janela. A barra mostra quanto do tempo já passou: compare com o avanço dos itens para ver se a sprint está adiantada ou atrasada.',
} as const;

export type HelpKey = keyof typeof HELP;

/** The help for a Home tile of this type. */
export const tileHelp = (type: string): string | undefined => (HELP as Record<string, string>)[`tile:${type}`];
