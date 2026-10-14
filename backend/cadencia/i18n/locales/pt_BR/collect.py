"""A coleta: o que ela grava quando um board para, e as respostas das rotas de configuração."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "no_board_selected": "nenhum board selecionado",
    "cancelled.message": "Coleta cancelada a pedido.",
    "cancelled.cause": "cancelada",
    "cancelled.action": "Rode de novo quando quiser; nada foi gravado pela metade.",
    "unexpected.cause": "erro inesperado",
    "unexpected.action": "Veja o log estruturado desta execução.",
    "jira_not_configured.cause": "Jira não configurado",
    "jira_not_configured.action": "Defina CADENCIA_JIRA_BASE_URL, CADENCIA_JIRA_EMAIL e "
    "CADENCIA_JIRA_API_TOKEN (variável de ambiente ou arquivo em /run/secrets).",
    "no_space": "Sem espaço",
    "board_not_found": "board não encontrado",
    "board_unknown": "O board {board} não existe ou ainda não foi descoberto.",
    "board_detail": "Board {board}.",
    "nothing_running": "nenhuma coleta em andamento",
    "already_running.cause": "coleta em andamento",
    "already_running.action": "Aguarde a coleta atual terminar.",
}
