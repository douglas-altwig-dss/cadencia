"""The planning algorithms the UI offers. The picker is drawn from this registry, so a new
strategy is one ``register`` call here and no change to any view."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from cadencia.domain.epic_plan.schedule import SchedulingProblem, list_schedule
from cadencia.errors import Invalid
from cadencia.planner.solvers import HEURISTIC, SolveResult, solve_cpsat, solve_milp

Runner = Callable[[SchedulingProblem, float], SolveResult]


@dataclass(frozen=True)
class Strategy:
    id: str
    name: str
    tooltip: str
    run: Runner
    #: Uses the time limit and can prove optimality; the UI shows its status and gap.
    exact: bool = False
    default: bool = False

    def as_dict(self) -> dict[str, object]:
        return {
            "id": self.id,
            "nome": self.name,
            "descricao": self.tooltip,
            "exato": self.exact,
            "padrao": self.default,
        }


STRATEGIES: dict[str, Strategy] = {}


def register(strategy: Strategy) -> Strategy:
    STRATEGIES[strategy.id] = strategy
    return strategy


def strategy(strategy_id: str) -> Strategy:
    try:
        return STRATEGIES[strategy_id]
    except KeyError:
        raise Invalid(f"Algoritmo desconhecido: {strategy_id}. Opções: {', '.join(STRATEGIES)}.") from None


def _greedy(problem: SchedulingProblem, _seconds: float) -> SolveResult:
    return SolveResult(HEURISTIC, list_schedule(problem))


GREEDY = register(
    Strategy(
        "guloso",
        "List Scheduling (heurística gulosa)",
        "Rápida, responde em segundos. Aloca cada subtarefa ao especialista compatível que fica livre "
        "primeiro, respeitando os pré-requisitos. Não garante a melhor solução, mas é ideal para "
        "simulações rápidas.",
        _greedy,
        default=True,
    )
)
register(
    Strategy(
        "milp",
        "MS-RCPSP exato (MILP)",
        "Modela o escalonamento com múltiplas habilidades e recursos limitados como programação "
        "linear inteira mista. Pode provar a solução ótima, mas o tempo cresce muito com o número de "
        "subtarefas; por isso roda com limite de tempo.",
        solve_milp,
        exact=True,
    )
)
register(
    Strategy(
        "cpsat",
        "Constraint Programming (CP-SAT)",
        "Usa o solver de restrições do Google OR-Tools. Lida bem com precedências, não sobreposição e "
        "disponibilidade e costuma achar soluções muito boas rapidamente. Opção recomendada.",
        solve_cpsat,
        exact=True,
    )
)
