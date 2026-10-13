"""The i18n core (docs/i18n-backend.md, T1): negotiation, the request locale, Msg, rendering,
formatting, the localized error bodies — and the catalogue checks every namespace is held to.

The catalogue checks walk whatever namespaces exist, so a namespace added later is checked without
editing this file.
"""

from __future__ import annotations

import ast
import copy
import importlib
import inspect
import itertools
import pickle
import re
import string
import subprocess
import sys
import threading
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import BackgroundTasks, Depends, FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from cadencia.api.app import create_app
from cadencia.errors import Invalid, NotFound
from cadencia.i18n import (
    DECK_LOCALE,
    DEFAULT_LOCALE,
    SUPPORTED,
    Msg,
    catalog,
    configure_default_locale,
    current_locale,
    fmt,
    localize,
    msg,
    negotiate,
    render,
    stored_text,
    tr,
    using_locale,
)
from cadencia.i18n.middleware import LocaleMiddleware
from cadencia.i18n.render import namespaces
from tests.support import make_settings

BACKEND = Path(__file__).resolve().parents[1]
PACKAGE = BACKEND / "cadencia"
OTHERS = tuple(locale for locale in SUPPORTED if locale != DEFAULT_LOCALE)
# The package re-exports the function `render` under the submodule's name, so reach the module itself.
render_module = importlib.import_module("cadencia.i18n.render")


# ----------------------------------------------------------------------------- negotiation


@pytest.mark.parametrize(
    ("header", "expected"),
    [
        (None, "en-US"),
        ("", "en-US"),
        ("pt-BR", "pt-BR"),
        ("de-DE", "de-DE"),
        ("en-US", "en-US"),
        ("PT-br", "pt-BR"),
        ("pt_BR", "pt-BR"),
        ("de", "de-DE"),
        ("pt", "pt-BR"),
        ("en-GB", "en-US"),
        ("pt-PT", "pt-BR"),
        ("de-AT,de;q=0.9", "de-DE"),
        ("fr-FR, fr;q=0.9, de;q=0.8, en;q=0.7", "de-DE"),
        ("en;q=0.5, pt-BR;q=0.9", "pt-BR"),
        ("de;q=0.5, pt;q=0.5", "de-DE"),  # ties keep the header's order
        ("pt-BR;q=0, de-DE", "de-DE"),  # q=0 means "not this"
        ("pt-BR;q=abc, de-DE;q=0.1", "de-DE"),  # an invalid weight skips the entry
        ("pt-BR;q=2", "en-US"),  # out of range is invalid
        ("*", "en-US"),
        ("*, de;q=0.1", "de-DE"),
        ("fr, es, ja", "en-US"),
        ("garbage;;;,,, ;q=", "en-US"),
        ("x" * 5000, "en-US"),
    ],
)
def test_negotiate(header, expected):
    assert negotiate(header) == expected


# ----------------------------------------------------------------------------- ambient locale


def test_the_ambient_locale_is_the_contextvar_else_the_process_default():
    configure_default_locale("de-DE")
    with using_locale("en-US"):
        assert current_locale() == "en-US"
        with using_locale("pt_br"):
            assert current_locale() == "pt-BR"
        assert current_locale() == "en-US"
    seen: list[str] = []
    with using_locale("en-US"):
        # A plain thread (like the scheduler's pool) starts without the contextvar.
        thread = threading.Thread(target=lambda: seen.append(current_locale()))
        thread.start()
        thread.join()
    assert seen == ["de-DE"]


def test_unsupported_locales_are_refused_where_they_are_configuration():
    with pytest.raises(ValueError, match="unsupported locale"):
        configure_default_locale("fr-FR")
    with pytest.raises(ValueError), using_locale("xx"):
        pass


