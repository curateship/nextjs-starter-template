from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import get_current_user, require_super_admin
from app.models import SeoUser, SeoWorkspace
from app.schemas import WorkspaceCreateIn, WorkspaceCreateOut, WorkspaceListOut

router = APIRouter(prefix="/api/v1/workspaces", tags=["workspaces"])


@router.get("", response_model=WorkspaceListOut)
def list_workspaces(
    current_user: SeoUser = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WorkspaceListOut:
    query = db.query(SeoWorkspace).order_by(SeoWorkspace.created_at.desc())

    if current_user.role != "super_admin":
        query = query.filter(SeoWorkspace.owner_user_id == current_user.id)

    return WorkspaceListOut(workspaces=query.all())


@router.post("", response_model=WorkspaceCreateOut)
def create_workspace(
    payload: WorkspaceCreateIn,
    current_user: SeoUser = Depends(require_super_admin),
    db: Session = Depends(get_db),
) -> WorkspaceCreateOut:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Workspace name is required")

    existing = (
        db.query(SeoWorkspace)
        .filter(SeoWorkspace.owner_user_id == current_user.id, SeoWorkspace.name == name)
        .first()
    )
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Workspace already exists")

    workspace = SeoWorkspace(owner_user_id=current_user.id, name=name)
    db.add(workspace)
    db.commit()
    db.refresh(workspace)

    return WorkspaceCreateOut(workspace=workspace)
