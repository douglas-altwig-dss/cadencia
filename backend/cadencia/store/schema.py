"""Database schema. Timestamps are always stored and returned as UTC-aware datetimes."""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Date,
    DateTime,
    Float,
    Integer,
    MetaData,
    String,
    Text,
    TypeDecorator,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class UTCDateTime(TypeDecorator[datetime]):
    """SQLite has no time zones; PostgreSQL does. Either way the application sees UTC."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Any) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("datetime sem fuso horário não pode ser gravado")  # i18n: out of scope
        value = value.astimezone(UTC)
        return value.replace(tzinfo=None) if dialect.name == "sqlite" else value

    def process_result_value(self, value: datetime | None, dialect: Any) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)


NAMING = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING)
    type_annotation_map = {datetime: UTCDateTime(), date: Date(), dict[str, Any]: JSON, list[Any]: JSON}


class SpaceRow(Base):
    """A Jira space — the team that owns one or more boards (RF-01)."""

    __tablename__ = "space"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    discovered_at: Mapped[datetime | None]


class VariableRow(Base):
    """A named placeholder the deck can use (RF-52).

    A variable is an identity — ``definicao`` — kept apart from what it says, because what it says
    depends on where the slide is being filled. ``template_id`` is what detaches it from the
    space: ``None`` means every template may use it, an id means it belongs to that template
    alone and does not clutter anybody else's field picker.

    The row is also the **registration**, and registration is what makes a name usable at all: a
    ``{{texto.x}}`` with no row here is a typo, not a variable, and generation refuses it. That is
    why ``default`` lives on this row. A variable that legitimately has a fallback declares it
    once, here; ``None`` means it has none and every target must be given a value, which is the
    whole point — an unfilled variable has to be loud rather than quietly empty.
    """

    __tablename__ = "variable"
    __table_args__ = (UniqueConstraint("template_id", "name"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(64), index=True)  # slug used in {{texto.<name>}}
    label: Mapped[str] = mapped_column(String(160), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    template_id: Mapped[int | None] = mapped_column(Integer, index=True)
    #: The registration's own fallback. ``None`` is "no default"; ``""`` is a default of empty,
    #: which somebody chose on purpose. The two must stay distinguishable.
    default: Mapped[str | None] = mapped_column(Text, default=None)
    #: RF-58: a catalogue key this variable reads from — ``board.nome``, ``sprint.objetivo`` — so a
    #: name can mean "whatever Jira says here" instead of words somebody typed per space. It sits
    #: on the registration for the same reason ``default`` does: the registration is where a
    #: variable's meaning lives, and scattering it through the rendering code is what RF-45 removed.
    #: Never another ``texto.*``: a variable pointing at a variable could form a cycle.
    source_field: Mapped[str | None] = mapped_column(String(64), default=None)
    created_at: Mapped[datetime | None]


class VariableValueRow(Base):
    """What one variable says at one scope.

    Resolution runs from the narrowest target the user can pick to the widest:
    **slide → board → space → global**. A slide value is set on one template slide and follows
    every copy of it; a board value differs per cloned copy; a space value is the project's; the
    global one is the fallback for anybody who wrote nothing.
    """

    __tablename__ = "variable_value"
    __table_args__ = (UniqueConstraint("variable_id", "scope", "scope_key"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    variable_id: Mapped[int] = mapped_column(Integer, index=True)
    scope: Mapped[str] = mapped_column(String(10))  # "global" | "space" | "board" | "slide"
    scope_key: Mapped[str] = mapped_column(String(64), default="")
    value: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime | None]


class BoardRow(Base):
    __tablename__ = "board"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    name: Mapped[str] = mapped_column(String(255))
    type: Mapped[str] = mapped_column(String(20))
    space_key: Mapped[str | None] = mapped_column(String(64), index=True)
    space_name: Mapped[str | None] = mapped_column(String(255))
    selected: Mapped[bool] = mapped_column(default=False)
    columns: Mapped[list[Any]] = mapped_column(default=list)
    settings: Mapped[dict[str, Any]] = mapped_column(default=dict)
    discovered_at: Mapped[datetime | None]
    last_success_at: Mapped[datetime | None]
    last_full_at: Mapped[datetime | None]
    last_error: Mapped[str | None] = mapped_column(Text)
    #: The failure as ``{"cause", "action", "message"}`` ``$msg`` records, rendered by each reader in
    #: its own language; ``last_error`` stays the pt-BR mirror (rows from before 0022 have only it).
    last_error_i18n: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    last_error_at: Mapped[datetime | None]


class SprintRow(Base):
    __tablename__ = "sprint"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    board_id: Mapped[int] = mapped_column(index=True)
    name: Mapped[str] = mapped_column(String(255))
    state: Mapped[str] = mapped_column(String(20))
    start_at: Mapped[datetime | None]
    end_at: Mapped[datetime | None]
    complete_at: Mapped[datetime | None]
    goal: Mapped[str | None] = mapped_column(Text)


class PersonRow(Base):
    __tablename__ = "person"
    account_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(255))


class StatusRow(Base):
    __tablename__ = "status"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    category: Mapped[str] = mapped_column(String(20))


class IssueRow(Base):
    __tablename__ = "issue"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    id: Mapped[str] = mapped_column(String(32), default="")
    project_key: Mapped[str] = mapped_column(String(64), default="")
    summary: Mapped[str] = mapped_column(Text, default="")
    type_name: Mapped[str] = mapped_column(String(128))
    hierarchy_level: Mapped[int] = mapped_column(default=0)
    status_id: Mapped[str] = mapped_column(String(32))
    status_name: Mapped[str] = mapped_column(String(255))
    status_category: Mapped[str] = mapped_column(String(20))
    assignee_id: Mapped[str | None] = mapped_column(String(128))
    assignee_name: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime]
    updated_at: Mapped[datetime]
    resolved_at: Mapped[datetime | None]
    due_date: Mapped[date | None]
    parent_key: Mapped[str | None] = mapped_column(String(64), index=True)
    estimate: Mapped[float | None] = mapped_column(Float)
    sprint_ids: Mapped[list[Any]] = mapped_column(default=list)
    flagged: Mapped[bool] = mapped_column(default=False)
    labels: Mapped[list[Any]] = mapped_column(default=list)
    components: Mapped[list[Any]] = mapped_column(default=list)
    priority: Mapped[str | None] = mapped_column(String(64))
    rank: Mapped[str | None] = mapped_column(String(255))
    blocked_by: Mapped[list[Any]] = mapped_column(default=list)
    original_estimate_hours: Mapped[float | None] = mapped_column(Float)
    description: Mapped[str] = mapped_column(Text, default="")
    collected_at: Mapped[datetime]
    changelog_synced_at: Mapped[datetime | None]


class IssueBoardRow(Base):
    __tablename__ = "issue_board"
    board_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    issue_key: Mapped[str] = mapped_column(String(64), primary_key=True)


class TransitionRow(Base):
    __tablename__ = "transition"
    __table_args__ = (UniqueConstraint("issue_key", "history_id", "item_index"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    issue_key: Mapped[str] = mapped_column(String(64), index=True)
    history_id: Mapped[str] = mapped_column(String(32))
    item_index: Mapped[int]
    at: Mapped[datetime] = mapped_column(index=True)
    field: Mapped[str] = mapped_column(String(20))
    from_id: Mapped[str | None] = mapped_column(Text)
    from_value: Mapped[str | None] = mapped_column(Text)
    to_id: Mapped[str | None] = mapped_column(Text)
    to_value: Mapped[str | None] = mapped_column(Text)
    author_id: Mapped[str | None] = mapped_column(String(128))
    author_name: Mapped[str | None] = mapped_column(String(255))


class CheckpointRow(Base):
    __tablename__ = "checkpoint"
    __table_args__ = (UniqueConstraint("board_id", "at"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    board_id: Mapped[int] = mapped_column(index=True)
    at: Mapped[datetime]
    sprint_id: Mapped[int | None]
    window_index: Mapped[int | None]
    created_at: Mapped[datetime]


class SnapshotRow(Base):
    """Frozen state of an item at a checkpoint — the auditable record of what was said."""

    __tablename__ = "issue_snapshot"
    checkpoint_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    issue_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    status_id: Mapped[str] = mapped_column(String(32))
    status_name: Mapped[str] = mapped_column(String(255))
    status_category: Mapped[str] = mapped_column(String(20))
    column_name: Mapped[str | None] = mapped_column(String(255))
    assignee_id: Mapped[str | None] = mapped_column(String(128))
    assignee_name: Mapped[str | None] = mapped_column(String(255))
    estimate: Mapped[float | None] = mapped_column(Float)
    sprint_ids: Mapped[list[Any]] = mapped_column(default=list)
    in_sprint: Mapped[bool] = mapped_column(default=False)
    flagged: Mapped[bool] = mapped_column(default=False)
    last_transition_at: Mapped[datetime | None]
    last_transition_author: Mapped[str | None] = mapped_column(String(255))
    situation: Mapped[str] = mapped_column(String(20))
    evidence: Mapped[list[Any]] = mapped_column(default=list)


class CommitmentRow(Base):
    __tablename__ = "sprint_commitment"
    sprint_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    issue_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    estimate: Mapped[float | None] = mapped_column(Float)
    assignee_id: Mapped[str | None] = mapped_column(String(128))
    recorded_at: Mapped[datetime]


class AbsenceRow(Base):
    __tablename__ = "absence"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    account_id: Mapped[str] = mapped_column(String(128), index=True)
    start_date: Mapped[date]
    end_date: Mapped[date]
    note: Mapped[str | None] = mapped_column(Text)


class PersonAvailabilityRow(Base):
    """How much of a person's time the tracked boards can count on: their own day length (else the
    board's) and the share of their time given to these boards. Absences stay in ``absence``."""

    __tablename__ = "person_availability"
    account_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    hours_per_day: Mapped[float | None] = mapped_column(Float)
    allocation_pct: Mapped[int] = mapped_column(Integer, default=100)
    updated_at: Mapped[datetime]


