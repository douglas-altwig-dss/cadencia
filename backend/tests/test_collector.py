from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select

from cadencia.analytics.data import MEMO_SIZE, load_board
from cadencia.collector import scheduler
from cadencia.collector.service import COLLECT_LEASE, LEASE_TTL
from cadencia.collector.snapshots import record_checkpoints, snapshot_rows
from cadencia.report.core.mapping import DeckMapping
from cadencia.store import repo
from cadencia.store import schema as s
from cadencia.store.db import session_scope
from tests.support import NOW, collect_demo

FIRST_CHECKPOINT = datetime(2026, 9, 4, 21, 0, tzinfo=UTC)


async def test_full_collection_populates_every_board(demo, sessions, settings):
    result = await collect_demo(demo, sessions, settings)
    assert result["status"] == "success"
    assert {b["board_id"]: b["full"] for b in result["boards"]} == {1: True, 2: True, 3: True}
    with session_scope(sessions) as session:
        # 24 of the board's own, CAD-2's epic, and CAD-50 — its own initiative, never on any
        # board, fetched only because the collector now climbs a second hop past an epic's parent.
        assert len(repo.load_issues(session, board_id=1)) == 26
        assert repo.load_field_map(session).sprint == "customfield_10020"
        board = session.get(s.BoardRow, 1)
        assert board.last_success_at == NOW and board.last_full_at == NOW
        assert [c["name"] for c in board.columns] == ["A fazer", "Em andamento", "Code Review", "Concluído"]
        assert any(c.at == FIRST_CHECKPOINT for c in repo.list_checkpoints(session, 1))
        committed = repo.load_commitment(session, 12)
        assert {"CAD-10", "CAD-11", "CAD-16"} <= committed
        assert "CAD-15" not in committed  # entered after the sprint started


async def test_discovery_records_the_space_each_board_belongs_to(demo, sessions, settings):
    await collect_demo(demo, sessions, settings)
    with session_scope(sessions) as session:
        spaces = {sp.key: sp.name for sp in repo.list_spaces(session)}
        assert spaces == {"CAD": "Produto Digital", "DAD": "Inteligência de Dados"}
        boards = {row.id: row.space_key for row in repo.selected_boards(session)}
        assert boards == {1: "CAD", 2: "DAD", 3: "CAD"}  # one space, two boards


async def test_cross_project_parent_is_fetched(demo, sessions, settings):
    await collect_demo(demo, sessions, settings)
    assert any(path == "/rest/api/3/search/jql" for _m, path, _p in demo.calls)
    with session_scope(sessions) as session:
        assert "CAD-2" in repo.board_issue_keys(session, 3)


async def test_second_run_is_incremental_and_idempotent(demo, sessions, settings):
    await collect_demo(demo, sessions, settings)
    with session_scope(sessions) as session:
        before = session.scalar(select(func.count()).select_from(s.TransitionRow))
    demo.calls.clear()
    result = await collect_demo(demo, sessions, settings, mode="incremental")
    assert result["status"] == "success"
    assert not any(b["full"] for b in result["boards"])
    jqls = [
        p.get("jql")
        for _m, path, p in demo.calls
        if path.startswith("/rest/agile/1.0/board/") and path.endswith("/issue")
    ]
    assert jqls and all(j.startswith("updated >= -") for j in jqls)
    with session_scope(sessions) as session:
        assert session.scalar(select(func.count()).select_from(s.TransitionRow)) == before


async def test_a_failing_board_does_not_stop_the_others(demo, sessions, settings):
    demo.fail_boards = {2}
    result = await collect_demo(demo, sessions, settings)
    assert result["status"] == "partial"
    by_board = {b["board_id"]: b for b in result["boards"]}
    assert by_board[1]["status"] == "success" and by_board[3]["status"] == "success"
    assert by_board[2]["status"] == "failed"
    assert by_board[2]["error"]["cause"] == "erro interno do Jira"
    with session_scope(sessions) as session:
        assert session.get(s.BoardRow, 2).last_error
        assert repo.last_board_run(session, 2).cause == "erro interno do Jira"


async def test_rate_limits_are_absorbed(demo, sessions, settings):
    demo.rate_limit_next = 3
    result = await collect_demo(demo, sessions, settings)
    assert result["status"] == "success"
    assert result["counters"]["rate_limit_waits"] >= 3


async def test_rerunning_a_past_checkpoint_reproduces_the_record(demo, sessions, settings):
    await collect_demo(demo, sessions, settings)
    with session_scope(sessions) as session:
        data = load_board(session, 1, repo.profile_defaults(settings))
        assert record_checkpoints(session, data, NOW) == 0  # already frozen, never overwritten
        checkpoint = next(c for c in repo.list_checkpoints(session, 1) if c.at == FIRST_CHECKPOINT)
        fields = (
            "issue_key",
            "status_id",
            "column_name",
            "assignee_id",
            "in_sprint",
            "situation",
            "evidence",
        )
        stored = [{f: getattr(r, f) for f in fields} for r in repo.load_snapshots(session, checkpoint.id)]
        again = sorted(snapshot_rows(data, FIRST_CHECKPOINT, data.sprints[12]), key=lambda r: r["issue_key"])
        assert stored == [{f: r[f] for f in fields} for r in again]
        situations = {r["issue_key"]: r["situation"] for r in stored}
        assert situations["CAD-11"] == "arrastado"


