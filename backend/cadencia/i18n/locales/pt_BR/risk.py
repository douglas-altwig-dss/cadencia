"""Classificação de risco: nomes das situações, descrição das regras e a evidência de cada regra.

Textos idênticos aos de antes da internacionalização (R8): eles também vão para a apresentação,
inclusive o ``:g`` com ponto decimal em "em andamento há 7.5 dias".
"""

from __future__ import annotations

from cadencia.i18n.fmt import day_month
from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "situation.em_dia": "Em dia",
    "situation.envelhecendo": "Envelhecendo",
    "situation.estagnado": "Estagnado",
    "situation.bloqueado": "Bloqueado",
    "situation.atrasado": "Atrasado",
    "situation.arrastado": "Arrastado",
    "rule.arrasto": "Participou de sprints encerradas sem ser concluído.",
    "rule.prazo": "Data limite (duedate) anterior à data de referência e item não concluído.",
    "rule.bloqueio": "Sinalizado como impedimento, em status de bloqueio ou com bloqueador aberto.",
    "rule.estagnacao": (
        "Em coluna de andamento sem nenhuma transição de status entre checkpoints consecutivos."
    ),
    "rule.envelhecimento": "Tempo em andamento acima do percentil histórico do mesmo tipo e board.",
    "evidence.carried": lambda count, sprints: (
        f"passou por {count} {'sprint encerrada' if count == 1 else 'sprints encerradas'} sem conclusão "
        f"({', '.join(sprints)})"
    ),
    "evidence.overdue": lambda due, late: (
        f"data limite {day_month(due, 'pt-BR')} vencida há {late} dia{'s' if late != 1 else ''}"
    ),
    "evidence.blocked": lambda reasons: "; ".join(reasons),
    "reason.flagged": "sinalizado como impedimento no Jira",
    "reason.status": "no status {status}",
    "reason.waiting": lambda keys: "aguardando " + ", ".join(keys),
    "evidence.stalled": lambda days, column, checkpoints: (
        f"parado há {days} dias em {column}"
        + (f" ({checkpoints} checkpoints sem transição)" if checkpoints > 1 else "")
    ),
    "evidence.aging": lambda age, percentile, type_name, threshold: (
        f"em andamento há {age:g} dias; P{percentile:g} histórico de {type_name}: {threshold:g} dias"
    ),
    "detail.assignee": lambda before, after, when: (
        f"responsável mudou de {before or 'ninguém'} para {after or 'ninguém'} em "
        f"{day_month(when, 'pt-BR')}, sem mudança de status"
    ),
    "detail.estimate": lambda before, after, when: (
        f"estimativa mudou de {before or '—'} para {after or '—'} em {day_month(when, 'pt-BR')}"
    ),
    "detail.sprint": lambda after, when: f"sprint mudou para {after or '—'} em {day_month(when, 'pt-BR')}",
}
