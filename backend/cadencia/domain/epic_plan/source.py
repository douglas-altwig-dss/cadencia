"""Where an epic plan comes from. Today that is Jira (``analytics.epic_plan.JiraEpicSource``,
reading what the collector stored); the views only ever see an :class:`Epic`, so another source
is one more implementation of this port and nothing else."""

from __future__ import annotations

from typing import Protocol

from cadencia.domain.epic_plan.model import Epic


class EpicSource(Protocol):
    def load(self, key: str) -> Epic:
        """The epic's tasks and subtasks. Raises ``NotFound`` for an epic nobody collected."""
        ...
