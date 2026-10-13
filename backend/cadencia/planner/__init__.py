"""Plan generation for the epic plan: the exact solvers and the strategy registry.

Kept apart from ``domain.epic_plan`` because it leans on a heavy native library (OR-Tools); the
domain package stays importable, and the greedy planner usable, without it.
"""
