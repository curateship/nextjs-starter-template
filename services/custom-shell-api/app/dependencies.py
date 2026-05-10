from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import CustomShellSession, CustomShellUser, utcnow
from app.security import SESSION_COOKIE_NAME, hash_session_token


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> CustomShellUser:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Custom Shell session")

    session = (
        db.query(CustomShellSession)
        .filter(
            CustomShellSession.token_hash == hash_session_token(token),
            CustomShellSession.expires_at > utcnow(),
        )
        .first()
    )
    if session is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Custom Shell session")

    user = db.get(CustomShellUser, session.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Custom Shell user not found")

    return user


def require_app_origin(request: Request) -> None:
    origin = request.headers.get("origin")
    if origin is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid origin")

    allowed_origins = {value.rstrip("/") for value in get_settings().app_origins}
    if origin.rstrip("/") not in allowed_origins:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid origin")
