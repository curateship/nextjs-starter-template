from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import require_admin_token
from app.models import ScraperPlace, ScraperPlaceSnapshot, ScraperRun, ScraperRunResult, utcnow
from app.schemas import (
    PlaceOut,
    PlaceSnapshotOut,
    RunCreateIn,
    RunListOut,
    RunOut,
    RunResponseOut,
    RunResultOut,
    RunResultsOut,
)
from app.services.modules import MODULE_KEY_GOOGLE_MAPS_SEARCH

router = APIRouter(prefix="/api/v1/runs", tags=["runs"])


@router.get("", response_model=RunListOut)
def list_runs(db: Session = Depends(get_db)) -> RunListOut:
    runs = db.execute(select(ScraperRun).order_by(ScraperRun.created_at.desc())).scalars().all()
    return RunListOut(runs=[RunOut.model_validate(run) for run in runs])


@router.post("", response_model=RunResponseOut)
def create_run(
    payload: RunCreateIn,
    _: None = Depends(require_admin_token),
    db: Session = Depends(get_db),
) -> RunResponseOut:
    keyword = payload.keyword.strip()
    area = payload.area.strip()

    if not keyword or not area:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Keyword and area are required")

    run = ScraperRun(
        module_key=MODULE_KEY_GOOGLE_MAPS_SEARCH,
        keyword=keyword,
        area=area,
        max_places=payload.max_places,
        status="queued",
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    return RunResponseOut(run=RunOut.model_validate(run))


@router.get("/{run_id}", response_model=RunResponseOut)
def get_run(run_id: str, db: Session = Depends(get_db)) -> RunResponseOut:
    run = db.get(ScraperRun, run_id)
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")

    return RunResponseOut(run=RunOut.model_validate(run))


@router.get("/{run_id}/results", response_model=RunResultsOut)
def get_run_results(run_id: str, db: Session = Depends(get_db)) -> RunResultsOut:
    run = db.get(ScraperRun, run_id)
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")

    rows = db.execute(
        select(ScraperRunResult, ScraperPlace, ScraperPlaceSnapshot)
        .join(ScraperPlace, ScraperPlace.id == ScraperRunResult.place_id)
        .join(ScraperPlaceSnapshot, ScraperPlaceSnapshot.id == ScraperRunResult.snapshot_id)
        .where(ScraperRunResult.run_id == run_id)
        .order_by(ScraperRunResult.position.asc())
    ).all()

    results = [
        RunResultOut(
            id=result.id,
            position=result.position,
            place=PlaceOut(
                id=place.id,
                external_id=place.external_id,
                name=place.name,
                primary_category=place.primary_category,
                address=place.address,
                phone=place.phone,
                website=place.website,
                latitude=place.latitude,
                longitude=place.longitude,
                google_maps_url=place.google_maps_url,
            ),
            snapshot=PlaceSnapshotOut(
                id=snapshot.id,
                rating=snapshot.rating,
                review_count=snapshot.review_count,
                hours_text=snapshot.hours_text,
                scraped_at=snapshot.scraped_at,
            ),
        )
        for result, place, snapshot in rows
    ]

    return RunResultsOut(results=results)


@router.post("/{run_id}/cancel", response_model=RunResponseOut)
def cancel_run(
    run_id: str,
    _: None = Depends(require_admin_token),
    db: Session = Depends(get_db),
) -> RunResponseOut:
    run = db.get(ScraperRun, run_id)
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Run not found")

    now = utcnow()
    if run.status == "queued":
        run.status = "canceled"
        run.finished_at = now
        run.cancel_requested_at = now
    elif run.status == "running" and run.cancel_requested_at is None:
        run.cancel_requested_at = now

    db.commit()
    db.refresh(run)

    return RunResponseOut(run=RunOut.model_validate(run))
