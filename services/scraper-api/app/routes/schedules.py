from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import require_admin_token
from app.models import ScraperModule, ScraperSchedule, utcnow
from app.modules.registry import get_module
from app.schemas import (
    ScheduleCreateIn,
    ScheduleListOut,
    ScheduleOut,
    ScheduleResponseOut,
    ScheduleUpdateIn,
)
from app.services.schedules import advance_schedule_time
from app.routes.runs import format_validation_error

router = APIRouter(prefix="/api/v1/schedules", tags=["schedules"])


@router.get("", response_model=ScheduleListOut)
def list_schedules(db: Session = Depends(get_db)) -> ScheduleListOut:
    schedules = db.execute(select(ScraperSchedule).order_by(ScraperSchedule.created_at.desc())).scalars().all()
    return ScheduleListOut(schedules=[ScheduleOut.model_validate(schedule) for schedule in schedules])


@router.post("", response_model=ScheduleResponseOut)
def create_schedule(
    payload: ScheduleCreateIn,
    _: None = Depends(require_admin_token),
    db: Session = Depends(get_db),
) -> ScheduleResponseOut:
    handler = get_module(payload.module_key)
    if handler is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found")

    module = db.get(ScraperModule, payload.module_key)
    if module is None or not module.enabled:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found")

    timezone = payload.timezone.strip()
    if not timezone:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Timezone is required")

    try:
        validated_input = handler.validate_input(payload.input)
    except (ValidationError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=format_validation_error(exc)) from exc

    schedule = ScraperSchedule(
        module_key=payload.module_key,
        input=validated_input,
        cadence=payload.cadence,
        timezone=timezone,
        active=True,
        next_run_at=advance_schedule_time(utcnow(), payload.cadence),
    )
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    return ScheduleResponseOut(schedule=ScheduleOut.model_validate(schedule))


@router.patch("/{schedule_id}", response_model=ScheduleResponseOut)
def update_schedule(
    schedule_id: str,
    payload: ScheduleUpdateIn,
    _: None = Depends(require_admin_token),
    db: Session = Depends(get_db),
) -> ScheduleResponseOut:
    schedule = db.get(ScraperSchedule, schedule_id)
    if schedule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")

    handler = get_module(schedule.module_key)
    if handler is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found")

    if payload.input is not None:
        try:
            schedule.input = handler.validate_input(payload.input)
        except (ValidationError, ValueError) as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=format_validation_error(exc)) from exc

    if payload.cadence is not None:
        schedule.cadence = payload.cadence

    if payload.timezone is not None:
        timezone = payload.timezone.strip()
        if not timezone:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Timezone is required")
        schedule.timezone = timezone

    if payload.active is not None:
        schedule.active = payload.active

    now = utcnow()
    if schedule.active and schedule.next_run_at <= now:
        schedule.next_run_at = advance_schedule_time(now, schedule.cadence)

    db.commit()
    db.refresh(schedule)
    return ScheduleResponseOut(schedule=ScheduleOut.model_validate(schedule))


@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_schedule(
    schedule_id: str,
    _: None = Depends(require_admin_token),
    db: Session = Depends(get_db),
) -> Response:
    schedule = db.get(ScraperSchedule, schedule_id)
    if schedule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule not found")

    db.delete(schedule)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
