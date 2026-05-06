from typing import Optional, Union

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import require_admin_token
from app.models import ScraperModule, ScraperResult, ScraperRun
from app.modules.registry import get_module
from app.schemas import RunCreateIn, RunListOut, RunOut, RunResponseOut, RunResultsOut, ResultOut

router = APIRouter(prefix="/api/v1/runs", tags=["runs"])


@router.get("", response_model=RunListOut)
def list_runs(
    module_key: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
) -> RunListOut:
    query = select(ScraperRun)
    if module_key:
        query = query.where(ScraperRun.module_key == module_key)

    runs = db.execute(query.order_by(ScraperRun.created_at.desc())).scalars().all()
    return RunListOut(runs=[RunOut.model_validate(run) for run in runs])


@router.post("", response_model=RunResponseOut)
def create_run(
    payload: RunCreateIn,
    _: None = Depends(require_admin_token),
    db: Session = Depends(get_db),
) -> RunResponseOut:
    handler = get_module(payload.module_key)
    if handler is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found")

    module = db.get(ScraperModule, payload.module_key)
    if module is None or not module.enabled:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found")

    try:
        validated_input = handler.validate_input(payload.input)
    except (ValidationError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=format_validation_error(exc)) from exc

    run = ScraperRun(module_key=payload.module_key, input=validated_input, status="queued")
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

    results = db.execute(
        select(ScraperResult)
        .where(ScraperResult.run_id == run_id)
        .order_by(ScraperResult.created_at.desc())
    ).scalars().all()
    return RunResultsOut(results=[ResultOut.model_validate(result) for result in results])


def format_validation_error(error: Union[ValidationError, ValueError]) -> str:
    if isinstance(error, ValidationError):
        first_error = error.errors()[0] if error.errors() else None
        if first_error:
            message = str(first_error.get("msg", "Invalid input"))
            return message.replace("Value error, ", "")

    return str(error)
