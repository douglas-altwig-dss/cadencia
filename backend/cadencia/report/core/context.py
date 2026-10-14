"""Data handed to the deck generator, and the field catalogue users map areas to.

The generator only sees these plain structures, never the database, so it can be tested with
hand-built data. Deck status categories: ``concluido``, ``em_dia``, ``risco``, ``atrasado``.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import datetime
from types import MappingProxyType
from typing import Any, Literal

from cadencia.i18n.message import Msg

Kind = Literal["text", "number", "groups", "rows", "row_groups", "status", "series"]


class _Missing:
    """A registered variable that nobody filled in and whose registration has no default.

    It is deliberately neither ``None`` nor ``""``. ``None`` is "this field has no data for this
    board", an ordinary empty that a deck is allowed to contain; ``""`` is a value somebody chose.
    This is the third case — *nothing was ever said* — and the generator refuses it instead of
    printing a blank, which is the whole of RF-45's "an unfilled variable must be loud".
    """

    __slots__ = ()

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return "<variável sem valor>"  # i18n: out of scope

    def __bool__(self) -> bool:
        return False


MISSING = _Missing()


@dataclass(frozen=True)
class VariableSpec:
    """One registration, as the generator sees it.

    ``default`` is the *only* place a variable may carry a fallback. ``None`` means it has none,
    and a target that fills in nothing gets :data:`MISSING` rather than an empty string.

    RF-59: a variable is **typed**. ``kind`` comes from the field it reads from, so a variable
    wired to ``riscos.itens`` is a ``rows`` variable that fills a table and one wired to
    ``board.status_geral`` is a ``status`` variable that colours a shape. A hand-filled variable is
    ``text``, because words are the only thing a person can type into a box. That is what lets the
    manager be the single place a name exists without costing the deck its tables and charts.
    """

    name: str
    label: str = ""
    default: str | None = None
    #: RF-58: a catalogue key this variable reads from when no target filled it in. Never another
    #: ``texto.*`` — the API refuses that, so this cannot walk into a cycle.
    source_field: str | None = None
    #: Derived from ``source_field``, never stored: a kind that could disagree with its source is
    #: a kind that will, the first time somebody repoints the variable.
    kind: Kind = "text"

    @property
    def typed(self) -> bool:
        """True when this variable carries something a person cannot type: rows, a series, a status.

        The distinction runs through the whole module. A ``text`` variable has the full four-level
        walk of hand-written values behind it; a typed one has exactly one answer, its field, and
        the API refuses to store values or a default for it.
        """
        return self.kind != "text"


@dataclass
class Group:
    title: str
    items: list[str]


@dataclass
class Row:
    values: dict[str, str]
    status: str | None = None


@dataclass
class RowGroup:
    title: str
    rows: list[Row]


@dataclass
class Series:
    """What a chart area draws.

    ``style`` says how a *rendered* chart draws it — a native chart in the template keeps its own
    type and only receives ``categories``/``series``. ``marks`` carries what does not fit a
    category × value grid: points of a scatter (``{"x": index, "y": value, "label": key}``) or the
    bars of a Gantt (``{"lane": name, "start": h, "end": h, "color": "#rrggbb", "label": id}``).
    """

    categories: list[str]
    series: dict[str, list[float]]
    style: str = "bar"  # bar | stacked_area | line | scatter | gantt
    marks: list[dict[str, Any]] = field(default_factory=list)
    x_label: str = ""
    y_label: str = ""


#: Styles that only make sense rendered: a template's native bar chart cannot be a Gantt.
RENDER_ONLY_STYLES = frozenset({"scatter", "gantt"})


@dataclass
class BoardDeck:
    board_id: int
    name: str
    space_key: str | None = None
    space_name: str | None = None
    sprint_id: int | None = None
    texts: dict[str, str] = field(default_factory=dict)
    groups: dict[str, list[Group]] = field(default_factory=dict)
    rows: dict[str, list[Row]] = field(default_factory=dict)
    row_groups: dict[str, list[RowGroup]] = field(default_factory=dict)
    statuses: dict[str, str] = field(default_factory=dict)
    series: dict[str, Series] = field(default_factory=dict)
    numbers: dict[str, float] = field(default_factory=dict)


@dataclass
class DeckData:
    reference: datetime
    texts: dict[str, str] = field(default_factory=dict)
    numbers: dict[str, float] = field(default_factory=dict)
    boards: list[BoardDeck] = field(default_factory=list)
    #: Variables set on a single template slide, by that slide's id (RF-52). They are the narrowest
    #: scope, so they win over the board's, the space's and the global value.
    slide_texts: dict[int, dict[str, str]] = field(default_factory=dict)
    #: The registry, by name, and the single source of truth for which variables exist. A
    #: ``{{texto.x}}`` whose name is not a key here is not a variable at all — it is a typo, and
    #: :func:`resolve` answers ``None`` for it so the caller can refuse the deck.
    variables: dict[str, VariableSpec] = field(default_factory=dict)
    #: Only so an error can say *which* template the bad name appeared in.
    template_name: str = ""

    def board_by_id(self, board_id: int | None) -> BoardDeck | None:
        return next((b for b in self.boards if b.board_id == board_id), None)


@dataclass(frozen=True)
class FieldSpec:
    key: str
    kind: Kind
    scope: Literal["deck", "board"]
    label: str
    columns: tuple[str, ...] = ()
    group: str = "Geral"
    #: A message for the field picker (``fields.variable_hint.*``), rendered by the report service.
    hint: str | Msg = ""


ROW_COLUMNS = (
    "sprint",
    "chave",
    "resumo",
    "responsavel",
    "acao",
    "prazo",
    "situacao",
    "epico",
    "tipo",
    "estimativa",
    "status",
    "dias_parado",
    "cycle_time",
)

PLAN_COLUMNS = ("chave", "epico", "horas", "base_dias", "plano_dias", "ganho", "algoritmo", "situacao_plano")
CHANGE_COLUMNS = ("chave", "resumo", "responsavel", "de", "para", "motivo")
HEALTH_COLUMNS = ("problema", "gravidade", "quantidade", "exemplos", "acao")

# Groups are only for how the field picker is organised; they carry no behaviour. The pt-BR names
# are the catalogue's own copy; the API shows `fields.group.<GROUP_IDS[...]>` in the reader's
# language instead (docs/i18n-backend.md, 2.7, D7).
G_REPORT = "Relatório"  # deck text: pt-BR by design
G_SPACE = "Espaço (time)"  # deck text: pt-BR by design
G_BOARD = "Board"
G_SPRINT = "Sprint e janela"  # deck text: pt-BR by design
G_NUMBERS = "Números do resumo"  # deck text: pt-BR by design
G_LISTS = "Listas agrupadas"  # deck text: pt-BR by design
G_TABLES = "Tabelas"
G_STATUS = "Semáforos"  # deck text: pt-BR by design
G_CHARTS = "Gráficos"  # deck text: pt-BR by design
G_FIXED = "Variáveis"  # deck text: pt-BR by design
G_FORECAST = "Previsão e fluxo"  # deck text: pt-BR by design
G_CHANGES = "O que mudou"  # deck text: pt-BR by design
G_PLAN = "Plano do épico"  # deck text: pt-BR by design
G_HEALTH = "Saúde dos dados"  # deck text: pt-BR by design

#: A stable id per group, for the API (``group_id``) and the catalogue keys ``fields.group.<id>``.
GROUP_IDS = {
    G_REPORT: "report",
    G_SPACE: "space",
    G_BOARD: "board",
    G_SPRINT: "sprint",
    G_NUMBERS: "numbers",
    G_LISTS: "lists",
    G_TABLES: "tables",
    G_STATUS: "status",
    G_CHARTS: "charts",
    G_FIXED: "variables",
    G_FORECAST: "forecast",
    G_CHANGES: "changes",
    G_PLAN: "plan",
    G_HEALTH: "health",
    "Geral": "general",
}

FIELDS: tuple[FieldSpec, ...] = (
    # deck text: pt-BR by design (docs/i18n.md) — these labels are the charts' alt text in the .pptx;
    # the field picker shows `fields.label.<key>` in the reader's language instead.
    # ---- deck-wide
    FieldSpec("relatorio.data", "text", "deck", "Data de geração do relatório", group=G_REPORT),
    FieldSpec("relatorio.semana", "text", "deck", "Data do checkpoint de referência", group=G_REPORT),
    FieldSpec("relatorio.periodo", "text", "deck", "Período da janela de referência", group=G_REPORT),
    FieldSpec(
        "relatorio.boards", "text", "deck", "Boards do relatório, separados por vírgula", group=G_REPORT
    ),
    FieldSpec("relatorio.espacos", "text", "deck", "Espaços (times) do relatório", group=G_REPORT),
    FieldSpec("relatorio.total_boards", "number", "deck", "Quantidade de boards", group=G_REPORT),
    FieldSpec(
        "relatorio.total_entregues", "number", "deck", "Itens entregues somando os boards", group=G_REPORT
    ),
    FieldSpec(
        "relatorio.total_em_risco", "number", "deck", "Itens em risco somando os boards", group=G_REPORT
    ),
    FieldSpec(
        "relatorio.total_atrasados", "number", "deck", "Itens atrasados somando os boards", group=G_REPORT
    ),
    # ---- space (the project)
    FieldSpec(
        "espaco.nome", "text", "board", "Nome do espaço (time) — preenche o nome no modelo", group=G_SPACE
    ),
    FieldSpec("espaco.chave", "text", "board", "Chave do espaço (time) no Jira", group=G_SPACE),
    # ---- board
    FieldSpec("board.nome", "text", "board", "Nome do board", group=G_BOARD),
    FieldSpec("board.tipo", "text", "board", "Tipo do board (scrum ou kanban)", group=G_BOARD),
    FieldSpec(
        "board.pessoas", "text", "board", "Pessoas com itens na sprint, em ordem alfabética", group=G_BOARD
    ),
    FieldSpec("board.total_pessoas", "number", "board", "Quantas pessoas têm itens na sprint", group=G_BOARD),
    # ---- sprint and window
    FieldSpec("sprint.nome", "text", "board", "Nome da sprint", group=G_SPRINT),
    FieldSpec("sprint.periodo", "text", "board", "Início e fim da sprint", group=G_SPRINT),
    FieldSpec("sprint.objetivo", "text", "board", "Objetivo da sprint", group=G_SPRINT),
    FieldSpec(
        "sprint.estado", "text", "board", "Estado da sprint (ativa, encerrada, futura)", group=G_SPRINT
    ),
    FieldSpec(
        "sprint.dias_restantes", "number", "board", "Dias corridos até o fim da sprint", group=G_SPRINT
    ),
    FieldSpec("janela.numero", "text", "board", "Número da janela (semana) na sprint", group=G_SPRINT),
    FieldSpec("janela.periodo", "text", "board", "Período da janela", group=G_SPRINT),
    FieldSpec("janela.indice", "number", "board", "Índice da janela atual", group=G_SPRINT),
    FieldSpec("janela.total", "number", "board", "Quantidade de janelas da sprint", group=G_SPRINT),
    # ---- summary numbers (text for compatibility, plus a numeric twin for formatting)
    FieldSpec("resumo.entregues", "text", "board", "Itens entregues na janela", group=G_NUMBERS),
    FieldSpec(
        "resumo.comprometidos", "text", "board", "Itens comprometidos no início da sprint", group=G_NUMBERS
    ),
    FieldSpec(
        "resumo.aderencia",
        "text",
        "board",
        "Aderência ao combinado (entregues ÷ comprometidos)",
        group=G_NUMBERS,
    ),
    FieldSpec(
        "resumo.escopo_adicionado", "text", "board", "Itens que entraram depois do início", group=G_NUMBERS
    ),
    FieldSpec(
        "resumo.arrastados", "text", "board", "Itens arrastados de sprints anteriores", group=G_NUMBERS
    ),
    FieldSpec("resumo.em_risco", "text", "board", "Itens em risco", group=G_NUMBERS),
    FieldSpec("num.entregues", "number", "board", "Entregues na janela (número formatável)", group=G_NUMBERS),
    FieldSpec("num.comprometidos", "number", "board", "Comprometidos (número formatável)", group=G_NUMBERS),
    FieldSpec("num.entregues_sprint", "number", "board", "Entregues na sprint inteira", group=G_NUMBERS),
    FieldSpec("num.restantes", "number", "board", "Comprometidos ainda em aberto", group=G_NUMBERS),
    FieldSpec("num.removidos", "number", "board", "Itens que saíram da sprint", group=G_NUMBERS),
    FieldSpec("num.aderencia", "number", "board", "Aderência como fração (0–1)", group=G_NUMBERS),
    FieldSpec("num.escopo_adicionado", "number", "board", "Escopo adicionado (número)", group=G_NUMBERS),
    FieldSpec("num.arrastados", "number", "board", "Arrastados (número)", group=G_NUMBERS),
    FieldSpec("num.em_risco", "number", "board", "Em risco (número)", group=G_NUMBERS),
    FieldSpec("num.bloqueados", "number", "board", "Itens bloqueados", group=G_NUMBERS),
    FieldSpec("num.atrasados", "number", "board", "Itens atrasados ou arrastados", group=G_NUMBERS),
    FieldSpec("num.abertos", "number", "board", "Itens em aberto na sprint", group=G_NUMBERS),
    FieldSpec("num.sem_responsavel", "number", "board", "Itens abertos sem responsável", group=G_NUMBERS),
    FieldSpec("num.progresso", "number", "board", "Concluídos ÷ total da sprint (0–1)", group=G_NUMBERS),
    FieldSpec("num.cycle_p50", "number", "board", "Cycle time P50 em dias", group=G_NUMBERS),
    FieldSpec("num.cycle_p85", "number", "board", "Cycle time P85 em dias", group=G_NUMBERS),
    FieldSpec("num.lead_p50", "number", "board", "Lead time P50 em dias", group=G_NUMBERS),
    FieldSpec("num.wip", "number", "board", "Itens em andamento agora", group=G_NUMBERS),
    FieldSpec("num.vazao_janela", "number", "board", "Vazão da janela atual", group=G_NUMBERS),
    # ---- grouped lists
    FieldSpec(
        "entregas.por_epico", "groups", "board", "Entregues na janela, agrupados por épico", group=G_LISTS
    ),
    FieldSpec(
        "entregas.por_responsavel", "groups", "board", "Entregues na janela, por responsável", group=G_LISTS
    ),
    FieldSpec(
        "proximas.por_epico",
        "groups",
        "board",
        "Próximas atividades (abertas na sprint), por épico",
        group=G_LISTS,
    ),
    FieldSpec(
        "proximas.por_responsavel", "groups", "board", "Próximas atividades, por responsável", group=G_LISTS
    ),
    FieldSpec(
        "riscos.por_epico", "groups", "board", "Itens em risco com a evidência, por épico", group=G_LISTS
    ),
    FieldSpec(
        "riscos.por_situacao", "groups", "board", "Itens em risco agrupados pela situação", group=G_LISTS
    ),
    FieldSpec("prazos.por_epico", "groups", "board", "Épicos com data limite e itens abertos", group=G_LISTS),
    FieldSpec("bloqueios.por_epico", "groups", "board", "Itens bloqueados, por épico", group=G_LISTS),
    FieldSpec(
        "conquistas.destaques",
        "groups",
        "board",
        "Destaques da janela: entregas de maior estimativa",
        group=G_LISTS,
    ),
    # ---- tables
    FieldSpec(
        "riscos.bloqueios", "rows", "board", "Itens bloqueados (linhas de tabela)", ROW_COLUMNS, G_TABLES
    ),
    FieldSpec("riscos.itens", "rows", "board", "Itens em risco (linhas de tabela)", ROW_COLUMNS, G_TABLES),
    FieldSpec("entregas.itens", "rows", "board", "Itens entregues na janela (linhas)", ROW_COLUMNS, G_TABLES),
    FieldSpec("proximas.itens", "rows", "board", "Itens abertos na sprint (linhas)", ROW_COLUMNS, G_TABLES),
    FieldSpec("prazos.itens", "rows", "board", "Itens com prazo definido (linhas)", ROW_COLUMNS, G_TABLES),
    FieldSpec("sprint.itens", "rows", "board", "Todos os itens da sprint (linhas)", ROW_COLUMNS, G_TABLES),
    FieldSpec(
        "acompanhamento.por_epico",
        "row_groups",
        "board",
        "Itens da sprint com prazo ou risco, por épico",
        ROW_COLUMNS,
        G_TABLES,
    ),
    FieldSpec(
        "acompanhamento.por_responsavel",
        "row_groups",
        "board",
        "Itens da sprint por responsável",
        ROW_COLUMNS,
        G_TABLES,
    ),
    FieldSpec(
        "acompanhamento.por_situacao",
        "row_groups",
        "board",
        "Itens da sprint por situação de risco",
        ROW_COLUMNS,
        G_TABLES,
    ),
    # ---- status lights
    FieldSpec("board.status_geral", "status", "board", "Status geral do board", group=G_STATUS),
    FieldSpec("board.status_prazo", "status", "board", "Status de prazo", group=G_STATUS),
    FieldSpec("board.status_riscos", "status", "board", "Status de riscos e bloqueios", group=G_STATUS),
    FieldSpec(
        "board.status_escopo",
        "status",
        "board",
        "Status de escopo (quanto entrou depois do início)",
        group=G_STATUS,
    ),
    FieldSpec(
        "board.status_aderencia", "status", "board", "Status de aderência ao combinado", group=G_STATUS
    ),
    # ---- charts
    FieldSpec("grafico.vazao", "series", "board", "Vazão por janela da sprint", group=G_CHARTS),
    FieldSpec(
        "grafico.evolucao", "series", "board", "Comprometido × entregue nas últimas sprints", group=G_CHARTS
    ),
    FieldSpec("grafico.riscos", "series", "board", "Itens por situação de risco", group=G_CHARTS),
    FieldSpec("grafico.burndown", "series", "board", "Itens em aberto ao fim de cada janela", group=G_CHARTS),
    FieldSpec("grafico.por_responsavel", "series", "board", "Entregues por pessoa na janela", group=G_CHARTS),
    FieldSpec("grafico.por_tipo", "series", "board", "Itens da sprint por tipo", group=G_CHARTS),
    FieldSpec("grafico.progresso", "series", "board", "Concluído × em andamento × a fazer", group=G_CHARTS),
    # ---- forecast and flow (#2, #3)
    FieldSpec(
        "grafico.previsao",
        "series",
        "board",
        "Previsão Monte Carlo: dias úteis para terminar o que resta (P50, P85, P95)",
        group=G_FORECAST,
    ),
    FieldSpec(
        "grafico.cfd", "series", "board", "Fluxo cumulativo (CFD) por coluna do board", group=G_FORECAST
    ),
    FieldSpec(
        "grafico.aging",
        "series",
        "board",
        "Idade dos itens em andamento, por coluna (aging)",
        group=G_FORECAST,
    ),
    FieldSpec("previsao.p50_data", "text", "board", "Data com 50% de chance de terminar", group=G_FORECAST),
    FieldSpec("previsao.p85_data", "text", "board", "Data com 85% de chance de terminar", group=G_FORECAST),
    FieldSpec(
        "previsao.chance_sprint",
        "text",
        "board",
        "Chance de terminar o que resta até o fim da sprint",
        group=G_FORECAST,
    ),
    FieldSpec("num.previsao_p50_dias", "number", "board", "Dias úteis até terminar (P50)", group=G_FORECAST),
    FieldSpec("num.previsao_p85_dias", "number", "board", "Dias úteis até terminar (P85)", group=G_FORECAST),
    FieldSpec(
        "num.previsao_chance_sprint",
        "number",
        "board",
        "Chance de terminar na sprint (0–1)",
        group=G_FORECAST,
    ),
    # ---- trends (#5): this period against the previous one
    FieldSpec(
        "num.vazao_janela_delta",
        "number",
        "board",
        "Vazão da janela menos a da janela anterior",
        group=G_NUMBERS,
    ),
    FieldSpec(
        "num.aderencia_delta",
        "number",
        "board",
        "Aderência menos a da sprint anterior (fração)",
        group=G_NUMBERS,
    ),
    FieldSpec(
        "num.entregues_sprint_delta",
        "number",
        "board",
        "Entregues na sprint menos os da sprint anterior",
        group=G_NUMBERS,
    ),
    FieldSpec(
        "num.em_risco_delta", "number", "board", "Em risco agora menos no último checkpoint", group=G_NUMBERS
    ),
    FieldSpec("tendencia.vazao", "text", "board", "Vazão com seta de tendência (ex.: 5 ↑2)", group=G_NUMBERS),
    FieldSpec("tendencia.aderencia", "text", "board", "Aderência com seta de tendência", group=G_NUMBERS),
    FieldSpec("tendencia.em_risco", "text", "board", "Em risco com seta de tendência", group=G_NUMBERS),
    # ---- what changed since the last checkpoint (#4)
    FieldSpec("mudancas.periodo", "text", "board", "Desde quando a comparação é feita", group=G_CHANGES),
    FieldSpec(
        "mudancas.novos_riscos", "rows", "board", "Itens que ficaram em risco", CHANGE_COLUMNS, G_CHANGES
    ),
    FieldSpec("mudancas.resolvidos", "rows", "board", "Riscos resolvidos", CHANGE_COLUMNS, G_CHANGES),
    FieldSpec("mudancas.concluidos", "rows", "board", "Itens concluídos", CHANGE_COLUMNS, G_CHANGES),
    FieldSpec(
        "mudancas.entraram", "rows", "board", "Itens que entraram no escopo", CHANGE_COLUMNS, G_CHANGES
    ),
    FieldSpec("mudancas.resumo", "groups", "board", "Resumo das mudanças, em listas", group=G_CHANGES),
    FieldSpec("num.mudancas_novos_riscos", "number", "board", "Quantos ficaram em risco", group=G_CHANGES),
    FieldSpec(
        "num.mudancas_resolvidos", "number", "board", "Quantos riscos foram resolvidos", group=G_CHANGES
    ),
    FieldSpec(
        "num.mudancas_concluidos", "number", "board", "Quantos itens foram concluídos", group=G_CHANGES
    ),
    # ---- epic plan (#1)
    FieldSpec(
        "plano.epicos",
        "rows",
        "board",
        "Épicos da sprint com plano: horas, base × plano e ganho",
        PLAN_COLUMNS,
        G_PLAN,
    ),
    FieldSpec("plano.epico", "text", "board", "Épico principal (o de mais horas)", group=G_PLAN),
    FieldSpec(
        "plano.duracao",
        "text",
        "board",
        "Duração do plano do épico principal (planejamento + execução)",
        group=G_PLAN,
    ),
    FieldSpec("num.plano_dias", "number", "board", "Dias úteis do plano do épico principal", group=G_PLAN),
    FieldSpec("num.plano_base_dias", "number", "board", "Dias úteis do cronograma base", group=G_PLAN),
    FieldSpec("num.plano_ganho_dias", "number", "board", "Dias ganhos pelo plano", group=G_PLAN),
    FieldSpec("num.plano_horas", "number", "board", "Horas do épico principal", group=G_PLAN),
    FieldSpec("grafico.gantt", "series", "board", "Cronograma (Gantt) do épico principal", group=G_PLAN),
    FieldSpec(
        "grafico.horas_por_papel",
        "series",
        "board",
        "Horas-pessoa por papel no épico principal",
        group=G_PLAN,
    ),
    # ---- data health (#6)
    FieldSpec(
        "saude.problemas",
        "rows",
        "board",
        "Problemas de higiene do Jira neste board",
        HEALTH_COLUMNS,
        G_HEALTH,
    ),
    FieldSpec(
        "num.saude_problemas",
        "number",
        "board",
        "Quantos problemas de dados foram encontrados",
        group=G_HEALTH,
    ),
    FieldSpec("board.status_dados", "status", "board", "Status da qualidade dos dados", group=G_HEALTH),
)
FIELD_INDEX = {f.key: f for f in FIELDS}

# Mappings saved before a board stopped being called a "time" keep working: the old key is read
# as the new one. ``time.projeto`` was already the space, so it becomes ``espaco.nome``.
LEGACY_FIELD_KEYS = {
    "time.nome": "board.nome",
    "time.projeto": "espaco.nome",
    "time.status_geral": "board.status_geral",
    "time.status_prazo": "board.status_prazo",
    "time.status_riscos": "board.status_riscos",
}


def canonical_field(key: str) -> str:
    return LEGACY_FIELD_KEYS.get(key, key)


FIXED_PREFIX = "texto."


def fixed_text_spec(name: str, label: str = "", kind: Kind = "text", source: str | None = None) -> FieldSpec:
    """A variable, offered in the picker like any other field (RF-45, RF-59)."""
    return FieldSpec(
        key=f"{FIXED_PREFIX}{name}",
        kind=kind,
        scope="board",
        label=label or name,
        group=G_FIXED,
        hint=(
            Msg("fields.variable_hint.source", source=source) if source else Msg("fields.variable_hint.hand")
        ),
    )


def variable_name(key: str) -> str | None:
    """The bare name inside a ``texto.<name>`` key, or None if the key is not one."""
    key = canonical_field(key)
    if key.startswith(FIXED_PREFIX) and len(key) > len(FIXED_PREFIX):
        return key[len(FIXED_PREFIX) :]
    return None


def spec_for(key: str, registry: Mapping[str, VariableSpec] = MappingProxyType({})) -> FieldSpec | None:
    """The catalogue entry for a key, or None when nothing by that name exists.

    ``registry`` is the registered variables. It is empty by default **on purpose**: a caller with
    no registry in hand has no way to know that ``texto.x`` is real, and guessing that it is — which
    is what this function used to do for every well-formed ``texto.*`` — is exactly the implicit
    registration that let a typo render as a blank line. Callers that legitimately resolve
    variables have a :class:`DeckData` and pass ``deck.variables``.
    """
    key = canonical_field(key)
    spec = FIELD_INDEX.get(key)
    if spec is not None:
        return spec
    name = variable_name(key)
    if name is not None and name in registry:
        spec = registry[name]
        return fixed_text_spec(name, spec.label, spec.kind, spec.source_field)
    return None


def catalog(extra: Sequence[FieldSpec] = ()) -> list[dict[str, object]]:
    """The field picker's contents. ``extra`` carries the fixed texts stored for the instance."""
    return [
        {
            "key": f.key,
            "kind": f.kind,
            "scope": f.scope,
            "label": f.label,
            "columns": list(f.columns),
            "group": f.group,
            "hint": f.hint.to_json() if isinstance(f.hint, Msg) else f.hint,
        }
        for f in (*FIELDS, *extra)
    ]