def test_the_setting_is_validated_and_canonical(tmp_path, monkeypatch):
    assert make_settings(tmp_path, locale="de_de").locale == "de-DE"
    with pytest.raises(ValidationError):
        make_settings(tmp_path, locale="fr-FR")
    monkeypatch.setenv("CADENCIA_LOCALE", "pt-BR")
    from cadencia.config import Settings

    assert Settings(_env_file=None).locale == "pt-BR"
    monkeypatch.delenv("CADENCIA_LOCALE")
    assert Settings(_env_file=None).locale == "en-US"


def test_the_cli_speaks_cadencia_locale(tmp_path, monkeypatch):
    from cadencia import cli

    seen: list[str] = []

    class Parser:
        def parse_args(self, _argv):
            return SimpleNamespace(func=lambda _args: seen.append(current_locale()))

    monkeypatch.setattr(cli, "get_settings", lambda: make_settings(tmp_path, locale="de-DE"))
    monkeypatch.setattr(cli, "build_parser", Parser)
    # A new thread starts without the contextvar, as a fresh `cadencia` process does.
    thread = threading.Thread(target=cli.main, args=([],))
    thread.start()
    thread.join()
    assert seen == ["de-DE"]


def test_importing_the_package_loads_no_catalogue():
    code = (
        "import sys, cadencia.i18n, cadencia.errors; "
        "loaded = [m for m in sys.modules if m.startswith('cadencia.i18n.locales')]; "
        "assert not loaded, loaded"
    )
    subprocess.run([sys.executable, "-c", code], check=True, cwd=BACKEND)


# ----------------------------------------------------------------------------- Msg


def test_msg_round_trips_through_json_with_nested_messages():
    inner = Msg("common.not_found", subject="X")
    original = Msg("common.listing.more", shown="a, b", more=3, extra=[inner, "plain", [1, 2.5]], ok=None)
    data = original.to_json()
    assert data == {
        "$msg": "common.listing.more",
        "params": {
            "shown": "a, b",
            "more": 3,
            "extra": [{"$msg": "common.not_found", "params": {"subject": "X"}}, "plain", [1, 2.5]],
            "ok": None,
        },
    }
    assert Msg.is_json(data) and not Msg.is_json({"message": "x"}) and not Msg.is_json("x")
    again = Msg.from_json(data)
    assert again == original and hash(again) == hash(original)
    assert pickle.loads(pickle.dumps(original)) == original
    assert copy.deepcopy(original) == original


def test_msg_equality_is_by_key_and_params():
    assert Msg("a.b", x=1, y=2) == Msg("a.b", y=2, x=1)
    assert Msg("a.b", x=1) != Msg("a.b", x=2)
    assert Msg("a.b") != Msg("a.c")
    assert msg("a.b", x=(1, 2)) == Msg("a.b", x=[1, 2])  # tuples become lists
    assert len({Msg("a.b", x=1), Msg("a.b", x=1), Msg("a.b", x=2)}) == 2
    assert repr(Msg("a.b", key="CAD-1")) == "Msg('a.b', key='CAD-1')"  # "key" is a usable param name


def test_msg_is_immutable_and_refuses_what_json_cannot_hold():
    message = Msg("a.b", items=["x"])
    message.params["items"].append("y")
    assert message.params == {"items": ["x"]}
    with pytest.raises(AttributeError):
        message.key = "c"  # type: ignore[misc]
    from datetime import date

    with pytest.raises(TypeError, match="ISO strings"):
        Msg("a.b", when=date(2026, 9, 8))  # type: ignore[arg-type]
    with pytest.raises(TypeError):
        Msg("")


def test_str_of_a_msg_follows_the_ambient_locale():
    message = Msg("common.not_found", subject="Board 7")
    with using_locale("en-US"):
        assert str(message) == "Board 7 not found."
    with using_locale("de-DE"):
        assert str(message) == "Board 7 nicht gefunden."
    assert str(message) == "Board 7 não encontrado."  # the suite's pt-BR


# ----------------------------------------------------------------------------- rendering


