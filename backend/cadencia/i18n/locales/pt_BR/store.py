"""Recusas do repositório: board, variáveis, ausências, visões, comentários, papéis e equipe."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "board.not_found": "Board {board}.",
    "board.unknown_settings": "campos desconhecidos: {fields}",
    "variable.bad_name": "nome inválido: {name}",
    "variable.duplicate": "já existe uma variável chamada {name} neste escopo",
    "variable.bad_scope": "escopo inválido: {scope}",
    "variable.not_found": "A variável {id} não existe.",
    "variable.scope_needs_target": "o escopo {scope} precisa de um alvo",
    "absence.end_before_start": "fim da ausência anterior ao início",
    "availability.hours": "As horas por dia ficam entre 0,5 e 24.",
    "availability.allocation": "A dedicação fica entre 0% e 100%.",
    "view.name_missing": "dê um nome à visão",
    "view.bad_path": "a visão precisa apontar para uma tela da Cadência (um caminho que começa com /)",
    "view.not_found": "A visão {id} não existe.",
    "comment.empty": "o comentário está vazio",
    "comment.not_in_template": "O comentário {id} não existe neste modelo.",
    "comment.not_found": "O comentário {id} não existe.",
    "role.name_missing": "O papel precisa de um nome.",
    "role.bad_color": "A cor do papel deve estar no formato #rrggbb.",
    "role.duplicate": "Já existe um papel chamado {name}.",
    "role.not_found": "Papel não encontrado.",
    "role.in_use": "O papel {role} está atribuído a: {people}. Remova-o dessas pessoas antes.",
    "role.missing": "Papel {id} não existe.",
    "person.not_found": "Pessoa não encontrada entre as pessoas coletadas do Jira.",
    "member.bad_seniority": "Senioridade inválida: {seniority}. Use {allowed}.",
    "member.role_twice": "Um papel aparece duas vezes para a mesma pessoa.",
    "subtask.not_found": "{key} não é uma subtarefa coletada.",
    "subtask.role_count": "Uma subtarefa tem um ou dois papéis.",
    "subtask.unknown_roles": "Papel inexistente: {ids}.",
}
