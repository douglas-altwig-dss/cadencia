"""How a value is shaped before it reaches the slide (RF-41).

The generator answers "what goes here"; this module answers "in what shape". Sorting, filtering,
trimming, casing and number formatting all live here so every binding mode gets the same options
and the generator stays about PowerPoint.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from typing import Any

from cadencia.report.core.context import Group, Row, RowGroup
from cadencia.report.core.mapping import Binding, CellScale, FormatRule, RuleOp

ELLIPSIS = "…"
_SORT_KEYS: dict[str, Callable[[Row], Any]] = {
    "chave": lambda r: r.values.get("chave", ""),
    "resumo": lambda r: r.values.get("resumo", "").casefold(),
    "responsavel": lambda r: r.values.get("responsavel", "").casefold(),
    "prazo": lambda r: r.values.get("prazo", "") or "￿",
    "situacao": lambda r: r.values.get("situacao", ""),
    "epico": lambda r: r.values.get("epico", "").casefold(),
    "estimativa": lambda r: _as_float(r.values.get("estimativa")),
}


def _as_float(text: str | None) -> float:
    if not text:
        return 0.0
    try:
        return float(text.replace(",", "."))
    except ValueError:
        return 0.0


def apply_case(text: str, case: str) -> str:
    if case == "maiuscula":
        return text.upper()
    if case == "minuscula":
        return text.lower()
    if case == "capitular":
        # Only the first letter: title-casing a Portuguese sentence mangles it ("De" for "de").
        return text[:1].upper() + text[1:] if text else text
    return text


def clip(text: str, limit: int | None) -> str:
    if not limit or len(text) <= limit:
        return text
    return text[: max(limit - 1, 1)].rstrip() + ELLIPSIS


def decorate(text: str, binding: Binding) -> str:
    """Prefix, suffix, casing and clipping, in the order a reader would expect them."""
    if not text:
        return text
    return f"{binding.prefix}{apply_case(clip(text, binding.max_chars), binding.text_case)}{binding.suffix}"


def format_number(value: float | None, binding: Binding) -> str:
    """A number the way the slide should read it. Portuguese decimal comma throughout."""
    if value is None:
        return ""
    fmt = binding.number_format
    digits = max(0, min(binding.decimals, 6))
    if fmt in {"percentual", "percentual_decimal"}:
        digits = 0 if fmt == "percentual" else digits
        text = f"{value * 100:.{digits}f}".replace(".", ",")
        return f"{text}%"
    if fmt == "moeda":
        text = f"{value:,.{digits}f}".replace(",", "\x00").replace(".", ",").replace("\x00", ".")
        return f"R$ {text}"
    if fmt == "decimal":
        return f"{value:.{digits}f}".replace(".", ",")
    return f"{round(value):d}"


def as_number(text: str | None) -> float | None:
    """A shown value read back as a number: "85%", "R$ 1.234,50", "3,5" and "-2" all parse."""
    if text is None:
        return None
    raw = str(text).replace("R$", "").replace("%", "").replace("\u00a0", "").strip()
    if "," in raw and "." in raw:
        raw = raw.replace(".", "").replace(",", ".")
    else:
        raw = raw.replace(",", ".")
    try:
        return float(raw)
    except ValueError:
        return None


def _condition_matches(when: RuleOp, value: str, text: str | None) -> bool:
    shown = (text or "").strip()
    if when == "vazio":
        return not shown
    if when == "nao_vazio":
        return bool(shown)
    if when == "contem":
        return value.strip().casefold() in shown.casefold()
    left, right = as_number(shown), as_number(value)
    if left is not None and right is not None:
        a, b = left, right
    elif when in {"igual", "diferente"}:
        a, b = shown.casefold(), value.strip().casefold()  # type: ignore[assignment]
    else:
        return False  # "greater than" means nothing between words
    return {
        "maior": lambda: a > b,
        "maior_igual": lambda: a >= b,
        "menor": lambda: a < b,
        "menor_igual": lambda: a <= b,
        "igual": lambda: a == b,
        "diferente": lambda: a != b,
    }[when]()


def rule_matches(rule: FormatRule, text: str | None) -> bool:
    return _condition_matches(rule.when, rule.value, text)


def rule_matches_row(rule: FormatRule, values: Sequence[str | None], tested_text: str | None) -> bool:
    """Like :func:`rule_matches`, but every one of ``rule.also`` must hold too, each read from its
    own column of the same row — a compound rule such as "atrasado E prioridade alta"."""
    if not rule_matches(rule, tested_text):
        return False

    def _column(col: int | None) -> str | None:
        return values[col] if col is not None and 0 <= col < len(values) else None

    return all(_condition_matches(cond.when, cond.value, _column(cond.column)) for cond in rule.also)


def first_rule(rules: Sequence[FormatRule], text: str | None) -> FormatRule | None:
    return next((rule for rule in rules if rule_matches(rule, text)), None)


def filter_rows(rows: Sequence[Row], binding: Binding) -> list[Row]:
    if not binding.only_status:
        return list(rows)
    wanted = set(binding.only_status)
    return [r for r in rows if (r.status or "") in wanted]


def sort_rows(rows: Sequence[Row], binding: Binding) -> list[Row]:
    """``modelo`` keeps the order the data came in, which is the board's own ranking."""
    key = _SORT_KEYS.get(binding.sort)
    out = list(rows) if key is None else sorted(rows, key=key)
    if binding.descending:
        out.reverse()
    return out


