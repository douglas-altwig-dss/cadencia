"""Command line: `cadencia <comando>`. Every command prints JSON (M0/M1 proofs run from here)."""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from cadencia.config import get_settings
from cadencia.i18n import configure_default_locale, localize, tr


def _print(value: Any) -> None:
    """JSON on stdout. Any message the services left as ``Msg`` renders in ``CADENCIA_LOCALE``;
    the keys never change."""
    json.dump(localize(value), sys.stdout, ensure_ascii=False, indent=2, default=str)
    sys.stdout.write("\n")


def _instant(value: str | None) -> datetime | None:
    if not value:
        return None
    parsed = datetime.fromisoformat(value)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _sessions() -> Any:
    from cadencia.runtime import default_sessions

    return default_sessions()


def cmd_db_upgrade(_args: argparse.Namespace) -> None:
    from cadencia.runtime import prepare_database

    prepare_database(get_settings())
    _print({"ok": True})


def cmd_test_connection(_args: argparse.Namespace) -> None:
    from cadencia.collector.service import run_connection_test
    from cadencia.jira.errors import JiraError

    try:
        _print(asyncio.run(run_connection_test(get_settings(), _sessions())))
    except JiraError as exc:
        _print({"ok": False, "error": exc.as_dict()})
        raise SystemExit(1) from None


def cmd_discover(_args: argparse.Namespace) -> None:
    from cadencia.collector.service import run_discovery

    _print(asyncio.run(run_discovery(get_settings(), _sessions())))


def cmd_boards(args: argparse.Namespace) -> None:
    from cadencia.store import repo
    from cadencia.store.db import session_scope

    with session_scope(_sessions()) as session:
        if args.select:
            repo.set_selected_boards(session, args.select)
            session.flush()
        rows, total = repo.list_boards(session, query=args.q, limit=500)
        _print(
            {
                "total": total,
                "items": [
                    {
                        "id": r.id,
                        "name": r.name,
                        "type": r.type,
                        "space_key": r.space_key,
                        "space_name": r.space_name,
                        "selected": r.selected,
                    }
                    for r in rows
                ],
            }
        )


def cmd_spaces(args: argparse.Namespace) -> None:
    """The teams: every space with the boards under it."""
    from cadencia.store import repo
    from cadencia.store.db import session_scope

    with session_scope(_sessions()) as session:
        rows, _ = repo.list_boards(session, selected=True if args.selected else None, limit=1000)
        spaces = repo.spaces_of_boards(session, rows)
        grouped: dict[str | None, list[Any]] = {}
        for row in rows:
            grouped.setdefault(row.space_key or None, []).append(row)
        for row in repo.list_spaces(session):
            grouped.setdefault(row.key, [])
            spaces.setdefault(row.key, repo.space_from_row(row))
        items = [
            {
                "key": key,
                "name": spaces[key].label if key and key in spaces else tr("cli.no_space"),
                "boards": [
                    {"id": b.id, "name": b.name, "type": b.type, "selected": b.selected}
                    for b in sorted(boards, key=lambda b: b.name.casefold())
                ],
            }
            for key, boards in grouped.items()
        ]
        items.sort(key=lambda i: (i["key"] is None, str(i["name"]).casefold()))
        _print({"total": len(items), "items": items})


def cmd_collect(args: argparse.Namespace) -> None:
    from cadencia.collector.service import run_collection

    result = asyncio.run(
        run_collection(
            get_settings(), _sessions(), mode="full" if args.full else "incremental", board_ids=args.board
        )
    )
    _print(result)
    if result["status"] in {"failed", "partial"}:
        raise SystemExit(2)
    if result["status"] == "skipped":  # another collection holds the lease; nothing was collected
        raise SystemExit(3)


