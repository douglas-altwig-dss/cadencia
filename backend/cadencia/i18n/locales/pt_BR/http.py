"""Erros genéricos das dependências compartilhadas da API (api/deps.py)."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "invalid_name.cause": "nome inválido",
    "file_not_found.cause": "arquivo não encontrado",
    "board_not_found.cause": "board não encontrado",
    "board_not_found.message": "O board {board_id} não existe ou ainda não foi descoberto.",
    "sprint_not_found.cause": "sprint não encontrada",
    "sprint_not_found.message": "A sprint {sprint_id} não foi coletada.",
    "issue_not_found.cause": "item não encontrado",
    "issue_not_found.message": "O item {key} não foi coletado em nenhum board.",
    "invalid_date.cause": "data inválida",
    "invalid_date.message": "{value} não é uma data ISO.",
    "invalid_param.cause": "parâmetro inválido",
}
