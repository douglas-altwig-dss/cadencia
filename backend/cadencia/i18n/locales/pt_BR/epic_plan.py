"""Plano do épico: problemas dos dados do Jira, validador, rótulos de horas e duração, erros da
página e da API. Cópia literal dos textos de antes da internacionalização (R8): horas com vírgula,
plurais com "(s)"."""

from __future__ import annotations

from cadencia.i18n.fmt import hours as _hours
from cadencia.i18n.fmt import listing as _listing
from cadencia.i18n.render import Entry

_LOC = "pt-BR"


def _h(value: float) -> str:
    return _hours(value, _LOC)


def _list(items: list[str], limit: int = 12) -> str:
    return _listing(items, limit, _LOC)


MESSAGES: dict[str, Entry] = {
    "seniority.junior": "Júnior",
    "seniority.pleno": "Pleno",
    "seniority.senior": "Sênior",
    "hours_source.original": "estimativa original",
    "hours_source.estimate": "campo de estimativa",
    "parameter.range": lambda name, low, high: f"Parâmetro {name} deve ficar entre {low:g} e {high:g}.",
    "parameter.workday_granularity": "A jornada útil precisa ser múltipla da granularidade de agenda.",
    "parameter.hours_source": "Fonte das horas inválida: {value}.",
    "parameter.empty": "Parâmetro {name} não pode ficar vazio.",
    "problem.code_review_without_code": "{task} está marcada como sem código, "
    "mas tem subtarefa de code review.",
    "problem.code_review_mismatch": lambda task, actual, expected, count, each: (
        f"Code review de {task}: {_h(actual)}h estimadas, {_h(expected)}h esperadas "
        f"({count} subtarefas × {_h(each)}h)."
    ),
    "problem.card_setup_mismatch": lambda actual, expected, cards, minutes: (
        f"Cadastro de cards: {_h(actual)}h estimadas, {_h(expected)}h esperadas "
        f"({cards} cards × {_h(minutes)} min)."
    ),
    "hours_label": lambda hours, days, rest: (
        f"{_h(hours)}h" + ((f" · {days}d" + (f" {_h(rest)}h" if rest else "")) if days else "")
    ),
    "why.no_role_label": "sem label de papel",
    "why.not_on_team": "{name} não está na equipe",
    "why.covers_roles": "{name} cobre {count} papéis",
    "why.no_role": "{name} não tem papel",
    "why.no_assignee": "sem responsável",
    "reason_group": lambda why, keys: f"{why}: {_list(keys, 8)}",
    "rounded_item": lambda key, before, after: f"{key} ({_h(before)}h → {_h(after)}h)",
    "problem.no_role": lambda count, reasons: (
        f"{count} subtarefa(s) sem papel ({'; '.join(reasons)}). "
        "Atribua o papel em “Papéis das subtarefas”, cadastre o papel dos responsáveis na equipe "
        "ou use labels de papel no Jira."
    ),
    "problem.too_many_roles": lambda items: (
        f"Uma subtarefa tem um ou dois papéis; estas correspondem a mais: {_list(items, 6)}."
    ),
    "problem.no_hours": lambda count, total, source, keys: (
        f"{count} de {total} subtarefa(s) sem horas no campo “{source}” do Jira; "
        f"contam como 0h: {_list(keys)}."
    ),
    "problem.rounded": lambda step, items: (
        f"Horas arredondadas para a granularidade de {_h(step)}h: {_list(items, 6)}."
    ),
    "problem.external_dependency": lambda items: (
        f"Dependências de itens fora do épico foram ignoradas: {_list(items, 8)}."
    ),
    "problem.empty_tasks": lambda count, keys: (
        f"{count} tarefa(s) sem subtarefas não somam horas: {_list(keys)}."
    ),
    "problem.cycle": "Dependência circular entre subtarefas: {path}.",
    "problem.role_without_member": lambda role, keys: (
        f"Nenhum membro selecionado cobre o papel {role}; subtarefas afetadas: {', '.join(keys)}."
    ),
    "problem.composite_without_pair": lambda keys: (
        "Subtarefas compostas precisam de duas pessoas diferentes, e só uma pessoa selecionada "
        f"cobre os dois papéis: {', '.join(keys)}."
    ),
    "problems": lambda items: " ".join(items),
    "violation.unknown_subtask": "{key} não faz parte do épico.",
    "violation.roles_once": "{key} não está alocada exatamente uma vez para cada papel que exige.",
    "violation.same_person": "{key} é composta e tem a mesma pessoa nas duas vagas.",
    "violation.not_together": "{key} é composta e as duas vagas não acontecem ao mesmo tempo.",
    "violation.not_selected": "{key} foi alocada a {worker}, que não está selecionado.",
    "violation.lacks_role": "{key} foi alocada a {worker}, que não tem o papel exigido.",
    "violation.duration": "{key} não ocupa a sua duração em horas úteis contínuas.",
    "violation.prerequisite": "{key} começa antes de o pré-requisito {prerequisite} terminar.",
    "violation.overlap": "{name} está em {first} e {second} ao mesmo tempo.",
    "violation.workday": "{name} passa da jornada no dia {day}.",
    "duration": "Planejamento {planning} d + Execução {execution} d = Total {total} dias úteis",
    "task_hours": lambda work, review: f"{_h(work)}h" + (f" + {_h(review)}h" if review else ""),
    "error.not_collected": "O épico {key} não foi coletado do Jira.",
    "error.unknown_parameter": "Parâmetro desconhecido: {name}.",
    "error.hours_source": lambda value, options: (
        f"Fonte das horas inválida: {value}. Use {' ou '.join(options)}."
    ),
    "error.unknown_members": lambda ids: f"Membros inexistentes, inativos ou sem papel: {', '.join(ids)}.",
    "error.no_subtasks": "O épico {key} não tem subtarefas para planejar.",
    "error.time_limit": "O limite de tempo deve ficar entre {low} e {high} segundos.",
    "error.unknown_selection": lambda ids: f"Membros desconhecidos: {', '.join(ids)}.",
    "role_in_use.members": lambda names: f"atribuído a {', '.join(names)}",
    "role_in_use.subtasks": lambda keys: f"usado pelas subtarefas {_list(keys, 10)}",
    "role_in_use.message": lambda role, places: f"O papel {role} está em uso: {'; '.join(places)}.",
}
