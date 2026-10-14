"""Collector service: incremental collection on an interval, plus a job at each board checkpoint
(e.g. Friday 18h America/Sao_Paulo) that collects, freezes snapshots and generates the decks whose
mapping asks for it. APScheduler keeps this free of a queue/broker for a weekly job."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Iterable
from datetime import UTC, datetime, timedelta
from pathlib import Path

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.orm import Session, sessionmaker

from cadencia import notify
from cadencia.collector.service import run_collection
from cadencia.config import Settings
from cadencia.errors import Invalid, NotFound
from cadencia.i18n import Msg, using_locale
from cadencia.logging import log_event
from cadencia.report.core.mapping import DeckMapping
from cadencia.report.service import generate_report, run_boards, run_pdf
from cadencia.store import repo
from cadencia.store import schema as s
from cadencia.store.db import session_scope

log = logging.getLogger(__name__)
WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
#: A checkpoint queues behind a collection already running instead of skipping it: the snapshot and
#: the deck it produces should see this week's data.
CHECKPOINT_WAIT = timedelta(minutes=30)


def _collect(
    settings: Settings,
    sessions: sessionmaker[Session],
    mode: str,
    board_ids: Iterable[int] | None = None,
    wait: timedelta | None = None,
) -> None:
    try:
        # The result's failure texts feed the notification, which speaks CADENCIA_LOCALE; asyncio.run
        # copies this context into the collection's task.
        with using_locale(settings.locale):
            result = asyncio.run(
                run_collection(settings, sessions, mode=mode, board_ids=board_ids, wait=wait)
            )
    except Exception as exc:
        log.exception("coleta agendada falhou")
        result = {"status": "failed", "boards": [], "error": str(exc)}
    if result.get("status") in {"failed", "partial"}:
        _notify_failure(settings, sessions, result)


def _notify_failure(settings: Settings, sessions: sessionmaker[Session], result: dict) -> None:
    """RF-71: a scheduled collection nobody is watching must not fail in silence."""
    failed = [b for b in result.get("boards", []) if b.get("status") == "failed"]
    lines = [f"{b['name']}: {b['error']['cause']} — {b['error']['message']}" for b in failed]
    message = notify.Message(
        event="collection_failed",
        title=Msg("notify.collection." + ("failed" if result["status"] == "failed" else "partial")),
        text="\n".join(lines) or str(result.get("error") or "") or Msg("notify.collection.failed_text"),
        link=notify.app_link(settings, "/status"),
    )
    try:
        with session_scope(sessions) as session:
            notify.deliver(session, settings, message)
    except Exception:
        log.exception("falha ao avisar sobre a coleta")


#: Above this an attachment bounces off most mail servers; the link still goes out.
MAX_ATTACHMENT = 20 * 1024 * 1024
PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation"


def deck_attachment(settings: Settings, run: s.ReportRunRow, kind: str) -> tuple[str, bytes, str] | None:
    """#13: the file a scheduled delivery attaches, or None to send only the link.

    A deck the validation refused is never attached: the file would travel without the reasons, and
    the link opens them."""
    if kind == "link" or run.status != "ok" or not run.path:
        return None
    try:
        path = run_pdf(settings, run) if kind == "pdf" else Path(run.path)
    except (Invalid, NotFound) as exc:
        log_event(
            log, "anexo indisponível; vai só o link", level=logging.WARNING, run=run.id, reason=str(exc)
        )
        return None
    if not path.exists() or path.stat().st_size > MAX_ATTACHMENT:
        return None
    stem = f"cadencia-{run.reference_at:%Y-%m-%d}"
    mime = "application/pdf" if kind == "pdf" else PPTX_MIME
    return (f"{stem}.{kind}", path.read_bytes(), mime)


def _deliver_deck(
    session: Session, settings: Settings, run: s.ReportRunRow, mapping: DeckMapping, name: str
) -> None:
    if mapping.schedule.notify:
        message = notify.deck_message(settings, run, name)
        attachment = deck_attachment(settings, run, mapping.schedule.attach)
        if attachment is not None:
            message.attachments.append(attachment)
        notify.deliver(session, settings, message)


def _checkpoint_boards(session: Session, settings: Settings, weekday: int, hour: int, tz: str) -> set[int]:
    """The selected boards whose checkpoint this is."""
    defaults = repo.profile_defaults(settings)
    return {
        b.id
        for b in repo.selected_boards(session)
        if (p := repo.board_profile(session, b.id, defaults)).checkpoint_weekday == weekday
        and p.checkpoint_hour == hour
        and p.timezone == tz
    }


def _checkpoint(
    settings: Settings, sessions: sessionmaker[Session], weekday: int, hour: int, tz: str
) -> None:
    """Collect the boards whose checkpoint this is, then regenerate the decks that show them.

    Boards are worked out when the job fires rather than when it was registered, so a board moved to
    another checkpoint in between is not collected twice. Each deck gets its own transaction: a
    database error in one used to leave the shared session needing a rollback, failing every deck
    after it.
    """
    log_event(log, "checkpoint agendado", weekday=weekday, hour=hour, timezone=tz)
    with session_scope(sessions) as session:
        boards = _checkpoint_boards(session, settings, weekday, hour, tz)
        template_ids = [t.id for t in repo.list_templates(session)]
    # No selected board at all: the default job still runs, over everything, as it always did.
    _collect(settings, sessions, "incremental", board_ids=boards or None, wait=CHECKPOINT_WAIT)
    for template_id in template_ids:
        try:
            with session_scope(sessions) as session:
                row = repo.get_mapping(session, template_id)
                if row is None:
                    continue
                mapping = DeckMapping.model_validate(row.mapping)
                if not mapping.auto_generate or (boards and not boards & set(run_boards(session, mapping))):
                    continue
                run = generate_report(session, settings, template_id, now=datetime.now(UTC))
                template = session.get(s.TemplateRow, template_id)
                _deliver_deck(
                    session, settings, run, mapping, template.name if template else str(template_id)
                )
                log_event(
                    log,
                    "apresentação gerada no checkpoint",
                    template=template_id,
                    run=run.id,
                    status=run.status,
                )
        except Exception:
            log.exception("falha ao gerar a apresentação do modelo %s", template_id)


def sync_checkpoint_jobs(
    scheduler: BlockingScheduler, settings: Settings, sessions: sessionmaker[Session]
) -> None:
    with session_scope(sessions) as session:
        combos = {
            (p.checkpoint_weekday, p.checkpoint_hour, p.timezone)
            for p in (
                repo.board_profile(session, b.id, repo.profile_defaults(settings))
                for b in repo.selected_boards(session)
            )
        }
    combos = combos or {(settings.checkpoint_weekday, settings.checkpoint_hour, settings.timezone)}
    wanted = {f"checkpoint:{wd}:{hour}:{tz}": (wd, hour, tz) for wd, hour, tz in combos}
    for job in scheduler.get_jobs():
        if job.id.startswith("checkpoint:") and job.id not in wanted:
            job.remove()
    for job_id, (weekday, hour, tz) in wanted.items():
        if scheduler.get_job(job_id) is None:
            scheduler.add_job(
                _checkpoint,
                CronTrigger(day_of_week=WEEKDAYS[weekday], hour=hour, minute=5, timezone=tz),
                args=[settings, sessions, weekday, hour, tz],
                id=job_id,
            )
            log_event(log, "job de checkpoint registrado", job=job_id)


def _scheduled_deck(settings: Settings, sessions: sessionmaker[Session], template_id: int) -> None:
    """RF-77: a template's own generation time, independent of the boards' checkpoints."""
    try:
        with session_scope(sessions) as session:
            row = repo.get_mapping(session, template_id)
            template = session.get(s.TemplateRow, template_id)
            if row is None or template is None:
                return
            mapping = DeckMapping.model_validate(row.mapping)
            if not mapping.schedule.enabled:
                return
            now = datetime.now(UTC)
            reference = now if mapping.schedule.reference == "agora" else None  # None: last checkpoint
            run = generate_report(
                session,
                settings,
                template_id,
                reference=reference,
                now=now,
                audience=mapping.schedule.audience,
            )
            _deliver_deck(session, settings, run, mapping, template.name)
            log_event(
                log, "apresentação agendada gerada", template=template_id, run=run.id, status=run.status
            )
    except Exception:
        log.exception("falha na geração agendada do modelo %s", template_id)


def _digest(settings: Settings, sessions: sessionmaker[Session]) -> None:
    try:
        with session_scope(sessions) as session:
            result = notify.send_digest(session, settings, datetime.now(UTC))
        log_event(log, "resumo de riscos enviado", spaces=len(result["sent"]), new=result["total_new_risks"])
    except Exception:
        log.exception("falha ao enviar o resumo de riscos")


def _replace_jobs(scheduler: BlockingScheduler, prefix: str, wanted: dict[str, tuple]) -> dict[str, tuple]:
    """Drop this family's jobs that are no longer wanted; return the ones still to be added."""
    for job in scheduler.get_jobs():
        if job.id.startswith(prefix) and job.id not in wanted:
            job.remove()
    return {job_id: spec for job_id, spec in wanted.items() if scheduler.get_job(job_id) is None}


