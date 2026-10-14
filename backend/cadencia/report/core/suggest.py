"""Starter mapping suggested from the template's own labels.

Weekly-report templates label their areas ("REPORT WEEK", "Completed Activities", "Blockers",
a status legend…). This module reads those labels from the manifest and proposes bindings, the
palette and the status labels (taken from the template's legend, in the template's language).
The suggestion is only a draft: the user reviews and saves it in the mapping screen.
"""

from __future__ import annotations

import copy
import re
from typing import Any

from cadencia.i18n.message import Msg
from cadencia.report.core.manifest import area_id, parse_target

LABEL_FIELDS = [
    (re.compile(r"report\s*week|semana|data do relat", re.I), "relatorio.semana"),
    (re.compile(r"project\s*name|use\s*case|projeto", re.I), "espaco.nome"),
    (re.compile(r"^sprint$", re.I), "sprint.nome"),
]
CAPTIONS = [
    (
        re.compile(r"completed\s*activities|atividades\s*conclu|entregas", re.I),
        "grouped_list",
        "entregas.por_epico",
    ),
    (
        re.compile(r"upcoming\s*activities|pr[oó]ximas\s*atividades", re.I),
        "grouped_list",
        "proximas.por_epico",
    ),
    (re.compile(r"^blockers?$|bloqueios|impedimentos", re.I), "table_rows", "riscos.bloqueios"),
    (
        re.compile(r"issues\s*/\s*risks|riscos\s*/\s*problemas|^riscos$", re.I),
        "grouped_rows",
        "acompanhamento.por_epico",
    ),
]
STATUS_CAPTION = re.compile(r"general\s*status|status\s*geral", re.I)
HEADERS = [
    (re.compile(r"^sprint$", re.I), "sprint"),
    (re.compile(r"jira|^key$|chave|^id$", re.I), "chave"),
    # Before "ação": "Situação" contains "ação" and must not be read as the action column.
    (re.compile(r"^status|situa", re.I), "situacao"),
    (re.compile(r"descri|summary|resumo|block|bloqueio|item", re.I), "resumo"),
    (re.compile(r"respons|owner|assignee", re.I), "responsavel"),
    (re.compile(r"action|a[cç][aã]o", re.I), "acao"),
    (re.compile(r"limit|due|prazo|data", re.I), "prazo"),
    (re.compile(r"status|situa", re.I), "situacao"),
]
LEGEND = [
    (re.compile(r"done|conclu", re.I), "concluido"),
    (re.compile(r"on\s*time|em\s*dia|no\s*prazo|on\s*track", re.I), "em_dia"),
    (re.compile(r"risk|risco", re.I), "risco"),
    (re.compile(r"late|delay|atras", re.I), "atrasado"),
]
CONTROL_ROWS = [
    (re.compile(r"deadline|prazo|schedule|cronograma", re.I), "board.status_prazo", "prazos.por_epico"),
    (re.compile(r"^risks?$|riscos?", re.I), "board.status_riscos", None),
]


def _text(area: dict[str, Any]) -> str:
    return " ".join(p["text"] for p in area.get("paragraphs", [])).strip()


def _below(caption: dict[str, Any], candidates: list[dict[str, Any]]) -> dict[str, Any] | None:
    cb = caption["bbox"]
    best, best_gap = None, None
    for area in candidates:
        bb = area["bbox"]
        overlap = min(cb["x"] + cb["w"], bb["x"] + bb["w"]) - max(cb["x"], bb["x"])
        gap = bb["y"] - cb["y"]
        if overlap > 0 and gap > 0 and (best_gap is None or gap < best_gap):
            best, best_gap = area, gap
    return best


def _nearest(anchor: dict[str, Any], candidates: list[dict[str, Any]]) -> dict[str, Any] | None:
    ax = anchor["bbox"]["x"] + anchor["bbox"]["w"] / 2
    ay = anchor["bbox"]["y"] + anchor["bbox"]["h"] / 2

    def distance(area: dict[str, Any]) -> float:
        bx = area["bbox"]["x"] + area["bbox"]["w"] / 2
        by = area["bbox"]["y"] + area["bbox"]["h"] / 2
        return ((ax - bx) ** 2 + (ay - by) ** 2) ** 0.5

    return min(candidates, key=distance) if candidates else None


