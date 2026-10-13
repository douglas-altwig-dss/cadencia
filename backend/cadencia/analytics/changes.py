"""What changed between two moments of a board (RF-74), and the risk digest built on it (RF-73).

A checkpoint freezes what was said that week (RF-08). Comparing two of them — or the last one with
right now — is the question every weekly meeting starts with, and it used to be answered by
opening two decks side by side. Both ends are read as snapshot rows, the live end through the very
same `snapshot_rows` that froze the stored ones, so the two sides are always measured alike.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Mapping, Sequence
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from cadencia.analytics.data import BoardData
from cadencia.analytics.serialize import iso, issue_url
from cadencia.collector.snapshots import snapshot_rows
from cadencia.domain.risk import SEVERITY, Situation
from cadencia.errors import Invalid, NotFound
from cadencia.store import repo
from cadencia.store import schema as s

#: What the digest reports as a new risk: the situations somebody has to act on this week.
DIGEST_SITUATIONS = frozenset({Situation.STAGNANT.value, Situation.BLOCKED.value, Situation.OVERDUE.value})
_RANK = {situation.value: index for index, situation in enumerate(SEVERITY)}
_LABEL = {situation.value: situation.label for situation in SEVERITY}

State = dict[str, dict[str, Any]]


def _entry(
    key: str,
    status: str,
    category: str,
    assignee: str | None,
    estimate: float | None,
    situation: str,
    evidence: Sequence[Any],
) -> dict[str, Any]:
    first = evidence[0] if evidence else None
    return {
        "key": key,
        "status": status,
        "category": category,
        "assignee": assignee,
        "estimate": estimate,
        "situation": situation,
        "reason": first.get("message") if isinstance(first, Mapping) else None,
    }


def state_at_checkpoint(session: Session, checkpoint_id: int) -> State:
    return {
        r.issue_key: _entry(
            r.issue_key,
            r.status_name,
            r.status_category,
            r.assignee_name,
            r.estimate,
            r.situation,
            r.evidence,
        )
        for r in repo.load_snapshots(session, checkpoint_id)
    }


def state_now(data: BoardData, now: datetime) -> State:
    sprint = data.current_sprint(now)
    return {
        r["issue_key"]: _entry(
            r["issue_key"],
            r["status_name"],
            r["status_category"],
            r["assignee_name"],
            r["estimate"],
            r["situation"],
            r["evidence"],
        )
        for r in snapshot_rows(data, now, sprint if sprint is not None and sprint.state != "closed" else None)
    }


def compare(before: State, after: State) -> dict[str, Any]:
    """Every difference worth a sentence, grouped the way a meeting walks through them."""
    both = before.keys() & after.keys()
    new_risks, resolved, completed, reopened, moved, reassigned = [], [], [], [], [], []
    for key in sorted(after):
        now = after[key]
        was = before.get(key)
        if now["category"] == "done" and (was is None or was["category"] != "done"):
            completed.append(now)
        if was is not None and was["category"] == "done" and now["category"] != "done":
            reopened.append(now)
        risky = now["situation"] != Situation.ON_TRACK.value and now["category"] != "done"
        if risky and (was is None or _RANK[now["situation"]] > _RANK[was["situation"]]):
            new_risks.append({**now, "from": was["situation"] if was else None})
    for key in sorted(both):
        was, now = before[key], after[key]
        if was["situation"] != Situation.ON_TRACK.value and (
            now["category"] == "done" or _RANK[now["situation"]] < _RANK[was["situation"]]
        ):
            resolved.append({**now, "from": was["situation"]})
        if was["status"] != now["status"]:
            moved.append({**now, "from_status": was["status"]})
        if was["assignee"] != now["assignee"]:
            reassigned.append({**now, "from_assignee": was["assignee"]})

    def totals(state: State) -> dict[str, Any]:
        open_items = [e for e in state.values() if e["category"] != "done"]
        return {
            "items": len(state),
            "done": len(state) - len(open_items),
            "open": len(open_items),
            "open_estimate": round(sum(e["estimate"] or 0 for e in open_items), 2),
            "situations": dict(Counter(e["situation"] for e in open_items)),
        }

    return {
        "entered": [after[k] for k in sorted(after.keys() - before.keys())],
        "left": [before[k] for k in sorted(before.keys() - after.keys())],
        "completed": completed,
        "reopened": reopened,
        "new_risks": new_risks,
        "resolved": resolved,
        "moved": moved,
        "reassigned": reassigned,
        "before": totals(before),
        "after": totals(after),
    }


def _enrich(result: dict[str, Any], data: BoardData, base_url: str | None) -> dict[str, Any]:
    for name, value in result.items():
        if isinstance(value, list):
            for entry in value:
                issue = data.issues.get(entry["key"])
                entry["summary"] = issue.summary if issue else ""
                entry["url"] = issue_url(base_url, entry["key"])
                entry["label"] = _LABEL.get(entry["situation"], entry["situation"])
        result[name] = value
    return result


def checkpoints_with_snapshots(session: Session, board_id: int, now: datetime) -> list[s.CheckpointRow]:
    return [
        c
        for c in repo.list_checkpoints(session, board_id)
        if c.at <= now and repo.snapshot_count(session, c.id)
    ]


def board_changes(
    session: Session,
    data: BoardData,
    now: datetime,
    *,
    since: int | None = None,
    until: int | None = None,
    base_url: str | None = None,
) -> dict[str, Any]:
    """Compare two checkpoints of the board, or one checkpoint with now (``until=None``)."""
    marks = checkpoints_with_snapshots(session, data.board.id, now)
    by_id = {c.id: c for c in marks}
    for wanted in (since, until):
        if wanted is not None and wanted not in by_id:
            raise NotFound(wanted, f"O checkpoint {wanted} não existe neste board ou não tem snapshot.")
    start = by_id[since] if since is not None else (marks[-1] if marks else None)
    end = by_id[until] if until is not None else None
    if start is not None and end is not None and end.at <= start.at:
        raise Invalid("O checkpoint final precisa ser posterior ao inicial.")
    after = state_at_checkpoint(session, end.id) if end else state_now(data, now)
    before = state_at_checkpoint(session, start.id) if start else {}
    result = _enrich(compare(before, after), data, base_url)
    return {
        "board": {"id": data.board.id, "name": data.board.name},
        "since": {"id": start.id, "at": iso(start.at)} if start else None,
        "until": {"id": end.id, "at": iso(end.at)} if end else {"id": None, "at": iso(now)},
        "checkpoints": [{"id": c.id, "at": iso(c.at), "sprint_id": c.sprint_id} for c in marks],
        **result,
    }


def digest(
    session: Session, boards: Sequence[BoardData], now: datetime, base_url: str | None = None
) -> dict[str, Any]:
    """Per space, what became stalled, blocked or overdue since each board's last checkpoint."""
    spaces: dict[str | None, dict[str, Any]] = {}
    total = 0
    for data in boards:
        changes = board_changes(session, data, now, base_url=base_url)
        risks = [e for e in changes["new_risks"] if e["situation"] in DIGEST_SITUATIONS]
        resolved = changes["resolved"]
        total += len(risks)
        key = data.board.space_key
        space = spaces.setdefault(
            key, {"space": {"key": key, "name": data.board.space_name or key or "Sem espaço"}, "boards": []}
        )
        space["boards"].append(
            {
                "board": {"id": data.board.id, "name": data.board.name},
                "since": changes["since"],
                "new_risks": risks,
                "resolved": resolved,
            }
        )
    ordered = sorted(spaces.values(), key=lambda g: str(g["space"]["name"]).casefold())
    return {"generated_at": iso(now), "total_new_risks": total, "spaces": ordered}


def digest_text(space: Mapping[str, Any], fmt_since: Any) -> str:
    """One space's digest as plain text, for a chat message or an e-mail body."""
    lines: list[str] = []
    for board in space["boards"]:
        since = fmt_since(board["since"]["at"]) if board["since"] else "o início"
        risks, resolved = board["new_risks"], board["resolved"]
        if not risks and not resolved:
            lines.append(f"{board['board']['name']}: nada novo desde {since}.")
            continue
        name = board["board"]["name"]
        lines.append(f"{name}: {len(risks)} novo(s) risco(s), {len(resolved)} resolvido(s) desde {since}.")
        for entry in risks:
            reason = f" — {entry['reason']}" if entry.get("reason") else ""
            lines.append(f"  • {entry['key']} {entry['label']}: {entry['summary']}{reason}")
    return "\n".join(lines)
