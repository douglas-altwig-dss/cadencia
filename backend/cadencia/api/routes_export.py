"""CSV/JSON export of every aggregate shown in the UI (RF-24)."""

from __future__ import annotations

import csv
import io
import json
from collections.abc import Iterable
from datetime import timedelta
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse, Response

from cadencia.analytics import flow
from cadencia.analytics import sprint as sprint_views
from cadencia.analytics.dashboard import dashboard as dashboard_view
from cadencia.api.deps import (
    Now,
    SessionDep,
    SettingsDep,
    base_url,
    board_data,
    committed_lookup,
    csv_ints,
    parse_instant,
    selected_or,
    sprint_or_404,
)
from cadencia.store import repo

router = APIRouter(tags=["exportação"])
DATASETS = (
    "dashboard",
    "risks",
    "flow",
    "flow_people",
    "commitment",
    "tree",
    "committed_vs_delivered",
    "aging",
)


def flatten(value: dict[str, Any], prefix: str = "") -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, item in value.items():
        name = f"{prefix}.{key}" if prefix else str(key)
        if isinstance(item, dict):
            out.update(flatten(item, name))
        elif isinstance(item, list):
            if all(not isinstance(x, dict | list) for x in item):
                out[name] = "; ".join("" if x is None else str(x) for x in item)
            else:
                out[name] = json.dumps(item, ensure_ascii=False, default=str)
        else:
            out[name] = item
    return out


#: A cell starting with one of these is a formula to Excel and LibreOffice, and Jira text (summaries,
#: names, labels) is whatever somebody typed. Only text is quoted; a negative number stays a number.
_FORMULA_START = ("=", "+", "-", "@", "\t", "\r")


def _cell(value: Any) -> Any:
    return "'" + value if isinstance(value, str) and value.startswith(_FORMULA_START) else value


def to_csv(rows: Iterable[dict[str, Any]], sep: str = ";") -> str:
    flat = [{key: _cell(value) for key, value in flatten(r).items()} for r in rows]
    columns: list[str] = []
    for row in flat:
        for key in row:
            if key not in columns:
                columns.append(key)
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=columns, delimiter=sep, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(flat)
    return "﻿" + buffer.getvalue()  # BOM so Excel in pt-BR opens accents correctly


def _tree_rows(nodes: list[dict[str, Any]], depth: int = 0) -> list[dict[str, Any]]:
    rows = []
    for node in nodes:
        issue = node.get("issue") or {}
        rows.append(
            {
                "depth": depth,
                "key": node["key"],
                "label": node["label"],
                "type": issue.get("type"),
                "status": issue.get("status"),
                "assignee": issue.get("assignee"),
                "situation": (node.get("risk") or {}).get("label"),
                "estimate_rollup": node.get("estimate_rollup"),
                "progress": node.get("progress"),
            }
        )
        rows += _tree_rows(node.get("children") or [], depth + 1)
    return rows


def _risk_rows(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            **{k: v for k, v in item.items() if k != "risk"},
            "situation": item["risk"]["label"],
            "evidence": " | ".join(e["message"] for e in item["risk"]["evidence"]),
            "rules": "; ".join(e["rule"] for e in item["risk"]["evidence"]),
        }
        for item in items
    ]


@router.get("/export/{dataset}")
def export(
    dataset: str,
    session: SessionDep,
    settings: SettingsDep,
    now: Now,
    format: Literal["csv", "json"] = "csv",
    sep: str = ";",
    board_id: str | None = None,
    sprint_id: int | None = None,
    person: str | None = None,
    type: str | None = None,
    start: str | None = None,
    end: str | None = None,
) -> Response:
    if dataset not in DATASETS:
        raise HTTPException(
            404, detail={"cause": "conjunto desconhecido", "message": f"Use um de: {', '.join(DATASETS)}"}
        )
    until = parse_instant(end, now)
    since = parse_instant(start, until - timedelta(weeks=12))
    rows: list[dict[str, Any]]
    if dataset == "dashboard":
        rows = dashboard_view(
            session, repo.profile_defaults(settings), now, history_days=settings.history_days
        )["rows"]
    elif dataset in {"risks", "commitment", "tree"}:
        if sprint_id is None and dataset != "risks":
            raise HTTPException(400, detail={"cause": "sprint_id obrigatório"})
        if sprint_id is not None:
            sprint = sprint_or_404(session, sprint_id)
            data = board_data(session, settings, sprint.board_id)
            if dataset == "risks":
                rows = _risk_rows(
                    sprint_views.risk_list(
                        data, now, sprint=sprint, person=person, type_name=type, base_url=base_url(settings)
                    )
                )
            elif dataset == "tree":
                rows = _tree_rows(sprint_views.sprint_tree(data, sprint, now, base_url(settings)))
            else:
                overview = sprint_views.sprint_overview(
                    data, sprint, now, committed=repo.load_commitment(session, sprint_id)
                )
                rows = [overview["commitment"]["board"], *overview["commitment"]["people"]]
        else:
            ids = csv_ints(board_id)
            if not ids:
                raise HTTPException(400, detail={"cause": "informe sprint_id ou board_id"})
            data = board_data(session, settings, ids[0])
            rows = _risk_rows(
                sprint_views.risk_list(data, now, person=person, type_name=type, base_url=base_url(settings))
            )
    elif dataset in {"flow", "flow_people"}:
        view = flow.flow_view(
            selected_or(session, settings, csv_ints(board_id)),
            since,
            until,
            person=person,
            type_name=type,
            committed=committed_lookup(session),
        )
        rows = view["items"] if dataset == "flow" else view["people"]
    else:
        ids = csv_ints(board_id)
        if not ids:
            raise HTTPException(400, detail={"cause": "board_id obrigatório"})
        data = board_data(session, settings, ids[0])
        if dataset == "aging":
            rows = flow.aging_view(data, now)["items"]
        else:
            rows = flow.committed_vs_delivered(data, now, committed=committed_lookup(session))
    stamp = now.strftime("%Y%m%d-%H%M")
    if format == "json":
        return JSONResponse(
            content=json.loads(json.dumps(rows, default=str)),
            headers={"Content-Disposition": f'attachment; filename="cadencia-{dataset}-{stamp}.json"'},
        )
    return Response(
        content=to_csv(rows, sep if sep in {";", ",", "\t"} else ";"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="cadencia-{dataset}-{stamp}.csv"'},
    )
