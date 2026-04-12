from __future__ import annotations

import calendar
import time
from datetime import datetime, timedelta

from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_session_factory
from app.models import (
    ScraperPlace,
    ScraperPlaceSnapshot,
    ScraperRun,
    ScraperRunAttempt,
    ScraperRunResult,
    ScraperSchedule,
    utcnow,
)
from app.services.google_maps import (
    BlockedRunError,
    CancelledRunError,
    RetryableRunError,
    ScrapedPlace,
    run_google_maps_search,
)
from app.services.modules import MODULE_KEY_GOOGLE_MAPS_SEARCH

MAX_ATTEMPTS = 3


def advance_schedule_time(base: datetime, cadence: str) -> datetime:
    if cadence == "daily":
        return base + timedelta(days=1)

    if cadence == "weekly":
        return base + timedelta(days=7)

    if cadence == "monthly":
        month = base.month + 1
        year = base.year
        if month > 12:
            year += 1
            month = 1

        day = min(base.day, calendar.monthrange(year, month)[1])
        return base.replace(year=year, month=month, day=day)

    raise ValueError(f"Unsupported cadence: {cadence}")


def enqueue_due_schedules(db: Session, now: datetime | None = None) -> int:
    now = now or utcnow()
    schedules = db.execute(
        select(ScraperSchedule)
        .where(ScraperSchedule.active.is_(True), ScraperSchedule.next_run_at <= now)
        .order_by(ScraperSchedule.next_run_at.asc())
        .with_for_update(skip_locked=True)
    ).scalars().all()

    created = 0
    for schedule in schedules:
        run = ScraperRun(
            module_key=schedule.module_key,
            keyword=schedule.keyword,
            area=schedule.area,
            max_places=schedule.max_places,
            scheduled_for=schedule.next_run_at,
            status="queued",
        )
        db.add(run)
        schedule.last_run_at = schedule.next_run_at
        schedule.next_run_at = advance_schedule_time(schedule.next_run_at, schedule.cadence)
        created += 1

    if created > 0:
        db.commit()

    return created


def claim_next_run(db: Session, now: datetime | None = None) -> ScraperRun | None:
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


def process_next_run() -> str | None:
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
            if run is None:
                return

            if run.status in {"succeeded", "failed", "blocked", "canceled"}:
                return

            if _is_cancel_requested(db, run_id):
                _mark_run_canceled(db, run, None)
                return

            attempt = ScraperRunAttempt(
                run_id=run.id,
                attempt_number=attempt_number,
                status="running",
                proxy_session_key=f"{run.id}-attempt-{attempt_number}",
                browser_session_key=f"browser-{run.id}-{attempt_number}",
            )
            run.attempt_count = attempt_number
            db.add(attempt)
            db.commit()
            db.refresh(attempt)

            try:
                if run.module_key != MODULE_KEY_GOOGLE_MAPS_SEARCH:
                    raise RuntimeError(f"Unsupported module: {run.module_key}")

                places = run_google_maps_search(
                    keyword=run.keyword,
                    area=run.area,
                    max_places=run.max_places,
                    session_key=attempt.proxy_session_key or run.id,
                    should_cancel=lambda: _is_cancel_requested_fresh(run.id),
                )
                _persist_places(db, run, attempt, places)
                return
            except CancelledRunError:
                _mark_run_canceled(db, run, attempt)
                return
            except BlockedRunError as exc:
                _finalize_attempt(db, attempt, "blocked", str(exc))
                if attempt_number == MAX_ATTEMPTS:
                    _finalize_run(db, run, "blocked", str(exc), total_found=0, total_saved=0)
                    return
            except RetryableRunError as exc:
                _finalize_attempt(db, attempt, "failed", str(exc))
                if attempt_number == MAX_ATTEMPTS:
                    _finalize_run(db, run, "failed", str(exc), total_found=0, total_saved=0)
                    return
            except Exception as exc:
                _finalize_attempt(db, attempt, "failed", str(exc))
                _finalize_run(db, run, "failed", str(exc), total_found=0, total_saved=0)
                return
        finally:
            db.close()


