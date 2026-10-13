"""Translate Jira payloads into domain objects. The only place that knows the JSON shapes."""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from datetime import UTC, date, datetime
from typing import Any

from cadencia.domain.models import (
    Board,
    ChangeField,
    Issue,
    Person,
    Space,
    Sprint,
    Status,
    StatusCategory,
    Transition,
)
from cadencia.jira.fields import STORY_POINT_NAMES, FieldMap

_OFFSET_NO_COLON = re.compile(r"([+-]\d{2})(\d{2})$")
_LEGACY_SPRINT_ID = re.compile(r"\bid=(\d+)")
_BLOCKED_BY = ("is blocked by", "é bloqueado por", "bloqueado por")


def parse_datetime(raw: str | None) -> datetime | None:
    if not raw:
        return None
    text = str(raw).strip().replace("Z", "+00:00")
    text = _OFFSET_NO_COLON.sub(r"\1:\2", text)
    value = datetime.fromisoformat(text)
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def parse_date(raw: str | None) -> date | None:
    if not raw:
        return None
    return date.fromisoformat(str(raw)[:10])


def status_from(raw: Mapping[str, Any]) -> Status:
    category_key = ((raw.get("statusCategory") or {}).get("key")) or "new"
    try:
        category = StatusCategory(category_key)
    except ValueError:
        category = StatusCategory.TODO
    return Status(id=str(raw.get("id", "")), name=str(raw.get("name", "")), category=category)


def person_from(raw: Mapping[str, Any] | None) -> Person | None:
    if not raw or not raw.get("accountId"):
        return None
    return Person(
        account_id=str(raw["accountId"]),
        display_name=str(raw.get("displayName") or raw["accountId"]),
    )


def space_from(raw: Mapping[str, Any]) -> Space | None:
    """The space a board lives in, read from its ``location`` (the Jira project)."""
    location = raw.get("location") or {}
    key = location.get("projectKey")
    if not key:
        return None
    name = location.get("projectName") or location.get("displayName") or key
    return Space(key=str(key), name=str(name))


def board_from(raw: Mapping[str, Any]) -> Board:
    space = space_from(raw)
    return Board(
        id=int(raw["id"]),
        name=str(raw.get("name", "")),
        type=str(raw.get("type", "scrum")),
        space_key=space.key if space else None,
        space_name=space.name if space else None,
    )


def sprint_from(raw: Mapping[str, Any], board_id: int) -> Sprint:
    return Sprint(
        id=int(raw["id"]),
        board_id=int(raw.get("originBoardId") or board_id),
        name=str(raw.get("name", "")),
        state=str(raw.get("state", "future")).lower(),
        start=parse_datetime(raw.get("startDate")),
        end=parse_datetime(raw.get("endDate")),
        complete=parse_datetime(raw.get("completeDate")),
        goal=raw.get("goal") or None,
    )


def columns_from(configuration: Mapping[str, Any]) -> list[dict[str, Any]]:
    columns = (configuration.get("columnConfig") or {}).get("columns") or []
    return [
        {
            "name": str(col.get("name", "")),
            "status_ids": [str(s.get("id")) for s in col.get("statuses") or [] if s.get("id")],
        }
        for col in columns
    ]


def _sprint_ids(value: Any) -> tuple[int, ...]:
    if not value:
        return ()
    ids: list[int] = []
    for entry in value if isinstance(value, list) else [value]:
        if isinstance(entry, Mapping) and entry.get("id") is not None:
            ids.append(int(entry["id"]))
        elif isinstance(entry, str):  # legacy "com.atlassian.greenhopper...Sprint@x[id=12,...]"
            ids.extend(int(m) for m in _LEGACY_SPRINT_ID.findall(entry))
    return tuple(sorted(set(ids)))


def _flagged(value: Any) -> bool:
    if isinstance(value, list):
        return any((v.get("value") if isinstance(v, Mapping) else v) for v in value)
    return bool(value)


def _estimate(fields: Mapping[str, Any], field_ids: Iterable[str]) -> float | None:
    for field_id in field_ids:
        value = fields.get(field_id)
        if value is not None and value != "":
            try:
                return float(value)
            except (TypeError, ValueError):
                continue
    return None


def _blocked_by(links: Iterable[Mapping[str, Any]] | None) -> tuple[str, ...]:
    keys: list[str] = []
    for link in links or []:
        link_type = link.get("type") or {}
        inward = str(link_type.get("inward", "")).casefold()
        if link.get("inwardIssue") and (
            link_type.get("name") == "Blocks" or any(p in inward for p in _BLOCKED_BY)
        ):
            keys.append(str(link["inwardIssue"]["key"]))
    return tuple(sorted(set(keys)))


