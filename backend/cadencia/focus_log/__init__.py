"""The "Timeline de foco" log: a team's focus over time, kept by hand.

This package is isolated on purpose. It does not read Jira, the collected boards, the analytics or
the deck. Its only dependencies are its own rows in the store and the pydantic models here, so it
can be used, tested and removed without touching the rest of the app. `tests/test_focus_log.py`
enforces that with a test rather than a convention.
"""