def _persist_places(db: Session, run: ScraperRun, attempt: ScraperRunAttempt, places: list[ScrapedPlace]) -> None:
    db.execute(delete(ScraperRunResult).where(ScraperRunResult.run_id == run.id))
    saved_count = 0

    for place_data in places:
        place = db.execute(
            select(ScraperPlace).where(
                or_(
                    ScraperPlace.external_id == place_data.external_id,
                    ScraperPlace.normalized_google_maps_url == place_data.normalized_google_maps_url,
                )
            )
        ).scalars().first()

        if place is None:
            place = ScraperPlace(
                external_id=place_data.external_id,
                normalized_google_maps_url=place_data.normalized_google_maps_url,
                name=place_data.name,
                primary_category=place_data.primary_category,
                address=place_data.address,
                phone=place_data.phone,
                website=place_data.website,
                latitude=place_data.latitude,
                longitude=place_data.longitude,
                google_maps_url=place_data.google_maps_url,
            )
            db.add(place)
            db.flush()
        else:
            place.name = place_data.name
            place.primary_category = place_data.primary_category
            place.address = place_data.address
            place.phone = place_data.phone
            place.website = place_data.website
            place.latitude = place_data.latitude
            place.longitude = place_data.longitude
            place.google_maps_url = place_data.google_maps_url

        snapshot = ScraperPlaceSnapshot(
            place_id=place.id,
            run_id=run.id,
            rating=place_data.rating,
            review_count=place_data.review_count,
            hours_text=place_data.hours_text,
            raw_payload=place_data.raw_payload,
        )
        db.add(snapshot)
        db.flush()

        db.add(
            ScraperRunResult(
                run_id=run.id,
                place_id=place.id,
                snapshot_id=snapshot.id,
                position=place_data.position,
            )
        )
        saved_count += 1

    _finalize_attempt(db, attempt, "succeeded", None)
    _finalize_run(db, run, "succeeded", None, total_found=len(places), total_saved=saved_count)


def _mark_run_canceled(db: Session, run: ScraperRun, attempt: ScraperRunAttempt | None) -> None:
    if attempt is not None:
        _finalize_attempt(db, attempt, "canceled", "Run canceled")

    _finalize_run(db, run, "canceled", "Run canceled", total_found=0, total_saved=0)


def _finalize_attempt(db: Session, attempt: ScraperRunAttempt, status: str, error_message: str | None) -> None:
    attempt.status = status
    attempt.error_message = error_message
    attempt.finished_at = utcnow()
    db.commit()
    db.refresh(attempt)


def _finalize_run(
    db: Session,
    run: ScraperRun,
    status: str,
    error_message: str | None,
    *,
    total_found: int,
    total_saved: int,
) -> None:
    now = utcnow()
    run.status = status
    run.error_message = error_message
    run.total_places_found = total_found
    run.total_places_saved = total_saved
    run.finished_at = now
    run.updated_at = now
    if status == "canceled" and run.cancel_requested_at is None:
        run.cancel_requested_at = now
    db.commit()
    db.refresh(run)


def _is_cancel_requested(db: Session, run_id: str) -> bool:
    run = db.get(ScraperRun, run_id)
    if run is None:
        return True

    return run.cancel_requested_at is not None or run.status == "canceled"


def _is_cancel_requested_fresh(run_id: str) -> bool:
    db = get_session_factory()()
    try:
        return _is_cancel_requested(db, run_id)
    finally:
        db.close()


def run_worker_loop() -> None:
    poll_seconds = get_settings().worker_poll_seconds

    while True:
        processed = process_next_run()
        if processed is None:
            time.sleep(poll_seconds)


def main() -> None:
    run_worker_loop()
