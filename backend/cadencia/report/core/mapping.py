"""Mapping between template areas and data fields (RF-38). Saved and reused every sprint."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Literal

from pydantic import BaseModel, Field, field_validator

Mode = Literal[
    "text",
    "number",
    "status_text",
    "bullet_list",
    "inline_list",
    "grouped_list",
    "table_rows",
    "grouped_rows",
    "status_fill",
    "chart",
    #: RF-63: the value rendered as a QR code and placed over the area. A link to scan, an id to
    #: hand to a phone — something a slide can carry as a picture but not as words.
    "qr_code",
]
Sort = Literal["modelo", "chave", "resumo", "responsavel", "prazo", "situacao", "epico", "estimativa"]
Case = Literal["original", "maiuscula", "minuscula", "capitular"]
Align = Literal["modelo", "esquerda", "centro", "direita", "justificado"]
NumberFormat = Literal["inteiro", "decimal", "percentual", "percentual_decimal", "moeda"]

# Deck statuses a row can carry; a binding may keep only some of them.
DECK_STATUSES = ("concluido", "em_dia", "risco", "atrasado")

DEFAULT_PALETTE = {
    "concluido": "00B050",
    "em_dia": "00B050",
    "risco": "FFC000",
    "atrasado": "FF0000",
}
DEFAULT_STATUS_LABELS = {
    "concluido": "Concluído",
    "em_dia": "Em dia",  # deck text: pt-BR by design (docs/i18n.md)
    "risco": "Em risco",  # deck text: pt-BR by design (docs/i18n.md)
    "atrasado": "Atrasado",
}

#: #5: the Okabe-Ito palette — chosen because it stays distinguishable under every common form of
#: colour blindness (deuteranopia, protanopia, tritanopia), unlike red/green/amber. Offered as a
#: suggestion, never applied automatically: `StatusPalette` shows badges with an icon *and* a
#: label everywhere in the app, but a coloured cell on the deck's own slide has neither, so the
#: colour alone is what a reader has to tell risk from progress by.
COLORBLIND_SAFE_PALETTE = {
    "concluido": "0072B2",  # blue
    "em_dia": "009E73",  # bluish green
    "risco": "E69F00",  # orange
    "atrasado": "D55E00",  # vermillion
}


RuleOp = Literal[
    "maior", "maior_igual", "menor", "menor_igual", "igual", "diferente", "contem", "vazio", "nao_vazio"
]


class FormatCondition(BaseModel):
    """An extra condition a compound :class:`FormatRule` must also satisfy (all AND'd together).

    Table modes only: each condition is tested against its own column of the same row, which is
    the only place more than one field is on hand at once.
    """

    when: RuleOp
    value: str = ""
    column: int | None = None


class FormatRule(BaseModel):
    """RF-92: "when the value says this, colour it" — beyond the status palette.

    Tested against the text the slide will show (so a rule reads the way the deck reads: "85%" is
    85), numerically when both sides are numbers and as text otherwise. The first rule that matches
    wins, in the order they were written. ``also`` makes it compound: every extra condition must
    hold too ("atrasado E prioridade alta"), each read from its own table column.
    """

    when: RuleOp
    value: str = ""
    color: str
    apply: Literal["texto", "preenchimento"] = "texto"
    #: Table modes: the table column whose text is tested; empty tests the status column.
    column: int | None = None
    #: Table modes: colour the whole row instead of only the tested cell.
    whole_row: bool = False
    also: list[FormatCondition] = Field(default_factory=list)

    @field_validator("color")
    @classmethod
    def _hex(cls, value: str) -> str:
        value = value.strip().lstrip("#").upper()
        if len(value) != 6 or any(c not in "0123456789ABCDEF" for c in value):
            raise ValueError("a cor precisa ser hexadecimal, como FF0000")
        return value


class CellScale(BaseModel):
    """#18: a table column read as a quantity and drawn as one — a bar of blocks after the value,
    an arrow by third of the range, or a fill blending from ``low_color`` to ``high_color``.

    The range is the column's own min and max on the slide unless ``min``/``max`` fix it.
    ``inverted`` says a higher number is worse (days blocked), which flips arrows and colours."""

    column: int = Field(ge=0)
    kind: Literal["barra", "icone", "cor"] = "barra"
    min: float | None = None
    max: float | None = None
    inverted: bool = False
    low_color: str = "F8D7DA"
    high_color: str = "D1E7DD"

    @field_validator("low_color", "high_color")
    @classmethod
    def _hex(cls, value: str) -> str:
        return FormatRule._hex(value)


class Binding(BaseModel):
    target: str
    mode: Mode
    #: RF-59: the registered variable this area shows, by bare name. It is the way a binding should
    #: be written from now on — the variable manager is the one place a name exists, and a variable
    #: carries its own kind, so a table binding names a ``rows`` variable exactly as a text binding
    #: names a ``text`` one.
    variable: str | None = None
    #: The legacy path: a catalogue key bound straight to the area, from before variables were
    #: typed. Still resolved so no saved mapping breaks; `key` is what resolution actually reads.
    field: str | None = None
    value: str | None = None  # literal text instead of a data field

    @property
    def key(self) -> str | None:
        """The catalogue key this binding resolves, whichever way it was written.

        A variable is addressed as ``texto.<name>`` everywhere else in the module, so expressing
        `variable` as that key means every resolver, validator and error message keeps working
        without learning a second spelling.
        """
        if self.variable:
            return f"texto.{self.variable}"
        return self.field

    columns: list[str | None] | None = None  # table modes: data column per table column
    header_rows: int = 1
    status_column: int | None = None  # table column whose fill follows the row status
    group_row: int | None = None  # grouped_rows: prototype row for group headers
    item_row: int | None = None  # table modes: prototype row for items
    header_paragraph: int | None = None  # grouped_list prototypes
    item_paragraph: int | None = None

    # ---- layout: how the value is shaped before it reaches the slide. Every one of these is
    # optional and defaults to "leave the template alone".
    max_items: int | None = None
    max_chars: int | None = None  # per item/line, with an ellipsis
    sort: Sort = "modelo"
    descending: bool = False
    only_status: list[str] = Field(default_factory=list)  # keep only these deck statuses
    empty_text: str = ""  # written instead of leaving the area blank
    text_case: Case = "original"
    prefix: str = ""
    suffix: str = ""
    separator: str = " · "  # inline_list
    bullet: str = ""  # bullet_list: a literal marker before each item
    number_format: NumberFormat = "inteiro"
    decimals: int = 1
    text_columns: int = 1  # flow the text in N columns inside the shape
    #: qr_code: how much of a damaged symbol must still scan. "m" (~15%) survives being printed,
    #: projected and photographed off a screen, which is what a deck's QR goes through.
    qr_error: Literal["l", "m", "q", "h"] = "m"
    align: Align = "modelo"
    shrink_to_fit: bool = False
    #: RF-92: conditional formatting, first match wins.
    rules: list[FormatRule] = Field(default_factory=list)
    #: #18: table columns drawn as bars, arrows or a colour scale.
    scales: list[CellScale] = Field(default_factory=list)
    #: #15: what a screen reader says for a chart or QR this binding draws. Empty describes the
    #: data itself ("Vazão por janela: Semana 1: 3; Semana 2: 5").
    alt_text: str = ""


class SlideMapping(BaseModel):
    action: Literal["keep", "remove"] = "keep"
    scope: Literal["deck", "board", "repeat"] = "deck"
    board_id: int | None = None
    overflow: Literal["clone", "truncate"] = "clone"
    # A repeated slide can run once per board or once per space. Per space is what a slide about
    # "the space" wants: two boards of the same team share one slide.
    repeat_by: Literal["board", "espaco"] = "board"
    # Drop the slide when this field has nothing to show ("no blockers this week, no Blockers
    # slide"). Empty means always keep it.
    hide_when_empty: str | None = None
    #: RF-65: a name somebody gave this slide, to find it in a deck of thirty. Empty falls back to
    #: the template's own headline, so a mapping saved before this reads exactly as it did.
    name: str = ""
    # RF-55: which spaces and boards this slide belongs to. **Empty means every one of them**, and
    # that is the default a new slide gets on purpose: a mapping saved before this existed has
    # empty lists everywhere, so an old presentation keeps emitting exactly the slides it always
    # did. Opting a slide *out* has to be a decision somebody made, never a silent consequence of
    # an upgrade. The two are ANDed, and each is ignored when empty.
    only_spaces: list[str] = Field(default_factory=list)
    only_boards: list[int] = Field(default_factory=list)
    #: #25: the audience variants this slide belongs to (by name, from `DeckMapping.audiences`).
    #: Empty means every audience — the same "empty is everywhere" rule as spaces and boards.
    only_audiences: list[str] = Field(default_factory=list)
    #: #26: minutes planned for this slide in the meeting; the presenter's timer warns past it.
    minutes: float | None = Field(None, ge=0, le=120)
    #: How Cadência's own presenter moves into this slide. Never written as OOXML `<p:transition>`
    #: — it is how *Cadência* presents, not a property of the .pptx file, so a deck opened in real
    #: PowerPoint shows no transition, which is honest rather than a promise Cadência cannot keep.
    transition: Literal["nenhuma", "fade", "deslizar"] = "nenhuma"
    bindings: list[Binding] = Field(default_factory=list)

    def covers(self, space_key: str | None, board_id: int | None) -> bool:
        """Whether this slide belongs to one space/board pair. Empty lists cover everything."""
        if self.only_spaces and (space_key or "") not in self.only_spaces:
            return False
        return not (self.only_boards and board_id not in self.only_boards)

    def for_audience(self, audience: str) -> bool:
        """#25: whether this slide goes to ``audience`` ("" = the full deck, every slide)."""
        return not audience or not self.only_audiences or audience in self.only_audiences

    @property
    def conditional(self) -> bool:
        """True when the slide is not simply everywhere — what the thumbnail badge marks."""
        return bool(self.only_spaces or self.only_boards or self.only_audiences)


class Schedule(BaseModel):
    """RF-77: when this template generates by itself, independent of the boards' checkpoints.

    The checkpoint is Friday 18:00 and the meeting may be Friday 10:00; a deck that exists only after
    the meeting it was for is no use. ``reference`` says which data it shows: right now, or the
    state frozen at the last checkpoint (the "official" weekly picture).
    """

    enabled: bool = False
    weekdays: list[int] = Field(default_factory=lambda: [4])  # 0 = segunda ... 6 = domingo
    hour: int = Field(10, ge=0, le=23)
    minute: int = Field(0, ge=0, le=59)
    timezone: str = "America/Sao_Paulo"
    reference: Literal["agora", "ultimo_checkpoint"] = "agora"
    notify: bool = True  # send it to the channels subscribed to "deck" (RF-71)
    #: #13: what the delivery carries. E-mail attaches the file; a webhook (Slack, Teams) cannot
    #: carry a file, so it always gets the link.
    attach: Literal["link", "pptx", "pdf"] = "link"
    #: #25: the audience variant the scheduled deck is generated for ("" = everyone).
    audience: str = ""

    @field_validator("weekdays")
    @classmethod
    def _weekdays(cls, value: list[int]) -> list[int]:
        if not value or any(d < 0 or d > 6 for d in value):
            raise ValueError("dias da semana vão de 0 (segunda) a 6 (domingo)")  # i18n: out of scope
        return sorted(set(value))

    @field_validator("timezone")
    @classmethod
    def _timezone(cls, value: str) -> str:
        from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError(f"fuso horário desconhecido: {value!r}") from None  # i18n: out of scope
        return value


class DeckMapping(BaseModel):
    slides: dict[str, SlideMapping] = Field(default_factory=dict)
    # RF-62: the status colours and labels are configured **once**, in the variable manager, and
    # these are this template's overrides of them. Empty means "inherit", which is why they no
    # longer default to `DEFAULT_PALETTE`: a full copy here would mean every template silently
    # overrode the shared setting and changing it centrally would do nothing. `service.load_mapping`
    # merges the two before anything resolves a colour.
    palette: dict[str, str] = Field(default_factory=dict)
    status_labels: dict[str, str] = Field(default_factory=dict)

    def inheriting(self, palette: Mapping[str, str], labels: Mapping[str, str]) -> DeckMapping:
        """A copy with the shared configuration underneath this template's own choices."""
        return self.model_copy(
            update={
                "palette": {**palette, **{k: v for k, v in self.palette.items() if v}},
                "status_labels": {**labels, **{k: v for k, v in self.status_labels.items() if v}},
            }
        )

    anonymize: bool = False
    board_ids: list[int] = Field(default_factory=list)  # boards for "repeat" slides; empty = selected
    # RF-55: spaces the presentation covers. Empty means every space the boards belong to, so an
    # older mapping is unchanged. A space here narrows `board_ids` rather than adding to it.
    space_keys: list[str] = Field(default_factory=list)
    auto_generate: bool = False  # generate at every checkpoint (scheduler)
    schedule: Schedule = Field(default_factory=Schedule)  # RF-77: its own time, besides checkpoints
    #: #12: a deck from this template is downloaded (without ``force``) only once approved.
    require_approval: bool = False
    #: #25: named audience variants ("Executivo", "Time"); a slide narrows itself to some of them.
    audiences: list[str] = Field(default_factory=list)

    def for_slide(self, slide_id: int) -> SlideMapping:
        return self.slides.get(str(slide_id)) or SlideMapping()

    def targets(self) -> list[str]:
        return [b.target for m in self.slides.values() for b in m.bindings]

    def color(self, status: str | None) -> str | None:
        return self.palette.get(status or "") if status else None

    def label(self, status: str | None) -> str:
        return self.status_labels.get(status or "", status or "")
