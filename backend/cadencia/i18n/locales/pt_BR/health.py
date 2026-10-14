"""Saúde dos dados (RF-78): título e ação de cada verificação. Textos de antes (R8)."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "campos_ausentes.title": "Campos do Jira não encontrados",
    "campos_ausentes.action": "Informe o id do campo em Configuração → Campos.",
    "coleta_desatualizada.title": "Coleta desatualizada",
    "coleta_desatualizada.action": "Rode uma coleta na página Status; se ela falhar, a causa aparece lá.",
    "sem_estimativa.title": "Itens abertos sem estimativa",
    "sem_estimativa.action": (
        "Estime no Jira: sem isso o progresso em pontos e a capacidade ficam subestimados."
    ),
    "status_sem_coluna.title": "Status fora de qualquer coluna do board",
    "status_sem_coluna.action": (
        "Mapeie esses status numa coluna do board no Jira; fora dela o item some do WIP."
    ),
    "sprint_sem_datas.title": "Sprints sem data de início ou fim",
    "sprint_sem_datas.action": (
        "Preencha as datas da sprint no Jira; sem elas as janelas semanais são estimadas."
    ),
    "em_andamento_sem_responsavel.title": "Itens em andamento sem responsável",
    "em_andamento_sem_responsavel.action": (
        "Atribua um responsável no Jira: a alocação e a visão por pessoa não os enxergam."
    ),
    "fora_do_time.title": "Responsáveis que não estão no time do board",
    "fora_do_time.action": "Inclua a pessoa nos membros do board, ou confira se o item é mesmo deste time.",
    "historico_curto.title": "Pouco histórico concluído",
    "historico_curto.action": (
        "Envelhecimento e previsão ficam com baixa confiança até haver mais itens concluídos."
    ),
}