def shape_rows(rows: Sequence[Row] | None, binding: Binding) -> list[Row]:
    out = sort_rows(filter_rows(rows or (), binding), binding)
    return out[: binding.max_items] if binding.max_items else out


def shape_row_groups(groups: Sequence[RowGroup] | None, binding: Binding) -> list[RowGroup]:
    """Groups keep their order; the rows inside each are filtered, sorted and capped.

    ``max_items`` counts per group, because a cap that ate whole groups would silently drop an
    epic rather than shorten it.
    """
    out = []
    for group in groups or ():
        rows = shape_rows(group.rows, binding)
        if rows:
            out.append(RowGroup(title=group.title, rows=rows))
    return out


def shape_groups(groups: Sequence[Group] | None, binding: Binding) -> list[Group]:
    out = []
    for group in groups or ():
        items = [decorate(item, binding) for item in group.items]
        if binding.max_items:
            items = items[: binding.max_items]
        if items:
            title = decorate(group.title, binding) if binding.prefix else group.title
            out.append(Group(title=title, items=items))
    return out


def flatten(value: Any, kind: str | None, binding: Binding) -> list[str]:
    """Any list-shaped field as plain lines, for ``bullet_list`` and ``inline_list``.

    The list has lost its groups by definition, so ``max_items`` caps the whole list here — unlike
    ``grouped_list``, where the same option shortens each group instead of dropping one.
    """
    uncapped = binding.model_copy(update={"max_items": None})
    lines: list[str] = []
    if kind == "groups":
        for group in shape_groups(value, uncapped):
            lines += group.items
    elif kind == "rows":
        lines = [r.values.get("resumo", "") for r in shape_rows(value, uncapped)]
    elif kind == "row_groups":
        for group in shape_row_groups(value, uncapped):
            lines += [r.values.get("resumo", "") for r in group.rows]
    elif value is not None:
        lines = [str(value)]
    if kind != "groups":  # groups were decorated on the way out of shape_groups
        lines = [decorate(line, binding) for line in lines if line]
    lines = [line for line in lines if line]
    return lines[: binding.max_items] if binding.max_items else lines


# ---------------------------------------------------------------- scales in tables (#18)

BAR_CELLS = 5
BAR_FULL, BAR_EMPTY = "▰", "▱"
ARROWS = ("▼", "●", "▲")  # low, middle, high third


def _blend(low: str, high: str, ratio: float) -> str:
    a = [int(low[i : i + 2], 16) for i in (0, 2, 4)]
    b = [int(high[i : i + 2], 16) for i in (0, 2, 4)]
    return "".join(f"{round(x + (y - x) * ratio):02X}" for x, y in zip(a, b, strict=True))


def scale_marks(
    rows: Sequence[Sequence[str | None]], scales: Sequence[CellScale]
) -> list[dict[int, dict[str, str]]]:
    """For each row, what each scaled column becomes: ``{col: {"text": ..., "fill": ...}}``.

    Generation and the preview both call this, so the canvas shows the very bars the file gets.
    A cell that does not read as a number is left alone."""
    out: list[dict[int, dict[str, str]]] = [{} for _ in rows]
    for scale in scales:
        numbers = [as_number(r[scale.column]) if scale.column < len(r) else None for r in rows]
        present = [n for n in numbers if n is not None]
        if not present:
            continue
        low = scale.min if scale.min is not None else min(present)
        high = scale.max if scale.max is not None else max(present)
        span = high - low
        for index, number in enumerate(numbers):
            if number is None:
                continue
            ratio = 0.5 if span <= 0 else min(max((number - low) / span, 0.0), 1.0)
            good = 1 - ratio if scale.inverted else ratio
            mark = out[index].setdefault(scale.column, {})
            shown = mark.get("text", rows[index][scale.column] or "")
            if scale.kind == "barra":
                filled = int(ratio * BAR_CELLS + 0.5)  # half up, as a reader counts, not banker's
                mark["text"] = f"{shown} {BAR_FULL * filled}{BAR_EMPTY * (BAR_CELLS - filled)}".strip()
            elif scale.kind == "icone":
                third = min(int(good * 3), 2)
                mark["text"] = f"{ARROWS[third]} {shown}".strip()
            else:
                mark["fill"] = _blend(scale.low_color, scale.high_color, good)
    return out
