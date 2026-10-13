"""Dependencies. The source of truth is each subtask's prerequisites; a task's dependencies are
derived from them: task A depends on task B when some subtask of A waits on a subtask of B."""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping, Sequence

from cadencia.domain.epic_plan.model import Epic

_PARTS = re.compile(r"(\d+)")


def natural_key(identifier: str) -> tuple[object, ...]:
    """``CAD-9`` before ``CAD-10``, and ``S02`` before ``S10`` — the order people read ids in."""
    return tuple(int(p) if p.isdigit() else p.casefold() for p in _PARTS.split(identifier) if p)


def task_dependencies(epic: Epic) -> dict[str, tuple[str, ...]]:
    owner = {s.id: s.task_id for s in epic.subtasks}
    out: dict[str, set[str]] = {t.id: set() for t in epic.tasks}
    for subtask in epic.subtasks:
        for prerequisite in subtask.prerequisites:
            other = owner.get(prerequisite)
            if other and other != subtask.task_id:
                out.setdefault(subtask.task_id, set()).add(other)
    return {k: tuple(sorted(v, key=natural_key)) for k, v in out.items()}


def cycles(nodes: Iterable[str], preds: Mapping[str, Iterable[str]]) -> list[tuple[str, ...]]:
    """Strongly connected components that are cycles (two or more nodes, or a self-loop)."""
    universe = list(dict.fromkeys(nodes))
    known = set(universe)
    succs: dict[str, list[str]] = {n: [] for n in universe}
    for node in universe:
        for pred in preds.get(node, ()):
            if pred in known:
                succs[pred].append(node)
    index: dict[str, int] = {}
    low: dict[str, int] = {}
    stack: list[str] = []
    on_stack: set[str] = set()
    found: list[tuple[str, ...]] = []
    counter = 0

    for root in universe:
        if root in index:
            continue
        # Iterative Tarjan: (node, iterator over its successors).
        work = [(root, iter(succs[root]))]
        index[root] = low[root] = counter
        counter += 1
        stack.append(root)
        on_stack.add(root)
        while work:
            node, successors = work[-1]
            advanced = False
            for nxt in successors:
                if nxt not in index:
                    index[nxt] = low[nxt] = counter
                    counter += 1
                    stack.append(nxt)
                    on_stack.add(nxt)
                    work.append((nxt, iter(succs[nxt])))
                    advanced = True
                    break
                if nxt in on_stack:
                    low[node] = min(low[node], index[nxt])
            if advanced:
                continue
            work.pop()
            if work:
                parent = work[-1][0]
                low[parent] = min(low[parent], low[node])
            if low[node] == index[node]:
                component = []
                while True:
                    member = stack.pop()
                    on_stack.discard(member)
                    component.append(member)
                    if member == node:
                        break
                if len(component) > 1 or node in set(preds.get(node, ())):
                    found.append(tuple(sorted(component, key=natural_key)))
    return sorted(found, key=lambda c: natural_key(c[0]))


def subtask_cycles(epic: Epic) -> list[tuple[str, ...]]:
    return cycles((s.id for s in epic.subtasks), {s.id: s.prerequisites for s in epic.subtasks})


def layers(nodes: Sequence[str], preds: Mapping[str, Iterable[str]]) -> dict[str, int]:
    """Column of each node in a left-to-right diagram: the longest chain of prerequisites before it.
    Nodes caught in a cycle are placed after everything they could be placed after."""
    known = set(nodes)
    incoming = {n: {p for p in preds.get(n, ()) if p in known and p != n} for n in nodes}
    layer: dict[str, int] = {}
    remaining = list(nodes)
    while remaining:
        progressed = False
        for node in list(remaining):
            if all(p in layer for p in incoming[node]):
                layer[node] = max((layer[p] + 1 for p in incoming[node]), default=0)
                remaining.remove(node)
                progressed = True
        if not progressed:  # a cycle: release the first node that has any placed prerequisite
            node = remaining.pop(0)
            layer[node] = max((layer[p] + 1 for p in incoming[node] if p in layer), default=0)
    return layer


def tails(durations: Mapping[str, int], preds: Mapping[str, Iterable[str]]) -> dict[str, int]:
    """Longest path from each node to the end of the graph, its own duration included: the
    "remaining critical path" list scheduling sorts by. The graph must be acyclic."""
    succs: dict[str, list[str]] = {n: [] for n in durations}
    for node in durations:
        for pred in preds.get(node, ()):
            if pred in succs:
                succs[pred].append(node)
    out: dict[str, int] = {}

    def visit(node: str) -> int:
        if node not in out:
            out[node] = durations[node] + max((visit(s) for s in succs[node]), default=0)
        return out[node]

    for node in durations:
        visit(node)
    return out