def cmd_checkpoint(args: argparse.Namespace) -> None:
    """Materialise (or re-run) checkpoint snapshots; prints a digest to prove reproducibility."""
    from cadencia.analytics.data import load_board
    from cadencia.collector.snapshots import due_checkpoints, record_checkpoints, snapshot_rows
    from cadencia.store import repo
    from cadencia.store.db import session_scope

    settings = get_settings()
    now = datetime.now(UTC)
    with session_scope(_sessions()) as session:
        data = load_board(session, args.board, repo.profile_defaults(settings), settings.history_days)
        at = _instant(args.at)
        written = record_checkpoints(session, data, now, only=at, force=args.force)
        out = []
        for instant, sprint_id, index in due_checkpoints(data, now):
            if at is not None and instant != at:
                continue
            checkpoint_id = repo.ensure_checkpoint(
                session, data.board.id, instant, sprint_id=sprint_id, window_index=index
            )
            stored = [
                {
                    k: getattr(r, k)
                    for k in (
                        "issue_key",
                        "status_id",
                        "column_name",
                        "assignee_id",
                        "in_sprint",
                        "situation",
                    )
                }
                for r in repo.load_snapshots(session, checkpoint_id)
            ]
            recomputed = [
                {
                    k: r[k]
                    for k in (
                        "issue_key",
                        "status_id",
                        "column_name",
                        "assignee_id",
                        "in_sprint",
                        "situation",
                    )
                }
                for r in sorted(
                    snapshot_rows(data, instant, data.sprints.get(sprint_id) if sprint_id else None),
                    key=lambda r: r["issue_key"],
                )
            ]
            digest = hashlib.sha256(json.dumps(stored, sort_keys=True, default=str).encode()).hexdigest()[:16]
            out.append(
                {
                    "at": instant,
                    "sprint_id": sprint_id,
                    "window": index,
                    "items": len(stored),
                    "digest": digest,
                    "reproducible": stored == recomputed,
                }
            )
        _print({"written": written, "checkpoints": out})


def cmd_summary(args: argparse.Namespace) -> None:
    from cadencia.analytics.data import load_board
    from cadencia.analytics.sprint import risk_list, sprint_overview
    from cadencia.store import repo
    from cadencia.store.db import session_scope

    settings = get_settings()
    now = datetime.now(UTC)
    with session_scope(_sessions()) as session:
        sprint = repo.get_sprint(session, args.sprint)
        if sprint is None:
            raise SystemExit(tr("cli.error.sprint_not_collected", sprint=args.sprint))
        data = load_board(session, sprint.board_id, repo.profile_defaults(settings), settings.history_days)
        overview = sprint_overview(
            data,
            sprint,
            now,
            committed=repo.load_commitment(session, sprint.id),
            base_url=settings.jira_base_url,
        )
        overview["risks"] = [r for r in risk_list(data, now, sprint=sprint) if r["risk"]["severity"] > 0]
        _print(overview)


def cmd_manifest(args: argparse.Namespace) -> None:
    from cadencia.report.core.manifest import extract_manifest

    manifest = extract_manifest(args.path)
    if args.out:
        Path(args.out).write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        _print({"written": args.out, "slides": manifest["template"]["slides"]})
    else:
        _print(manifest)


def cmd_template_add(args: argparse.Namespace) -> None:
    from cadencia.report.service import store_template
    from cadencia.store.db import session_scope

    path = Path(args.path)
    with session_scope(_sessions()) as session:
        row = store_template(session, get_settings(), path.name, path.read_bytes(), args.name)
        _print(
            {
                "id": row.id,
                "name": row.name,
                "sha256": row.sha256,
                "slides": row.manifest["template"]["slides"],
            }
        )


def cmd_mapping(args: argparse.Namespace) -> None:
    from cadencia.report.core.mapping import DeckMapping
    from cadencia.report.core.suggest import suggest_mapping
    from cadencia.store import repo
    from cadencia.store import schema as s
    from cadencia.store.db import session_scope

    with session_scope(_sessions()) as session:
        template = session.get(s.TemplateRow, args.template)
        if template is None:
            raise SystemExit(tr("cli.error.template_not_found", template=args.template))
        if args.action == "show":
            row = repo.get_mapping(session, template.id)
            _print(row.mapping if row else None)
        elif args.action == "suggest":
            rows, _ = repo.list_boards(session, limit=500)
            _print(suggest_mapping(template.manifest, [{"id": r.id, "name": r.name} for r in rows]))
        else:
            payload = json.loads(Path(args.file).read_text(encoding="utf-8"))
            payload.pop("notes", None)
            mapping = DeckMapping.model_validate(payload)
            repo.save_mapping(session, template.id, template.sha256, mapping.model_dump())
            _print({"saved": True, "bindings": len(mapping.targets())})


