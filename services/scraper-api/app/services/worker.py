from __future__ import annotations

import time
from datetime import datetime
from typing import Optional

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_session_factory
from app.models import ScraperRun, ScraperRunAttempt, ScraperSchedule, utcnow
from app.modules.registry import get_module
from app.services.schedules import advance_schedule_time

MAX_ATTEMPTS = 3


def enqueue_due_schedules(db: Session, now: Optional[datetime] = None) -> int:
    now = now or utcnow()
    schedules = db.execute(
        select(ScraperSchedule)
        .where(ScraperSchedule.active.is_(True), ScraperSchedule.next_run_at <= now)
        .order_by(ScraperSchedule.next_run_at.asc())
        .with_for_update(skip_locked=True)
    ).scalars().all()

    created = 0
    for schedule in schedules:
        db.add(
            ScraperRun(
                module_key=schedule.module_key,
                input=schedule.input,
                scheduled_for=schedule.next_run_at,
                status="queued",
            )
        )
        schedule.last_run_at = schedule.next_run_at
        schedule.next_run_at = advance_schedule_time(schedule.next_run_at, schedule.cadence)
        created += 1

    if created:
        db.commit()

    return created


def claim_next_run(db: Session, now: Optional[datetime] = None) -> Optional[ScraperRun]:
    now = now or utcnow()
    run = db.execute(
        select(ScraperRun)
        .where(
            ScraperRun.status == "queued",
            or_(ScraperRun.scheduled_for.is_(None), ScraperRun.scheduled_for <= now),
        )
        .order_by(ScraperRun.created_at.asc())
        .with_for_update(skip_locked=True)
    ).scalars().first()

    if run is None:
        return None

    run.status = "running"
    run.started_at = run.started_at or now
    run.updated_at = now
    db.commit()
    db.refresh(run)
    return run


def process_next_run() -> Optional[str]:
    db = get_session_factory()()
    try:
        enqueue_due_schedules(db)
        run = claim_next_run(db)
        if run is None:
            return None

        process_run(run.id)
        return run.id
    finally:
        db.close()


def process_run(run_id: str) -> None:
    for attempt_number in range(1, MAX_ATTEMPTS + 1):
        db = get_session_factory()()
        try:
            run = db.get(ScraperRun, run_id)
            if run is None or run.status in {"succeeded", "failed", "canceled"}:
                return

            handler = get_module(run.module_key)
            if handler is None:
                _finalize_run(db, run, "failed", f"Unsupported module: {run.module_key}", 0, 0)
                return

            attempt = ScraperRunAttempt(run_id=run.id, attempt_number=attempt_number, status="running")
            run.attempt_count = attempt_number
            db.add(attempt)
            db.commit()
            db.refresh(attempt)

            try:
                validated_input = handler.validate_input(run.input)
                execution = handler.execute(validated_input)
                persisted = handler.persist(db, run, execution)
                _finalize_attempt(db, attempt, "succeeded", None)
                _finalize_run(db, run, "succeeded", None, persisted.raw_items, persisted.results)
                return
            except Exception as exc:
                db.rollback()
                attempt = db.get(ScraperRunAttempt, attempt.id)
                run = db.get(ScraperRun, run_id)
                if attempt is not None:
                    _finalize_attempt(db, attempt, "failed", str(exc))
                if run is not None and attempt_number == MAX_ATTEMPTS:
                    _finalize_run(db, run, "failed", str(exc), 0, 0)
                    return
        finally:
            db.close()


def _finalize_attempt(db: Session, attempt: ScraperRunAttempt, status: str, error_message: Optional[str]) -> None:
    attempt.status = status
    attempt.error_message = error_message
    attempt.finished_at = utcnow()
    db.commit()


def _finalize_run(
    db: Session,
    run: ScraperRun,
    status: str,
    error_message: Optional[str],
    total_raw_items: int,
    total_results: int,
) -> None:
    now = utcnow()
    run.status = status
    run.error_message = error_message
    run.total_raw_items = total_raw_items
    run.total_results = total_results
    run.finished_at = now
    run.updated_at = now
    db.commit()


def run_worker_loop() -> None:
    poll_seconds = get_settings().worker_poll_seconds

    while True:
        processed = process_next_run()
        if processed is None:
            time.sleep(poll_seconds)


def main() -> None:
    run_worker_loop()
