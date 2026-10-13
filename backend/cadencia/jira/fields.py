"""Dynamic discovery of instance-specific custom field ids (RF-04).

Hard-coding ``customfield_10016`` is the classic way a Jira integration works on one instance
and breaks on the next, so ids are discovered from ``/rest/api/3/field`` by schema type first
and by name second, and can be overridden manually.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any

SPRINT_SCHEMA = "com.pyxis.greenhopper.jira:gh-sprint"
EPIC_LINK_SCHEMA = "com.pyxis.greenhopper.jira:gh-epic-link"
RANK_SCHEMA = "com.pyxis.greenhopper.jira:gh-lexo-rank"
TEAM_STORY_POINTS_SCHEMA = "com.pyxis.greenhopper.jira:jsw-story-points"
FLOAT_SCHEMA = "com.atlassian.jira.plugin.system.customfieldtypes:float"
STORY_POINT_NAMES = frozenset(
    {
        "story points",
        "story point estimate",
        "pontos da história",
        "pontos de história",
        "estimativa de pontos da história",
    }
)
FLAGGED_NAMES = frozenset({"flagged", "sinalizado", "sinalizador"})

BASE_FIELDS = (
    "summary",
    "issuetype",
    "status",
    "assignee",
    "created",
    "updated",
    "resolutiondate",
    "duedate",
    "parent",
    "priority",
    "labels",
    "components",
    "issuelinks",
    "project",
    "timeoriginalestimate",
    "description",
)


@dataclass(frozen=True)
class FieldMap:
    story_points: tuple[str, ...] = ()
    sprint: str | None = None
    epic_link: str | None = None
    flagged: str | None = None
    rank: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "story_points": list(self.story_points),
            "sprint": self.sprint,
            "epic_link": self.epic_link,
            "flagged": self.flagged,
            "rank": self.rank,
        }

    @classmethod
    def from_dict(cls, data: Mapping[str, Any] | None) -> FieldMap:
        data = data or {}
        return cls(
            story_points=tuple(data.get("story_points") or ()),
            sprint=data.get("sprint"),
            epic_link=data.get("epic_link"),
            flagged=data.get("flagged"),
            rank=data.get("rank"),
        )

    def merged(self, overrides: Mapping[str, Any] | None) -> FieldMap:
        """Manual overrides win over discovery; empty values mean "keep discovered"."""
        if not overrides:
            return self
        base = self.as_dict()
        for key, value in overrides.items():
            if key in base and value not in (None, "", []):
                base[key] = value
        return FieldMap.from_dict(base)

    def issue_fields(self) -> list[str]:
        extra: Iterable[str | None] = (
            *self.story_points,
            self.sprint,
            self.epic_link,
            self.flagged,
            self.rank,
        )
        return [*BASE_FIELDS, *(f for f in extra if f)]

    def missing(self) -> list[str]:
        out = []
        if not self.story_points:
            out.append("story_points")
        for name in ("sprint", "epic_link", "flagged", "rank"):
            if not getattr(self, name):
                out.append(name)
        return out


def discover_fields(payload: Iterable[Mapping[str, Any]]) -> FieldMap:
    story_points: list[tuple[int, str]] = []
    sprint = epic_link = flagged = rank = None
    for field in payload:
        field_id = field.get("id")
        if not field_id:
            continue
        schema = field.get("schema") or {}
        custom = schema.get("custom")
        name = str(field.get("name") or "").strip().casefold()
        if custom == SPRINT_SCHEMA and sprint is None:
            sprint = field_id
        elif custom == EPIC_LINK_SCHEMA and epic_link is None:
            epic_link = field_id
        elif custom == RANK_SCHEMA and rank is None:
            rank = field_id
        if name in STORY_POINT_NAMES and (
            custom in {TEAM_STORY_POINTS_SCHEMA, FLOAT_SCHEMA} or schema.get("type") == "number"
        ):
            # Team-managed "Story point estimate" first, then classic "Story Points".
            priority = 0 if custom == TEAM_STORY_POINTS_SCHEMA else 1
            story_points.append((priority, field_id))
        if name in FLAGGED_NAMES and field.get("custom") and flagged is None:
            flagged = field_id
    return FieldMap(
        story_points=tuple(fid for _, fid in sorted(story_points)),
        sprint=sprint,
        epic_link=epic_link,
        flagged=flagged,
        rank=rank,
    )