def _blank(kind: Kind | None, value: object) -> bool:
    """Whether a resolved value has nothing to show, judged by its own kind.

    A table with no rows and a text of ``"   "`` are both nothing; a number of ``0`` and a status
    of ``concluido`` are both something. Stringifying everything — which is what this did while
    variables were text-only — would have called an empty ``rows`` list "[]" and shown it.
    """
    if value is None or value is MISSING:
        return True
    if kind in {"rows", "groups"}:
        return not len(value)  # type: ignore[arg-type]
    if kind == "row_groups":
        return not any(getattr(g, "rows", ()) for g in value)  # type: ignore[union-attr]
    if kind == "series":
        return not getattr(value, "categories", None)
    if kind == "number":
        return False  # zero is an answer
    return not str(value).strip()


def _from_source(deck: DeckData, board: BoardDeck | None, spec: VariableSpec | None) -> object:
    """RF-58: what a variable wired to a Jira field says, with the registration behind it.

    The order is deliberate. A typed value is an override somebody made for one target and has
    already won by the time we get here; the field is the variable's *meaning*, so it comes next;
    the literal default is the last resort, for a board where the field has nothing. Only then is
    it :data:`MISSING`, which keeps RF-45's promise that an unanswered variable is loud.

    An empty field is not an answer — a blank line on a slide is what this whole rule exists to
    stop — so it falls through to the default rather than printing nothing.
    """
    if spec is None:
        return MISSING
    if spec.source_field:
        kind, value = resolve(deck, board, spec.source_field)
        if kind is not None:
            # RF-59: the source **answered**, and an empty answer is still an answer. A sprint with
            # no goal, a board with no blockers — that is data, not a gap somebody forgot to fill,
            # and refusing the deck over it would make every optional field mandatory. A default,
            # when the registration has one, is an explicit "say this instead of nothing".
            if not _blank(kind, value) or spec.default is None:
                return value
            return spec.default
    # Nothing to read from: this is the hand-filled variable nobody filled in, which is the case
    # RF-45 exists for. Its default, or MISSING and a refused deck.
    return spec.default if spec.default is not None else MISSING