class AllocationPlanRow(Base):
    __tablename__ = "allocation_plan"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sprint_id: Mapped[int] = mapped_column(index=True)
    created_at: Mapped[datetime]
    parameters: Mapped[dict[str, Any]] = mapped_column(default=dict)
    result: Mapped[dict[str, Any]] = mapped_column(default=dict)


class CollectorRunRow(Base):
    __tablename__ = "collector_run"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    mode: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20))
    started_at: Mapped[datetime]
    finished_at: Mapped[datetime | None]
    counters: Mapped[dict[str, Any]] = mapped_column(default=dict)
    error: Mapped[str | None] = mapped_column(Text)
    #: ``error`` as a ``$msg`` record (the pt-BR text stays in ``error``).
    error_i18n: Mapped[dict[str, Any] | None] = mapped_column(JSON)


class LeaseRow(Base):
    """A named lock kept in the database, because the API and the scheduler are separate processes
    (separate containers) and an in-process lock only ever saw its own half. A holder that dies
    stops renewing and the lease simply expires."""

    __tablename__ = "lease"
    name: Mapped[str] = mapped_column(String(64), primary_key=True)
    holder: Mapped[str | None] = mapped_column(String(64))
    expires_at: Mapped[datetime | None]


class BoardRunRow(Base):
    __tablename__ = "board_run"
    run_id: Mapped[str] = mapped_column(String(32), primary_key=True)
    board_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    status: Mapped[str] = mapped_column(String(20))
    started_at: Mapped[datetime]
    finished_at: Mapped[datetime | None]
    counters: Mapped[dict[str, Any]] = mapped_column(default=dict)
    error: Mapped[str | None] = mapped_column(Text)
    cause: Mapped[str | None] = mapped_column(String(255))
    action: Mapped[str | None] = mapped_column(Text)
    #: ``error``/``cause``/``action`` as ``$msg`` records; those three columns keep the pt-BR mirror.
    error_i18n: Mapped[dict[str, Any] | None] = mapped_column(JSON)