def test_render_tr_and_their_fallbacks(monkeypatch):
    assert render("legacy text", "de-DE") == "legacy text"
    assert render(None) == ""
    assert render({"$msg": "common.error.invalid", "params": {}}, "en-US") == "invalid request"
    assert render(Msg("common.error.invalid"), "de") == "ungültige Anfrage"  # lenient on explicit tags
    with using_locale("de-DE"):
        assert tr("common.error.not_found") == "nicht gefunden"
    with pytest.raises(KeyError, match="no catalogue entry"):
        tr("common.does.not.exist")

    real = render_module.catalog

    def without_pt(locale):
        entries = dict(real(locale))
        if locale == "pt-BR":
            entries.pop("common.error.invalid")
        return entries

    monkeypatch.setattr(render_module, "catalog", without_pt)
    assert render(Msg("common.error.invalid"), "pt-BR") == "invalid request"  # falls back to en-US


def test_nested_messages_render_in_the_same_locale(monkeypatch):
    real = render_module.catalog

    def with_join(locale):
        return {**real(locale), "test.join": lambda reasons: "; ".join(reasons)}

    monkeypatch.setattr(render_module, "catalog", with_join)
    nested = Msg("test.join", reasons=[Msg("common.error.not_found"), "Jira's own text"])
    assert render(nested, "de-DE") == "nicht gefunden; Jira's own text"
    assert render(nested, "pt-BR") == "não encontrado; Jira's own text"


def test_localize_replaces_every_message_in_a_tree():
    tree = {
        "a": Msg("common.error.invalid"),
        "b": [{"c": {"$msg": "common.error.not_found", "params": {}}}, ("x", Msg("common.error.invalid"))],
        "n": 3,
        "s": "kept",
    }
    out = localize(tree, "de-DE")
    assert out == {
        "a": "ungültige Anfrage",
        "b": [{"c": "nicht gefunden"}, ("x", "ungültige Anfrage")],
        "n": 3,
        "s": "kept",
    }
    assert isinstance(tree["a"], Msg)  # the input is untouched
    with using_locale("en-US"):
        assert localize([Msg("common.error.invalid")]) == ["invalid request"]


def test_stored_text_prefers_the_record_and_falls_back_to_the_legacy_text():
    record = Msg("common.not_found", subject="X").to_json()
    assert stored_text(record, "X não encontrado.", "de-DE") == "X nicht gefunden."
    assert stored_text(None, "texto antigo", "de-DE") == "texto antigo"
    assert stored_text({"cause": "x"}, "texto antigo", "de-DE") == "texto antigo"
    assert stored_text(None, None) is None
    gone = {"$msg": "removed.since", "params": {}}
    assert stored_text(gone, "texto antigo", "en-US") == "texto antigo"
    with pytest.raises(KeyError):
        stored_text(gone, None, "en-US")


# ----------------------------------------------------------------------------- formatting


def test_formatting_per_locale():
    assert fmt.plural(1, "day", "days") == "day" and fmt.plural(0, "day", "days") == "days"
    assert fmt.listing(["A", "B", "C", "D"], 2, "pt-BR") == "A, B e mais 2"
    assert fmt.listing(["A", "B", "C", "D"], 2, "en-US") == "A, B and 2 more"
    assert fmt.listing(["A", "B", "C", "D"], 2, "de-DE") == "A, B und 2 weitere"
    assert fmt.listing(["A", "B"], 2, "de-DE") == "A, B"
    assert [fmt.day_month("2026-09-08", loc) for loc in SUPPORTED] == ["09/08", "08/09", "08.09."]
    assert [fmt.day_month_year("2026-09-08", loc) for loc in SUPPORTED] == [
        "09/08/2026",
        "08/09/2026",
        "08.09.2026",
    ]
    assert fmt.day_month_year("2026-09-08T15:04:00+00:00", "pt-BR", time=True) == "08/09/2026 15:04"
    assert fmt.day_month("2026-09-08T15:04:00Z", "de-DE", time=True) == "08.09. 15:04"
    assert [fmt.number(1234.56, loc) for loc in SUPPORTED] == ["1,234.6", "1.234,6", "1.234,6"]
    assert fmt.number(7.0, "pt-BR") == "7" and fmt.number(-0.01, "en-US") == "0"
    assert fmt.number(7.25, "de-DE", 2) == "7,25"
    assert [fmt.hours(3.5, loc) for loc in SUPPORTED] == ["3.5", "3,5", "3,5"]
    assert fmt.hours(19.0, "pt-BR") == "19"
    with using_locale("de-DE"):
        assert fmt.number(0.5) == "0,5"


