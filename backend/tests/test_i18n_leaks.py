"""No Portuguese left in backend code outside the explicit allowlist (docs/i18n-backend.md,
Appendix A and the final sweep).

The allowlist is the scanner's own (``tools/i18n_scan.py``): whole files (demo data, the sample
template, migrations, the pt-BR catalogue), named Jira-input matchers and the deck field labels,
plus any literal carrying ``# deck text: pt-BR by design`` (section 1.7) or ``# i18n: out of
scope`` (section 1.8). This test pins that allowlist, so widening it is a visible change.
"""

from __future__ import annotations

import importlib
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
PACKAGE = BACKEND / "cadencia"


@pytest.fixture(scope="module")
def scanner():
    sys.path.insert(0, str(BACKEND / "tools"))
    try:
        return importlib.import_module("i18n_scan")
    finally:
        sys.path.remove(str(BACKEND / "tools"))


def test_the_allowlist_is_the_one_documented(scanner):
    assert scanner.ALLOWED_FILES == (
        "demo.py",
        "demo_seed.py",
        "report/core/sample_template.py",
        "store/migrations/",
        "i18n/locales/pt_BR/",
    )
    names = {
        "jira/fields.py": {"STORY_POINT_NAMES", "FLAGGED_NAMES"},
        "jira/mapping.py": {"_BLOCKED_BY"},
        "domain/epic_plan/from_jira.py": {"_SECTIONS"},
        "report/core/context.py": {"FIELDS"},
    }
    assert names == scanner.ALLOWED_NAMES
    assert scanner.MARKERS == ("# deck text: pt-BR by design", "# i18n: out of scope")


def test_no_portuguese_is_left_in_the_backend(scanner):
    findings = [str(f) for f in scanner.scan([PACKAGE])]
    assert findings == [], "\n".join(findings)


def test_a_marker_silences_only_its_own_literal(scanner, tmp_path):
    source = tmp_path / "catalogue.py"
    source.write_text(
        "MESSAGES = {  # i18n: out of scope\n"
        '    "a": "Coleta com falha",\n'
        '    "b": "Texto do slide sem valor",  # deck text: pt-BR by design\n'
        "    # deck text: pt-BR by design\n"
        '    "c": "Semana de entregas",\n'
        '    "d": "Nada para mostrar ainda",\n'
        "}\n"
        'raise ValueError(\n    "falha na coleta"\n)  # i18n: out of scope\n',
        encoding="utf-8",
    )
    found = [(f.line, f.text) for f in scanner.scan_file(source)]
    assert found == [(2, "Coleta com falha"), (6, "Nada para mostrar ainda"), (9, "falha na coleta")]


def test_domains_and_addresses_are_not_the_word_com(scanner):
    assert not scanner.looks_portuguese("Write to ana@example.com or see docs.example.com")
    assert not scanner.looks_portuguese("Open https://example.com/de for details")
    assert scanner.looks_portuguese("Fale com a equipe")