class SettingRow(Base):
    __tablename__ = "app_setting"
    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    value: Mapped[dict[str, Any] | None] = mapped_column(JSON)


class TemplateRow(Base):
    __tablename__ = "report_template"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255))
    filename: Mapped[str] = mapped_column(String(255))
    sha256: Mapped[str] = mapped_column(String(64))
    path: Mapped[str] = mapped_column(Text)
    manifest: Mapped[dict[str, Any]] = mapped_column(default=dict)
    uploaded_at: Mapped[datetime]


class DeckEditRow(Base):
    """Manual edits to the generated deck, kept apart from the data so a re-run keeps both (RF-46).

    Edits are stored as absolute overrides keyed by the slide's origin and the shape's id, never as
    a diff against a previous file: replaying them onto a freshly generated deck is then idempotent,
    which is what makes "regenerate the data, keep my layout" true.
    """

    __tablename__ = "deck_edit"
    template_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    revision: Mapped[int] = mapped_column(default=1)
    edits: Mapped[dict[str, Any]] = mapped_column(default=dict)
    updated_at: Mapped[datetime]


class AssetRow(Base):
    """An image the user dropped on a slide. Content-addressed, so the same file is stored once."""

    __tablename__ = "report_asset"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # sha256
    filename: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(80))
    width: Mapped[int] = mapped_column(default=0)
    height: Mapped[int] = mapped_column(default=0)
    path: Mapped[str] = mapped_column(Text)
    uploaded_at: Mapped[datetime]
    #: #17: how people find it again in the library.
    label: Mapped[str] = mapped_column(String(160), default="")
    tags: Mapped[list[Any]] = mapped_column(default=list)


