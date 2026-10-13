from datetime import datetime, timedelta

import pytest
from sqlalchemy import func, inspect, select, text

from cadencia.domain.models import Board, Person, Space
from cadencia.store import repo
from cadencia.store import schema as s
from cadencia.store.db import make_engine, session_scope, upgrade
from tests.factories import DOING, TODO, at, issue, move


def test_upserts_are_idempotent(sessions):
    item = issue("K-1", status=DOING)
    transitions = [move("K-1", "2026-09-01T12:00", TODO, DOING)]
    for _ in range(2):
        with session_scope(sessions) as session:
            repo.upsert_issues(session, [item], 1, at("2026-09-10T12:00"))
            repo.upsert_transitions(session, transitions)
    with session_scope(sessions) as session:
        assert session.scalar(select(func.count()).select_from(s.IssueRow)) == 1
        assert session.scalar(select(func.count()).select_from(s.TransitionRow)) == 1
        assert session.scalar(select(func.count()).select_from(s.IssueBoardRow)) == 1


def test_datetimes_round_trip_as_utc(sessions):
    item = issue("K-2", created="2026-09-01T09:30:00-03:00")
    with session_scope(sessions) as session:
        repo.upsert_issues(session, [item], None, at("2026-09-10T12:00"))
    with session_scope(sessions) as session:
        loaded = repo.load_issues(session, keys=["K-2"])[0]
    assert loaded.created == at("2026-09-01T12:30:00")
    assert loaded.created.tzinfo is not None


def test_naive_datetimes_are_rejected(sessions):
    with pytest.raises(Exception, match="fuso"), session_scope(sessions) as session:
        repo.start_run(session, "r1", "full")
        session.flush()
        row = session.get(s.CollectorRunRow, "r1")
        row.finished_at = datetime(2026, 9, 1, 12, 0)
        session.flush()


def test_board_settings_are_validated(sessions):
    with session_scope(sessions) as session:
        repo.upsert_boards(session, [Board(1, "Plataforma", "scrum")], at("2026-09-10T12:00"))
    with session_scope(sessions) as session:
        profile = repo.update_board_settings(session, 1, {"focus_factor": 0.6, "holidays": ["2026-09-07"]})
        assert profile.focus_factor == 0.6
        with pytest.raises(ValueError, match="desconhecidos"):
            repo.update_board_settings(session, 1, {"cor_favorita": "azul"})
    with session_scope(sessions) as session:
        assert repo.board_profile(session, 1).holidays[0].isoformat() == "2026-09-07"


def test_alembic_baseline_creates_the_schema(tmp_path):
    url = f"sqlite:///{tmp_path / 'cadencia.db'}"
    upgrade(url)
    engine = make_engine(url)
    tables = set(inspect(engine).get_table_names())
    assert {"issue", "issue_snapshot", "transition", "sprint_commitment", "report_run", "space"} <= tables
    columns = {c["name"] for c in inspect(engine).get_columns("board")}
    assert {"space_key", "space_name"} <= columns and "project_key" not in columns


def test_people_are_grouped_by_the_space_of_the_boards_they_work_on(sessions):
    with session_scope(sessions) as session:
        repo.upsert_spaces(session, [Space("CAD", "Produto Digital")], at("2026-09-10T12:00"))
        repo.upsert_boards(
            session,
            [Board(1, "Plataforma", "scrum", "CAD", "Produto Digital"), Board(2, "Dados", "scrum", "DAD")],
            at("2026-09-10T12:00"),
        )
        repo.set_selected_boards(session, [1, 2])
        ana = Person("ana", "Ana Lima")
        repo.upsert_people(session, [ana])
        repo.upsert_issues(session, [issue("K-1", assignee=ana)], 1, at("2026-09-10T12:00"))
        repo.upsert_issues(session, [issue("K-2", assignee=ana)], 2, at("2026-09-10T12:00"))
    with session_scope(sessions) as session:
        grouped = repo.people_by_space(session)
        # Ana works in both spaces, so she is listed under both.
        assert {k: [p.display_name for p in v] for k, v in grouped.items()} == {
            "CAD": ["Ana Lima"],
            "DAD": ["Ana Lima"],
        }
        spaces = repo.spaces_of_boards(session, repo.selected_boards(session))
        # The space table names CAD; DAD is unknown there and falls back to the board's own copy.
        assert spaces["CAD"].name == "Produto Digital" and spaces["DAD"].name == "DAD"


