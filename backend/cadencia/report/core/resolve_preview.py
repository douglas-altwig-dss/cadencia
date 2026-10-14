"""What one slide will actually say, before it is generated (RF-38, RF-44).

The mapping screen used to show the template's own image with clickable boxes drawn on it: it told
you *where* a field would land, never *what* it would say. This resolves a slide's bindings exactly
the way :mod:`cadencia.report.core.generate` will — same layout pipeline, same status labels, same
placeholder expansion — and hands the result back as data the browser can draw over the template
image. No LibreOffice, so it is fast enough to refresh on every keystroke.
"""

from __future__ import annotations

from typing import Any

from cadencia.i18n.message import Msg
from cadencia.report.core import layout as lay
from cadencia.report.core.context import MISSING, BoardDeck, DeckData, Series, resolve, spec_for
from cadencia.report.core.generate import MarkerReport, expand_markers, render_marker
from cadencia.report.core.mapping import Binding, DeckMapping, SlideMapping
from cadencia.report.core.text import MARKER, marker_base


def _group_dict(group: Any) -> dict[str, Any]:
    return {"title": group.title, "items": list(group.items)}


def _row_dict(row: Any, mapping: DeckMapping) -> dict[str, Any]:
    return {
        "values": dict(row.values),
        "status": row.status,
        "status_label": mapping.label(row.status) if row.status else "",
        "color": mapping.color(row.status),
    }


def _series_dict(series: Series) -> dict[str, Any]:
    return {"categories": list(series.categories), "series": {k: list(v) for k, v in series.series.items()}}


def _as_text(kind: str | None, value: Any, mapping: DeckMapping) -> str:
    if value is MISSING:
        # The preview names it; it must never read as a deliberately blank line.
        raise AssertionError(
            "MISSING chegou a _as_text: o chamador tem de recusar antes"  # i18n: out of scope
        )
    if value is None:
        return ""
    if kind == "status":
        return mapping.label(str(value))
    if kind == "groups":
        return "\n".join(f"{g.title} {', '.join(g.items)}" for g in value)
    if kind == "rows":
        return "\n".join(r.values.get("resumo", "") for r in value)
    return str(value)


def resolve_binding(
    binding: Binding,
    deck: DeckData,
    board: BoardDeck | None,
    mapping: DeckMapping,
    slide_id: int | None = None,
) -> dict[str, Any]:
    """One binding's resolved content, shaped by exactly the options the generator will apply."""
    out: dict[str, Any] = {
        "target": binding.target,
        "mode": binding.mode,
        "field": binding.key,
        "literal": binding.value is not None,
        "layout": {
            "align": binding.align,
            "text_columns": binding.text_columns,
            "bullet": binding.bullet,
            "shrink_to_fit": binding.shrink_to_fit,
        },
    }
    if binding.value is not None:
        report = MarkerReport()
        kind: str | None = "text"
        value: Any = expand_markers(binding.value, deck, board, mapping, report, slide_id)
        out["raw"] = binding.value
        # The two stay apart: one is a name to register, the other a value to fill in.
        out["unregistered_texts"] = list(dict.fromkeys(report.unregistered))
        out["missing_texts"] = list(dict.fromkeys(report.unfilled))
    elif binding.key:
        spec = spec_for(binding.key, deck.variables)
        if spec is None:
            out.update({"kind": None, "unknown": True, "empty": True, "text": ""})
            return out
        kind, value = resolve(deck, board, binding.key, slide_id)
        if value is MISSING:
            # Shown exactly as it will be generated: the marker, not a blank.
            out.update(
                {
                    "kind": kind,
                    "unfilled": True,
                    "empty": True,
                    "text": f"{{{{{binding.key}}}}}",
                }
            )
            return out
    else:
        out.update({"kind": None, "empty": True, "text": "", "unbound": True})
        return out

    out["kind"] = kind
    if binding.mode in {"text", "status_text", "number"}:
        if binding.mode == "status_text":
            text = mapping.label(str(value)) if value else ""
        elif binding.mode == "number":
            text = lay.format_number(_number(kind, value), binding)
        else:
            text = _as_text(kind, value, mapping)
        text = lay.decorate(text, binding)
        out["text"] = text or binding.empty_text
        out["empty"] = not text
        # RF-92: the same first-match rule the generator applies, so the canvas can colour it.
        rule = lay.first_rule(binding.rules, out["text"])
        if rule is not None:
            out["rule"] = {"color": rule.color, "apply": rule.apply}
    elif binding.mode in {"bullet_list", "inline_list"}:
        lines = lay.flatten(value, kind, binding)
        out["lines"] = lines
        out["text"] = binding.separator.join(lines) if binding.mode == "inline_list" else "\n".join(lines)
        if not lines and binding.empty_text:
            out["text"] = binding.empty_text
        out["empty"] = not lines
    elif binding.mode == "grouped_list":
        groups = lay.shape_groups(value, binding) if kind == "groups" else []
        out["groups"] = [_group_dict(g) for g in groups]
        out["empty"] = not groups
    elif binding.mode == "table_rows":
        rows = lay.shape_rows(value, binding) if kind == "rows" else []
        out["rows"] = [_row_dict(r, mapping) for r in rows]
        out["scales"] = _scales(binding, rows, mapping)
        out["columns"] = list(binding.columns or [])
        out["status_column"] = binding.status_column
        out["header_rows"] = binding.header_rows
        out["empty"] = not rows
    elif binding.mode == "grouped_rows":
        groups = lay.shape_row_groups(value, binding) if kind == "row_groups" else []
        out["row_groups"] = [
            {"title": g.title, "rows": [_row_dict(r, mapping) for r in g.rows]} for g in groups
        ]
        out["columns"] = list(binding.columns or [])
        out["status_column"] = binding.status_column
        out["header_rows"] = binding.header_rows
        out["empty"] = not groups
    elif binding.mode == "status_fill":
        out["fill"] = mapping.color(str(value)) if value else None
        out["status"] = str(value) if value else None
        out["text"] = mapping.label(str(value)) if value else ""
        out["empty"] = not out["fill"]
    elif binding.mode == "qr_code":
        # The preview shows what will be *encoded*, not a drawn symbol: the point of checking a QR
        # before generating is that it points at the right thing.
        text = lay.decorate(_as_text(kind, value, mapping), binding)
        out["text"] = text or binding.empty_text
        out["qr_value"] = text
        out["empty"] = not text.strip()
    elif binding.mode == "chart":
        out["series"] = _series_dict(value) if isinstance(value, Series) else None
        out["empty"] = out["series"] is None or not out["series"]["categories"]
    return out


