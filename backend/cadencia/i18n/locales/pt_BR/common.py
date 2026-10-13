"""Textos genéricos: causas de erro, corpos 401/404/400/500 da API, fim de listas."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "not_found": "{subject} não encontrado.",
    "error.not_found": "não encontrado",
    "error.invalid": "requisição inválida",
    "error.internal.cause": "erro interno",
    "error.internal.message": "{error} em {path}",
    "error.internal.action": "Veja o log da API para o rastreamento completo.",
    "auth.cause": "credencial ausente ou inválida",
    "auth.message": "A API exige o token definido em CADENCIA_API_TOKEN.",
    "auth.action": "Acesse pela interface web (que entra com usuário e senha) ou envie "
    "Authorization: Bearer <token>.",
    "listing.more": "{shown} e mais {more}",
}