# ----------------------------------------------------------------------------- exceptions


def test_exceptions_carry_messages_and_render_ambiently():
    invalid = Invalid(Msg("common.error.invalid"))
    not_found = NotFound("Board 9")
    with using_locale("de-DE"):
        assert str(invalid) == "ungültige Anfrage"
        assert str(not_found) == not_found.message == "Board 9 nicht gefunden."
    with using_locale("en-US"):
        assert str(invalid) == "invalid request"
        assert not_found.message == "Board 9 not found."
    assert str(Invalid("texto ainda não convertido")) == "texto ainda não convertido"
    assert NotFound(1, "Mensagem própria.").message == "Mensagem própria."
    assert isinstance(invalid, ValueError) and isinstance(not_found, KeyError)
    assert pickle.loads(pickle.dumps(invalid)).msg == invalid.msg
    with pytest.raises(ValueError, match="requisição inválida"):  # match uses str(): pt-BR here
        raise invalid


def test_the_deck_source_builds_its_data_in_the_deck_locale(monkeypatch):
    from cadencia.report.adapters import jira_source

    seen: list[str] = []
    monkeypatch.setattr(jira_source.repo, "profile_defaults", lambda _settings: None)
    monkeypatch.setattr(jira_source, "deck_data", lambda *a, **k: seen.append(current_locale()) or "deck")
    source = jira_source.JiraSource(session=None, settings=None)  # type: ignore[arg-type]
    with using_locale("de-DE"):
        assert source.deck_data([], reference=None, now=None, registry={}) == "deck"  # type: ignore[arg-type]
        assert current_locale() == "de-DE"
    assert seen == [DECK_LOCALE]


# ----------------------------------------------------------------------------- middleware


def _probe_app() -> tuple[FastAPI, dict[str, Any]]:
    seen: dict[str, Any] = {}
    app = FastAPI()
    app.add_middleware(LocaleMiddleware)

    def sync_dep() -> str:
        seen["sync_dep"] = current_locale()
        return "ok"

    def generator_dep():
        seen["generator_enter"] = current_locale()
        yield "ok"
        seen["generator_exit"] = current_locale()

    @app.get("/probe")
    def probe(background: BackgroundTasks, _a: str = Depends(sync_dep), _b: str = Depends(generator_dep)):
        seen["route"] = current_locale()
        background.add_task(lambda: seen.__setitem__("background", current_locale()))
        return {"text": tr("common.error.invalid")}

    return app, seen


@pytest.mark.parametrize(
    ("headers", "query", "expected", "text"),
    [
        ({}, "", "en-US", "invalid request"),
        ({"Accept-Language": "de-DE"}, "", "de-DE", "ungültige Anfrage"),
        ({"Accept-Language": "pt-BR"}, "", "pt-BR", "requisição inválida"),
        ({"Accept-Language": "pt-BR"}, "?lang=de-DE", "de-DE", "ungültige Anfrage"),
        ({}, "?lang=pt", "pt-BR", "requisição inválida"),
        ({"Accept-Language": "de-DE"}, "?lang=", "de-DE", "ungültige Anfrage"),
    ],
)
def test_the_request_locale_reaches_routes_dependencies_and_background_tasks(headers, query, expected, text):
    app, seen = _probe_app()
    with using_locale("pt-BR"), TestClient(app) as client:
        response = client.get(f"/probe{query}", headers=headers)
    assert response.status_code == 200
    assert response.json() == {"text": text}
    assert response.headers["content-language"] == expected
    assert "Accept-Language" in response.headers["vary"]
    assert seen == dict.fromkeys(
        ("sync_dep", "generator_enter", "route", "background", "generator_exit"), expected
    )


