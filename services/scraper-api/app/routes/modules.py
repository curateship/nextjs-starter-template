from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import ScraperModule
from app.schemas import ModuleListOut, ModuleOut

router = APIRouter(prefix="/api/v1/modules", tags=["modules"])


@router.get("", response_model=ModuleListOut)
def list_modules(db: Session = Depends(get_db)) -> ModuleListOut:
    modules = db.execute(select(ScraperModule).order_by(ScraperModule.name.asc())).scalars().all()
    return ModuleListOut(modules=[ModuleOut.model_validate(module) for module in modules])
