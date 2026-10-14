"""Leak scanner: Portuguese text left in backend code (docs/i18n-backend.md, Appendix A).

Usage, from ``backend/``::

    .venv/bin/python tools/i18n_scan.py                 # all of cadencia/
    .venv/bin/python tools/i18n_scan.py cadencia/api/app.py cadencia/domain

It parses each file with ``ast``, drops docstrings, log calls (``log.*``, ``logger.*``,
``logging.*``, ``log_event``), regular expressions (``re.*``) and OpenAPI metadata, and reports
string literals and f-string templates that contain a space and either a Portuguese diacritic or a
Portuguese function word. It is a heuristic: read what it lists.

Not reported: the files in the allowlist below (demo data, the sample template, migrations, the
pt-BR catalogue), the Jira-name matchers used to *read* Jira, and any literal on a line marked
``# deck text: pt-BR by design`` (deck content, which stays pt-BR) or ``# i18n: out of scope``
(operator-only text such as boot errors). A marker covers the lines of the literal it sits on (or
a comment line directly above it), never the rest of the statement. Exit status 1 when anything is
reported.
"""

from __future__ import annotations

import argparse
import ast
import re
import sys
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from pathlib import Path

PACKAGE = Path(__file__).resolve().parents[1] / "cadencia"

#: Whole files (or directories, ending in "/") relative to cadencia/ that are never reported.
ALLOWED_FILES = (
    "demo.py",  # fictional Jira data: Jira data is never translated
    "demo_seed.py",  # demo deck values
    "report/core/sample_template.py",  # template content
    "store/migrations/",
    "i18n/locales/pt_BR/",
)
#: Module-level names whose literals are Jira vocabulary matched on input, per file.
ALLOWED_NAMES = {
    "jira/fields.py": {"STORY_POINT_NAMES", "FLAGGED_NAMES"},
    "jira/mapping.py": {"_BLOCKED_BY"},
    "domain/epic_plan/from_jira.py": {"_SECTIONS"},  # description headings as teams write them
    # Deck text: the labels are the charts' alt text in the .pptx (docs/i18n-backend.md 1.7); the
    # field picker shows ``fields.label.<key>`` in the reader's language instead.
    "report/core/context.py": {"FIELDS"},
}
MARKERS = ("# deck text: pt-BR by design", "# i18n: out of scope")

DIACRITICS = frozenset("áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ")
WORDS = re.compile(
    # Words English does not share ("no", "do", "item", "configure" would flag English text).
    # A word right after "." "@" "/" or a letter is part of a domain, address or path ("x.com").
    r"(?<![\w.@/])(?:não|sem|para|com|de|da|dos|em|na|que|há|já|nada|ainda|uma|pelo|pela|está|"
    r"coleta|itens|dias|dia|nenhum|nenhuma|confira|informe|escolha|recarregue|verifique|"
    r"tente|selecione|aguarde|abra|veja)\b(?![.@/]\w)",
    re.IGNORECASE,
)
LOG_RECEIVERS = frozenset({"log", "logger", "logging", "_log", "LOG"})
SKIP_CALLS = frozenset({"log_event", "FastAPI", "APIRouter"})


@dataclass(frozen=True)
class Finding:
    path: str
    line: int
    text: str

    def __str__(self) -> str:
        text = self.text if len(self.text) <= 100 else self.text[:97] + "..."
        return f"{self.path}:{self.line}: {text!r}"


def looks_portuguese(text: str) -> bool:
    return " " in text and (any(ch in DIACRITICS for ch in text) or WORDS.search(text) is not None)


def _relative(path: Path) -> str:
    try:
        return path.resolve().relative_to(PACKAGE).as_posix()
    except ValueError:
        return path.as_posix()


def _allowed_file(relative: str) -> bool:
    return any(
        relative.startswith(entry) if entry.endswith("/") else relative == entry for entry in ALLOWED_FILES
    )


def _skipped_call(node: ast.Call) -> bool:
    func = node.func
    if isinstance(func, ast.Name):
        return func.id in SKIP_CALLS
    if isinstance(func, ast.Attribute) and isinstance(func.value, ast.Name):
        return func.value.id in LOG_RECEIVERS or func.value.id == "re"
    return False


def _template(node: ast.JoinedStr) -> str:
    return "".join(
        part.value if isinstance(part, ast.Constant) and isinstance(part.value, str) else "{…}"
        for part in node.values
    )


def _docstrings(tree: ast.AST) -> set[int]:
    found: set[int] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Module | ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef):
            body = node.body
            first = body[0] if body else None
            value = first.value if isinstance(first, ast.Expr) else None
            if isinstance(value, ast.Constant) and isinstance(value.value, str):
                found.add(id(value))
    return found


def _strings(tree: ast.AST, allowed_names: set[str]) -> Iterator[tuple[ast.expr, str]]:
    """Every literal and f-string template outside the skipped places."""
    docstrings = _docstrings(tree)

    def walk(node: ast.AST) -> Iterator[tuple[ast.expr, str]]:
        if isinstance(node, ast.Call) and _skipped_call(node):
            return
        if isinstance(node, ast.keyword) and node.arg == "tags":
            return
        if isinstance(node, ast.Assign | ast.AnnAssign) and allowed_names:
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            if any(isinstance(t, ast.Name) and t.id in allowed_names for t in targets):
                return
        if isinstance(node, ast.JoinedStr):
            yield node, _template(node)
            return
        if isinstance(node, ast.Constant) and isinstance(node.value, str) and id(node) not in docstrings:
            yield node, node.value
            return
        for child in ast.iter_child_nodes(node):
            yield from walk(child)

    yield from walk(tree)


def scan_file(path: Path) -> list[Finding]:
    relative = _relative(path)
    if _allowed_file(relative):
        return []
    source = path.read_text(encoding="utf-8")
    lines = source.splitlines()
    tree = ast.parse(source, filename=str(path))

    def marked(first: int, last: int) -> bool:
        """A marker on one of the literal's own lines, or alone on the comment line right above it.

        Never the whole statement: one marker in a dict of messages must not hide every entry."""
        own = lines[first - 1 : last]
        above = lines[first - 2].strip() if first >= 2 else ""
        if above.startswith("#"):
            own = [*own, above]
        return any(marker in line for line in own for marker in MARKERS)

    findings = []
    for node, text in _strings(tree, ALLOWED_NAMES.get(relative, set())):
        if not looks_portuguese(text):
            continue
        if marked(node.lineno, node.end_lineno or node.lineno):
            continue
        findings.append(Finding(relative, node.lineno, text))
    return findings


def _files(paths: Iterable[Path]) -> Iterator[Path]:
    for path in paths:
        if path.is_dir():
            yield from sorted(p for p in path.rglob("*.py") if "__pycache__" not in p.parts)
        elif path.suffix == ".py":
            yield path


def scan(paths: Iterable[Path] = (PACKAGE,)) -> list[Finding]:
    return [finding for path in _files(paths) for finding in scan_file(path)]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Report Portuguese literals left in backend code.")
    parser.add_argument("paths", nargs="*", type=Path, help="files or directories (default: cadencia/)")
    args = parser.parse_args(argv)
    findings = scan(args.paths or [PACKAGE])
    for finding in findings:
        print(finding)
    print(f"{len(findings)} literal{'s' if len(findings) != 1 else ''} reported", file=sys.stderr)
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