def _columns(header: list[str]) -> list[str | None]:
    out: list[str | None] = []
    for text in header:
        name = next((field for pattern, field in HEADERS if pattern.search(text.strip())), None)
        out.append(name if name not in out else None)
    return out


def _light(hex_color: str) -> bool:
    try:
        r, g, b = (int(hex_color[i : i + 2], 16) for i in (0, 2, 4))
    except (TypeError, ValueError):
        return True
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.9


def _legend(manifest: dict[str, Any]) -> tuple[dict[str, str], dict[str, str]]:
    """A legend is a table with at least two status words on saturated fills."""
    # RF-62: only what this template's legend really says. Seeding these with the defaults would
    # write a full palette into every mapping, and a "override" that is just a copy of the shared
    # setting makes changing the shared setting do nothing.
    palette: dict[str, str] = {}
    labels: dict[str, str] = {}
    legends: list[dict[str, tuple[str, str]]] = []
    for slide in manifest.get("slides", []):
        for area in slide["areas"]:
            table = area.get("table")
            if not table:
                continue
            fills = table.get("fills") or []
            found: dict[str, tuple[str, str]] = {}
            for r, row in enumerate(table["cells"]):
                for c, text in enumerate(row):
                    fill = fills[r][c] if r < len(fills) and c < len(fills[r]) else None
                    label = text.strip()
                    if not fill or _light(fill) or not label or len(label) > 20:
                        continue
                    for pattern, category in LEGEND:
                        if pattern.search(label):
                            found.setdefault(category, (label, fill))
                            break
            if len(found) >= 2:
                legends.append(found)
    # A legend with "done" describes table rows (Done / At risk / Late): its words win the labels.
    legends.sort(key=lambda found: "concluido" not in found)
    assigned: set[str] = set()
    for found in legends:
        for category, (label, fill) in found.items():
            if category not in assigned:
                palette[category] = fill
                labels[category] = label
                assigned.add(category)
    return palette, labels


def as_repeat(suggestion: dict[str, Any]) -> dict[str, Any]:
    """Slides whose board was not identified become one-per-board slides, with the space name filled
    where the template has a name label (generic templates, the demo)."""
    out = copy.deepcopy(suggestion)
    for slide_id, spec in out["slides"].items():
        if spec.get("scope") == "board" and not spec.get("board_id"):
            spec["scope"] = "repeat"
            target = out.get("name_targets", {}).get(slide_id)
            if target:
                spec["bindings"].append({"target": target, "mode": "text", "field": "espaco.nome"})
    return out


