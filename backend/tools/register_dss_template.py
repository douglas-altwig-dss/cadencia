"""Register the dss+360 template in Cadência with a reviewed mapping.

``suggest_mapping`` already reads this template correctly — the labels, the legends and the control
table are the ones it looks for. ``as_repeat`` then turns both project slides into the per-board
block, because the template's project name matches no board. Only three bindings need a human:
the two chart areas (a plain shape advertises ``status_fill``, not ``chart``) and the comments cell
of the Risks control row, which ``suggest.CONTROL_ROWS`` deliberately leaves empty.

Run it from ``backend/`` after ``build_dss_template.py``, against whichever database
``CADENCIA_DATABASE_URL`` points at.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from cadencia.config import get_settings
from cadencia.report.core.mapping import DeckMapping
from cadencia.report.core.suggest import as_repeat, suggest_mapping
from cadencia.report.service import store_template
from cadencia.runtime import default_sessions
from cadencia.store import repo
from cadencia.store.db import session_scope

ROOT = Path(__file__).resolve().parents[2]
TEMPLATE = ROOT / "dss+360 - AI Applications Weekly Report - Cadencia Template.pptx"
NAME = "dss+360 — AI Applications Weekly Report"

# grafico.riscos is deliberately not used here: its categories are the six risk-situation names,
# which collide into an unreadable axis at this column width. Throughput per week and committed
# vs delivered per sprint both have short categories.
CHARTS = {"Área gráfico vazão": "grafico.vazao", "Área gráfico evolução": "grafico.evolucao"}

# The control table sits near the bottom of the slide, so its two generated cells are capped. Only
# items within a group can be capped, not the number of groups, so a board with many at-risk epics
# can still push the table past the slide — validate_deck reports that as an "estouro" warning.
# The risks cell carries one long evidence sentence per item, so it gets the tighter cap.
MAX_ITEMS = {"riscos.por_epico": 1, "prazos.por_epico": 2}


def _area_id(manifest: dict[str, Any], slide_index: int, name: str) -> str:
    areas = manifest["slides"][slide_index]["areas"]
    return next(a["id"] for a in areas if a["name"] == name)


def build_mapping(manifest: dict[str, Any], boards: list[dict[str, Any]]) -> DeckMapping:
    suggestion = as_repeat(suggest_mapping(manifest, boards))
    suggestion.pop("notes", None)

    project, risks = manifest["slides"][1], manifest["slides"][2]
    project_bindings = suggestion["slides"][str(project["slide_id"])]["bindings"]
    risks_bindings = suggestion["slides"][str(risks["slide_id"])]["bindings"]

    # The Risks row of the control table: its status is suggested, its comments are not.
    status = next(b for b in project_bindings if b["field"] == "board.status_riscos")
    risks_cell = status["target"].replace("c1", "c2")
    project_bindings.append({"target": risks_cell, "mode": "grouped_list", "field": "riscos.por_epico"})
    for binding in project_bindings:
        if binding["field"] in MAX_ITEMS:
            binding["max_items"] = MAX_ITEMS[binding["field"]]

    for name, field in CHARTS.items():
        risks_bindings.append({"target": _area_id(manifest, 2, name), "mode": "chart", "field": field})

    return DeckMapping.model_validate(suggestion)


def main() -> None:
    settings = get_settings()
    with session_scope(default_sessions()) as session:
        template = store_template(session, settings, TEMPLATE.name, TEMPLATE.read_bytes(), NAME)
        boards = [{"id": b.id, "name": b.name} for b in repo.selected_boards(session)]
        mapping = build_mapping(template.manifest, boards)
        repo.save_mapping(session, template.id, template.sha256, mapping.model_dump())
        print({"template_id": template.id, "bindings": len(mapping.targets()), "boards": len(boards)})


if __name__ == "__main__":
    main()
