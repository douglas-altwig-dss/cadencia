"""Work tree (initiative → epic → story/task/bug → subtask) and progress (RF-11, RF-12).

Progress is always reported on two bases at once: item count and estimate sum. Items without an
estimate are counted apart and never treated as zero, which would inflate the estimate progress.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable, Iterable, Iterator, Sequence
from dataclasses import dataclass, field

from cadencia.domain.models import HierarchyLevel, Issue
from cadencia.i18n.message import Msg

NO_EPIC_KEY = "__sem_epico__"
#: The synthetic "no epic" node's label; rendered by the view that shows it.
NO_EPIC_LABEL = Msg("board.tree.no_epic")


@dataclass(frozen=True)
class Progress:
    total: int
    done: int
    estimated: int
    unestimated: int
    estimate_total: float
    estimate_done: float

    @property
    def remaining(self) -> int:
        return self.total - self.done

    @property
    def estimate_remaining(self) -> float:
        return self.estimate_total - self.estimate_done

    @property
    def count_ratio(self) -> float | None:
        return self.done / self.total if self.total else None

    @property
    def estimate_ratio(self) -> float | None:
        return self.estimate_done / self.estimate_total if self.estimate_total else None

    @property
    def coverage(self) -> float | None:
        return self.estimated / self.total if self.total else None

    @property
    def coverage_warning(self) -> Msg | None:
        if self.unestimated == 0 or self.total == 0:
            return None
        return Msg("board.progress.coverage", unestimated=self.unestimated, total=self.total)

    def as_dict(self) -> dict[str, object]:
        return {
            "total": self.total,
            "done": self.done,
            "remaining": self.remaining,
            "estimated": self.estimated,
            "unestimated": self.unestimated,
            "estimate_total": self.estimate_total,
            "estimate_done": self.estimate_done,
            "estimate_remaining": self.estimate_remaining,
            "count_ratio": self.count_ratio,
            "estimate_ratio": self.estimate_ratio,
            "coverage": self.coverage,
            # A `$msg` record: the view that embeds this renders it (``localize``).
            "coverage_warning": warning.to_json() if (warning := self.coverage_warning) else None,
        }


def progress_of(items: Iterable[Issue], is_done: Callable[[Issue], bool] | None = None) -> Progress:
    done_fn = is_done or (lambda i: i.is_done)
    total = done = estimated = 0
    estimate_total = estimate_done = 0.0
    for item in items:
        total += 1
        finished = done_fn(item)
        done += finished
        if item.estimate is not None:
            estimated += 1
            estimate_total += item.estimate
            if finished:
                estimate_done += item.estimate
    return Progress(
        total=total,
        done=done,
        estimated=estimated,
        unestimated=total - estimated,
        estimate_total=estimate_total,
        estimate_done=estimate_done,
    )


@dataclass
class TreeNode:
    key: str
    label: str | Msg  # an issue's summary, or a message for a synthetic node
    issue: Issue | None
    children: list[TreeNode] = field(default_factory=list)
    progress: Progress | None = None
    estimate_rollup: float | None = None
    missing: bool = False  # parent referenced by collected items but not collected itself

    @property
    def synthetic(self) -> bool:
        return self.issue is None

    def walk(self) -> Iterator[TreeNode]:
        yield self
        for child in self.children:
            yield from child.walk()


def _sort_key(issue: Issue) -> tuple[str, str]:
    return (issue.rank or "~", issue.key)


def build_tree(issues: Sequence[Issue], is_done: Callable[[Issue], bool] | None = None) -> list[TreeNode]:
    by_key = {i.key: i for i in issues}
    children: dict[str, list[Issue]] = defaultdict(list)
    missing: dict[str, list[Issue]] = defaultdict(list)
    roots: list[Issue] = []
    orphans: list[Issue] = []
    for issue in issues:
        parent = issue.parent_key
        if parent and parent in by_key and parent != issue.key:
            children[parent].append(issue)
        elif parent:
            missing[parent].append(issue)
        elif issue.hierarchy_level >= HierarchyLevel.EPIC:
            roots.append(issue)
        else:
            orphans.append(issue)

    def make(issue: Issue) -> TreeNode:
        kids = [make(c) for c in sorted(children.get(issue.key, []), key=_sort_key)]
        return _finish(TreeNode(key=issue.key, label=issue.summary, issue=issue, children=kids), is_done)

    nodes = [make(i) for i in sorted(roots, key=_sort_key)]
    for parent_key in sorted(missing):
        kids = [make(c) for c in sorted(missing[parent_key], key=_sort_key)]
        nodes.append(
            _finish(
                TreeNode(
                    key=parent_key,
                    label=Msg("board.tree.out_of_scope", key=parent_key),
                    issue=None,
                    children=kids,
                    missing=True,
                ),
                is_done,
            )
        )
    if orphans:
        kids = [make(c) for c in sorted(orphans, key=_sort_key)]
        nodes.append(
            _finish(TreeNode(key=NO_EPIC_KEY, label=NO_EPIC_LABEL, issue=None, children=kids), is_done)
        )
    return nodes


def _finish(node: TreeNode, is_done: Callable[[Issue], bool] | None) -> TreeNode:
    if node.children:
        direct = [c.issue for c in node.children if c.issue is not None]
        node.progress = progress_of(direct, is_done)
    elif node.issue is not None:
        node.progress = progress_of([node.issue], is_done)
    own = node.issue.estimate if node.issue else None
    if own is not None:
        node.estimate_rollup = own
    else:
        rolled = [c.estimate_rollup for c in node.children if c.estimate_rollup is not None]
        node.estimate_rollup = sum(rolled) if rolled else None
    return node


def find_node(nodes: Iterable[TreeNode], key: str) -> TreeNode | None:
    for root in nodes:
        for node in root.walk():
            if node.key == key:
                return node
    return None
