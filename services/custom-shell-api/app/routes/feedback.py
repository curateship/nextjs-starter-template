from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import get_current_user, require_app_origin
from app.models import CustomShellFeedback, CustomShellFeedbackVote, CustomShellUser
from app.schemas import FeedbackCreateIn, FeedbackListOut, FeedbackOut

router = APIRouter(prefix="/api/v1", tags=["feedback"])


@router.get("/feedback", response_model=FeedbackListOut)
def list_feedback(
    current_user: CustomShellUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FeedbackListOut:
    rows = db.query(CustomShellFeedback).order_by(CustomShellFeedback.created_at.desc()).all()
    return FeedbackListOut(feedback=_serialize_feedback_rows(db, rows, current_user.id))


@router.post("/feedback", response_model=FeedbackOut, status_code=status.HTTP_201_CREATED)
def create_feedback(
    payload: FeedbackCreateIn,
    current_user: CustomShellUser = Depends(get_current_user),
    _: None = Depends(require_app_origin),
    db: Session = Depends(get_db),
) -> FeedbackOut:
    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Message is required")

    row = CustomShellFeedback(
        user_id=current_user.id,
        feedback_type=payload.type,
        message=message,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return _serialize_feedback_row(row, current_user.name, 0, False)


@router.post("/feedback/{feedback_id}/vote", response_model=FeedbackOut)
def toggle_feedback_vote(
    feedback_id: str,
    current_user: CustomShellUser = Depends(get_current_user),
    _: None = Depends(require_app_origin),
    db: Session = Depends(get_db),
) -> FeedbackOut:
    row = db.get(CustomShellFeedback, feedback_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feedback not found")
    if row.feedback_type != "suggestion":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only suggestions can be upvoted")

    existing_vote = (
        db.query(CustomShellFeedbackVote)
        .filter(
            CustomShellFeedbackVote.feedback_id == feedback_id,
            CustomShellFeedbackVote.user_id == current_user.id,
        )
        .first()
    )

    if existing_vote:
        db.delete(existing_vote)
        has_voted = False
    else:
        db.add(CustomShellFeedbackVote(feedback_id=feedback_id, user_id=current_user.id))
        has_voted = True

    db.commit()
    db.refresh(row)

    vote_count = (
        db.query(func.count(CustomShellFeedbackVote.id))
        .filter(CustomShellFeedbackVote.feedback_id == row.id)
        .scalar()
        or 0
    )
    author_name = db.get(CustomShellUser, row.user_id).name
    return _serialize_feedback_row(row, author_name, vote_count, has_voted)


def _serialize_feedback_rows(
    db: Session,
    rows: list[CustomShellFeedback],
    current_user_id: str,
) -> list[FeedbackOut]:
    feedback_ids = [row.id for row in rows]
    if not feedback_ids:
        return []

    vote_counts = {
        feedback_id: count
        for feedback_id, count in (
            db.query(CustomShellFeedbackVote.feedback_id, func.count(CustomShellFeedbackVote.id))
            .filter(CustomShellFeedbackVote.feedback_id.in_(feedback_ids))
            .group_by(CustomShellFeedbackVote.feedback_id)
            .all()
        )
    }
    voted_ids = {
        feedback_id
        for (feedback_id,) in (
            db.query(CustomShellFeedbackVote.feedback_id)
            .filter(
                CustomShellFeedbackVote.feedback_id.in_(feedback_ids),
                CustomShellFeedbackVote.user_id == current_user_id,
            )
            .all()
        )
    }
    author_ids = {row.user_id for row in rows}
    author_names = {
        user.id: user.name
        for user in db.query(CustomShellUser).filter(CustomShellUser.id.in_(author_ids)).all()
    }

    return [
        _serialize_feedback_row(
            row,
            author_names.get(row.user_id, "Unknown"),
            vote_counts.get(row.id, 0),
            row.id in voted_ids,
        )
        for row in rows
    ]


def _serialize_feedback_row(
    row: CustomShellFeedback,
    author_name: str,
    vote_count: int,
    has_voted: bool,
) -> FeedbackOut:
    return FeedbackOut(
        id=row.id,
        type=row.feedback_type,
        message=row.message,
        author_name=author_name,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
        vote_count=vote_count,
        has_voted=has_voted,
    )
