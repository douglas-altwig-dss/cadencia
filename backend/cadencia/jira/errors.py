"""Jira errors that carry a human cause and a suggested action (RF-01, RF-35)."""

from __future__ import annotations

from typing import Any


class JiraError(Exception):
    cause = "erro inesperado ao falar com o Jira"
    action = "Tente novamente; se persistir, veja o log da coleta."

    def __init__(
        self,
        message: str,
        *,
        status: int | None = None,
        cause: str | None = None,
        action: str | None = None,
        details: Any = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status = status
        if cause:
            self.cause = cause
        if action:
            self.action = action
        self.details = details

    def as_dict(self) -> dict[str, Any]:
        return {
            "error": type(self).__name__,
            "cause": self.cause,
            "action": self.action,
            "message": self.message,
            "status": self.status,
        }


class JiraAuthError(JiraError):
    cause = "credencial inválida"
    action = "Confira o e-mail e gere um novo token de API em id.atlassian.com."


class JiraPermissionError(JiraError):
    cause = "sem permissão"
    action = "Peça acesso de leitura ao projeto ou board para a conta usada pela Cadência."


class JiraNotFoundError(JiraError):
    cause = "recurso não encontrado"
    action = "Confira se o board, sprint ou item ainda existe e se a conta tem acesso."


class JiraHostError(JiraError):
    cause = "host inacessível ou errado"
    action = "Confira a URL da instância, por exemplo https://empresa.atlassian.net."


class JiraQueryError(JiraError):
    cause = "consulta JQL inválida"
    action = "Revise o JQL; o endpoint /search/jql não valida a consulta por conta própria."


class JiraRateLimitError(JiraError):
    cause = "limite de requisições do Jira esgotado"
    action = "Aguarde alguns minutos ou reduza CADENCIA_JIRA_MAX_CONCURRENCY."


class JiraServerError(JiraError):
    cause = "erro interno do Jira"
    action = "O Jira respondeu com erro; tente novamente em alguns minutos."


class JiraWriteForbidden(JiraError):
    cause = "operação de escrita bloqueada"
    action = "A Cadência é somente leitura; nenhuma chamada de escrita é permitida."
