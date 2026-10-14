"""Algoritmos de planejamento: nomes, descrições e erros. Cópia literal dos textos anteriores (R8)."""

from __future__ import annotations

from cadencia.i18n.render import Entry

MESSAGES: dict[str, Entry] = {
    "strategy.guloso.name": "List Scheduling (heurística gulosa)",
    "strategy.guloso.description": "Rápida, responde em segundos. Aloca cada subtarefa ao especialista "
    "compatível que fica livre primeiro, respeitando os pré-requisitos. Não garante a melhor solução, mas "
    "é ideal para simulações rápidas.",
    "strategy.milp.name": "MS-RCPSP exato (MILP)",
    "strategy.milp.description": "Modela o escalonamento com múltiplas habilidades e recursos limitados "
    "como programação linear inteira mista. Pode provar a solução ótima, mas o tempo cresce muito com o "
    "número de subtarefas; por isso roda com limite de tempo.",
    "strategy.cpsat.name": "Constraint Programming (CP-SAT)",
    "strategy.cpsat.description": "Usa o solver de restrições do Google OR-Tools. Lida bem com "
    "precedências, não sobreposição e disponibilidade e costuma achar soluções muito boas rapidamente. "
    "Opção recomendada.",
    "unknown": lambda algorithm, options: (
        f"Algoritmo desconhecido: {algorithm}. Opções: {', '.join(options)}."
    ),
    "unavailable": "OR-Tools ({solver}) não está instalado no backend.",
    "unavailable_cause": "solver indisponível",
    "unavailable_action": "Instale as dependências do backend (ortools) ou use o algoritmo guloso.",
}
