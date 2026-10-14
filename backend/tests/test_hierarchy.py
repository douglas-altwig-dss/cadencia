from cadencia.domain.hierarchy import NO_EPIC_KEY, build_tree, find_node, progress_of
from tests.factories import DONE, TODO, issue


def test_epic_progress_by_count_and_estimate_with_coverage_warning():
    # RF-12 acceptance: 10 stories, 4 done, 3 without estimate.
    estimates = [3, 5, 2, 8, 1, 3, 5, None, None, None]
    done = {0, 1, 7, 8}
    stories = [
        issue(f"S-{i}", status=DONE if i in done else TODO, parent="E-1", estimate=e)
        for i, e in enumerate(estimates)
    ]
    epic = issue("E-1", type_name="Epic", level=1)
    node = find_node(build_tree([epic, *stories]), "E-1")
    progress = node.progress
    assert progress.total == 10 and progress.done == 4
    assert progress.count_ratio == 0.4
    assert progress.estimated == 7 and progress.unestimated == 3
    assert progress.estimate_total == 27 and progress.estimate_done == 8
    assert round(progress.estimate_ratio, 3) == round(8 / 27, 3)
    assert progress.coverage == 0.7
    assert "3 de 10" in str(progress.coverage_warning)


def test_unestimated_items_are_never_counted_as_zero():
    progress = progress_of([issue("A", estimate=None, status=DONE), issue("B", estimate=5)])
    assert progress.estimate_total == 5 and progress.estimate_done == 0
    assert progress.count_ratio == 0.5


def test_tree_groups_orphans_and_missing_parents_explicitly():
    items = [
        issue("E-1", type_name="Epic", level=1),
        issue("S-1", parent="E-1", estimate=3),
        issue("T-1", parent="S-1", level=-1, type_name="Subtarefa"),
        issue("S-2"),
        issue("S-3", parent="E-9"),
    ]
    nodes = build_tree(items)
    keys = [n.key for n in nodes]
    assert keys == ["E-1", "E-9", NO_EPIC_KEY]
    assert nodes[1].missing and "fora do escopo" in str(nodes[1].label)
    assert str(nodes[2].label) == "Sem épico" and [c.key for c in nodes[2].children] == ["S-2"]
    story = find_node(nodes, "S-1")
    assert [c.key for c in story.children] == ["T-1"]
    assert nodes[0].estimate_rollup == 3