class MappingRow(Base):
    __tablename__ = "report_mapping"
    template_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    template_sha256: Mapped[str] = mapped_column(String(64))
    mapping: Mapped[dict[str, Any]] = mapped_column(default=dict)
    updated_at: Mapped[datetime]


class ReportRunRow(Base):
    __tablename__ = "report_run"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    template_id: Mapped[int] = mapped_column(index=True)
    template_sha256: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime]
    reference_at: Mapped[datetime]
    board_ids: Mapped[list[Any]] = mapped_column(default=list)
    sprint_ids: Mapped[list[Any]] = mapped_column(default=list)
    status: Mapped[str] = mapped_column(String(20))
    path: Mapped[str | None] = mapped_column(Text)
    validation: Mapped[dict[str, Any]] = mapped_column(default=dict)
    anonymized: Mapped[bool] = mapped_column(default=False)
    #: "entrega" (a deck for people), "previa" (one board, to look at before generating, #9) or
    #: "parcial" (some slides or boards regenerated from ``parent_run_id``, #10). Only "entrega"
    #: runs are listed in the history, shared and scheduled.
    kind: Mapped[str] = mapped_column(String(10), default="entrega")
    parent_run_id: Mapped[str | None] = mapped_column(String(32))
    #: #25: the audience variant this deck was generated for; empty is "everyone".
    audience: Mapped[str] = mapped_column(String(40), default="")
    #: #12: rascunho → em_revisao → aprovado | reprovado.
    review_status: Mapped[str] = mapped_column(String(12), default="rascunho")
    reviewed_by: Mapped[str | None] = mapped_column(String(255))
    reviewed_at: Mapped[datetime | None]
    review_note: Mapped[str] = mapped_column(Text, default="")
    #: Every review transition kept (action, by, at, note), because the single `review_*` columns
    #: above only ever hold the *latest* decision — a rejection's reason must survive a later
    #: approval by someone else, not be silently overwritten by it.
    review_history: Mapped[list[Any]] = mapped_column(default=list)
    #: #30: how long generation took, for the usage view.
    seconds: Mapped[float] = mapped_column(Float, default=0.0)


class DeckShareRow(Base):
    """#14: a read-only link to one generated deck. The token is the whole credential, so it is
    random, expires and can be revoked; it opens that run's scene and nothing else."""

    __tablename__ = "deck_share"
    token: Mapped[str] = mapped_column(String(64), primary_key=True)
    run_id: Mapped[str] = mapped_column(String(32), index=True)
    created_at: Mapped[datetime]
    expires_at: Mapped[datetime]
    created_by: Mapped[str | None] = mapped_column(String(255))
    revoked_at: Mapped[datetime | None]
    views: Mapped[int] = mapped_column(Integer, default=0)


