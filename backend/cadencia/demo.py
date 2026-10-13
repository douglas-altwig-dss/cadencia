"""Fictional Jira Cloud instance for `cadencia demo`, the test-suite and UI work.

Everything here is invented (people, projects, issues). Dates are built around an anchor — the
most recent Thursday 15:00 in America/Sao_Paulo — so the demo always sits in the second week of
an active two-week sprint, and the data is engineered to trigger every risk rule:

- CAD-11 carried over from the previous sprint, stalled since before the last checkpoint and
  reassigned without any status change;
- CAD-12 aging (in progress longer than the historical P85); CAD-13 flagged; CAD-14 overdue;
- CAD-15 added after the sprint start; CAD-16 removed; CAD-18 waiting on CAD-11;
- DAD-3 stalled; SUP-7 belongs to an epic of another project (cross-project parent fetch).
"""

from __future__ import annotations

import itertools
import re
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import httpx

TZ = ZoneInfo("America/Sao_Paulo")
BASE_URL = "https://demo.atlassian.net"

PEOPLE = {
    "ana": ("demo-ana", "Ana Souza"),
    "bruno": ("demo-bruno", "Bruno Lima"),
    "carla": ("demo-carla", "Carla Mendes"),
    "diego": ("demo-diego", "Diego Rocha"),
    "elisa": ("demo-elisa", "Elisa Prado"),
    "fabio": ("demo-fabio", "Fábio Teixeira"),
    "gabriela": ("demo-gabriela", "Gabriela Nunes"),
    "heitor": ("demo-heitor", "Heitor Campos"),
    "iris": ("demo-iris", "Íris Moura"),
}
STATUSES = {
    "todo": ("10000", "A fazer", "new"),
    "doing": ("3", "Em andamento", "indeterminate"),
    "review": ("10001", "Code Review", "indeterminate"),
    "blocked": ("10002", "Bloqueado", "indeterminate"),
    "done": ("10003", "Concluído", "done"),
}
COLUMNS = [
    ("A fazer", ["10000"]),
    ("Em andamento", ["3", "10002"]),
    ("Code Review", ["10001"]),
    ("Concluído", ["10003"]),
]
TYPES = {
    "Iniciativa": (2, False),
    "Epic": (1, False),
    "Story": (0, False),
    "Task": (0, False),
    "Bug": (0, False),
    "Subtarefa": (-1, True),
}
SPRINT_FIELD = "customfield_10020"
EPIC_LINK = "customfield_10014"
RANK = "customfield_10019"
POINTS = "customfield_10016"
FLAGGED = "customfield_10021"
FIELDS = [
    {"id": "summary", "name": "Resumo", "custom": False, "schema": {"type": "string", "system": "summary"}},
    {
        "id": SPRINT_FIELD,
        "name": "Sprint",
        "custom": True,
        "schema": {"type": "array", "items": "json", "custom": "com.pyxis.greenhopper.jira:gh-sprint"},
    },
    {
        "id": EPIC_LINK,
        "name": "Epic Link",
        "custom": True,
        "schema": {"type": "any", "custom": "com.pyxis.greenhopper.jira:gh-epic-link"},
    },
    {
        "id": RANK,
        "name": "Rank",
        "custom": True,
        "schema": {"type": "any", "custom": "com.pyxis.greenhopper.jira:gh-lexo-rank"},
    },
    {
        "id": POINTS,
        "name": "Story point estimate",
        "custom": True,
        "schema": {"type": "number", "custom": "com.pyxis.greenhopper.jira:jsw-story-points"},
    },
    {
        "id": "customfield_10050",
        "name": "Story Points",
        "custom": True,
        "schema": {"type": "number", "custom": "com.atlassian.jira.plugin.system.customfieldtypes:float"},
    },
    {
        "id": FLAGGED,
        "name": "Flagged",
        "custom": True,
        "schema": {
            "type": "array",
            "items": "option",
            "custom": "com.atlassian.jira.plugin.system.customfieldtypes:multicheckboxes",
        },
    },
]


def _iso(value: datetime) -> str:
    return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.000+0000")


def _person(handle: str | None) -> dict[str, Any] | None:
    if handle is None:
        return None
    account, name = PEOPLE[handle]
    return {"accountId": account, "displayName": name, "active": True}


