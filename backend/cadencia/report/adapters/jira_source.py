"""Cadência's own data behind :class:`~cadencia.report.ports.DeckSource` (RF-60).

This is the adapter, and the only place in the deck path that knows a board from a sprint. It is
thin on purpose: `analytics.deck.deck_data` already builds the engine's structures, so the job here
is to answer the port's three questions in the port's vocabulary and get out of the way.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from cadencia.analytics.changes import checkpoints_with_snapshots, compare, state_at_checkpoint, state_now
from cadencia.analytics.data import BoardData, load_board
from cadencia.analytics.deck import BoardInputs, deck_data
from cadencia.analytics.epic_plan import board_epic_summaries
from cadencia.analytics.health import board_health
from cadencia.config import Settings
from cadencia.domain.models import HierarchyLevel
from cadencia.i18n import DECK_LOCALE, using_locale
from cadencia.report.core.context import FIELDS, DeckData, FieldSpec, VariableSpec
from cadencia.store import repo
from cadencia.store import schema as s


@dataclass(frozen=True)
class BoardTarget:
    """One Jira board, wearing the port's names. The space is the group."""

    id: int
    name: str
    group_key: str | None
    group_name: str | None


class JiraSource:
    """The boards Cadência collects, as a deck source."""

    name = "jira"

    def __init__(self, session: Session, settings: Settings) -> None:
        self._session = session
        self._settings = settings

    def targets(self) -> Sequence[BoardTarget]:
        return [
            BoardTarget(id=b.id, name=b.name, group_key=b.space_key, group_name=b.space_name)
            for b in repo.selected_boards(self._session)
        ]

    def catalog(self) -> Sequence[FieldSpec]:
        """Everything Jira can answer. The variables themselves are not here: they are the
        module's, and `service.catalog_extras` adds them on top."""
        return FIELDS

    def deck_data(
        self,
        target_ids: Sequence[int],
        *,
        reference: datetime,
        now: datetime,
        registry: Mapping[str, VariableSpec],
        variables: Callable[[str | None, int | None], dict[str, str]] | None = None,
        slide_variables: Mapping[int, Mapping[str, str]] | None = None,
        template_name: str = "",
        anonymize: bool = False,
    ) -> DeckData:
        # The deck is filled into a pt-BR template and is not translated (docs/i18n.md): whatever
        # the request or CADENCIA_LOCALE says, text rendered while its data is built is pt-BR.
        # `inputs()` runs inside too (through the lambda below), and so does every DeckData build.
        with using_locale(DECK_LOCALE):
            defaults = repo.profile_defaults(self._settings)
            boards = [
                load_board(self._session, board_id, defaults, self._settings.history_days)
                for board_id in target_ids
                if self._session.get(s.BoardRow, board_id)
            ]
            return deck_data(
                boards,
                reference,
                now=now,
                anonymize=anonymize,
                committed=lambda sprint_id: repo.load_commitment(self._session, sprint_id),
                variables=variables,
                slide_variables=slide_variables,
                registry=registry,
                template_name=template_name,
                inputs=lambda data, reference: self.inputs(data, reference, now),
            )

    def inputs(self, data: BoardData, reference: datetime, now: datetime) -> BoardInputs:
        """What the deck needs from the store, per board: the last checkpoint against the
        reference, the data health check and the plans of the epics the board works on."""
        session = self._session
        changes = since = None
        earlier = [c for c in checkpoints_with_snapshots(session, data.board.id, now) if c.at < reference]
        if earlier:
            changes = compare(state_at_checkpoint(session, earlier[-1].id), state_now(data, reference))
            since = earlier[-1].at
        health = board_health(data, repo.load_field_map(session), reference)
        sprint = data.sprint_at(reference)
        scope = (
            data.sprint_members(sprint.id, data.reference_for(sprint, reference))
            if sprint is not None
            else data.open_items(reference)
        )
        epics = []
        for history in scope:
            parent = data.issues.get(history.issue.parent_key or "")
            while parent is not None and parent.hierarchy_level < HierarchyLevel.EPIC:
                parent = data.issues.get(parent.parent_key or "")
            if parent is not None:
                epics.append(parent.key)
        plans = board_epic_summaries(session, epics, self._settings.jira_base_url or None)
        return BoardInputs(changes=changes, changes_since=since, health=health, plans=plans)