def suggest_mapping(manifest: dict[str, Any], boards: list[dict[str, Any]]) -> dict[str, Any]:
    palette, labels = _legend(manifest)
    slides: dict[str, Any] = {}
    notes: list[Msg] = []
    name_targets: dict[str, str] = {}
    previous_signature: tuple[str, frozenset[str]] | None = None
    for slide in manifest.get("slides", []):
        areas = slide["areas"]
        texts = [a for a in areas if a.get("paragraphs")]
        tables = [a for a in areas if a["kind"] == "table"]
        bindings: list[dict[str, Any]] = []
        captions: set[str] = set()

        for area in texts:
            paragraphs = area["paragraphs"]
            first = paragraphs[0]["text"].strip() if paragraphs else ""
            if len(paragraphs) >= 2:
                for pattern, field in LABEL_FIELDS:
                    if pattern.search(first):
                        bindings.append({"target": f"{area['id']}#p1", "mode": "text", "field": field})
                        break
            for pattern, mode, field in CAPTIONS:
                if pattern.search(first) and len(paragraphs) == 1:
                    target = _below(area, tables)
                    if target is None:
                        continue
                    captions.add(field)
                    table = target["table"]
                    if mode == "grouped_list" and table["cols"] == 1:  # 1×1 or 2×1 text boxes
                        bindings.append(
                            {"target": f"{target['id']}#r0c0", "mode": "grouped_list", "field": field}
                        )
                    elif mode in {"table_rows", "grouped_rows"}:
                        columns = _columns(table["header"])
                        bindings.append(
                            {
                                "target": target["id"],
                                "mode": mode,
                                "field": field,
                                "columns": columns,
                                "header_rows": 1,
                                "status_column": columns.index("situacao") if "situacao" in columns else None,
                            }
                        )
                    break
            if STATUS_CAPTION.search(first.replace(" ", "")) or STATUS_CAPTION.search(first):
                indicators = [
                    a
                    for a in areas
                    if a["kind"] in {"text", "shape"}
                    and not _text(a)
                    and a.get("fill")
                    and a["id"] != area["id"]
                ]
                target = _nearest(area, indicators)
                if target is not None:
                    bindings.append(
                        {"target": target["id"], "mode": "status_fill", "field": "board.status_geral"}
                    )

        for area in tables:
            table = area["table"]
            header = [h.lower() for h in table["header"]]
            if not header or not any("status" in h or "situa" in h for h in header) or table["cols"] < 3:
                continue
            if not any(re.search(r"dimens|dimension|crit", h) for h in header):
                continue
            for r, row in enumerate(table["cells"][1:], start=1):
                for pattern, status_field, comments_field in CONTROL_ROWS:
                    if pattern.search(row[0].strip()):
                        bindings.append(
                            {"target": f"{area['id']}#r{r}c1", "mode": "status_fill", "field": status_field}
                        )
                        if comments_field:
                            bindings.append(
                                {
                                    "target": f"{area['id']}#r{r}c2",
                                    "mode": "grouped_list",
                                    "field": comments_field,
                                }
                            )
                        break

        signature = (slide.get("headline", ""), frozenset(captions))
        entry: dict[str, Any] = {"action": "keep", "scope": "deck", "overflow": "clone", "bindings": bindings}
        if captions and previous_signature == signature:
            entry = {"action": "remove", "scope": "deck", "bindings": []}
            notes.append(Msg("deck_problem.suggest.continuation", slide=slide["index"]))
        elif any(b["field"] and not b["field"].startswith("relatorio.") for b in bindings):
            headline = (slide.get("headline") or "").casefold()
            match = next(
                (
                    b
                    for b in boards
                    if headline and (b["name"].casefold() in headline or headline in b["name"].casefold())
                ),
                None,
            )
            # A slide about one board keeps the project name the template author wrote.
            name = next((b for b in bindings if b["field"] == "espaco.nome"), None)
            if name:
                name_targets[str(slide["slide_id"])] = name["target"]
            entry["bindings"] = [b for b in bindings if b["field"] != "espaco.nome"]
            entry.update(scope="board", board_id=match["id"] if match else None)
            if not match:
                notes.append(
                    Msg(
                        "deck_problem.suggest.choose_board",
                        slide=slide["index"],
                        headline=slide.get("headline"),
                    )
                )
        slides[str(slide["slide_id"])] = entry
        if captions:
            previous_signature = signature
    return {
        "slides": slides,
        "palette": palette,
        "status_labels": labels,
        # `{"$msg": …}` records: whoever shows the suggestion renders them (`localize`).
        "notes": [note.to_json() for note in notes],
        "name_targets": name_targets,
    }


# ---------------------------------------------------------------- clone a mapping to a new file (#13)


def _name_and_position(manifest: dict[str, Any], slide_id: int, shape_id: int) -> tuple[int, str] | None:
    for position, slide in enumerate(manifest.get("slides", [])):
        if slide["slide_id"] != slide_id:
            continue
        for area in slide["areas"]:
            if area["shape_id"] == shape_id:
                return position, area["name"]
        return None
    return None