async def test_an_item_that_left_the_board_stops_counting_but_keeps_its_history(demo, sessions, settings):
    await collect_demo(demo, sessions, settings)
    del demo.issues["CAD-14"]  # deleted, or moved to another project under a new key
    result = await collect_demo(demo, sessions, settings)
    assert {b["board_id"]: b["counters"]["left_board"] for b in result["boards"]} == {1: 1, 2: 0, 3: 0}
    with session_scope(sessions) as session:
        assert "CAD-14" not in repo.board_issue_keys(session, 1)
        assert "CAD-14" not in load_board(session, 1, repo.profile_defaults(settings)).issues
        # What each checkpoint said about it is the record of that week (RF-08): untouched.
        checkpoint = next(c for c in repo.list_checkpoints(session, 1) if c.at == FIRST_CHECKPOINT)
        assert "CAD-14" in {r.issue_key for r in repo.load_snapshots(session, checkpoint.id)}
        # A parent fetched from another project is on the board because of its child: it stays.
        assert "CAD-2" in repo.board_issue_keys(session, 3)


async def test_an_incremental_run_never_drops_anything(demo, sessions, settings):
    await collect_demo(demo, sessions, settings)
    del demo.issues["CAD-14"]
    result = await collect_demo(demo, sessions, settings, mode="incremental")
    assert all("left_board" not in b["counters"] for b in result["boards"])
    with session_scope(sessions) as session:
        assert "CAD-14" in repo.board_issue_keys(session, 1)


async def test_a_collection_already_running_elsewhere_is_not_overlapped(demo, sessions, settings):
    with session_scope(sessions) as session:
        assert repo.acquire_lease(session, COLLECT_LEASE, "api-abc", LEASE_TTL)
    result = await collect_demo(demo, sessions, settings)
    assert result["status"] == "skipped" and result["holder"] == "api-abc"
    assert not any(path.endswith("/issue") for _m, path, _p in demo.calls)
    with session_scope(sessions) as session:  # still theirs: a skipped run releases nothing
        assert repo.lease_holder(session, COLLECT_LEASE) == "api-abc"


async def test_a_finished_collection_releases_the_lease(demo, sessions, settings):
    result = await collect_demo(demo, sessions, settings)
    assert result["status"] == "success"
    with session_scope(sessions) as session:
        assert repo.lease_holder(session, COLLECT_LEASE) is None


async def test_the_risk_memo_of_a_cached_board_stays_bounded(demo, sessions, settings):
    await collect_demo(demo, sessions, settings)
    with session_scope(sessions) as session:
        data = load_board(session, 1, repo.profile_defaults(settings))
    # The API asks about a new "now" on every request; the cached board used to keep them all.
    for second in range(100):
        data.risk_context(NOW + timedelta(seconds=second))
    assert len(data._memo) <= MEMO_SIZE
    assert data.risk_context(NOW) is data.risk_context(NOW)  # and it still memoises


async def test_a_checkpoint_collects_and_regenerates_only_its_own_boards(
    demo, sessions, settings, monkeypatch
):
    await collect_demo(demo, sessions, settings)
    with session_scope(sessions) as session:
        repo.update_board_settings(session, 2, {"checkpoint_weekday": 3}, repo.profile_defaults(settings))
        # Newest first is the order they are generated in, so "plataforma" fails before "suporte" runs.
        templates = [
            ("dados", [2], True),
            ("suporte", [3], True),
            ("plataforma", [1], True),
            ("manual", [2], False),
        ]
        for day, (name, boards, auto) in enumerate(templates, start=1):
            template = repo.add_template(
                session, name=name, filename=f"{name}.pptx", sha256=name, path="", manifest={}
            )
            template.uploaded_at = datetime(2026, 9, day, tzinfo=UTC)
            mapping = DeckMapping(board_ids=boards, auto_generate=auto)
            repo.save_mapping(session, template.id, name, mapping.model_dump())
        ids = {t.name: t.id for t in repo.list_templates(session)}
        assert scheduler._checkpoint_boards(session, settings, 3, 18, "America/Sao_Paulo") == {2}
        assert scheduler._checkpoint_boards(session, settings, 4, 18, "America/Sao_Paulo") == {1, 3}

    collected, generated = [], []
    monkeypatch.setattr(scheduler, "_collect", lambda *_a, **kw: collected.append(kw["board_ids"]))

    def fake_generate(session, _settings, template_id, **_kw):
        generated.append(template_id)
        if template_id == ids["plataforma"]:  # a flush error leaves its session needing a rollback
            session.add_all(
                [s.SettingRow(key="duplicada", value={}), s.SettingRow(key="duplicada", value={})]
            )
            session.flush()

    monkeypatch.setattr(scheduler, "generate_report", fake_generate)
    scheduler._checkpoint(settings, sessions, 3, 18, "America/Sao_Paulo")
    assert collected == [{2}]
    assert generated == [ids["dados"]]
    scheduler._checkpoint(settings, sessions, 4, 18, "America/Sao_Paulo")
    assert collected[-1] == {1, 3}
    # The failed deck no longer takes the next one down with it: each has its own transaction.
    assert sorted(generated[1:]) == sorted([ids["plataforma"], ids["suporte"]])