def sync_template_jobs(
    scheduler: BlockingScheduler, settings: Settings, sessions: sessionmaker[Session]
) -> None:
    """One cron job per scheduled template, and the digest's. The id carries the schedule, so
    changing a schedule replaces its job at the next sync instead of leaving the old one running."""
    wanted: dict[str, tuple] = {}
    with session_scope(sessions) as session:
        for template in repo.list_templates(session):
            row = repo.get_mapping(session, template.id)
            if row is None:
                continue
            plan = DeckMapping.model_validate(row.mapping).schedule
            if plan.enabled:
                days = ",".join(WEEKDAYS[d] for d in plan.weekdays)
                key = f"template:{template.id}:{days}:{plan.hour}:{plan.minute}:{plan.timezone}"
                wanted[key] = (template.id, days, plan.hour, plan.minute, plan.timezone)
        digest = notify.digest_schedule(session)
    for job_id, (template_id, days, hour, minute, tz) in _replace_jobs(
        scheduler, "template:", wanted
    ).items():
        scheduler.add_job(
            _scheduled_deck,
            CronTrigger(day_of_week=days, hour=hour, minute=minute, timezone=tz),
            args=[settings, sessions, template_id],
            id=job_id,
        )
        log_event(log, "geração agendada registrada", job=job_id)
    digest_jobs: dict[str, tuple] = {}
    if digest.enabled:
        days = ",".join(WEEKDAYS[d] for d in digest.weekdays)
        digest_jobs[f"digest:{days}:{digest.hour}:{digest.timezone}"] = (days, digest.hour, digest.timezone)
    for job_id, (days, hour, tz) in _replace_jobs(scheduler, "digest:", digest_jobs).items():
        scheduler.add_job(
            _digest,
            CronTrigger(day_of_week=days, hour=hour, timezone=tz),
            args=[settings, sessions],
            id=job_id,
        )
        log_event(log, "resumo de riscos agendado", job=job_id)


def _sync(scheduler: BlockingScheduler, settings: Settings, sessions: sessionmaker[Session]) -> None:
    sync_checkpoint_jobs(scheduler, settings, sessions)
    sync_template_jobs(scheduler, settings, sessions)


def build_scheduler(settings: Settings, sessions: sessionmaker[Session]) -> BlockingScheduler:
    scheduler = BlockingScheduler(
        timezone="UTC", job_defaults={"coalesce": True, "max_instances": 1, "misfire_grace_time": 3600}
    )
    now = datetime.now(UTC)
    scheduler.add_job(
        _collect,
        IntervalTrigger(minutes=settings.collect_interval_minutes),
        args=[settings, sessions, "incremental"],
        id="incremental",
        next_run_time=now,
    )
    # Every five minutes: a schedule somebody just set in the app should not wait an hour to exist.
    scheduler.add_job(
        _sync,
        IntervalTrigger(minutes=5),
        args=[scheduler, settings, sessions],
        id="sync",
        next_run_time=now,
    )
    return scheduler