def cmd_deck(args: argparse.Namespace) -> None:
    from cadencia.report.service import generate_report, run_dict
    from cadencia.store.db import session_scope

    with session_scope(_sessions()) as session:
        run = generate_report(
            session,
            get_settings(),
            args.template,
            reference=_instant(args.reference),
            board_ids=args.board,
            anonymize=True if args.anonymize else None,
            render=not args.no_render,
        )
        _print({**run_dict(run), "path": run.path})


def cmd_serve(args: argparse.Namespace) -> None:
    import uvicorn

    uvicorn.run(
        "cadencia.api.app:create_app", factory=True, host=args.host, port=args.port, reload=args.reload
    )


def cmd_demo(args: argparse.Namespace) -> None:
    """Seed the database with the fictional demo instance (no Jira credentials needed)."""
    from cadencia.demo_seed import seed_demo
    from cadencia.store import repo
    from cadencia.store.db import session_scope

    sessions = _sessions()
    with session_scope(sessions) as session:
        _rows, total = repo.list_boards(session, limit=1)
    if total and not args.force:
        raise SystemExit(tr("cli.error.demo_not_empty"))
    _print(asyncio.run(seed_demo(get_settings(), sessions)))


def cmd_check_deck(args: argparse.Namespace) -> None:
    """Validate a .pptx as an OOXML package (RF-50). Exits non-zero when PowerPoint would refuse it."""
    from cadencia.report.core.package_check import check_package

    failures = 0
    results = []
    for path in args.file:
        report = check_package(path)
        failures += 0 if report.ok else 1
        results.append({"file": path, **report.as_dict()})
    _print({"ok": failures == 0, "checked": len(args.file), "invalid": failures, "results": results})
    if failures:
        raise SystemExit(1)


def cmd_check_variables(args: argparse.Namespace) -> None:
    """Which templates would stop generating under the registration rule (RF-45).

    Read-only: it flags, it never registers. Exits non-zero when any template would break, so it
    can stand in front of a deploy.
    """
    from cadencia.report.service import audit_variables

    settings = get_settings()
    sessions = _sessions()
    with sessions() as session:
        report = audit_variables(session, settings, args.template)
    _print(report)
    if not report["ok"]:
        raise SystemExit(1)


def cmd_migrate_bindings(args: argparse.Namespace) -> None:
    """RF-59: report what converting legacy ``field:`` bindings into variables would do.

    Read-only until ``--apply`` — and ``--apply`` is not implemented yet on purpose: the plan gets
    reviewed before anything rewrites a saved mapping.
    """
    from cadencia.report.service import apply_binding_migration, plan_binding_migration
    from cadencia.store.db import session_scope

    sessions = _sessions()
    if not args.apply:
        with sessions() as session:
            plan = plan_binding_migration(session, args.template)
        _print(plan)
        if not plan["ok"]:
            raise SystemExit(1)
        return
    with session_scope(sessions) as session:
        _print(apply_binding_migration(session, args.template))


def cmd_migrate_palette(args: argparse.Namespace) -> None:
    """RF-62: templates whose status palette is only a copy of the shared one."""
    from cadencia.report.service import apply_palette_migration, plan_palette_migration
    from cadencia.store.db import session_scope

    sessions = _sessions()
    if not args.apply:
        with sessions() as session:
            _print(plan_palette_migration(session))
        return
    with session_scope(sessions) as session:
        _print(apply_palette_migration(session))


