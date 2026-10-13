"""A deck source that offers nothing to read from (RF-60).

Every variable is hand-filled in the manager; there is no tracker, no API, no collector. It exists
for two reasons. It makes the module usable in a project that has data nowhere but in somebody's
head — which is the honest floor of "no variables by default". And it is a *second* implementation
of :class:`~cadencia.report.ports.DeckSource`, which is what keeps the port from quietly becoming
the shape of Jira: anything `JiraSource` needs that this cannot provide has to be justified.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime

from cadencia.report.core.context import BoardDeck, DeckData, FieldSpec, VariableSpec


@dataclass(frozen=True)
class NamedTarget:
    """A target with a name and nothing else, because that is all there is to know."""

    id: int
    name: str
    group_key: str | None = None
    group_name: str | None = None


class ManualSource:
    """Targets somebody typed, and no catalogue at all."""

    name = "manual"

    def __init__(self, targets: Sequence[NamedTarget] = ()) -> None:
        self._targets = list(targets)

    def targets(self) -> Sequence[NamedTarget]:
        return self._targets

    def catalog(self) -> Sequence[FieldSpec]:
        """Nothing. A variable here is wired to no field and says only what somebody wrote."""
        return ()

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
        wanted = {t.id: t for t in self._targets}
        deck = DeckData(reference=reference, variables=dict(registry), template_name=template_name)
        deck.slide_texts = {int(k): dict(v) for k, v in (slide_variables or {}).items()}
        for target_id in target_ids:
            target = wanted.get(target_id)
            if target is None:
                continue
            board = BoardDeck(
                board_id=target.id,
                name=target.name,
                space_key=target.group_key,
                space_name=target.group_name,
            )
            for name, value in (variables(target.group_key, target.id) if variables else {}).items():
                board.texts[f"texto.{name}"] = value
            deck.boards.append(board)
        # The deck-level view is the same lookup with no target: global values and registration
        # defaults only, which is exactly what a deck-scoped slide can see.
        for name, value in (variables(None, None) if variables else {}).items():
            deck.texts[f"texto.{name}"] = value
        return deck
