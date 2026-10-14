"""Configurações salvas no app (docs/config-store.md): recusas e as respostas do teste de conexão."""

from __future__ import annotations

from cadencia.i18n.render import Entry


def _missing(fields: list[str]) -> str:
    return "Preencha antes de testar: " + ", ".join(fields) + "."


MESSAGES: dict[str, Entry] = {
    "error.unknown": "{key} não é uma configuração.",
    "error.bootstrap": (
        "{key} só pode ser definida no ambiente: ela é necessária antes de o banco ser acessado."
    ),
    "error.int": "{key} deve ser um número inteiro de {min} a {max}.",
    "error.float": "{key} deve ser um número de {min} a {max}.",
    "error.weekday": "{key} deve ser um dia da semana de 0 (segunda) a 6 (domingo).",
    "error.hour": "{key} deve ser uma hora de 0 a 23.",
    "error.bool": "{key} deve ser verdadeiro ou falso.",
    "error.string": "{key} deve ser um texto.",
    "error.url": "{key} deve ser um endereço http ou https, como https://empresa.atlassian.net.",
    "error.email": "{key} deve ser um endereço de e-mail.",
    "error.timezone": "{value} não é um fuso horário conhecido; use um nome como America/Sao_Paulo.",
    "error.locale": "{value} não é um idioma suportado; use um destes: {supported}.",
    "error.refused": "{key} tem um valor que não pode ser usado.",
    "field.jira_base_url": "endereço do Jira",
    "field.jira_email": "e-mail",
    "field.jira_api_token": "token de API",
    "jira_test.missing.cause": "Conexão com o Jira incompleta",
    "jira_test.missing.message": _missing,
    "jira_test.missing.action": "Informe o endereço do Jira, o e-mail e o token de API e teste de novo.",
    "jira_test.invalid.cause": "Dados de conexão com o Jira recusados",
    "jira_test.invalid.action": "Corrija o valor e teste de novo.",
}
