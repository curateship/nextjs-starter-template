from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import CustomShellSettings, utcnow
from app.schemas import ShellConfigIn, ShellSettingsOut

DEFAULT_SETTINGS_KEY = "default"

router = APIRouter(prefix="/api/v1")


@router.get("/shell-settings", response_model=ShellSettingsOut)
def get_shell_settings(db: Session = Depends(get_db)):
    row = db.get(CustomShellSettings, DEFAULT_SETTINGS_KEY)
    return {"settings": row.settings if row else None}


@router.put("/shell-settings", response_model=ShellSettingsOut)
def put_shell_settings(settings: ShellConfigIn, db: Session = Depends(get_db)):
    settings_json = settings.model_dump(mode="json", exclude_none=True)
    row = db.get(CustomShellSettings, DEFAULT_SETTINGS_KEY)

    if row:
        row.settings = settings_json
        row.updated_at = utcnow()
    else:
        row = CustomShellSettings(key=DEFAULT_SETTINGS_KEY, settings=settings_json)
        db.add(row)

    db.commit()
    db.refresh(row)

    return {"settings": row.settings}
