"""Planning algorithms: names, descriptions and errors."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    # The strategy picker on the epic plan page.
    "strategy.guloso.name": "List scheduling (greedy heuristic)",
    "strategy.guloso.description": "Fast, answers in seconds. Assigns each subtask to the matching "
    "specialist who is free first, respecting prerequisites. It does not guarantee the best solution, "
    "but it is ideal for quick simulations.",
    "strategy.milp.name": "Exact MS-RCPSP (MILP)",
    "strategy.milp.description": "Models multi-skill, resource-constrained scheduling as mixed-integer "
    "linear programming. It can prove the optimal solution, but the time grows quickly with the number "
    "of subtasks, so it runs with a time limit.",
    "strategy.cpsat.name": "Constraint programming (CP-SAT)",
    "strategy.cpsat.description": "Uses Google OR-Tools' constraint solver. It handles precedences, "
    "non-overlap and availability well and usually finds very good solutions quickly. Recommended option.",
    # Errors.
    "unknown": lambda algorithm, options: f"Unknown algorithm: {algorithm}. Options: {', '.join(options)}.",
    "unavailable": "OR-Tools ({solver}) is not installed on the backend.",
    "unavailable_cause": "solver unavailable",
    "unavailable_action": "Install the backend dependencies (ortools) or use the greedy algorithm.",
}