# ----------------------------------------------------------------------------- the app's error bodies


@pytest.fixture
def app_client(settings, sessions):
    app = create_app(settings, sessions)

    @app.get("/api/_test/missing")
    def missing():
        raise NotFound("Board 9")

    @app.get("/api/_test/invalid")
    def invalid():
        raise Invalid(Msg("common.listing.more", shown="A", more=2))

    @app.get("/api/_test/boom")
    def boom():
        raise RuntimeError("boom")

    with TestClient(app, raise_server_exceptions=False) as client:
        yield client


BODIES = {
    "en-US": {
        404: {"cause": "not found", "message": "Board 9 not found."},
        400: {"cause": "invalid request", "message": "A and 2 more"},
        500: {
            "cause": "internal error",
            "message": "RuntimeError at /api/_test/boom",
            "action": "See the API log for the full traceback.",
        },
    },
    "pt-BR": {
        404: {"cause": "não encontrado", "message": "Board 9 não encontrado."},
        400: {"cause": "requisição inválida", "message": "A e mais 2"},
        500: {
            "cause": "erro interno",
            "message": "RuntimeError em /api/_test/boom",
            "action": "Veja o log da API para o rastreamento completo.",
        },
    },
    "de-DE": {
        404: {"cause": "nicht gefunden", "message": "Board 9 nicht gefunden."},
        400: {"cause": "ungültige Anfrage", "message": "A und 2 weitere"},
        500: {
            "cause": "interner Fehler",
            "message": "RuntimeError bei /api/_test/boom",
            "action": "Den vollständigen Traceback finden Sie im API-Log.",
        },
    },
}
PATHS = {404: "/api/_test/missing", 400: "/api/_test/invalid", 500: "/api/_test/boom"}


@pytest.mark.parametrize("status", [404, 400, 500])
@pytest.mark.parametrize(
    ("headers", "query", "locale"),
    [
        ({}, "", "en-US"),
        ({"Accept-Language": "de-DE"}, "", "de-DE"),
        ({"Accept-Language": "pt-BR"}, "", "pt-BR"),
        ({"Accept-Language": "pt-BR"}, "?lang=de-DE", "de-DE"),
    ],
)
def test_error_bodies_speak_the_request_language(app_client, status, headers, query, locale):
    response = app_client.get(PATHS[status] + query, headers=headers)
    assert response.status_code == status
    assert response.json() == {"detail": BODIES[locale][status]}
    assert response.headers["content-language"] == locale


def test_a_jira_error_speaks_the_request_language(app_client):
    """`JiraError.as_dict()` renders ambiently; the handler pins the request's locale for it."""
    from cadencia.jira.errors import JiraError

    app = app_client.app

    @app.get("/api/_test/jira")
    def jira():
        raise JiraError("x")

    response = app_client.get("/api/_test/jira", headers={"Accept-Language": "de-DE"})
    assert response.status_code == 502
    assert response.headers["content-language"] == "de-DE"


@pytest.mark.parametrize(
    ("headers", "cause"),
    [
        ({}, "missing or invalid credential"),
        ({"Accept-Language": "de-DE"}, "fehlende oder ungültige Anmeldedaten"),
        ({"Accept-Language": "pt-BR"}, "credencial ausente ou inválida"),
    ],
)
def test_the_401_speaks_the_request_language(tmp_path, sessions, headers, cause):
    app = create_app(make_settings(tmp_path, api_token="segredo"), sessions)
    with TestClient(app) as client:
        response = client.get("/api/boards", headers=headers)
    assert response.status_code == 401
    assert response.json()["detail"]["cause"] == cause
    assert set(response.json()["detail"]) == {"cause", "message", "action"}


