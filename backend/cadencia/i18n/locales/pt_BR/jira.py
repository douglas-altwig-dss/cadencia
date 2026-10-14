"""Erros do Jira: causa e ação de cada tipo, e as mensagens do cliente HTTP."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "error.cause": "erro inesperado ao falar com o Jira",
    "error.action": "Tente novamente; se persistir, veja o log da coleta.",
    "auth.cause": "credencial inválida",
    "auth.action": "Confira o e-mail e gere um novo token de API em id.atlassian.com.",
    "permission.cause": "sem permissão",
    "permission.action": "Peça acesso de leitura ao projeto ou board para a conta usada pela Cadência.",
    "not_found.cause": "recurso não encontrado",
    "not_found.action": "Confira se o board, sprint ou item ainda existe e se a conta tem acesso.",
    "host.cause": "host inacessível ou errado",
    "host.action": "Confira a URL da instância, por exemplo https://empresa.atlassian.net.",
    "query.cause": "consulta JQL inválida",
    "query.action": "Revise o JQL; o endpoint /search/jql não valida a consulta por conta própria.",
    "rate_limit.cause": "limite de requisições do Jira esgotado",
    "rate_limit.action": "Aguarde alguns minutos ou reduza CADENCIA_JIRA_MAX_CONCURRENCY.",
    "server.cause": "erro interno do Jira",
    "server.action": "O Jira respondeu com erro; tente novamente em alguns minutos.",
    "write_forbidden.cause": "operação de escrita bloqueada",
    "write_forbidden.action": "A Cadência é somente leitura; nenhuma chamada de escrita é permitida.",
    "message.no_base_url": "URL da instância do Jira não configurada",
    "message.no_credentials": "E-mail ou token de API ausente",
    "message.write_blocked": "{method} {path} bloqueado: a Cadência é somente leitura",
    "message.timeout": "Tempo esgotado ao chamar {path}",
    "message.connect": "Não foi possível conectar a {url} ({error})",
    "message.not_json": "Resposta não-JSON em {path}: o endereço não parece ser um Jira",
    "message.redirect": "{path} redirecionou para {location}",
    "message.rate_limited": "HTTP 429 em {path}",
    "message.http": "HTTP {status} em {path}: {detail}",
    "message.auth": "O Jira recusou a credencial (HTTP 401): {detail}",
    "message.permission": "Sem permissão para {path} (HTTP 403): {detail}",
    "message.not_found": "{path} não encontrado (HTTP 404): {detail}",
    "message.query": "JQL rejeitado: {detail}",
}
