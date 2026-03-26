import hmac

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.hub_client import fetch_hub_access
from app.models import SeoUser
from app.security import SESSION_COOKIE_NAME, verify_token


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> SeoUser:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing SEO session")

    payload = verify_token(token, get_settings().session_secret)
    seo_user_id = payload.get("seo_user_id")
    if not isinstance(seo_user_id, str):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid SEO session")

    user = db.query(SeoUser).filter(SeoUser.id == seo_user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="SEO user not found")

    return refresh_user_access(user, db)


def require_super_admin(current_user: SeoUser = Depends(get_current_user)) -> SeoUser:
    if current_user.role != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="super_admin required")
    return current_user


def refresh_user_access(current_user: SeoUser, db: Session) -> SeoUser:
    access = fetch_hub_access(current_user.hub_user_id)

    current_user.email = access["email"]
    current_user.role = access["role"]
    current_user.seo_access = bool(access["seo_access"])
    db.commit()
    db.refresh(current_user)

    if not current_user.seo_access:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SEO access disabled")

    return current_user


def require_hub_or_seo_origin(request: Request) -> None:
    settings = get_settings()
    _require_allowed_origin(request, {settings.hub_app_origin, settings.seo_app_origin})


def require_seo_app_origin(request: Request) -> None:
    settings = get_settings()
    _require_allowed_origin(request, {settings.seo_app_origin})


def require_internal_service_token(request: Request) -> None:
    token = request.headers.get("x-seo-service-token")
    if token is None or not hmac.compare_digest(token, get_settings().internal_api_token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")


def _require_allowed_origin(request: Request, allowed_origins: set[str]) -> None:
    origin = request.headers.get("origin")
    if origin is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid origin")

    normalized_origin = origin.rstrip("/")
    normalized_allowed = {value.rstrip("/") for value in allowed_origins}

    if normalized_origin not in normalized_allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid origin")