def _shape_by_position_and_name(manifest: dict[str, Any]) -> dict[tuple[int, str], tuple[int, int]]:
    """(slide position, shape name) -> (slide_id, shape_id). First shape of a repeated name wins —
    a best-effort key, not a guaranteed one; see `plan_mapping_clone`."""
    index: dict[tuple[int, str], tuple[int, int]] = {}
    for position, slide in enumerate(manifest.get("slides", [])):
        for area in slide["areas"]:
            index.setdefault((position, area["name"]), (slide["slide_id"], area["shape_id"]))
    return index


def _rebuilt_target(slide_id: int, shape_id: int, old_target: str) -> str:
    parsed = parse_target(old_target)
    if parsed.row is not None:
        part = f"r{parsed.row}c{parsed.col}" + (
            f"p{parsed.paragraph}" if parsed.paragraph is not None else ""
        )
    elif parsed.paragraph is not None:
        part = f"p{parsed.paragraph}"
    else:
        part = ""
    return area_id(slide_id, shape_id, part)


def plan_mapping_clone(
    from_manifest: dict[str, Any], from_mapping: dict[str, Any], to_manifest: dict[str, Any]
) -> dict[str, Any]:
    """#13: what cloning a mapping to a re-designed template would carry over.

    Templates get redesigned (a new year's corporate deck, the same areas moved around), and a
    binding's target is an id from the *old* file's own XML — meaningless in the new one. This
    matches a binding's shape by its position among the slides and its own name, the only two
    things a template author tends to keep when redesigning rather than rebuilding from scratch.
    It is a guess, not a promise: `unmatched` lists everything that could not be carried over, and
    the caller (`apply_mapping_clone`) still runs every remapped target through the same "does this
    area exist" check a saved mapping always gets.
    """
    index = _shape_by_position_and_name(to_manifest)
    matched: list[dict[str, Any]] = []
    unmatched: list[dict[str, Any]] = []
    for slide_key, slide in (from_mapping.get("slides") or {}).items():
        for binding in slide.get("bindings") or []:
            target = binding.get("target", "")
            try:
                parsed = parse_target(target)
            except ValueError:
                continue
            found = _name_and_position(from_manifest, parsed.slide_id, parsed.shape_id)
            entry = {"slide": slide_key, "old_target": target, "field": binding.get("field")}
            new_shape = index.get((found[0], found[1])) if found else None
            if found is None or new_shape is None:
                entry["shape_name"] = found[1] if found else None
                unmatched.append(entry)
                continue
            entry["shape_name"] = found[1]
            entry["new_target"] = _rebuilt_target(new_shape[0], new_shape[1], target)
            matched.append(entry)
    return {"matched": matched, "unmatched": unmatched}


def apply_mapping_clone(
    from_manifest: dict[str, Any], from_mapping: dict[str, Any], to_manifest: dict[str, Any]
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Builds the new mapping from the plan. Deck-level settings (palette, status labels, required
    approval, audiences, schedule) are not shape-specific and copy wholesale; slides carry over
    keyed by the *new* file's slide id, with only the matched bindings, remapped."""
    plan = plan_mapping_clone(from_manifest, from_mapping, to_manifest)
    remap = {m["old_target"]: m["new_target"] for m in plan["matched"]}
    new_slide_id_by_key: dict[str, int] = {}
    for slide_key, slide in (from_mapping.get("slides") or {}).items():
        matched_targets = [b["target"] for b in slide.get("bindings") or [] if b.get("target") in remap]
        if not matched_targets:
            continue
        new_slide_id = parse_target(remap[matched_targets[0]]).slide_id
        new_slide_id_by_key[slide_key] = new_slide_id

    new_slides: dict[str, Any] = {}
    for slide_key, slide in (from_mapping.get("slides") or {}).items():
        new_slide_id = new_slide_id_by_key.get(slide_key)
        if new_slide_id is None:
            continue
        entry = copy.deepcopy(slide)
        entry["bindings"] = [
            {**b, "target": remap[b["target"]]}
            for b in (slide.get("bindings") or [])
            if b.get("target") in remap
        ]
        new_slides[str(new_slide_id)] = entry

    cloned = {key: value for key, value in from_mapping.items() if key not in {"slides"}}
    cloned["slides"] = new_slides
    return cloned, plan