def anchor_for(now: datetime) -> datetime:
    """Most recent Thursday 15:00 (São Paulo) at or before ``now``."""
    local = now.astimezone(TZ)
    anchor = datetime.combine(local.date() - timedelta(days=(local.weekday() - 3) % 7), time(15), TZ)
    if anchor > local:
        anchor -= timedelta(days=7)
    return anchor.astimezone(UTC)


class _Issue:
    def __init__(
        self,
        jira: DemoJira,
        board: int,
        key: str,
        type_name: str,
        summary: str,
        created: datetime,
        *,
        assignee: str | None = None,
        parent: str | None = None,
        estimate: float | None = None,
        due: date | None = None,
        labels: tuple[str, ...] = (),
        components: tuple[str, ...] = (),
        blocked_by: tuple[str, ...] = (),
        hours: float | None = None,
        description: dict[str, Any] | None = None,
    ) -> None:
        self.jira = jira
        self.board = board
        self.key = key
        self.numeric_id = next(jira.ids)
        self.type_name = type_name
        self.summary = summary
        self.created = created
        self.updated = created
        self.assignee = assignee
        self.parent = parent
        self.estimate = estimate
        self.due = due
        self.labels = labels
        self.components = components
        self.blocked_by = blocked_by
        self.hours = hours
        self.description = description
        self.status = "todo"
        self.sprints: list[int] = []
        self.flagged = False
        self.resolved: datetime | None = None
        self.rank = f"0|i{next(jira.ranks):05d}:"
        self.histories: list[dict[str, Any]] = []

    def _log(self, at: datetime, by: str, item: dict[str, Any]) -> _Issue:
        self.histories.append(
            {
                "id": str(next(self.jira.history_ids)),
                "created": _iso(at),
                "author": _person(by),
                "items": [item],
            }
        )
        self.updated = max(self.updated, at)
        return self

    def to(self, at: datetime, status: str, by: str = "ana") -> _Issue:
        before, after = STATUSES[self.status], STATUSES[status]
        self.resolved = at if after[2] == "done" else None
        self.status = status
        return self._log(
            at,
            by,
            {
                "field": "status",
                "fieldtype": "jira",
                "fieldId": "status",
                "from": before[0],
                "fromString": before[1],
                "to": after[0],
                "toString": after[1],
            },
        )

    def assign(self, at: datetime, person: str | None, by: str = "ana") -> _Issue:
        before = self.assignee
        self.assignee = person
        return self._log(
            at,
            by,
            {
                "field": "assignee",
                "fieldtype": "jira",
                "fieldId": "assignee",
                "from": PEOPLE[before][0] if before else None,
                "fromString": PEOPLE[before][1] if before else None,
                "to": PEOPLE[person][0] if person else None,
                "toString": PEOPLE[person][1] if person else None,
            },
        )

    def sprint(self, at: datetime, ids: list[int], by: str = "ana") -> _Issue:
        before = list(self.sprints)
        self.sprints = list(ids)

        def ids_text(values: list[int]) -> str | None:
            return ", ".join(str(v) for v in values) or None

        def names(values: list[int]) -> str | None:
            return ", ".join(self.jira.sprints[v]["name"] for v in values) or None

        return self._log(
            at,
            by,
            {
                "field": "Sprint",
                "fieldtype": "custom",
                "fieldId": SPRINT_FIELD,
                "from": ids_text(before),
                "fromString": names(before),
                "to": ids_text(ids),
                "toString": names(ids),
            },
        )

    def flag(self, at: datetime, on: bool = True, by: str = "ana") -> _Issue:
        self.flagged = on
        return self._log(
            at,
            by,
            {
                "field": "Flagged",
                "fieldtype": "custom",
                "fieldId": FLAGGED,
                "from": None,
                "fromString": "" if on else "Impediment",
                "to": None,
                "toString": "Impediment" if on else "",
            },
        )

    def payload(self) -> dict[str, Any]:
        level, subtask = TYPES[self.type_name]
        status = STATUSES[self.status]
        fields: dict[str, Any] = {
            "summary": self.summary,
            "issuetype": {"name": self.type_name, "subtask": subtask, "hierarchyLevel": level},
            "status": {"id": status[0], "name": status[1], "statusCategory": {"key": status[2]}},
            "assignee": _person(self.assignee),
            "created": _iso(self.created),
            "updated": _iso(self.updated),
            "resolutiondate": _iso(self.resolved) if self.resolved else None,
            "duedate": self.due.isoformat() if self.due else None,
            "priority": {"name": "Medium"},
            "labels": list(self.labels),
            "components": [{"name": c} for c in self.components],
            "issuelinks": [
                {
                    "id": f"{self.numeric_id}{i}",
                    "type": {"name": "Blocks", "inward": "is blocked by", "outward": "blocks"},
                    "inwardIssue": {"key": key},
                }
                for i, key in enumerate(self.blocked_by)
            ],
            "project": {"key": self.key.split("-")[0]},
            SPRINT_FIELD: [self.jira.sprint_ref(s) for s in self.sprints] or None,
            POINTS: self.estimate,
            FLAGGED: [{"value": "Impediment"}] if self.flagged else None,
            RANK: self.rank,
            "timeoriginalestimate": round(self.hours * 3600) if self.hours is not None else None,
            "description": self.description,
        }
        if self.parent:
            fields["parent"] = {"key": self.parent}
        return {"id": str(self.numeric_id), "key": self.key, "fields": fields}