def _scales(binding: Any, rows: Any, mapping: Any) -> list[dict[str, dict[str, str]]]:
    """#18: the same bars/arrows/fills the generator writes, per row and table column."""
    if not binding.scales:
        return []
    columns = list(binding.columns or [])
    values = [
        [
            (mapping.label(r.status) if name == "situacao" else r.values.get(name, "")) if name else ""
            for name in columns
        ]
        for r in rows
    ]
    return [{str(k): v for k, v in marks.items()} for marks in lay.scale_marks(values, binding.scales)]


def _number(kind: str | None, value: Any) -> float | None:
    if kind == "number":
        return float(value) if value is not None else None
    if kind in {"rows", "groups"}:
        return float(len(value or ()))
    if kind == "row_groups":
        return float(sum(len(g.rows) for g in (value or ())))
    if value in (None, ""):
        return None
    try:
        return float(str(value).replace("%", "").replace(",", ".").strip())
    except ValueError:
        return None


def slide_preview(
    manifest_slide: dict[str, Any],
    spec: SlideMapping,
    mapping: DeckMapping,
    deck: DeckData,
    board: BoardDeck | None,
) -> dict[str, Any]:
    """Everything the browser needs to draw this slide as it will be generated."""
    slide_id = manifest_slide.get("slide_id")
    items = [resolve_binding(b, deck, board, mapping, slide_id) for b in spec.bindings]
    markers = []
    for area in manifest_slide.get("areas", []):
        for name in area.get("markers", []):
            kind, value, text = render_marker(deck, board, name, mapping, slide_id)
            markers.append(
                {
                    "area": area["id"],
                    "name": name,
                    "known": kind is not None,
                    "unfilled": kind is not None and value is MISSING,
                    "text": text if text is not None else f"{{{{{name}}}}}",
                }
            )
    # Messages, not text: the report service renders them for whoever asked (R1). The items and
    # markers above are deck content and stay exactly what the generator would write.
    warnings: list[Msg] = []
    if spec.scope == "board" and spec.board_id is None:
        warnings.append(Msg("deck_problem.preview.fixed_board_unset"))
    if board is None and spec.scope != "deck":
        warnings.append(Msg("deck_problem.preview.no_board_data"))
    space = (board.space_name or board.space_key or board.name) if board else None

    def unregistered(name: str) -> Msg:
        return Msg(
            "deck_problem.preview.variable_unregistered",
            marker=f"{{{{{name}}}}}",
            template=deck.template_name or "",
        )

    def unfilled(name: str) -> Msg:
        return Msg("deck_problem.preview.variable_unfilled", marker=f"{{{{{name}}}}}", target=space or "—")

    for item in items:
        if item.get("unknown"):
            field_key = item["field"]
            warnings.append(
                unregistered(field_key)
                if field_key.startswith("texto.")
                else Msg("deck_problem.preview.unknown_field", field=field_key)
            )
        if item.get("unfilled"):
            warnings.append(unfilled(item["field"]))
        for name in item.get("unregistered_texts", ()):
            warnings.append(unregistered(name))
        for name in item.get("missing_texts", ()):
            warnings.append(unfilled(name))
        if (
            item.get("empty")
            and not item.get("unbound")
            and not item.get("unknown")
            and not item.get("unfilled")
        ):
            warnings.append(Msg("deck_problem.preview.empty", field=item.get("field")))
    for marker in markers:
        if marker["unfilled"]:
            warnings.append(unfilled(marker["name"]))
    return {
        "slide_id": manifest_slide.get("slide_id"),
        "scope": spec.scope,
        "action": spec.action,
        "items": items,
        "markers": markers,
        "warnings": [w.to_json() for w in warnings],
        "unresolved_markers": sorted({m["name"] for m in markers if not m["known"] or m["unfilled"]}),
    }


def literal_placeholders(mapping: DeckMapping) -> set[str]:
    """Placeholder names used inside literal values anywhere in the mapping."""
    names: set[str] = set()
    for slide in mapping.slides.values():
        for binding in slide.bindings:
            if binding.value:
                names |= {marker_base(m.group(1)) for m in MARKER.finditer(binding.value)}
    return names
