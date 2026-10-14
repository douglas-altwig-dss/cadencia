"""Visões de board: árvore, janelas da sprint, fluxo, previsão, alocação, painel, pessoas e
exportação, e os erros das suas rotas. Textos idênticos aos de antes (R8)."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "tree.no_epic": "Sem épico",
    "tree.out_of_scope": "{key} (fora do escopo coletado)",
    "progress.coverage": (
        "{unestimated} de {total} itens sem estimativa: o progresso por estimativa considera só os estimados."
    ),
    "timeline.no_start": "Sprint sem data de início no Jira: janelas indisponíveis até ela começar.",
    "timeline.no_end": "Sprint sem data de fim no Jira: assumida a duração configurada de {weeks} semanas.",
    "timeline.end_before_start": (
        "Sprint com data de fim anterior ao início no Jira: assumida a "
        "duração configurada de {weeks} semanas."
    ),
    "timeline.too_long": "Sprint com mais de três semanas: confira as datas no Jira.",
    "timeline.partial": "Janela {index} é parcial: {business_days} dias úteis ({days} dias corridos).",
    "cfd.todo": "A fazer",
    "cfd.doing": "Em andamento",
    "cfd.done": "Concluído",
    "no_owner": "Sem responsável",
    "no_space": "Sem espaço",
    "space_not_found": "O espaço {key} não existe.",
    "forecast.no_pace": "Nenhum item concluído no período de amostra: não há ritmo para projetar.",
    "forecast.beyond": "Parte das simulações passa de {days} dias úteis.",
    "forecast.epic_caveat": (
        "Usa o ritmo do board inteiro; se o épico divide o time com outras frentes, "
        "o prazo real tende a ser maior."
    ),
    "allocation.disclaimer": (
        "Alocação teórica por heurística gulosa: é uma linha de base para conversa, não uma verdade. "
        "Ignora conhecimento tácito, pareamento, mentoria e interrupções."
    ),
    "allocation.cycle": "Dependência circular de bloqueio envolvendo {key}.",
    "allocation.no_capacity": lambda count, keys: (
        f"{count} item(ns) sem capacidade disponível: {', '.join(keys)}."
    ),
    "flow.principle": (
        "Métrica individual sem contexto de complexidade e de trabalho não planejado mede a sorte da "
        "pessoa, não o trabalho dela. Por isso mostramos percentis com amostra, destacamos o não "
        "planejado e comparamos com a mediana dos boards — nunca uma lista ordenada de pessoas."
    ),
    "dashboard.no_sprint": "Nenhuma sprint ativa ou encerrada encontrada para este board.",
    "dashboard.failed": "falha ao calcular os indicadores",
    "not_found.epic": "O épico {key} não está neste board.",
    "not_found.item": "O item {key} não está neste board.",
    "not_found.view": "A visão {view_id} não existe.",
    "not_found.person": "Pessoa não encontrada.",
    "home.duplicate_tiles": "Dois tiles do painel têm o mesmo identificador.",
    "home.config_too_large": "As configurações do tile {tile} são grandes demais.",
    "export.unknown": "conjunto desconhecido",
    "export.use_one_of": "Use um de: {datasets}",
    "export.sprint_required": "sprint_id obrigatório",
    "export.sprint_or_board": "informe sprint_id ou board_id",
    "export.board_required": "board_id obrigatório",
}