# ----------------------------------------------------------------------------- catalogue checks
#
# en-US is the source of truth. These walk every namespace that exists, so a new namespace is
# checked by adding its three files — nothing here to edit.

NAMESPACES = sorted(namespaces(DEFAULT_LOCALE))


def _module(locale: str, namespace: str):
    return importlib.import_module(f"cadencia.i18n.locales.{locale.replace('-', '_')}.{namespace}")


def test_every_locale_has_the_same_namespaces():
    for locale in OTHERS:
        assert sorted(namespaces(locale)) == NAMESPACES, locale


@pytest.mark.parametrize("namespace", NAMESPACES)
def test_1_every_locale_has_the_same_keys(namespace):
    expected = set(namespaces(DEFAULT_LOCALE)[namespace])
    for locale in OTHERS:
        actual = set(namespaces(locale).get(namespace, {}))
        assert not expected - actual, f"{locale}/{namespace} is missing {sorted(expected - actual)}"
        assert not actual - expected, f"{locale}/{namespace} has extra keys {sorted(actual - expected)}"


def _params(entry) -> set[str]:
    if isinstance(entry, str):
        names = set()
        for _text, field, _spec, _conv in string.Formatter().parse(entry):
            if field is None:
                continue
            base = re.split(r"[.\[]", field, maxsplit=1)[0]
            assert base and not base.isdigit(), f"positional field in {entry!r}: use named fields"
            names.add(base)
        return names
    parameters = inspect.signature(entry).parameters.values()
    assert all(p.kind is not inspect.Parameter.VAR_POSITIONAL for p in parameters)
    return {p.name if p.kind is not inspect.Parameter.VAR_KEYWORD else "**" for p in parameters}


@pytest.mark.parametrize("namespace", NAMESPACES)
def test_2_every_locale_takes_the_same_parameters(namespace):
    for key, entry in namespaces(DEFAULT_LOCALE)[namespace].items():
        expected = _params(entry)
        for locale in OTHERS:
            other = namespaces(locale)[namespace].get(key)
            if other is not None:
                assert _params(other) == expected, (
                    f"{locale} {namespace}.{key}: {_params(other)} != {expected}"
                )


_KEY_CALLS = frozenset({"tr", "Msg", "msg"})


def _literal_keys() -> tuple[list[tuple[str, str]], list[tuple[str, str]]]:
    """(literal keys, f-string prefixes) used in ``tr(…)``/``Msg(…)``/``msg(…)`` across cadencia/."""
    literal: list[tuple[str, str]] = []
    prefixes: list[tuple[str, str]] = []
    for path in sorted(PACKAGE.rglob("*.py")):
        if "__pycache__" in path.parts:
            continue
        where = str(path.relative_to(PACKAGE))
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if not isinstance(node, ast.Call) or not node.args:
                continue
            func = node.func
            name = (
                func.id
                if isinstance(func, ast.Name)
                else func.attr
                if isinstance(func, ast.Attribute)
                else ""
            )
            if name not in _KEY_CALLS:
                continue
            first = node.args[0]
            if isinstance(first, ast.Constant) and isinstance(first.value, str):
                literal.append((f"{where}:{node.lineno}", first.value))
            elif (
                isinstance(first, ast.JoinedStr)
                and first.values
                and isinstance(first.values[0], ast.Constant)
            ):
                prefixes.append((f"{where}:{node.lineno}", str(first.values[0].value)))
    return literal, prefixes


def test_3_every_key_the_code_uses_exists_in_en_us():
    """Literal keys must exist. A dynamic key (``f"risk.situation.{s.value}"``) must at least have
    its static prefix in the catalogue; the task that writes one enumerates its values in its own
    tests."""
    keys = set(catalog(DEFAULT_LOCALE))
    literal, prefixes = _literal_keys()
    assert literal, "the scan found no keys at all — it is broken"
    missing = [f"{where}: {key}" for where, key in literal if key not in keys]
    assert not missing, "keys used in code but missing from en-US:\n" + "\n".join(missing)
    unknown = [
        f"{where}: {prefix}…" for where, prefix in prefixes if not any(k.startswith(prefix) for k in keys)
    ]
    assert not unknown, "dynamic keys whose prefix matches nothing in en-US:\n" + "\n".join(unknown)