def cmd_scheduler(_args: argparse.Namespace) -> None:
    from cadencia.collector.scheduler import build_scheduler
    from cadencia.logging import configure_logging

    settings = get_settings()
    configure_logging(settings.log_level, settings.log_json)
    build_scheduler(settings, _sessions()).start()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="cadencia", description=tr("cli.description"))
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("db-upgrade", help=tr("cli.help.db_upgrade")).set_defaults(func=cmd_db_upgrade)
    sub.add_parser("test-connection", help=tr("cli.help.test_connection")).set_defaults(
        func=cmd_test_connection
    )
    sub.add_parser("discover", help=tr("cli.help.discover")).set_defaults(func=cmd_discover)

    p = sub.add_parser("boards", help=tr("cli.help.boards"))
    p.add_argument("--q", help=tr("cli.help.boards.q"))
    p.add_argument("--select", type=int, nargs="*", help=tr("cli.help.boards.select"))
    p.set_defaults(func=cmd_boards)

    p = sub.add_parser("spaces", help=tr("cli.help.spaces"))
    p.add_argument("--selected", action="store_true", help=tr("cli.help.spaces.selected"))
    p.set_defaults(func=cmd_spaces)

    p = sub.add_parser("check-deck", help=tr("cli.help.check_deck"))
    p.add_argument("file", nargs="+", help=tr("cli.help.check_deck.file"))
    p.set_defaults(func=cmd_check_deck)

    p = sub.add_parser(
        "check-variables",
        help=tr("cli.help.check_variables"),
    )
    p.add_argument("--template", type=int, help=tr("cli.help.template_filter"))
    p.set_defaults(func=cmd_check_variables)

    p = sub.add_parser(
        "migrate-bindings",
        help=tr("cli.help.migrate_bindings"),
    )
    p.add_argument("--template", type=int, help=tr("cli.help.template_filter"))
    p.add_argument("--apply", action="store_true", help=tr("cli.help.migrate_bindings.apply"))
    p.set_defaults(func=cmd_migrate_bindings)

    p = sub.add_parser(
        "migrate-palette",
        help=tr("cli.help.migrate_palette"),
    )
    p.add_argument("--apply", action="store_true", help=tr("cli.help.migrate_palette.apply"))
    p.set_defaults(func=cmd_migrate_palette)

    p = sub.add_parser("collect", help=tr("cli.help.collect"))
    p.add_argument("--full", action="store_true", help=tr("cli.help.collect.full"))
    p.add_argument("--board", type=int, action="append", help=tr("cli.help.collect.board"))
    p.set_defaults(func=cmd_collect)

    p = sub.add_parser("checkpoint", help=tr("cli.help.checkpoint"))
    p.add_argument("--board", type=int, required=True)
    p.add_argument("--at", help=tr("cli.help.checkpoint.at"))
    p.add_argument("--force", action="store_true", help=tr("cli.help.checkpoint.force"))
    p.set_defaults(func=cmd_checkpoint)

    p = sub.add_parser("summary", help=tr("cli.help.summary"))
    p.add_argument("--sprint", type=int, required=True)
    p.set_defaults(func=cmd_summary)

    p = sub.add_parser("manifest", help=tr("cli.help.manifest"))
    p.add_argument("path")
    p.add_argument("--out")
    p.set_defaults(func=cmd_manifest)

    p = sub.add_parser("template-add", help=tr("cli.help.template_add"))
    p.add_argument("path")
    p.add_argument("--name")
    p.set_defaults(func=cmd_template_add)

    p = sub.add_parser("mapping", help=tr("cli.help.mapping"))
    p.add_argument("action", choices=["show", "suggest", "set"])
    p.add_argument("template", type=int)
    p.add_argument("file", nargs="?", help=tr("cli.help.mapping.file"))
    p.set_defaults(func=cmd_mapping)

    p = sub.add_parser("deck", help=tr("cli.help.deck"))
    p.add_argument("--template", type=int, required=True)
    p.add_argument("--reference", help=tr("cli.help.deck.reference"))
    p.add_argument("--board", type=int, action="append")
    p.add_argument("--anonymize", action="store_true")
    p.add_argument("--no-render", action="store_true", help=tr("cli.help.deck.no_render"))
    p.set_defaults(func=cmd_deck)

    p = sub.add_parser("serve", help=tr("cli.help.serve"))
    p.add_argument("--host", default="0.0.0.0")
    p.add_argument("--port", type=int, default=8000)
    p.add_argument("--reload", action="store_true")
    p.set_defaults(func=cmd_serve)

    sub.add_parser("scheduler", help=tr("cli.help.scheduler")).set_defaults(func=cmd_scheduler)

    p = sub.add_parser("demo", help=tr("cli.help.demo"))
    p.add_argument("--force", action="store_true", help=tr("cli.help.demo.force"))
    p.set_defaults(func=cmd_demo)
    return parser


def main(argv: list[str] | None = None) -> None:
    # Before the parser: help texts and everything printed speak CADENCIA_LOCALE.
    configure_default_locale(get_settings().locale)
    args = build_parser().parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
