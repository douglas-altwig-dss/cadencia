"""Por que o rascunho de narrativa por IA (report/narrative.py) não saiu. O prompt não está aqui:
ele pede o idioma do deck e fica como está."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "disabled": "A sugestão por IA está desligada (CADENCIA_AI_ENABLED).",
    "package_missing": "O pacote anthropic não está instalado no backend.",
    "key_refused": "A chave da API da Anthropic foi recusada.",
    "rate_limited": "Limite de uso da API atingido; tente de novo em instantes.",
    "status_error": "A API respondeu com erro {status}.",
    "unreachable": "Não foi possível falar com a API da Anthropic.",
    "refused": "A IA recusou escrever este texto; escreva-o à mão.",
    "empty": "A IA não devolveu texto.",
}