_CANDIDATES = (3, "2026-09-08", ["Ana", "Bruno"], 1.5)
_MAX_SEARCH = 6  # parameters; beyond that, give SAMPLES


def _renders_everywhere(key: str, params: dict[str, Any]) -> dict[str, str] | None:
    out = {}
    for locale in SUPPORTED:
        try:
            text = render(Msg(key, **params), locale)
        except Exception:
            return None
        if not isinstance(text, str):
            return None
        out[locale] = text
    return out


@pytest.mark.parametrize("namespace", NAMESPACES)
def test_4_every_entry_renders_in_every_locale(namespace):
    """Parameters come from the en_US module's ``SAMPLES[key]`` when it has one; otherwise a search
    over a few typical values (a count, an ISO date, a list of names, a decimal) finds a set that
    renders all three locales. Also: en-US and de-DE never use "(s)"-style plurals."""
    samples = getattr(_module(DEFAULT_LOCALE, namespace), "SAMPLES", {})
    for local_key, entry in namespaces(DEFAULT_LOCALE)[namespace].items():
        key = f"{namespace}.{local_key}"
        if local_key in samples:
            rendered = _renders_everywhere(key, samples[local_key])
            assert rendered is not None, f"{key} does not render with its SAMPLES in every locale"
        else:
            names = sorted(_params(entry) - {"**"})
            assert len(names) <= _MAX_SEARCH, f"{key}: give SAMPLES[{local_key!r}] in en_US/{namespace}.py"
            rendered = None
            for values in itertools.product(_CANDIDATES, repeat=len(names)):
                rendered = _renders_everywhere(key, dict(zip(names, values, strict=True)))
                if rendered is not None:
                    break
            assert rendered is not None, (
                f"{key} does not render in every locale with any sample parameters; "
                f"give SAMPLES[{local_key!r}] in en_US/{namespace}.py"
            )
        for locale in ("en-US", "de-DE"):
            assert not re.search(r"\((?:s|ns|es)\)", rendered[locale]), (
                f"{locale} {key}: {rendered[locale]!r}"
            )


# ----------------------------------------------------------------------------- the leak scanner


def test_the_leak_scanner_reports_portuguese_and_respects_the_markers(tmp_path):
    sys.path.insert(0, str(BACKEND / "tools"))
    try:
        scanner = importlib.import_module("i18n_scan")
    finally:
        sys.path.remove(str(BACKEND / "tools"))
    source = tmp_path / "sample.py"
    source.write_text(
        '"""Docstring não conta."""\n'
        "import logging\n"
        "log = logging.getLogger(__name__)\n"
        'A = "Coleta com falha"\n'
        'B = "Concluído"  # no space: not reported\n'
        'C = "Semana {n} de trabalho"  # deck text: pt-BR by design\n'
        'D = f"parado há {3} dias"\n'
        'E = "Plain English text"\n'
        'log.warning("falha na coleta do board")\n',
        encoding="utf-8",
    )
    found = [(f.line, f.text) for f in scanner.scan_file(source)]
    assert found == [(4, "Coleta com falha"), (7, "parado há {…} dias")]


def test_the_files_this_task_owns_have_no_portuguese_left():
    sys.path.insert(0, str(BACKEND / "tools"))
    try:
        scanner = importlib.import_module("i18n_scan")
    finally:
        sys.path.remove(str(BACKEND / "tools"))
    owned = [
        PACKAGE / "i18n",
        PACKAGE / "errors.py",
        PACKAGE / "config.py",
        PACKAGE / "api" / "app.py",
        PACKAGE / "api" / "security.py",
        PACKAGE / "report" / "adapters" / "jira_source.py",
    ]
    assert [str(f) for f in scanner.scan(owned)] == []
