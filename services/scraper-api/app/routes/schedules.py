from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import require_admin_token
from app.models import ScraperSchedule, utcnow
from app.schemas import (
    ScheduleCreateIn,
    ScheduleListOut,
    ScheduleOut,
    ScheduleResponseOut,
    ScheduleUpdateIn,
)
from app.services.modules import MODULE_KEY_GOOGLE_MAPS_SEARCH
from app.services.worker import advance_schedule_time

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
    keyword = payload.keyword.strip()
    area = payload.area.strip()
    timezone = payload.timezone.strip()

    if not keyword or not area or not timezone:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Keyword, area, and timezone are required")

    schedule = ScraperSchedule(
        module_key=MODULE_KEY_GOOGLE_MAPS_SEARCH,
        keyword=keyword,
        area=area,
        max_places=payload.max_places,
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

    if payload.keyword is not None:
        keyword = payload.keyword.strip()
        if not keyword:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Keyword is required")
        schedule.keyword = keyword

    if payload.area is not None:
        area = payload.area.strip()
        if not area:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Area is required")
        schedule.area = area

    if payload.timezone is not None:
        timezone = payload.timezone.strip()
        if not timezone:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Timezone is required")
        schedule.timezone = timezone

    if payload.max_places is not None:
        schedule.max_places = payload.max_places

    if payload.cadence is not None:
        schedule.cadence = payload.cadence

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