class DemoJira:
    """In-memory Jira Cloud. ``transport`` plugs it into :class:`cadencia.jira.client.JiraClient`."""

    def __init__(self, now: datetime | None = None, *, epic_plan: bool = False) -> None:
        self.anchor = anchor_for(now or datetime.now(UTC))
        self.ids = itertools.count(10100)
        self.ranks = itertools.count(100)
        self.history_ids = itertools.count(50000)
        self.boards: dict[int, dict[str, Any]] = {}
        self.sprints: dict[int, dict[str, Any]] = {}
        self.issues: dict[str, _Issue] = {}
        self.fail_boards: set[int] = set()
        self.rate_limit_next = 0
        self.calls: list[tuple[str, str, dict[str, str]]] = []
        local = self.anchor.astimezone(TZ)
        self.sprint_start = datetime.combine(local.date() - timedelta(days=local.weekday() + 7), time(9), TZ)
        self._build()
        if epic_plan:
            self._build_epic_plan()

    # ------------------------------------------------------------------ scenario

    def d(self, days: float, hour: int = 10, minute: int = 0) -> datetime:
        day = self.sprint_start.date() + timedelta(days=int(days))
        return datetime.combine(day, time(hour, minute), TZ).astimezone(UTC)

    def _sprint(
        self, sprint_id: int, board: int, name: str, start_day: int, state: str, goal: str = ""
    ) -> None:
        start = self.d(start_day, 9)
        end = self.d(start_day + 11, 18)
        self.sprints[sprint_id] = {
            "id": sprint_id,
            "self": f"{BASE_URL}/rest/agile/1.0/sprint/{sprint_id}",
            "state": state,
            "name": name,
            "startDate": _iso(start) if state != "future" else None,
            "endDate": _iso(end) if state != "future" else None,
            "completeDate": _iso(end + timedelta(minutes=5)) if state == "closed" else None,
            "originBoardId": board,
            "goal": goal,
        }

    def sprint_ref(self, sprint_id: int) -> dict[str, Any]:
        s = self.sprints[sprint_id]
        return {"id": s["id"], "name": s["name"], "state": s["state"], "boardId": s["originBoardId"]}

    def _issue(
        self, board: int, key: str, type_name: str, summary: str, created: datetime, **kw: Any
    ) -> _Issue:
        issue = _Issue(self, board, key, type_name, summary, created, **kw)
        self.issues[key] = issue
        return issue

    def _build(self) -> None:
        d = self.d
        base = self.sprint_start.date()
        # Two spaces, three boards: "Produto Digital" owns a scrum board and a support kanban, so
        # the screens that group by space have something to group.
        self.boards = {
            1: {
                "id": 1,
                "name": "Plataforma",
                "type": "scrum",
                "location": {"projectKey": "CAD", "projectName": "Produto Digital"},
            },
            2: {
                "id": 2,
                "name": "Dados",
                "type": "scrum",
                "location": {"projectKey": "DAD", "projectName": "Inteligência de Dados"},
            },
            3: {
                "id": 3,
                "name": "Suporte",
                "type": "kanban",
                "location": {"projectKey": "CAD", "projectName": "Produto Digital"},
            },
        }
        self._sprint(10, 1, "Plataforma 3.3", -28, "closed")
        self._sprint(11, 1, "Plataforma 3.4", -14, "closed", "Estabilizar o checkout")
        self._sprint(12, 1, "Plataforma 3.5", 0, "active", "Pagamento com cartão em produção")
        self._sprint(13, 1, "Plataforma 3.6", 14, "future")
        self._sprint(21, 2, "Dados 4.0", -14, "closed")
        self._sprint(22, 2, "Dados 4.1", 0, "active", "Ingestão incremental")

        # --- Plataforma (CAD) ---------------------------------------------------------------
        # CAD-50 is never on any board of its own — an initiative never is — so it only reaches
        # the store through CAD-2's own parent link, one hop past the cross-project fetch SUP-7
        # already exercises: the collector has to climb a second time to find it.
        self._issue(2, "CAD-50", "Iniciativa", "Confiabilidade da plataforma", d(-90), assignee="ana")
        self._issue(
            1, "CAD-1", "Epic", "Checkout novo", d(-40), assignee="ana", due=base + timedelta(days=18)
        ).to(d(-30), "doing")
        self._issue(
            1,
            "CAD-2",
            "Epic",
            "Observabilidade",
            d(-40),
            assignee="elisa",
            due=base + timedelta(days=6),
            parent="CAD-50",
        ).to(d(-20), "doing")
        for i, (who, days) in enumerate([("ana", 2), ("bruno", 1), ("carla", 3), ("diego", 2)]):
            item = self._issue(
                1,
                f"CAD-{30 + i}",
                "Story",
                f"Ajuste de fluxo {i + 1}",
                d(-31),
                assignee=who,
                parent="CAD-1",
                estimate=3,
            )
            item.sprint(d(-29), [10]).to(d(-27), "doing", who).to(d(-27 + days), "done", who)
        history = [
            ("Story", 1, "ana", 3),
            ("Story", 2, "bruno", 5),
            ("Story", 2, "carla", 2),
            ("Story", 3, "diego", 3),
            ("Story", 4, "elisa", 8),
            ("Bug", 3, "ana", 1),
        ]
        summaries = [
            "Revisão do carrinho",
            "Endereço de entrega",
            "Frete expresso",
            "Resumo do pedido",
            "Parcelamento",
            "Erro no CEP",
        ]
        for i, (kind, cycle, who, points) in enumerate(history):
            item = self._issue(
                1,
                f"CAD-{3 + i}",
                kind,
                summaries[i],
                d(-17),
                assignee=who,
                parent="CAD-1" if i % 2 == 0 else "CAD-2",
                estimate=points,
            )
            item.sprint(d(-15), [11]).to(d(-13), "doing", who).to(d(-13 + cycle), "done", who)

        self._issue(
            1,
            "CAD-11",
            "Story",
            "Integração com gateway de pagamento",
            d(-16),
            assignee="bruno",
            parent="CAD-1",
            estimate=8,
        ).sprint(d(-15), [11]).to(d(-6), "doing", "bruno").sprint(d(-3, 18, 6), [11, 12]).assign(
            d(2), "carla"
        )
        self._issue(
            1, "CAD-12", "Story", "Recibo por e-mail", d(-5), assignee="carla", parent="CAD-1", estimate=3
        ).sprint(d(-1), [12]).to(d(2), "doing", "carla").to(d(7), "review", "carla")
        self._issue(
            1,
            "CAD-13",
            "Bug",
            "Erro de arredondamento no total",
            d(-4),
            assignee="diego",
            parent="CAD-1",
            estimate=2,
        ).sprint(d(-1), [12]).to(d(2), "doing", "diego").flag(d(3), True, "diego")
        self._issue(
            1,
            "CAD-14",
            "Task",
            "Configurar alertas de latência",
            d(-6),
            assignee="elisa",
            parent="CAD-2",
            due=base + timedelta(days=6),
        ).sprint(d(-1), [12]).to(d(7), "doing", "elisa")
        self._issue(
            1,
            "CAD-15",
            "Story",
            "Painel de latência por endpoint",
            d(1),
            assignee="ana",
            parent="CAD-2",
            estimate=5,
        ).sprint(d(2, 11), [12]).to(d(2, 14), "doing").to(d(3, 16), "done")
        self._issue(
            1, "CAD-16", "Story", "Exportar pedidos em CSV", d(-8), assignee="bruno", estimate=3
        ).sprint(d(-1), [12]).sprint(d(8), [13])
        self._issue(
            1,
            "CAD-17",
            "Story",
            "Busca por número do pedido",
            d(-7),
            assignee="ana",
            parent="CAD-1",
            estimate=5,
        ).sprint(d(-1), [12])
        self._issue(
            1,
            "CAD-18",
            "Task",
            "Atualizar SDK de pagamentos",
            d(-7),
            assignee="diego",
            estimate=1,
            blocked_by=("CAD-11",),
            components=("api",),
        ).sprint(d(-1), [12])
        self._issue(
            1,
            "CAD-10",
            "Story",
            "Tela de pagamento",
            d(-9),
            assignee="ana",
            parent="CAD-1",
            estimate=5,
            components=("web",),
        ).sprint(d(-1), [12]).to(d(1), "doing").to(d(3), "review").to(d(8), "done")
        self._issue(
            1, "CAD-19", "Subtarefa", "Validar campos do cartão", d(1), assignee="carla", parent="CAD-10"
        ).sprint(d(1, 11), [12]).to(d(2), "doing", "carla").to(d(7), "done", "carla")
        self._issue(
            1, "CAD-20", "Subtarefa", "Mensagens de erro", d(1), assignee="ana", parent="CAD-10"
        ).sprint(d(1, 11), [12]).to(d(3), "doing").to(d(8, 9), "done")
        self._issue(
            1, "CAD-21", "Bug", "Timeout no login social", d(-2), assignee="carla", estimate=2
        ).sprint(d(-1), [12]).to(d(1), "doing", "carla").to(d(3), "done", "carla")
        self._issue(
            1, "CAD-22", "Story", "Cupom de desconto", d(-5), assignee="bruno", parent="CAD-1", estimate=3
        ).sprint(d(-1), [12]).to(d(1), "doing", "bruno").to(d(2), "done", "bruno").to(
            d(3), "doing", "bruno"
        ).to(d(4), "done", "bruno")

        # --- Dados (DAD) --------------------------------------------------------------------
        self._issue(
            2,
            "DAD-1",
            "Epic",
            "Lago de dados unificado",
            d(-40),
            assignee="diego",
            due=base + timedelta(days=25),
        ).to(d(-35), "doing")
        for i, cycle in enumerate([2, 3, 3, 4, 5]):
            who = "diego" if i % 2 else "elisa"
            item = self._issue(
                2,
                f"DAD-{5 + i}",
                "Story",
                f"Modelo de dados {i + 1}",
                d(-17),
                assignee=who,
                parent="DAD-1",
                estimate=3,
            )
            item.sprint(d(-15), [21]).to(d(-13), "doing", who).to(d(-13 + cycle), "done", who)
        self._issue(
            2,
            "DAD-2",
            "Story",
            "Tabela de clientes deduplicada",
            d(-5),
            assignee="elisa",
            parent="DAD-1",
            estimate=5,
        ).sprint(d(-1), [22]).to(d(1), "doing", "elisa").to(d(3), "done", "elisa")
        self._issue(
            2,
            "DAD-3",
            "Story",
            "Ingestão incremental do ERP",
            d(-10),
            assignee="diego",
            parent="DAD-1",
            estimate=8,
        ).sprint(d(-1), [22]).to(d(-4), "doing", "diego")
        self._issue(
            2, "DAD-4", "Task", "Catálogo de tabelas", d(-6), assignee="elisa", parent="DAD-1"
        ).sprint(d(-1), [22])

        # --- Suporte (SUP, kanban) ----------------------------------------------------------
        for i in range(5):
            item = self._issue(
                3,
                f"SUP-{1 + i}",
                "Bug",
                f"Chamado recorrente {i + 1}",
                d(-20 + i),
                assignee="bruno" if i % 2 else "carla",
            )
            item.to(d(-18 + i * 3), "doing").to(d(-17 + i * 3 + i % 3), "done")
        self._issue(3, "SUP-6", "Bug", "Falha na impressão de notas", d(-14), assignee="bruno").to(
            d(-12), "doing", "bruno"
        )
        self._issue(
            3, "SUP-7", "Task", "Revisar permissões de acesso", d(-3), assignee="elisa", parent="CAD-2"
        )
        self._issue(
            3,
            "SUP-8",
            "Bug",
            "Relatório fiscal com totais errados",
            d(-4),
            assignee="carla",
            due=base + timedelta(days=2),
        )

    def _build_epic_plan(self) -> None:
        """An epic laid out for the epic plan: subtasks labelled by role, estimated in hours and
        linked by "is blocked by", with two composite "A + B" subtasks and a parallel track."""
        self.boards[4] = {
            "id": 4,
            "name": "Analytics",
            "type": "kanban",
            "location": {"projectKey": "ANL", "projectName": "Analytics"},
        }
        numbers = itertools.count(2)
        created = self.d(-10)

        def adf(**sections: str) -> dict[str, Any]:
            content: list[dict[str, Any]] = []
            for title, text in sections.items():
                content.append(
                    {"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": title}]}
                )
                content.append({"type": "paragraph", "content": [{"type": "text", "text": text}]})
            return {"type": "doc", "version": 1, "content": content}

        def task(
            summary: str, labels: tuple[str, ...], blocked: tuple[str, ...] = (), **sections: str
        ) -> str:
            key = f"ANL-{next(numbers)}"
            self._issue(
                4,
                key,
                "Task",
                summary,
                created,
                parent="ANL-1",
                labels=labels,
                blocked_by=blocked,
                description=adf(**sections) if sections else None,
            )
            return key

        def sub(
            parent: str,
            summary: str,
            hours: float,
            who: str,
            labels: tuple[str, ...] = (),
            blocked: tuple[str, ...] = (),
        ) -> str:
            key = f"ANL-{next(numbers)}"
            self._issue(
                4,
                key,
                "Subtarefa",
                summary,
                created,
                assignee=who,
                parent=parent,
                labels=labels,
                blocked_by=blocked,
                hours=hours,
            )
            return key

        def review(parent: str, executions: list[str]) -> str:
            hours = 0.5 * len(executions)
            return sub(
                parent,
                "Code review pelo Tech Leader",
                hours,
                "carla",
                ("tech-lead", "code-review"),
                tuple(executions),
            )

        self._issue(
            4, "ANL-1", "Epic", "Perguntas em linguagem natural sobre planilhas", self.d(-12), assignee="ana"
        )
        request = task(
            "Requisição do cliente",
            ("pm-po", "planejamento", "sem-codigo"),
            Negócio="O épico nasce de uma necessidade real do cliente, registrada antes de qualquer desenho.",
            Técnico="Sem entrega técnica própria: é o registro formal que alimenta o planejamento.",
        )
        a = sub(request, "Coletar necessidade e caso de uso do cliente", 3, "ana")
        b = sub(request, "Formalizar escopo e prioridade no backlog", 3, "ana", blocked=(a,))
        sub(request, "Criar o card do épico no Jira", 1, "ana", blocked=(b,))

        design = task(
            "Planejamento da solução",
            ("arquitetura", "planejamento", "sem-codigo"),
            (request,),
            Negócio="Um desenho único evita que cada pessoa invente a própria integração.",
            Técnico="Contrato das mensagens das filas, guardrails, schema de status e sequência das tarefas.",
        )
        scope = sub(
            design,
            "Levantar requisitos com PO e formalizar escopo técnico",
            4,
            "fabio",
            ("arquitetura", "pm-po"),
        )
        contract = sub(design, "Definir contrato de mensagens das filas", 4, "fabio", blocked=(scope,))
        guard = sub(design, "Definir guardrails e schema de status", 4, "fabio", blocked=(contract,))
        order = sub(design, "Definir sequência e dependências entre as tarefas", 4, "fabio", blocked=(guard,))
        sub(
            design,
            "Revisar o DoD de cada card com o tech lead",
            3,
            "fabio",
            ("arquitetura", "tech-lead"),
            (order,),
        )
        sub(
            design,
            "Criar os cards de tarefas e subtarefas no Jira",
            8,
            "ana",
            ("pm-po", "cadastro-jira"),
            (order,),
        )

        queues = task(
            "Infra 1 — Provisionar filas do worker",
            ("infra",),
            (design,),
            Negócio="Sem filas separadas o worker não prioriza as perguntas rápidas.",
            Técnico="Filas de parse e de consulta nos três ambientes, seguindo o contrato do planejamento.",
        )
        q1 = sub(queues, "Criar as filas nos três ambientes", 5, "elisa")
        q2 = sub(queues, "Aplicar o payload definido no planejamento", 3, "elisa", blocked=(q1,))
        q3 = sub(queues, "Configurar TTL e dead-letter por fila", 4, "elisa", blocked=(q1,))
        q4 = sub(queues, "Smoke test de enfileirar e consumir", 2, "elisa", blocked=(q2, q3))
        review(queues, [q1, q2, q3, q4])

        upload = task(
            "Backend: liberar upload de .xlsx",
            ("backend",),
            (design,),
            Negócio="Abre a porta de entrada do arquivo antes de a interface existir.",
            Técnico="Ajuste na validação do endpoint de upload, roteando .xlsx para o fluxo de parse.",
        )
        u1 = sub(upload, "Liberar .xlsx na validação de upload", 4, "bruno")
        u2 = sub(upload, "Rotear para o fluxo de parse", 5, "bruno", blocked=(u1,))
        u3 = sub(upload, "Teste via chamada direta à API", 3, "bruno", blocked=(u2,))
        review(upload, [u1, u2, u3])

        parse = task(
            "Parse: Excel → Parquet",
            ("dados",),
            (design,),
            Negócio="Transforma a planilha enviada em dado confiável e consultável.",
            Técnico="Novo consumidor no worker existente, em modo somente leitura, um parquet por aba.",
            Dependências="Começa junto com a Infra 1 e o upload, usando arquivos de teste locais.",
        )
        p1 = sub(parse, "Consumir job da fila e resolver a referência do arquivo", 5, "heitor")
        p2 = sub(parse, "Parse com leitura somente leitura e tratamentos básicos", 9, "heitor", blocked=(p1,))
        p3 = sub(parse, "Escrever um parquet por aba", 5, "diego", blocked=(p2,))
        p4 = sub(parse, "Testes com arquivos variados", 5, "gabriela", blocked=(p1,))
        review(parse, [p1, p2, p3, p4])

        enqueue = task(
            "Enfileirar job de parse",
            ("backend",),
            (queues, upload),
            Negócio="Liga o upload já liberado ao processamento real.",
            Técnico="Publica a mensagem na fila de parse com o contrato definido no planejamento.",
        )
        e1 = sub(enqueue, "Publicar mensagem na fila ao concluir o upload", 4, "gabriela")
        e2 = sub(enqueue, "Criar registro inicial de status", 3, "bruno")
        e3 = sub(enqueue, "Teste ponta a ponta: upload → fila → worker", 2, "bruno", blocked=(e1, e2))
        review(enqueue, [e1, e2, e3])

        joint = task(
            "Integração Backend + Dados",
            ("backend", "dados"),
            (parse, enqueue),
            Negócio="Valida juntos os dois lados construídos em paralelo.",
            Técnico="Troca o arquivo de teste local pela fila real e ajusta divergências de contrato.",
        )
        j1 = sub(joint, "Trocar o mock pela fila real", 4, "gabriela", ("backend", "dados"))
        j2 = sub(joint, "Ajustar divergências de contrato", 3, "heitor", ("backend", "dados"), (j1,))
        review(joint, [j1, j2])

        screen = task(
            "Interface de perguntas sobre a planilha",
            ("frontend",),
            (joint,),
            Negócio="É onde o cliente anexa a planilha e conversa com ela.",
            Técnico="Tela de upload e chat consumindo as APIs entregues pelo backend.",
        )
        f1 = sub(screen, "Tela de upload com confirmação", 5, "iris")
        f2 = sub(screen, "Chat com a planilha", 6, "iris", blocked=(f1,))
        review(screen, [f1, f2])

        health = task(
            "Infra 2 — Painel de saúde do worker",
            ("infra",),
            (design,),
            Negócio="Mostra incidentes do worker antes de o cliente senti-los.",
            Técnico="Dashboards nos três ambientes com alertas de memória, timeout e fila.",
            Dependências="Trilha paralela e independente; é pré-requisito do deploy.",
        )
        h1 = sub(health, "Definir métricas a expor", 3, "carla", ("infra",))
        h2 = sub(health, "Criar dashboard e replicar nos ambientes", 7, "carla", ("infra",), (h1,))
        h3 = sub(health, "Configurar alertas", 3, "elisa", ("infra",), (h2,))
        review(health, [h1, h2, h3])

    # ------------------------------------------------------------------ HTTP

    @property
    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self.handle)

    def _page(
        self, items: list[Any], params: dict[str, str], key: str, *, is_last: bool = True
    ) -> dict[str, Any]:
        start = int(params.get("startAt", 0))
        size = int(params.get("maxResults", 50))
        page = items[start : start + size]
        body: dict[str, Any] = {"startAt": start, "maxResults": size, "total": len(items), key: page}
        if is_last:
            body["isLast"] = start + size >= len(items)
        return body

    def handle(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        params = dict(request.url.params)
        self.calls.append((request.method, path, params))
        if self.rate_limit_next > 0:
            self.rate_limit_next -= 1
            return httpx.Response(
                429, headers={"Retry-After": "0"}, json={"errorMessages": ["Rate limit exceeded"]}
            )
        board_match = re.match(r"^/rest/agile/1\.0/board/(\d+)(/.*)?$", path)
        if board_match and int(board_match.group(1)) in self.fail_boards:
            return httpx.Response(500, json={"errorMessages": ["Erro interno simulado"]})

        if path == "/rest/api/3/myself":
            return httpx.Response(
                200,
                json={
                    "accountId": "demo-bot",
                    "displayName": "Cadência (demo)",
                    "timeZone": "America/Sao_Paulo",
                },
            )
        if path == "/rest/api/3/mypermissions":
            return httpx.Response(200, json={"permissions": {"BROWSE_PROJECTS": {"havePermission": True}}})
        if path == "/rest/api/3/field":
            return httpx.Response(200, json=FIELDS)
        if path == "/rest/api/3/status":
            return httpx.Response(
                200,
                json=[{"id": i, "name": n, "statusCategory": {"key": c}} for i, n, c in STATUSES.values()],
            )
        if path == "/rest/agile/1.0/board":
            return httpx.Response(200, json=self._page(list(self.boards.values()), params, "values"))
        if board_match:
            board_id = int(board_match.group(1))
            rest = board_match.group(2) or ""
            if board_id not in self.boards:
                return httpx.Response(404, json={"errorMessages": ["Board não encontrado"]})
            if rest == "/configuration":
                return httpx.Response(
                    200,
                    json={
                        "id": board_id,
                        "columnConfig": {
                            "columns": [
                                {"name": n, "statuses": [{"id": s} for s in ids]} for n, ids in COLUMNS
                            ]
                        },
                    },
                )
            if rest == "/sprint":
                if self.boards[board_id]["type"] != "scrum":
                    return httpx.Response(400, json={"errorMessages": ["The board does not support sprints"]})
                states = set((params.get("state") or "active,future,closed").split(","))
                items = [
                    s
                    for s in self.sprints.values()
                    if s["originBoardId"] == board_id and s["state"] in states
                ]
                return httpx.Response(200, json=self._page(items, params, "values"))
            if rest == "/issue":
                items = [i.payload() for i in self.issues.values() if i.board == board_id]
                return httpx.Response(200, json=self._page(items, params, "issues", is_last=False))
        sprint_match = re.match(r"^/rest/agile/1\.0/sprint/(\d+)/issue$", path)
        if sprint_match:
            sprint_id = int(sprint_match.group(1))
            items = [i.payload() for i in self.issues.values() if sprint_id in i.sprints]
            return httpx.Response(200, json=self._page(items, params, "issues", is_last=False))
        changelog_match = re.match(r"^/rest/api/3/issue/([A-Z]+-\d+)/changelog$", path)
        if changelog_match:
            issue = self.issues.get(changelog_match.group(1))
            if issue is None:
                return httpx.Response(404, json={"errorMessages": ["Issue does not exist"]})
            return httpx.Response(200, json=self._page(issue.histories, params, "values"))
        if path == "/rest/api/3/search/jql" and request.method == "POST":
            import json as _json

            body = _json.loads(request.content or b"{}")
            keys_match = re.search(r"key in \(([^)]*)\)", body.get("jql", ""))
            if keys_match:
                wanted = [k.strip() for k in keys_match.group(1).split(",")]
                items = [self.issues[k].payload() for k in wanted if k in self.issues]
            else:
                items = [i.payload() for i in self.issues.values()]
            return httpx.Response(200, json={"issues": items, "isLast": True})
        if path == "/rest/api/3/search/approximate-count":
            return httpx.Response(200, json={"count": len(self.issues)})
        return httpx.Response(404, json={"errorMessages": [f"rota de demonstração inexistente: {path}"]})
