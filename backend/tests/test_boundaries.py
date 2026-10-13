"""The deck engine's isolation, enforced rather than documented (RF-60).

`report/core` is meant to be liftable into another project by copying the directory and
`ports.py`. That is only true while nothing inside it reaches for the store, the analytics layer,
the domain modules, Jira or the app's settings — and a rule like that decays the first time
somebody needs one import in a hurry. So it is a test.

Deliberately written with `ast` and no extra dependency: a module whose selling point is that it
travels should not need a linter installed to prove it still can.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

REPORT = Path(__file__).resolve().parents[1] / "cadencia" / "report"
CORE = REPORT / "core"

#: What `core/` may not touch. `report.adapters` is on the list too: an adapter knows both
#: vocabularies, and the engine depending on one would put the seam back where it started.
FORBIDDEN = ("cadencia.store", "cadencia.analytics", "cadencia.domain", "cadencia.jira")
#: Settings and logging are app plumbing. The engine takes paths and values as arguments.
FORBIDDEN_EXACT = ("cadencia.config", "cadencia.logging", "cadencia.collector", "cadencia.api")


def _imports(path: Path) -> list[tuple[int, str]]:
    """Every module name this file imports, with the line it is on."""
    found: list[tuple[int, str]] = []
    for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
        if isinstance(node, ast.Import):
            found += [(node.lineno, alias.name) for alias in node.names]
        elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            found.append((node.lineno, node.module))
    return found


def _offends(module: str) -> bool:
    if module.startswith("cadencia.report.adapters"):
        return True
    return module in FORBIDDEN_EXACT or any(module == f or module.startswith(f + ".") for f in FORBIDDEN)


@pytest.mark.parametrize("path", sorted(CORE.glob("*.py")), ids=lambda p: p.name)
def test_the_engine_imports_nothing_from_the_application(path: Path) -> None:
    bad = [(line, module) for line, module in _imports(path) if _offends(module)]
    assert not bad, (
        f"{path.name} alcança a aplicação: "
        + ", ".join(f"linha {line}: {module}" for line, module in bad)
        + ". O motor trabalha sobre DeckData e arquivos; o que precisa da aplicação vai para "
        "report/adapters ou entra por parâmetro."
    )


def test_the_engine_does_not_import_the_orchestration() -> None:
    """`core` must not reach back into `service`, which is what would close the loop."""
    offenders = [
        f"{path.name}:{line}"
        for path in CORE.glob("*.py")
        for line, module in _imports(path)
        if module.startswith("cadencia.report.service") or module.startswith("cadencia.report.ports")
    ]
    assert not offenders, f"core importa a orquestração: {offenders}"


def test_a_second_source_satisfies_the_port() -> None:
    """Two implementations is what keeps a port from being the shape of its first caller."""
    from cadencia.report.adapters.jira_source import JiraSource
    from cadencia.report.adapters.manual_source import ManualSource
    from cadencia.report.ports import DeckSource

    assert isinstance(ManualSource(), DeckSource)
    assert isinstance(JiraSource.__new__(JiraSource), DeckSource)
    # And the manual one really does offer nothing to read from, which is the point of it.
    assert list(ManualSource().catalog()) == []
