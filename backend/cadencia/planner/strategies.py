"""The planning algorithms the UI offers. The picker is drawn from this registry, so a new
strategy is one ``register`` call here and no change to any view.

Names and descriptions are messages (R7: no module-level text), rendered by the view that shows
them; a plain ``str`` still works for a strategy registered without catalogue entries."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from cadencia.domain.epic_plan.schedule import SchedulingProblem, list_schedule
from cadencia.errors import Invalid
from cadencia.i18n.message import Msg
from cadencia.planner.solvers import HEURISTIC, SolveResult, solve_cpsat, solve_milp

Runner = Callable[[SchedulingProblem, float], SolveResult]


@dataclass(frozen=True)
class Strategy:
    id: str
    name: Msg | str
    tooltip: Msg | str
    run: Runner
    #: Uses the time limit and can prove optimality; the UI shows its status and gap.
    exact: bool = False
    default: bool = False

    def as_dict(self) -> dict[str, object]:
        """``nome``/``descricao`` as ``$msg`` JSON (or the plain text given): ``localize`` it."""
        return {
            "id": self.id,
            "nome": _json(self.name),
            "descricao": _json(self.tooltip),
            "exato": self.exact,
            "padrao": self.default,
        }


def _json(value: Msg | str) -> object:
    return value.to_json() if isinstance(value, Msg) else value


STRATEGIES: dict[str, Strategy] = {}


def register(strategy: Strategy) -> Strategy:
    STRATEGIES[strategy.id] = strategy
    return strategy


def strategy(strategy_id: str) -> Strategy:
    try:
        return STRATEGIES[strategy_id]
    except KeyError:
        raise Invalid(Msg("planner.unknown", algorithm=strategy_id, options=list(STRATEGIES))) from None


def _greedy(problem: SchedulingProblem, _seconds: float) -> SolveResult:
    return SolveResult(HEURISTIC, list_schedule(problem))


GREEDY = register(
    Strategy(
        "guloso",
        Msg("planner.strategy.guloso.name"),
        Msg("planner.strategy.guloso.description"),
        _greedy,
        default=True,
    )
)
register(
    Strategy(
        "milp",
        Msg("planner.strategy.milp.name"),
        Msg("planner.strategy.milp.description"),
        solve_milp,
        exact=True,
    )
)
register(
    Strategy(
        "cpsat",
        Msg("planner.strategy.cpsat.name"),
        Msg("planner.strategy.cpsat.description"),
        solve_cpsat,
        exact=True,
    )
)