class ReportQuestionRow(Base):
    """A question asked during a presentation — Slides' audience Q&A. Anyone who can reach
    Cadência can ask one against a run they are watching; there is no separate public join link,
    because the public surface (``/api/public/*``) is deliberately GET-only (RF: it only ever
    opens a shared deck for reading, never accepts a write) and this feature is for a room of
    people who already have access, not a stranger with a link."""

    __tablename__ = "report_question"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(String(32), index=True)
    text: Mapped[str] = mapped_column(Text)
    author: Mapped[str | None] = mapped_column(String(255))
    asked_at: Mapped[datetime]
    answered_at: Mapped[datetime | None]


class SavedViewRow(Base):
    """RF-75: a named set of filters, shared by link and optionally pinned in the navigation."""

    __tablename__ = "saved_view"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120))
    path: Mapped[str] = mapped_column(String(255))  # the screen, e.g. "/fluxo"
    query: Mapped[str] = mapped_column(Text, default="")  # its URL filters, without the "?"
    pinned: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime]


class DeckVersionRow(Base):
    """RF-87: a stored copy of a template's edits or mapping, so a bad save can be taken back.

    ``auto`` versions are the rolling safety net autosave leaves behind (one per ten-minute window);
    named ones are what somebody chose to keep and are never pruned.
    """

    __tablename__ = "deck_version"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    template_id: Mapped[int] = mapped_column(Integer, index=True)
    kind: Mapped[str] = mapped_column(String(20))  # "edits" | "mapping"
    label: Mapped[str] = mapped_column(String(255), default="")
    auto: Mapped[bool] = mapped_column(default=True)
    author: Mapped[str | None] = mapped_column(String(255))
    document: Mapped[dict[str, Any]] = mapped_column(default=dict)
    created_at: Mapped[datetime]
    updated_at: Mapped[datetime]


class DeckCommentRow(Base):
    """RF-93: a review note on a slide (or one shape of it), resolved before the meeting."""

    __tablename__ = "deck_comment"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    template_id: Mapped[int] = mapped_column(Integer, index=True)
    #: The template slide it is about, so it follows every board's copy of that slide.
    origin_slide_id: Mapped[int] = mapped_column(Integer)
    shape_key: Mapped[str | None] = mapped_column(String(64))
    parent_id: Mapped[int | None] = mapped_column(Integer)
    author: Mapped[str] = mapped_column(String(255), default="")
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime]
    resolved_at: Mapped[datetime | None]


class RoleRow(Base):
    """A role (UI: "Papel") somebody plays on an epic plan: Backend, Frontend, Tech Leader…

    Not a Jira "project role", which is a permission. ``labels`` are the Jira labels or components
    that mark a subtask as this role's work; that is how a plan read from Jira knows who does what.
    """

    __tablename__ = "role"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    description: Mapped[str] = mapped_column(Text, default="")
    color: Mapped[str] = mapped_column(String(16), default="#868e96")
    position: Mapped[int] = mapped_column(Integer, default=0)
    labels: Mapped[list[Any]] = mapped_column(default=list)
    created_at: Mapped[datetime]


class TeamMemberRow(Base):
    """A Jira person enrolled in epic planning. ``active: False`` keeps the roles but hides them."""

    __tablename__ = "team_member"
    account_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    active: Mapped[bool] = mapped_column(default=True)


class MemberRoleRow(Base):
    """One role a member covers, with its seniority (informative only: it changes no number)."""

    __tablename__ = "member_role"
    account_id: Mapped[str] = mapped_column(String(128), primary_key=True)
    role_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False, index=True)
    seniority: Mapped[str] = mapped_column(String(10), default="pleno")


class EpicPlanRunRow(Base):
    """A plan generated for an epic. The latest one is "o último plano gerado" the views compare
    against; ``fingerprint`` says which inputs it was built from, so a plan made before Jira or the
    team changed is recognised as stale instead of being shown as current."""

    __tablename__ = "epic_plan_run"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    epic_key: Mapped[str] = mapped_column(String(64), index=True)
    algorithm: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(20))
    gap: Mapped[float | None] = mapped_column(Float)
    makespan_days: Mapped[int] = mapped_column(Integer, default=0)
    member_ids: Mapped[list[Any]] = mapped_column(default=list)
    parameters: Mapped[dict[str, Any]] = mapped_column(default=dict)
    allocations: Mapped[list[Any]] = mapped_column(default=list)
    fingerprint: Mapped[str] = mapped_column(String(64), default="")
    seconds: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime]


