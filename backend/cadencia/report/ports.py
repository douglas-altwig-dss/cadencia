"""The interfaces the deck engine is filled through (RF-60).

`core/` knows how to turn a template plus a :class:`DeckData` into a .pptx. It does not know where
that data came from, and this is the seam that keeps it that way: a project wanting to use the
module supplies a :class:`DeckSource` and the engine is unchanged.

These are :class:`~typing.Protocol`\\ s, not base classes, on purpose. An adapter does not import
anything from here to satisfy one, which means a source can live in another package — or be a test
double that is three lines long — without a dependency pointing back at the module it plugs into.

The vocabulary is deliberately small. A source answers three questions:

* **Who can a deck be about?** :meth:`DeckSource.targets` — the boards, teams, projects, rows, or
  whatever that system's unit of reporting is.
* **What can a variable be wired to?** :meth:`DeckSource.catalog` — named, *typed* fields.
* **What do they say right now?** :meth:`DeckSource.deck_data` — one :class:`DeckData` per run.

Everything else the deck does — variables, mapping, edits, validation, rendering — is the engine's
and needs no source at all.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import datetime
from typing import Protocol, runtime_checkable

from cadencia.report.core.context import DeckData, FieldSpec, VariableSpec


class SourceTarget(Protocol):
    """One thing a deck can be generated for: a board, a team, a project, a spreadsheet row.

    Cadência's own unit is a Jira board grouped under a space, and the names here are that shape
    worn thin: ``key`` and ``name`` for the thing itself, ``group_key`` and ``group_name`` for
    whatever it belongs to. A source with no grouping leaves the second pair ``None``, and the
    per-space repeat simply has one group per target.
    """

    @property
    def id(self) -> int: ...

    @property
    def name(self) -> str: ...

    @property
    def group_key(self) -> str | None: ...

    @property
    def group_name(self) -> str | None: ...


@runtime_checkable
class DeckSource(Protocol):
    """Where a deck's data comes from. Implemented once per system the module is plugged into."""

    #: Short identifier stored with a template's mapping, so a deck built against one source is
    #: not silently regenerated against another.
    name: str

    def targets(self) -> Sequence[SourceTarget]:
        """Everything a deck can be generated for, in the order a picker should show it."""
        ...

    def catalog(self) -> Sequence[FieldSpec]:
        """The fields a variable may be wired to, each carrying the kind it yields.

        Returning an empty sequence is legitimate and means "this source offers nothing to read
        from" — every variable is then hand-filled, which is what `ManualSource` does.
        """
        ...

    def deck_data(
        self,
        target_ids: Sequence[int],
        *,
        reference: datetime,
        now: datetime,
        registry: Mapping[str, VariableSpec],
        variables: Mapping[str, str] | None = None,
        slide_variables: Mapping[int, Mapping[str, str]] | None = None,
        template_name: str = "",
        anonymize: bool = False,
    ) -> DeckData:
        """Everything the engine needs for one generation.

        ``registry`` is passed in rather than discovered because the variables are the *module's*,
        not the source's: a source supplies fields, and which of them a name reads from is a
        decision the variable manager owns.
        """
        ...