def test_variables_resolve_from_the_narrowest_scope_outwards(sessions):
    """RF-52: slide beats board beats space beats the default, and the UI says exactly that."""
    with session_scope(sessions) as session:
        definicao = repo.create_variable(session, name="definicao", label="Definição")
        for scope, key, value in (
            ("global", "", "Projeto sem descrição."),
            ("space", "CAD", "Checkout."),
            ("space", "DAD", "Dados."),
            ("board", "7", "Só do board 7."),
            ("slide", "257", "Só do slide 257."),
        ):
            repo.set_variable_value(session, definicao.id, scope=scope, scope_key=key, value=value)
        aviso = repo.create_variable(session, name="aviso")
        repo.set_variable_value(session, aviso.id, scope="global", scope_key="", value="Interno.")

    with session_scope(sessions) as session:

        def at(**kw):
            return repo.resolve_variables(session, template_id=None, **kw)

        assert at(space_key="CAD", board_id=1) == {"definicao": "Checkout.", "aviso": "Interno."}
        assert at(space_key="DAD", board_id=2)["definicao"] == "Dados."
        assert at(space_key="CAD", board_id=7)["definicao"] == "Só do board 7."
        # The slide is narrower than the board, so it answers first.
        assert at(space_key="CAD", board_id=7, slide_id=257)["definicao"] == "Só do slide 257."
        assert at(space_key=None, board_id=None)["definicao"] == "Projeto sem descrição."
        assert repo.slide_variable_values(session, None) == {257: {"definicao": "Só do slide 257."}}


def test_a_variable_can_belong_to_one_template_and_shadow_a_shared_one(sessions):
    """RF-52: binding a variable to a template is what detaches it from everybody else's picker."""
    with session_scope(sessions) as session:
        repo.add_template(session, name="A", filename="a.pptx", sha256="a" * 64, path="/a", manifest={})
        repo.add_template(session, name="B", filename="b.pptx", sha256="b" * 64, path="/b", manifest={})
        shared = repo.create_variable(session, name="definicao", label="Compartilhada")
        repo.set_variable_value(session, shared.id, scope="global", scope_key="", value="comum")
        only_a = repo.create_variable(session, name="definicao", label="Só do A", template_id=1)
        repo.set_variable_value(session, only_a.id, scope="global", scope_key="", value="do modelo A")
        repo.create_variable(session, name="exclusiva_de_a", template_id=1)
        # The same name may exist once per template and once unbound, never twice in one scope.
        with pytest.raises(ValueError):
            repo.create_variable(session, name="definicao", template_id=1)
        with pytest.raises(ValueError):
            repo.create_variable(session, name="Com Espaço")

    with session_scope(sessions) as session:
        assert [n for n, _ in repo.variable_names(session, 1)] == ["definicao", "exclusiva_de_a"]
        assert [n for n, _ in repo.variable_names(session, 2)] == ["definicao"]
        # Template A sees its own wording; template B sees the shared one.
        assert repo.resolve_variables(session, template_id=1, space_key=None, board_id=None) == {
            "definicao": "do modelo A"
        }
        assert repo.resolve_variables(session, template_id=2, space_key=None, board_id=None) == {
            "definicao": "comum"
        }


def test_variables_can_be_renamed_detached_and_deleted(sessions):
    with session_scope(sessions) as session:
        repo.add_template(session, name="A", filename="a.pptx", sha256="a" * 64, path="/a", manifest={})
        row = repo.create_variable(session, name="definicao", template_id=1)
        repo.set_variable_value(session, row.id, scope="space", scope_key="CAD", value="x")
        variable_id = row.id
    with session_scope(sessions) as session:
        repo.update_variable(session, variable_id, name="descricao", label="Descrição")
        repo.update_variable(session, variable_id, detach=True)
    with session_scope(sessions) as session:
        row = repo.get_variable(session, variable_id)
        assert row.name == "descricao" and row.label == "Descrição" and row.template_id is None
        assert repo.clear_variable_value(session, variable_id, "space", "CAD") is True
        assert repo.list_variable_values(session, variable_id) == []
        assert repo.delete_variable(session, variable_id) is True
        assert repo.get_variable(session, variable_id) is None


def test_the_lease_is_exclusive_renewable_and_expires(sessions):
    ttl, now = timedelta(minutes=10), at("2026-09-10T12:00")

    def call(fn, *args, **kwargs):
        with session_scope(sessions) as session:
            return fn(session, *args, **kwargs)

    assert call(repo.acquire_lease, "collect", "api", ttl, now=now)
    assert not call(repo.acquire_lease, "collect", "agendador", ttl, now=now)
    assert call(repo.acquire_lease, "collect", "api", ttl, now=now + timedelta(minutes=8))  # renewal
    assert call(repo.lease_holder, "collect", now=now + timedelta(minutes=17)) == "api"
    # A holder that died stops renewing, and the lease frees itself.
    assert call(repo.lease_holder, "collect", now=now + timedelta(minutes=19)) is None
    assert call(repo.acquire_lease, "collect", "agendador", ttl, now=now + timedelta(minutes=19))
    call(repo.release_lease, "collect", "api")  # only the holder can let go
    assert call(repo.lease_holder, "collect", now=now + timedelta(minutes=20)) == "agendador"
    call(repo.release_lease, "collect", "agendador")
    assert call(repo.lease_holder, "collect", now=now + timedelta(minutes=20)) is None


def test_migrations_create_the_lease_on_a_database_that_predates_it(tmp_path):
    url = f"sqlite:///{tmp_path / 'cadencia.db'}"
    upgrade(url)
    engine = make_engine(url)
    with engine.begin() as connection:
        connection.execute(text("DROP TABLE lease"))
        connection.execute(text("UPDATE alembic_version SET version_num = '0007'"))
    upgrade(url)
    assert "lease" in inspect(engine).get_table_names()