def issue_from_payload(raw: Mapping[str, Any], field_map: FieldMap) -> Issue:
    fields = raw.get("fields") or {}
    issue_type = fields.get("issuetype") or {}
    level = issue_type.get("hierarchyLevel")
    if level is None:
        level = -1 if issue_type.get("subtask") else 0
    parent_key = (fields.get("parent") or {}).get("key")
    if not parent_key and field_map.epic_link:
        parent_key = fields.get(field_map.epic_link) or None
    created = parse_datetime(fields.get("created")) or datetime.now(UTC)
    return Issue(
        key=str(raw["key"]),
        id=str(raw.get("id", "")),
        project_key=str((fields.get("project") or {}).get("key", "")),
        summary=str(fields.get("summary") or ""),
        type_name=str(issue_type.get("name") or ""),
        hierarchy_level=int(level),
        status=status_from(fields.get("status") or {}),
        created=created,
        updated=parse_datetime(fields.get("updated")) or created,
        assignee=person_from(fields.get("assignee")),
        resolution_date=parse_datetime(fields.get("resolutiondate")),
        due_date=parse_date(fields.get("duedate")),
        parent_key=parent_key,
        estimate=_estimate(fields, field_map.story_points),
        sprint_ids=_sprint_ids(fields.get(field_map.sprint)) if field_map.sprint else (),
        flagged=_flagged(fields.get(field_map.flagged)) if field_map.flagged else False,
        labels=tuple(sorted(str(x) for x in fields.get("labels") or [])),
        components=tuple(sorted(str(c.get("name")) for c in fields.get("components") or [])),
        priority=(fields.get("priority") or {}).get("name"),
        rank=fields.get(field_map.rank) if field_map.rank else None,
        blocked_by=_blocked_by(fields.get("issuelinks")),
        original_estimate_hours=_seconds_to_hours(fields.get("timeoriginalestimate")),
        description=adf_text(fields.get("description")),
    )


def _seconds_to_hours(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return round(float(value) / 3600, 4)
    except (TypeError, ValueError):
        return None


def adf_text(node: Any) -> str:
    """Plain text from an Atlassian Document Format description (API v3) or a v2 string.

    Headings come out as ``#`` lines and list items as ``- `` lines, because the epic plan reads a
    task's "Negócio"/"Técnico" sections by their headings. Marks (bold, links) are dropped.
    """
    if node is None:
        return ""
    if isinstance(node, str):
        return node.strip()
    blocks: list[str] = []
    _adf_blocks(node, blocks, "")
    return "\n".join(b for b in blocks).strip()


def _adf_inline(node: Mapping[str, Any]) -> str:
    kind = node.get("type")
    if kind == "text":
        return str(node.get("text") or "")
    if kind == "hardBreak":
        return "\n"
    if kind in ("mention", "emoji", "status", "date"):
        attrs = node.get("attrs") or {}
        return str(attrs.get("text") or attrs.get("shortName") or "")
    if kind == "inlineCard":
        return str((node.get("attrs") or {}).get("url") or "")
    return "".join(_adf_inline(c) for c in node.get("content") or [] if isinstance(c, Mapping))


def _adf_blocks(node: Mapping[str, Any], out: list[str], prefix: str) -> None:
    kind = node.get("type")
    children = [c for c in node.get("content") or [] if isinstance(c, Mapping)]
    if kind == "heading":
        level = int((node.get("attrs") or {}).get("level") or 1)
        out.append(f"{'#' * level} {''.join(_adf_inline(c) for c in children).strip()}")
    elif kind == "paragraph":
        text = "".join(_adf_inline(c) for c in children).strip()
        if text:
            out.append(prefix + text)
    elif kind == "listItem":
        start = len(out)
        for child in children:
            _adf_blocks(child, out, "")
        if len(out) > start:
            out[start] = f"{prefix}- {out[start]}"
    elif kind in ("bulletList", "orderedList"):
        for child in children:
            _adf_blocks(child, out, prefix)
    elif kind == "codeBlock":
        out.append("".join(_adf_inline(c) for c in children))
    else:  # doc, blockquote, panel, table cells… — walk into them
        for child in children:
            if child.get("type") in ("text", "hardBreak", "mention", "emoji", "inlineCard"):
                text = _adf_inline(child).strip()
                if text:
                    out.append(prefix + text)
            else:
                _adf_blocks(child, out, prefix)


def _change_field(item: Mapping[str, Any], field_map: FieldMap) -> ChangeField | None:
    field_id = str(item.get("fieldId") or "")
    name = str(item.get("field") or "").casefold()
    if field_id == "status" or name == "status":
        return ChangeField.STATUS
    if field_id == "assignee" or name == "assignee":
        return ChangeField.ASSIGNEE
    if (field_map.sprint and field_id == field_map.sprint) or name == "sprint":
        return ChangeField.SPRINT
    if field_id in field_map.story_points or name in STORY_POINT_NAMES:
        return ChangeField.ESTIMATE
    if (field_map.flagged and field_id == field_map.flagged) or name == "flagged":
        return ChangeField.FLAGGED
    if field_id == "parent" or name in {"parent", "epic link", "parent link"}:
        return ChangeField.PARENT
    return None


def transitions_from_changelog(
    issue_key: str, histories: Iterable[Mapping[str, Any]], field_map: FieldMap
) -> list[Transition]:
    out: list[Transition] = []
    for history in histories:
        at = parse_datetime(history.get("created"))
        if at is None:
            continue
        author = history.get("author") or {}
        for index, item in enumerate(history.get("items") or []):
            field = _change_field(item, field_map)
            if field is None:
                continue
            out.append(
                Transition(
                    issue_key=issue_key,
                    at=at,
                    field=field,
                    from_id=_str_or_none(item.get("from")),
                    from_value=_str_or_none(item.get("fromString")),
                    to_id=_str_or_none(item.get("to")),
                    to_value=_str_or_none(item.get("toString")),
                    author_id=author.get("accountId"),
                    author_name=author.get("displayName"),
                    history_id=str(history.get("id", "")),
                    item_index=index,
                )
            )
    return out


def _str_or_none(value: Any) -> str | None:
    return None if value is None else str(value)