def resolve(
    deck: DeckData, board: BoardDeck | None, key: str, slide_id: int | None = None
) -> tuple[Kind | None, object]:
    """Value of ``key`` for a slide scoped to ``board`` (None for deck-level slides).

    ``slide_id`` is the *template* slide being filled. A variable set on that slide is the narrowest
    scope there is, so it answers before anything the board or the space says.

    Three answers, and callers must keep them apart:

    * ``(None, None)`` — no such field, and for a ``texto.*`` key that means *not registered*.
    * ``(kind, MISSING)`` — a registered variable nobody filled in, whose registration declares no
      default. The deck cannot be generated from it.
    * ``(kind, value)`` — a real value, possibly ``None`` for a field the board has no data for.
    """
    key = canonical_field(key)
    spec = spec_for(key, deck.variables)
    if spec is None:
        return None, None
    name = variable_name(key)
    if name is not None:
        variable = deck.variables.get(name)
        # RF-59: a typed variable skips the hand-written levels entirely. Nobody can type a table
        # or a chart series, so its field is its only answer and looking for an override first
        # would just be three dictionary misses.
        if variable is not None and variable.typed:
            return variable.kind, _from_source(deck, board, variable)
        # A text variable takes the registry's full walk: slide, then this board's resolved value,
        # then the deck-wide one (the global value, or the registration's default when it has no
        # source field). Nothing beyond that is invented here; a variable with no answer says so.
        if slide_id is not None:
            override = deck.slide_texts.get(slide_id, {}).get(name)
            if override is not None:
                return "text", override
        if board is not None and key in board.texts:
            return "text", board.texts[key]
        if key in deck.texts:
            return "text", deck.texts[key]
        return "text", _from_source(deck, board, variable)
    if spec.scope == "deck":
        store: Mapping[str, object] = deck.numbers if spec.kind == "number" else deck.texts
        return spec.kind, store.get(key)
    if board is None:
        return spec.kind, None
    stores: dict[str, Mapping[str, object]] = {
        "text": board.texts,
        "number": board.numbers,
        "groups": board.groups,
        "rows": board.rows,
        "row_groups": board.row_groups,
        "status": board.statuses,
        "series": board.series,
    }
    return spec.kind, stores[spec.kind].get(key)