class SubtaskRoleRow(Base):
    """The role(s) somebody chose for a subtask in Cadência. It wins over labels and the assignee,
    because it is a decision a person made about this subtask; Jira stays untouched (read-only)."""

    __tablename__ = "subtask_role"
    issue_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    role_ids: Mapped[list[Any]] = mapped_column(default=list)
    updated_at: Mapped[datetime]


class DeckBlockRow(Base):
    """#16: a set of shapes somebody saved to reuse — a legend, a signature, a KPI strip.

    ``shapes`` holds insert edits (the edit layer's own vocabulary), with frames relative to the
    block's top-left corner, so a block lands wherever it is dropped, in any template."""

    __tablename__ = "deck_block"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    author: Mapped[str | None] = mapped_column(String(255))
    shapes: Mapped[dict[str, Any]] = mapped_column(default=dict)
    width: Mapped[int] = mapped_column(Integer, default=0)
    height: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime]
    #: #29: how often this block is dropped onto a slide, so the library can surface favourites
    #: instead of always showing the same alphabetical list.
    usage_count: Mapped[int] = mapped_column(Integer, default=0)
    last_used_at: Mapped[datetime | None]


class EditorPresenceRow(Base):
    """#19: who has a template open in the editor, and on which slide, as of their last beat."""

    __tablename__ = "editor_presence"
    template_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    author: Mapped[str] = mapped_column(String(255), primary_key=True)
    slide_key: Mapped[str] = mapped_column(String(64), default="")
    seen_at: Mapped[datetime]


class FocusLogStateRow(Base):
    """The focus log's revision: one row, bumped by every save, so an editor can tell it is stale (409)."""

    __tablename__ = "focus_log_state"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    revision: Mapped[int] = mapped_column(default=0)
    updated_at: Mapped[datetime]


class FocusLogPersonRow(Base):
    """A member of the focus log's team, kept by hand: not a Jira account."""

    __tablename__ = "focus_log_person"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    position: Mapped[int]
    nome: Mapped[str] = mapped_column(String(120))
    cargo: Mapped[str] = mapped_column(String(120), default="")
    cor: Mapped[str] = mapped_column(String(7))


class FocusLogThemeRow(Base):
    """A theme the focus log files its lines under, and the words that find it in a text."""

    __tablename__ = "focus_log_theme"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    position: Mapped[int]
    nome: Mapped[str] = mapped_column(String(120), unique=True)
    cor: Mapped[str] = mapped_column(String(7))
    palavras: Mapped[str] = mapped_column(Text, default="")


class FocusLogEntryRow(Base):
    """A line of the focus log: an ordinary activity, or a change of focus from one theme to another."""

    __tablename__ = "focus_log_entry"
    uid: Mapped[str] = mapped_column(String(64), primary_key=True)
    position: Mapped[int]
    tipo: Mapped[str] = mapped_column(String(16))
    nome: Mapped[str] = mapped_column(String(120))
    data: Mapped[date]
    registro: Mapped[str] = mapped_column(Text, default="")
    de_tema: Mapped[str | None] = mapped_column(String(120))
    para_tema: Mapped[str | None] = mapped_column(String(120))
    icone: Mapped[str | None] = mapped_column(String(16))
    cor_destaque: Mapped[str | None] = mapped_column(String(7))
    estilo_linha: Mapped[str | None] = mapped_column(String(32))


class FocusLogSignalRow(Base):
    """A condition the focus log finds in a line's words (blocked, urgent...). Managed by the team, unlike
    the signals that were fixed in the code: the same words-and-colour shape as a theme."""

    __tablename__ = "focus_log_signal"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    position: Mapped[int]
    nome: Mapped[str] = mapped_column(String(120), unique=True)
    cor: Mapped[str] = mapped_column(String(7))
    palavras: Mapped[str] = mapped_column(Text, default="")
    gatilho: Mapped[str] = mapped_column(String(200), default="")
